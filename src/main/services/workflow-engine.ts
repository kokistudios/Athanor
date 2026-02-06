import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { AgentManager } from './agent-manager';
import type { ApprovalRouter } from './approval-router';
import type { WorktreeManager } from './worktree-manager';
import type { AthanorConfig } from '../../shared/types/config';
import { buildSystemPreamble } from '../prompts/system-preamble';

export interface StartSessionOptions {
  userId: string;
  workspaceId: string;
  workflowId: string;
  context?: string;
  description?: string;
}

interface WorkflowPhaseConfig {
  permission_mode?: string;
}

export class WorkflowEngine extends EventEmitter {
  constructor(
    private db: Kysely<Database>,
    private agentManager: AgentManager,
    private approvalRouter: ApprovalRouter,
    private worktreeManager: WorktreeManager,
    private config: AthanorConfig,
  ) {
    super();

    // Listen for agent completion to handle phase advancement
    this.agentManager.on('agent:completed', async ({ agentId }: { agentId: string }) => {
      try {
        await this.handlePhaseComplete(agentId);
      } catch (err) {
        console.error('Error handling phase complete:', err);
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  async setSessionStatus(sessionId: string, status: string, extra?: Record<string, unknown>): Promise<void> {
    await this.db
      .updateTable('sessions')
      .set({ status, ...extra } as Record<string, unknown>)
      .where('id', '=', sessionId)
      .execute();

    this.emit('session:status-change', { sessionId, status });
  }

  private async hasPendingPhaseGate(sessionId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('approvals')
      .select('id')
      .where('session_id', '=', sessionId)
      .where('type', '=', 'phase_gate')
      .where('status', '=', 'pending')
      .executeTakeFirst();

    return !!row;
  }

  // ── Session lifecycle ───────────────────────────────────────

  async startSession(opts: StartSessionOptions): Promise<string> {
    const sessionId = crypto.randomUUID();

    // Look up the workflow phases
    const phases = await this.db
      .selectFrom('workflow_phases')
      .selectAll()
      .where('workflow_id', '=', opts.workflowId)
      .orderBy('ordinal', 'asc')
      .execute();

    if (phases.length === 0) {
      throw new Error('Workflow has no phases');
    }

    // Create session
    await this.db
      .insertInto('sessions')
      .values({
        id: sessionId,
        user_id: opts.userId,
        workspace_id: opts.workspaceId,
        workflow_id: opts.workflowId,
        description: opts.description || null,
        status: 'active',
        current_phase: phases[0].ordinal,
        context: opts.context || null,
      })
      .execute();

    this.emit('session:status-change', { sessionId, status: 'active' });

    const firstPhase = phases[0];

    // Check for 'before' gate
    if (firstPhase.approval === 'before') {
      await this.approvalRouter.createApproval({
        sessionId,
        type: 'phase_gate',
        summary: `Approve starting phase "${firstPhase.name}"?`,
        payload: { phaseId: firstPhase.id, phaseName: firstPhase.name, direction: 'before' },
      });
      await this.setSessionStatus(sessionId, 'waiting_approval');
    } else {
      await this.launchPhaseAgent(sessionId, firstPhase);
    }

    return sessionId;
  }

  async advancePhase(sessionId: string): Promise<void> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    const phases = await this.db
      .selectFrom('workflow_phases')
      .selectAll()
      .where('workflow_id', '=', session.workflow_id)
      .orderBy('ordinal', 'asc')
      .execute();

    const currentIdx = phases.findIndex((p) => p.ordinal === session.current_phase);
    const nextIdx = currentIdx + 1;

    if (nextIdx >= phases.length) {
      // All phases complete
      await this.setSessionStatus(sessionId, 'completed', {
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const nextPhase = phases[nextIdx];

    // Update session to next phase
    await this.db
      .updateTable('sessions')
      .set({ current_phase: nextPhase.ordinal })
      .where('id', '=', sessionId)
      .execute();

    this.emit('phase:advanced', {
      sessionId,
      phaseName: nextPhase.name,
      phaseNumber: nextIdx + 1,
      totalPhases: phases.length,
    });

    // Check for 'before' gate
    if (nextPhase.approval === 'before') {
      await this.approvalRouter.createApproval({
        sessionId,
        type: 'phase_gate',
        summary: `Approve starting phase "${nextPhase.name}"?`,
        payload: { phaseId: nextPhase.id, phaseName: nextPhase.name, direction: 'before' },
      });
      await this.setSessionStatus(sessionId, 'waiting_approval');
    } else {
      await this.launchPhaseAgent(sessionId, nextPhase);
    }
  }

  private async launchPhaseAgent(
    sessionId: string,
    phase: {
      id: string;
      name: string;
      prompt_template: string;
      allowed_tools: string | null;
      agents: string | null;
      config: string | null;
    },
  ): Promise<void> {
    // Guard: don't launch if there's a pending phase gate
    if (await this.hasPendingPhaseGate(sessionId)) {
      console.warn(`[WorkflowEngine] Blocked launch for session ${sessionId} — pending phase gate exists`);
      return;
    }

    // Look up workspace and repo for worktree
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    const workspace = await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', session.workspace_id)
      .executeTakeFirstOrThrow();

    const repo = await this.db
      .selectFrom('repos')
      .selectAll()
      .where('id', '=', workspace.repo_id)
      .executeTakeFirstOrThrow();

    // Build shared system prompt
    const systemPrompt = buildSystemPreamble({
      sessionId,
      phaseId: phase.id,
      phaseName: phase.name,
      repoName: repo.name,
      repoPath: repo.local_path,
    });

    // Create worktree
    const { dir, branch } = await this.worktreeManager.createWorktree(
      repo.local_path,
      `${phase.name}-${sessionId.slice(0, 8)}`,
    );

    // Build prompt with context
    let prompt = phase.prompt_template;
    if (session.context) {
      prompt = `## Context\n\n${session.context}\n\n## Phase Instructions\n\n${prompt}`;
    }

    // Parse agents JSON
    let agents: Record<string, unknown> | undefined;
    if (phase.agents) {
      try {
        agents = JSON.parse(phase.agents);
      } catch {
        // ignore parse error
      }
    }

    // Parse allowed tools
    let allowedTools: string[] | null = null;
    if (phase.allowed_tools) {
      try {
        allowedTools = JSON.parse(phase.allowed_tools);
      } catch {
        // ignore parse error
      }
    }

    // Parse phase config
    let phaseConfig: WorkflowPhaseConfig = {};
    if (phase.config) {
      try {
        phaseConfig = JSON.parse(phase.config) as WorkflowPhaseConfig;
      } catch {
        // ignore parse error
      }
    }
    // Workflow agents run in isolated worktrees and must call MCP tools
    // (athanor_phase_complete) to signal completion — default to bypassPermissions.
    const permissionMode =
      phaseConfig.permission_mode || 'bypassPermissions';

    await this.agentManager.spawnAgent({
      sessionId,
      phaseId: phase.id,
      name: phase.name,
      prompt,
      systemPrompt,
      worktreePath: dir,
      branch,
      allowedTools,
      agents,
      permissionMode,
    });
  }

  private async handlePhaseComplete(agentId: string): Promise<void> {
    const agent = await this.db
      .selectFrom('agents')
      .selectAll()
      .where('id', '=', agentId)
      .executeTakeFirst();

    if (!agent) return;

    const phase = await this.db
      .selectFrom('workflow_phases')
      .selectAll()
      .where('id', '=', agent.phase_id)
      .executeTakeFirst();

    if (!phase) return;

    // Check for 'after' gate
    if (phase.approval === 'after') {
      await this.approvalRouter.createApproval({
        sessionId: agent.session_id,
        agentId: agent.id,
        type: 'phase_gate',
        summary: `Review output of phase "${phase.name}" before advancing`,
        payload: {
          phaseId: phase.id,
          phaseName: phase.name,
          direction: 'after',
          agentId: agent.id,
        },
      });
      await this.setSessionStatus(agent.session_id, 'waiting_approval');
    } else {
      // Auto-advance
      await this.advancePhase(agent.session_id);
    }
  }

  async pauseSession(sessionId: string): Promise<void> {
    // Check current status — cannot pause a waiting_approval session
    const session = await this.db
      .selectFrom('sessions')
      .select('status')
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    if (session.status === 'waiting_approval') {
      throw new Error('Cannot pause a session that is waiting for approval — no agent to kill');
    }

    // Kill active agents for this session
    const agents = this.agentManager.getActiveAgents().filter((a) => a.sessionId === sessionId);

    for (const agent of agents) {
      await this.agentManager.killAgent(agent.id);
    }

    await this.setSessionStatus(sessionId, 'paused');
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    if (session.status !== 'paused' && session.status !== 'waiting_approval') {
      throw new Error('Session is not paused or waiting_approval');
    }

    // Look up current phase
    const phase = await this.db
      .selectFrom('workflow_phases')
      .selectAll()
      .where('workflow_id', '=', session.workflow_id)
      .where('ordinal', '=', session.current_phase!)
      .executeTakeFirstOrThrow();

    // If phase has a 'before' gate, check for pending gate
    if (phase.approval === 'before') {
      const hasPending = await this.hasPendingPhaseGate(sessionId);
      if (!hasPending) {
        // Re-create the gate approval
        await this.approvalRouter.createApproval({
          sessionId,
          type: 'phase_gate',
          summary: `Approve starting phase "${phase.name}"?`,
          payload: { phaseId: phase.id, phaseName: phase.name, direction: 'before' },
        });
      }
      await this.setSessionStatus(sessionId, 'waiting_approval');
      return;
    }

    // No gate required — set active and launch agent
    await this.setSessionStatus(sessionId, 'active');
    await this.launchPhaseAgent(sessionId, phase);
  }

  // Called when an approval for a phase_gate is resolved
  async handleApprovalResolved(approvalId: string): Promise<void> {
    const approval = await this.approvalRouter.getApproval(approvalId);
    if (!approval || approval.type !== 'phase_gate') return;

    const payload = approval.payload ? JSON.parse(approval.payload) : {};

    if (approval.status === 'approved') {
      // Set status back to active before launching
      await this.setSessionStatus(approval.session_id, 'active');

      if (payload.direction === 'before') {
        // Launch the phase agent
        const phase = await this.db
          .selectFrom('workflow_phases')
          .selectAll()
          .where('id', '=', payload.phaseId)
          .executeTakeFirstOrThrow();

        await this.launchPhaseAgent(approval.session_id, phase);
      } else if (payload.direction === 'after') {
        // Advance to next phase
        await this.advancePhase(approval.session_id);
      }
    } else if (approval.status === 'rejected') {
      // Keep session in waiting_approval — re-create the approval with [Retry] prefix
      await this.approvalRouter.createApproval({
        sessionId: approval.session_id,
        agentId: approval.agent_id || undefined,
        type: 'phase_gate',
        summary: `[Retry] ${approval.summary}`,
        payload,
      });
      await this.setSessionStatus(approval.session_id, 'waiting_approval');
    }
  }

  // ── Startup recovery ────────────────────────────────────────

  async recoverSessions(): Promise<void> {
    // Fix 'active' sessions with no running agents → paused
    const activeSessions = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('status', '=', 'active')
      .execute();

    const runningAgentSessionIds = new Set(
      this.agentManager.getActiveAgents().map((a) => a.sessionId),
    );

    for (const session of activeSessions) {
      if (!runningAgentSessionIds.has(session.id)) {
        console.warn(`[WorkflowEngine] Recovering orphaned active session ${session.id} → paused`);
        await this.setSessionStatus(session.id, 'paused');
      }
    }

    // Fix 'waiting_approval' sessions with missing approvals → re-create them
    const waitingSessions = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('status', '=', 'waiting_approval')
      .execute();

    for (const session of waitingSessions) {
      const hasPending = await this.hasPendingPhaseGate(session.id);
      if (!hasPending && session.current_phase !== null) {
        const phase = await this.db
          .selectFrom('workflow_phases')
          .selectAll()
          .where('workflow_id', '=', session.workflow_id)
          .where('ordinal', '=', session.current_phase)
          .executeTakeFirst();

        if (phase && (phase.approval === 'before' || phase.approval === 'after')) {
          console.warn(
            `[WorkflowEngine] Re-creating missing gate approval for session ${session.id}`,
          );
          await this.approvalRouter.createApproval({
            sessionId: session.id,
            type: 'phase_gate',
            summary: `[Recovered] Approve phase "${phase.name}"?`,
            payload: {
              phaseId: phase.id,
              phaseName: phase.name,
              direction: phase.approval,
            },
          });
        }
      }
    }
  }
}
