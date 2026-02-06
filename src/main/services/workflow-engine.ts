import * as crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { AgentManager } from './agent-manager';
import type { ApprovalRouter } from './approval-router';
import type { WorktreeManager } from './worktree-manager';
import type { AthanorConfig } from '../../shared/types/config';

export interface StartSessionOptions {
  userId: string;
  workspaceId: string;
  workflowId: string;
  context?: string;
}

interface WorkflowPhaseConfig {
  permission_mode?: string;
}

export class WorkflowEngine {
  constructor(
    private db: Kysely<Database>,
    private agentManager: AgentManager,
    private approvalRouter: ApprovalRouter,
    private worktreeManager: WorktreeManager,
    private config: AthanorConfig,
  ) {
    // Listen for agent completion to handle phase advancement
    this.agentManager.on('agent:completed', async ({ agentId }: { agentId: string }) => {
      try {
        await this.handlePhaseComplete(agentId);
      } catch (err) {
        console.error('Error handling phase complete:', err);
      }
    });
  }

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
        status: 'active',
        current_phase: phases[0].ordinal,
        context: opts.context || null,
      })
      .execute();

    const firstPhase = phases[0];

    // Check for 'before' gate
    if (firstPhase.approval === 'before') {
      await this.approvalRouter.createApproval({
        sessionId,
        type: 'phase_gate',
        summary: `Approve starting phase "${firstPhase.name}"?`,
        payload: { phaseId: firstPhase.id, phaseName: firstPhase.name, direction: 'before' },
      });
      // Session waits — approval resolution triggers advancePhase
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
      await this.db
        .updateTable('sessions')
        .set({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .where('id', '=', sessionId)
        .execute();
      return;
    }

    const nextPhase = phases[nextIdx];

    // Update session to next phase
    await this.db
      .updateTable('sessions')
      .set({ current_phase: nextPhase.ordinal })
      .where('id', '=', sessionId)
      .execute();

    // Check for 'before' gate
    if (nextPhase.approval === 'before') {
      await this.approvalRouter.createApproval({
        sessionId,
        type: 'phase_gate',
        summary: `Approve starting phase "${nextPhase.name}"?`,
        payload: { phaseId: nextPhase.id, phaseName: nextPhase.name, direction: 'before' },
      });
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
    const permissionMode =
      phaseConfig.permission_mode || this.config.claude.default_permission_mode;

    await this.agentManager.spawnAgent({
      sessionId,
      phaseId: phase.id,
      name: phase.name,
      prompt,
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
    } else {
      // Auto-advance
      await this.advancePhase(agent.session_id);
    }
  }

  async pauseSession(sessionId: string): Promise<void> {
    // Kill active agents for this session
    const agents = this.agentManager.getActiveAgents().filter((a) => a.sessionId === sessionId);

    for (const agent of agents) {
      await this.agentManager.killAgent(agent.id);
    }

    await this.db
      .updateTable('sessions')
      .set({ status: 'paused' })
      .where('id', '=', sessionId)
      .execute();
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    if (session.status !== 'paused') {
      throw new Error('Session is not paused');
    }

    await this.db
      .updateTable('sessions')
      .set({ status: 'active' })
      .where('id', '=', sessionId)
      .execute();

    // Re-launch the current phase
    const phase = await this.db
      .selectFrom('workflow_phases')
      .selectAll()
      .where('workflow_id', '=', session.workflow_id)
      .where('ordinal', '=', session.current_phase!)
      .executeTakeFirstOrThrow();

    await this.launchPhaseAgent(sessionId, phase);
  }

  // Called when an approval for a phase_gate is resolved
  async handleApprovalResolved(approvalId: string): Promise<void> {
    const approval = await this.approvalRouter.getApproval(approvalId);
    if (!approval || approval.type !== 'phase_gate') return;

    const payload = approval.payload ? JSON.parse(approval.payload) : {};

    if (approval.status === 'approved') {
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
      // Session paused on rejection
      await this.db
        .updateTable('sessions')
        .set({ status: 'paused' })
        .where('id', '=', approval.session_id)
        .execute();
    }
  }
}
