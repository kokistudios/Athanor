import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Kysely } from 'kysely';

const execFileAsync = promisify(execFile);
import type { Database } from '../../shared/types/database';
import type { AgentManager } from './agent-manager';
import type { ApprovalRouter } from './approval-router';
import type { WorktreeManager } from './worktree-manager';
import type { AthanorConfig } from '../../shared/types/config';
import type { GitStrategy, WorkflowPhaseConfig } from '../../shared/types/workflow-phase';
import type { RelayMode } from '../../shared/types/domain';
import type { ContentStore } from './content-store';
import { buildSystemPreamble } from '../prompts/system-preamble';

export interface StartSessionOptions {
  userId: string;
  workspaceId: string;
  workflowId: string;
  context?: string;
  description?: string;
  gitStrategy?: GitStrategy;
}

export class WorkflowEngine extends EventEmitter {
  constructor(
    private db: Kysely<Database>,
    private agentManager: AgentManager,
    private approvalRouter: ApprovalRouter,
    private worktreeManager: WorktreeManager,
    private contentStore: ContentStore,
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

  private async getWorkspaceRepos(
    workspaceId: string,
  ): Promise<Array<{ id: string; name: string; local_path: string; remote_url: string | null }>> {
    const rows = await this.db
      .selectFrom('workspace_repos')
      .innerJoin('repos', 'repos.id', 'workspace_repos.repo_id')
      .select(['repos.id', 'repos.name', 'repos.local_path', 'repos.remote_url'])
      .where('workspace_repos.workspace_id', '=', workspaceId)
      .orderBy('workspace_repos.ordinal', 'asc')
      .execute();

    if (rows.length === 0) {
      // Fall back to legacy repo_id
      const workspace = await this.db
        .selectFrom('workspaces')
        .select('repo_id')
        .where('id', '=', workspaceId)
        .executeTakeFirstOrThrow();
      const repo = await this.db
        .selectFrom('repos')
        .selectAll()
        .where('id', '=', workspace.repo_id)
        .executeTakeFirstOrThrow();
      return [repo];
    }

    return rows;
  }

  // ── Relay ──────────────────────────────────────────────────

  private detectSelfLoop(loopState: string | null, currentOrdinal: number): boolean {
    if (!loopState) return false;
    try {
      const ls = JSON.parse(loopState) as { loop_origin_ordinal?: number };
      return ls.loop_origin_ordinal === currentOrdinal;
    } catch {
      return false;
    }
  }

  private async buildRelayContent(
    sessionId: string,
    workflowId: string,
    currentPhaseOrdinal: number,
    relayMode: RelayMode,
    isSelfLoop: boolean,
  ): Promise<string | null> {
    const sections: string[] = [];

    // 1. Summary relay — collect phase summaries from completed prior agents
    // When self-looping, include the current phase's own prior summary (<=)
    const summaryOp = isSelfLoop ? '<=' as const : '<' as const;
    const summaryRows = await this.db
      .selectFrom('agents')
      .innerJoin('workflow_phases', 'workflow_phases.id', 'agents.phase_id')
      .select([
        'workflow_phases.name as phase_name',
        'workflow_phases.ordinal',
        'agents.phase_summary',
      ])
      .where('agents.session_id', '=', sessionId)
      .where('workflow_phases.workflow_id', '=', workflowId)
      .where('agents.phase_summary', 'is not', null)
      .where('workflow_phases.ordinal', summaryOp, currentPhaseOrdinal)
      .orderBy('workflow_phases.ordinal', 'asc')
      .execute();

    if (summaryRows.length > 0) {
      const lines = summaryRows.map(
        (r) => `### Phase ${r.ordinal + 1}: ${r.phase_name}\n\n${r.phase_summary}`,
      );
      sections.push(`## Prior Phase Summaries\n\n${lines.join('\n\n')}`);
    }

    // 2. Artifact relay (opt-in — only for 'previous' and 'all' modes)
    if (relayMode === 'previous' || relayMode === 'all') {
      const ordinalFilter =
        relayMode === 'previous'
          ? (isSelfLoop ? currentPhaseOrdinal : currentPhaseOrdinal - 1)
          : null; // 'all' → all prior (+ self if self-loop)

      let query = this.db
        .selectFrom('artifacts')
        .innerJoin('workflow_phases', 'workflow_phases.id', 'artifacts.phase_id')
        .select([
          'artifacts.name as artifact_name',
          'artifacts.file_path',
          'workflow_phases.name as phase_name',
          'workflow_phases.ordinal',
        ])
        .where('artifacts.session_id', '=', sessionId)
        .where('workflow_phases.workflow_id', '=', workflowId)
        .orderBy('workflow_phases.ordinal', 'asc');

      if (ordinalFilter !== null) {
        query = query.where('workflow_phases.ordinal', '=', ordinalFilter);
      } else {
        const artifactOp = isSelfLoop ? '<=' as const : '<' as const;
        query = query.where('workflow_phases.ordinal', artifactOp, currentPhaseOrdinal);
      }

      const artifactRows = await query.execute();

      if (artifactRows.length > 0) {
        const blocks: string[] = [];
        for (const row of artifactRows) {
          try {
            const buf = await this.contentStore.read(row.file_path);
            const content = buf.toString('utf-8');
            blocks.push(
              `### ${row.artifact_name} (Phase ${row.ordinal + 1}: ${row.phase_name})\n\n${content}`,
            );
          } catch {
            blocks.push(
              `### ${row.artifact_name} (Phase ${row.ordinal + 1}: ${row.phase_name})\n\n*[artifact not found]*`,
            );
          }
        }
        sections.push(`## Prior Artifacts\n\n${blocks.join('\n\n---\n\n')}`);
      }
    }

    return sections.length > 0 ? sections.join('\n\n') : null;
  }

  // ── Session lifecycle ───────────────────────────────────────

  async startSession(opts: StartSessionOptions): Promise<string> {
    const sessionId = crypto.randomUUID();

    // Validate all workspace repos are git repositories before creating any rows
    const repos = await this.getWorkspaceRepos(opts.workspaceId);
    if (repos.length === 0) {
      throw new Error('Workspace has no repositories. Add at least one repo before starting a session.');
    }

    for (const repo of repos) {
      try {
        await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: repo.local_path });
      } catch {
        throw new Error(
          `Repo "${repo.name}" at "${repo.local_path}" is not a git repository. Update the repo path in workspace settings.`,
        );
      }
    }

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
        git_strategy: opts.gitStrategy ? JSON.stringify(opts.gitStrategy) : null,
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

    // Update session to next phase; reset loop_state if we've moved past the loop origin
    const updateSet: Record<string, unknown> = { current_phase: nextPhase.ordinal };
    if (session.loop_state) {
      try {
        const ls = JSON.parse(session.loop_state) as { loop_origin_ordinal?: number };
        if (ls.loop_origin_ordinal !== undefined && nextPhase.ordinal > ls.loop_origin_ordinal) {
          updateSet.loop_state = null;
        }
      } catch {
        updateSet.loop_state = null;
      }
    }
    await this.db
      .updateTable('sessions')
      .set(updateSet)
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

    // Look up workspace and repos
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    const repos = await this.getWorkspaceRepos(session.workspace_id);
    if (repos.length === 0) {
      throw new Error('Workspace has no repositories.');
    }

    const primaryRepo = repos[0];

    // Validate that all repo paths are git repositories
    for (const repo of repos) {
      try {
        await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: repo.local_path });
      } catch {
        throw new Error(
          `Repo "${repo.name}" at "${repo.local_path}" is not a git repository. Update the repo path in workspace settings.`,
        );
      }
    }

    // Parse phase config (before prompt construction for relay mode)
    let phaseConfig: WorkflowPhaseConfig = {};
    if (phase.config) {
      try {
        phaseConfig = JSON.parse(phase.config) as WorkflowPhaseConfig;
      } catch {
        // ignore parse error
      }
    }

    // Build prompt with context and relay content
    const relayMode: RelayMode = phaseConfig.relay || 'summary';
    const promptSections: string[] = [];

    if (session.context) {
      promptSections.push(`## Context\n\n${session.context}`);
    }

    // Inject prior phase summaries and artifacts (skip entirely when relay is 'off')
    const currentPhase = await this.db
      .selectFrom('workflow_phases')
      .select('ordinal')
      .where('id', '=', phase.id)
      .executeTakeFirstOrThrow();

    if (relayMode !== 'off') {
      const isSelfLoop = this.detectSelfLoop(session.loop_state, currentPhase.ordinal);
      const relayContent = await this.buildRelayContent(
        sessionId,
        session.workflow_id,
        currentPhase.ordinal,
        relayMode,
        isSelfLoop,
      );
      if (relayContent) {
        promptSections.push(relayContent);
      }
    }

    promptSections.push(`## Phase Instructions\n\n${phase.prompt_template}`);
    const prompt = promptSections.join('\n\n');

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
    // Workflow agents run in isolated worktrees and must call MCP tools
    // (athanor_phase_complete) to signal completion — default to bypassPermissions.
    const permissionMode =
      phaseConfig.permission_mode || 'bypassPermissions';
    const agentType = phaseConfig.agent_type || 'claude';

    // Resolve git strategy: phase config > session default > worktree fallback
    const gitStrategy = this.resolveGitStrategy(phaseConfig, session.git_strategy);
    const taskName = `${phase.name}-${sessionId.slice(0, 8)}`;
    const isMultiRepo = repos.length > 1;

    let workingDir: string;
    let worktreePath: string | undefined;
    let branch: string | undefined;
    let worktreeManifest: string | undefined;

    // Repo paths for the system prompt — may be overridden by worktree paths below
    let promptRepos = repos.map((r) => ({ name: r.name, path: r.local_path }));

    switch (gitStrategy.mode) {
      case 'worktree': {
        if (isMultiRepo) {
          const result = await this.worktreeManager.createMultiRepoWorktrees(
            repos.map((r) => ({ repoId: r.id, repoPath: r.local_path, repoName: r.name })),
            taskName,
          );
          workingDir = result.sessionDir;
          worktreeManifest = JSON.stringify(result.repos);
          promptRepos = result.repos.map((e) => {
            const repo = repos.find((r) => r.id === e.repoId);
            return { name: repo?.name ?? e.repoId, path: e.worktreePath };
          });
        } else {
          const wt = await this.worktreeManager.createWorktree(primaryRepo.local_path, taskName);
          workingDir = wt.dir;
          worktreePath = wt.dir;
          branch = wt.branch;
          promptRepos = [{ name: primaryRepo.name, path: wt.dir }];
        }
        break;
      }
      case 'main': {
        await this.guardInPlaceConflict(session.workspace_id, sessionId);
        workingDir = primaryRepo.local_path;
        break;
      }
      case 'branch': {
        if (gitStrategy.isolation === 'worktree') {
          if (isMultiRepo) {
            const result = await this.worktreeManager.createMultiRepoWorktreesFromBranch(
              repos.map((r) => ({ repoId: r.id, repoPath: r.local_path, repoName: r.name })),
              gitStrategy.branch,
              taskName,
              gitStrategy.create,
            );
            workingDir = result.sessionDir;
            worktreeManifest = JSON.stringify(result.repos);
            branch = gitStrategy.branch;
            promptRepos = result.repos.map((e) => {
              const repo = repos.find((r) => r.id === e.repoId);
              return { name: repo?.name ?? e.repoId, path: e.worktreePath };
            });
          } else {
            const wt = await this.worktreeManager.createWorktreeFromBranch(
              primaryRepo.local_path,
              gitStrategy.branch,
              taskName,
              gitStrategy.create,
            );
            workingDir = wt.dir;
            worktreePath = wt.dir;
            branch = wt.branch;
            promptRepos = [{ name: primaryRepo.name, path: wt.dir }];
          }
        } else {
          await this.guardInPlaceConflict(session.workspace_id, sessionId);
          for (const repo of repos) {
            await this.worktreeManager.checkoutBranch(
              repo.local_path,
              gitStrategy.branch,
              gitStrategy.create,
            );
          }
          workingDir = primaryRepo.local_path;
          branch = gitStrategy.branch;
        }
        break;
      }
    }

    // Compute loop context for system prompt and agent row
    let loopConfig: Parameters<typeof buildSystemPreamble>[0]['loopConfig'];
    let loopIteration: number | undefined;

    const loopTo = phaseConfig.loop_to;
    if (loopTo !== undefined && loopTo !== null) {
      const targetPhase = await this.db
        .selectFrom('workflow_phases')
        .select('name')
        .where('workflow_id', '=', session.workflow_id)
        .where('ordinal', '=', loopTo)
        .executeTakeFirst();

      if (targetPhase) {
        const isSelfLoop = loopTo === currentPhase.ordinal;
        const maxIterations = phaseConfig.max_iterations || 20;
        const condition = phaseConfig.loop_condition || 'agent_signal';

        let currentIterationCount = 0;
        if (session.loop_state) {
          try {
            const ls = JSON.parse(session.loop_state) as {
              iterations?: number;
              loop_origin_ordinal?: number;
            };
            if (ls.loop_origin_ordinal === currentPhase.ordinal) {
              currentIterationCount = ls.iterations || 0;
            }
          } catch {
            // ignore
          }
        }

        loopIteration = currentIterationCount + 1;

        loopConfig = {
          loopTo,
          targetPhaseName: targetPhase.name,
          isSelfLoop,
          maxIterations,
          condition,
          currentIteration: loopIteration,
        };
      }
    }

    // Build shared system prompt
    const systemPrompt = buildSystemPreamble({
      sessionId,
      phaseId: phase.id,
      phaseName: phase.name,
      repos: promptRepos,
      loopConfig,
    });

    await this.agentManager.spawnAgent({
      sessionId,
      phaseId: phase.id,
      name: phase.name,
      prompt,
      systemPrompt,
      workingDir,
      worktreePath,
      branch,
      worktreeManifest,
      allowedTools,
      agents,
      permissionMode,
      agentType,
      loopIteration,
    });
  }

  private resolveGitStrategy(
    phaseConfig: WorkflowPhaseConfig,
    sessionGitStrategy: string | null,
  ): GitStrategy {
    if (phaseConfig.git_strategy) return phaseConfig.git_strategy;
    if (sessionGitStrategy) {
      try {
        return JSON.parse(sessionGitStrategy) as GitStrategy;
      } catch {
        // ignore malformed session git strategy
      }
    }
    return { mode: 'worktree' };
  }

  private async guardInPlaceConflict(workspaceId: string, currentSessionId: string): Promise<void> {
    // Check for running agents in the same workspace with no worktree (main/in-place mode)
    const conflicting = await this.db
      .selectFrom('agents')
      .innerJoin('sessions', 'sessions.id', 'agents.session_id')
      .select('agents.id')
      .where('sessions.workspace_id', '=', workspaceId)
      .where('agents.session_id', '!=', currentSessionId)
      .where('agents.worktree_path', 'is', null)
      .where('agents.status', 'in', ['spawning', 'running', 'waiting'])
      .limit(1)
      .executeTakeFirst();

    if (conflicting) {
      throw new Error(
        'Another agent is already running in-place in this workspace. Use worktree isolation or wait for it to complete.',
      );
    }
  }

  // ── Looping ─────────────────────────────────────────────────

  private async goToPhase(sessionId: string, targetOrdinal: number): Promise<void> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    const phase = await this.db
      .selectFrom('workflow_phases')
      .selectAll()
      .where('workflow_id', '=', session.workflow_id)
      .where('ordinal', '=', targetOrdinal)
      .executeTakeFirstOrThrow();

    const phases = await this.db
      .selectFrom('workflow_phases')
      .select('id')
      .where('workflow_id', '=', session.workflow_id)
      .execute();

    await this.db
      .updateTable('sessions')
      .set({ current_phase: targetOrdinal })
      .where('id', '=', sessionId)
      .execute();

    // Parse current loop state for iteration count in toast
    let iteration = 1;
    if (session.loop_state) {
      try {
        const ls = JSON.parse(session.loop_state) as { iterations?: number };
        iteration = (ls.iterations || 0) + 1;
      } catch {
        // ignore
      }
    }

    this.emit('phase:advanced', {
      sessionId,
      phaseName: phase.name,
      phaseNumber: targetOrdinal + 1,
      totalPhases: phases.length,
      isLoop: true,
      iteration,
    });

    if (phase.approval === 'before') {
      await this.approvalRouter.createApproval({
        sessionId,
        type: 'phase_gate',
        summary: `Approve starting phase "${phase.name}"? (loop iteration)`,
        payload: { phaseId: phase.id, phaseName: phase.name, direction: 'before' },
      });
      await this.setSessionStatus(sessionId, 'waiting_approval');
    } else {
      await this.launchPhaseAgent(sessionId, phase);
    }
  }

  private async executeLoop(sessionId: string, targetOrdinal: number): Promise<void> {
    const session = await this.db
      .selectFrom('sessions')
      .select('loop_state')
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();

    let loopState: { iterations: number; loop_origin_ordinal: number } = {
      iterations: 0,
      loop_origin_ordinal: targetOrdinal,
    };
    if (session.loop_state) {
      try {
        loopState = JSON.parse(session.loop_state);
      } catch {
        // reset on parse error
      }
    }

    loopState.iterations += 1;
    loopState.loop_origin_ordinal = targetOrdinal;

    await this.db
      .updateTable('sessions')
      .set({ loop_state: JSON.stringify(loopState) })
      .where('id', '=', sessionId)
      .execute();

    await this.goToPhase(sessionId, targetOrdinal);
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

    // Parse phase config for loop settings
    let phaseConfig: WorkflowPhaseConfig = {};
    if (phase.config) {
      try {
        phaseConfig = JSON.parse(phase.config) as WorkflowPhaseConfig;
      } catch {
        // ignore
      }
    }

    const loopTo = phaseConfig.loop_to;
    const hasLoop = loopTo !== undefined && loopTo !== null;
    const signal = agent.completion_signal;

    // Validate loop target ordinal exists before attempting any loop
    let loopTargetValid = false;
    if (hasLoop) {
      const targetPhase = await this.db
        .selectFrom('workflow_phases')
        .select('id')
        .where('workflow_id', '=', phase.workflow_id)
        .where('ordinal', '=', loopTo!)
        .executeTakeFirst();
      if (targetPhase) {
        loopTargetValid = true;
      } else {
        console.warn(
          `[WorkflowEngine] Loop target ordinal ${loopTo} does not exist for workflow ${phase.workflow_id} — skipping loop`,
        );
      }
    }

    // 1. Loop with approval gate — ask human whether to loop or advance
    if (loopTargetValid && phaseConfig.loop_condition === 'approval') {
      const session = await this.db
        .selectFrom('sessions')
        .select('loop_state')
        .where('id', '=', agent.session_id)
        .executeTakeFirstOrThrow();

      let iterations = 0;
      if (session.loop_state) {
        try {
          iterations = JSON.parse(session.loop_state).iterations || 0;
        } catch {
          // reset
        }
      }

      const maxIter = phaseConfig.max_iterations;

      await this.approvalRouter.createApproval({
        sessionId: agent.session_id,
        agentId: agent.id,
        type: 'phase_gate',
        summary: `Loop back to phase ${loopTo! + 1}? (iteration ${iterations + 1}${maxIter ? ` of ${maxIter}` : ''})`,
        payload: {
          phaseId: phase.id,
          phaseName: phase.name,
          direction: 'after',
          agentId: agent.id,
          loopDecision: true,
          loop_to: loopTo,
        },
      });
      await this.setSessionStatus(agent.session_id, 'waiting_approval');
      return;
    }

    // 2. Loop with agent signal — iterate if agent requested it
    if (loopTargetValid && signal === 'iterate') {
      const session = await this.db
        .selectFrom('sessions')
        .select('loop_state')
        .where('id', '=', agent.session_id)
        .executeTakeFirstOrThrow();

      let iterations = 0;
      if (session.loop_state) {
        try {
          iterations = JSON.parse(session.loop_state).iterations || 0;
        } catch {
          // reset
        }
      }

      const DEFAULT_SAFETY_CAP = 20;
      const maxIter = phaseConfig.max_iterations || DEFAULT_SAFETY_CAP;
      if (iterations < maxIter) {
        await this.executeLoop(agent.session_id, loopTo!);
        return;
      }
      if (!phaseConfig.max_iterations) {
        console.warn(
          `[WorkflowEngine] Safety cap (${DEFAULT_SAFETY_CAP}) reached for session ${agent.session_id} — advancing`,
        );
      } else {
        console.warn(
          `[WorkflowEngine] Max iterations (${maxIter}) reached for session ${agent.session_id} — advancing`,
        );
      }
      // Fall through to normal advance
    }

    // 3. Standard after-gate or auto-advance
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
        if (payload.loopDecision && payload.loop_to !== undefined) {
          // Approve = loop back
          await this.executeLoop(approval.session_id, payload.loop_to);
        } else {
          // Advance to next phase
          await this.advancePhase(approval.session_id);
        }
      }
    } else if (approval.status === 'rejected') {
      if (payload.loopDecision && payload.loop_to !== undefined) {
        // Reject = advance forward (skip loop)
        await this.setSessionStatus(approval.session_id, 'active');
        await this.advancePhase(approval.session_id);
      } else {
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
