import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../../shared/types/database';
import type { ServiceRegistry } from '../services/service-registry';
import { CLI_AGENT_TYPES, GIT_BRANCH_ISOLATIONS, PHASE_PERMISSION_MODES } from '../../shared/types/domain';
import { registerSecureIpcHandler } from './security';

const uuidSchema = z.string().uuid();
const permissionModeSchema = z.enum(PHASE_PERMISSION_MODES);
const cliAgentTypeSchema = z.enum(CLI_AGENT_TYPES);
const gitStrategySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('worktree') }),
  z.object({ mode: z.literal('main') }),
  z.object({
    mode: z.literal('branch'),
    branch: z.string().min(1).max(256),
    isolation: z.enum(GIT_BRANCH_ISOLATIONS),
    create: z.boolean(),
  }),
]);
const workflowPhaseConfigSchema = z
  .object({
    permission_mode: permissionModeSchema.optional(),
    agent_type: cliAgentTypeSchema.optional(),
    git_strategy: gitStrategySchema.optional(),
  })
  .strict();

const workflowPhaseCreateSchema = z
  .object({
    name: z.string().min(1).max(256),
    prompt_template: z.string().min(1).max(200_000),
    allowed_tools: z.array(z.string().min(1).max(256)).optional().nullable(),
    agents: z.record(z.string(), z.unknown()).optional(),
    approval: z.enum(['none', 'before', 'after']).optional(),
    config: workflowPhaseConfigSchema.optional(),
  })
  .strict();

const workflowPhaseUpdateSchema = z
  .object({
    id: uuidSchema.optional(),
    name: z.string().min(1).max(256),
    prompt_template: z.string().min(1).max(200_000),
    allowed_tools: z.array(z.string().min(1).max(256)).optional().nullable(),
    agents: z.record(z.string(), z.unknown()).optional(),
    approval: z.enum(['none', 'before', 'after']).optional(),
    config: workflowPhaseConfigSchema.optional(),
  })
  .strict();

const workflowCreateArgsSchema = z.tuple([
  z
    .object({
      userId: uuidSchema,
      name: z.string().min(1).max(256),
      description: z.string().max(4000).optional(),
      phases: z.array(workflowPhaseCreateSchema).max(64).optional(),
    })
    .strict(),
]);

const workflowUpdateArgsSchema = z.tuple([
  z
    .object({
      id: uuidSchema,
      name: z.string().max(256).optional(),
      description: z.string().max(4000).optional(),
      phases: z.array(workflowPhaseUpdateSchema).max(64).optional(),
    })
    .strict(),
]);

const sessionStartArgsSchema = z.tuple([
  z
    .object({
      userId: uuidSchema,
      workspaceId: uuidSchema,
      workflowId: uuidSchema,
      context: z.string().max(200_000).optional(),
      description: z.string().max(1000).optional(),
      gitStrategy: gitStrategySchema.optional(),
    })
    .strict(),
]);

export function registerWorkflowHandlers(
  db: Kysely<Database>,
  services: ServiceRegistry,
  mainWindow: BrowserWindow,
): void {
  registerSecureIpcHandler(mainWindow, 'workflow:list', z.tuple([]), async () => {
    return db.selectFrom('workflows').selectAll().orderBy('updated_at', 'desc').execute();
  });

  registerSecureIpcHandler(
    mainWindow,
    'workflow:get',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      const workflow = await db
        .selectFrom('workflows')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!workflow) return null;

      const phases = await db
        .selectFrom('workflow_phases')
        .selectAll()
        .where('workflow_id', '=', id)
        .orderBy('ordinal', 'asc')
        .execute();

      return { ...workflow, phases };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'workflow:create',
    workflowCreateArgsSchema,
    async (_event, opts) => {
      const workflowId = crypto.randomUUID();
      await db
        .insertInto('workflows')
        .values({
          id: workflowId,
          user_id: opts.userId,
          name: opts.name,
          description: opts.description || null,
        })
        .execute();

      if (opts.phases) {
        for (let i = 0; i < opts.phases.length; i++) {
          const phase = opts.phases[i];
          await db
            .insertInto('workflow_phases')
            .values({
              id: crypto.randomUUID(),
              workflow_id: workflowId,
              ordinal: i,
              name: phase.name,
              prompt_template: phase.prompt_template,
              allowed_tools: phase.allowed_tools ? JSON.stringify(phase.allowed_tools) : null,
              agents: phase.agents ? JSON.stringify(phase.agents) : null,
              approval: phase.approval || 'none',
              config: phase.config ? JSON.stringify(phase.config) : null,
            })
            .execute();
        }
      }

      return db
        .selectFrom('workflows')
        .selectAll()
        .where('id', '=', workflowId)
        .executeTakeFirstOrThrow();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'workflow:update',
    workflowUpdateArgsSchema,
    async (_event, opts) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (opts.name !== undefined) updates.name = opts.name;
      if (opts.description !== undefined) updates.description = opts.description;

      await db.updateTable('workflows').set(updates).where('id', '=', opts.id).execute();

      if (opts.phases) {
        // Merge phases: update existing, insert new, delete removed (if unreferenced).
        // A naive delete-all fails when agents/artifacts reference existing phases.
        const existingPhases = await db
          .selectFrom('workflow_phases')
          .select('id')
          .where('workflow_id', '=', opts.id)
          .execute();
        const existingIds = new Set(existingPhases.map((p) => p.id));
        const incomingIds = new Set(
          opts.phases.map((p) => p.id).filter((id): id is string => !!id),
        );

        // Delete phases that were removed and have no child references
        for (const existing of existingPhases) {
          if (!incomingIds.has(existing.id)) {
            const hasChildren = await db
              .selectFrom('agents')
              .select('id')
              .where('phase_id', '=', existing.id)
              .limit(1)
              .executeTakeFirst();
            if (!hasChildren) {
              const hasArtifacts = await db
                .selectFrom('artifacts')
                .select('id')
                .where('phase_id', '=', existing.id)
                .limit(1)
                .executeTakeFirst();
              if (!hasArtifacts) {
                await db.deleteFrom('workflow_phases').where('id', '=', existing.id).execute();
              }
            }
          }
        }

        // Upsert phases
        for (let i = 0; i < opts.phases.length; i++) {
          const phase = opts.phases[i];
          const phaseValues = {
            ordinal: i,
            name: phase.name,
            prompt_template: phase.prompt_template,
            allowed_tools: phase.allowed_tools ? JSON.stringify(phase.allowed_tools) : null,
            agents: phase.agents ? JSON.stringify(phase.agents) : null,
            approval: phase.approval || 'none',
            config: phase.config ? JSON.stringify(phase.config) : null,
          };

          if (phase.id && existingIds.has(phase.id)) {
            await db
              .updateTable('workflow_phases')
              .set(phaseValues)
              .where('id', '=', phase.id)
              .execute();
          } else {
            await db
              .insertInto('workflow_phases')
              .values({
                id: phase.id || crypto.randomUUID(),
                workflow_id: opts.id,
                ...phaseValues,
              })
              .execute();
          }
        }
      }

      return db
        .selectFrom('workflows')
        .selectAll()
        .where('id', '=', opts.id)
        .executeTakeFirstOrThrow();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'workflow:delete',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      await db.deleteFrom('workflows').where('id', '=', id).execute();
      return { success: true };
    },
  );

  // Session handlers
  registerSecureIpcHandler(mainWindow, 'session:list', z.tuple([]), async () => {
    return db
      .selectFrom('sessions')
      .leftJoin('workflows', 'workflows.id', 'sessions.workflow_id')
      .select([
        'sessions.id',
        'sessions.user_id',
        'sessions.workspace_id',
        'sessions.workflow_id',
        'sessions.status',
        'sessions.current_phase',
        'sessions.context',
        'sessions.description',
        'sessions.created_at',
        'sessions.completed_at',
        'workflows.name as workflow_name',
      ])
      .orderBy('sessions.created_at', 'desc')
      .execute();
  });

  registerSecureIpcHandler(mainWindow, 'session:get', z.tuple([uuidSchema]), async (_event, id) => {
    const session = await db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!session) return null;

    const agents = await db
      .selectFrom('agents')
      .selectAll()
      .where('session_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute();

    const decisions = await db
      .selectFrom('decisions')
      .selectAll()
      .where('session_id', '=', id)
      .orderBy('created_at', 'desc')
      .execute();

    const artifacts = await db
      .selectFrom('artifacts')
      .selectAll()
      .where('session_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute();

    return { ...session, agents, decisions, artifacts };
  });

  registerSecureIpcHandler(
    mainWindow,
    'session:start',
    sessionStartArgsSchema,
    async (_event, opts) => {
      const sessionId = await services.workflowEngine.startSession({
        userId: opts.userId,
        workspaceId: opts.workspaceId,
        workflowId: opts.workflowId,
        context: opts.context,
        description: opts.description,
        gitStrategy: opts.gitStrategy,
      });
      return db
        .selectFrom('sessions')
        .selectAll()
        .where('id', '=', sessionId)
        .executeTakeFirstOrThrow();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'session:pause',
    z.tuple([uuidSchema]),
    async (_event, sessionId) => {
      await services.workflowEngine.pauseSession(sessionId);
      return { success: true };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'session:resume',
    z.tuple([uuidSchema]),
    async (_event, sessionId) => {
      await services.workflowEngine.resumeSession(sessionId);
      return { success: true };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'session:delete',
    z.tuple([uuidSchema]),
    async (_event, sessionId) => {
      // Kill any active agents for this session first
      const activeAgents = services.agentManager
        .getActiveAgents()
        .filter((a) => a.sessionId === sessionId);
      await Promise.all(activeAgents.map((agent) => services.agentManager.killAgent(agent.id)));

      // Collect agent info before deleting rows — we need IDs and worktree paths
      const agentRows = await db
        .selectFrom('agents')
        .select(['id', 'worktree_path'])
        .where('session_id', '=', sessionId)
        .execute();
      const ids = agentRows.map((a) => a.id);
      const worktreePaths = agentRows
        .map((a) => a.worktree_path)
        .filter((p): p is string => !!p);

      // Look up the repo path for git worktree removal
      let repoPath: string | null = null;
      if (worktreePaths.length > 0) {
        const session = await db
          .selectFrom('sessions')
          .select('workspace_id')
          .where('id', '=', sessionId)
          .executeTakeFirst();
        if (session) {
          const workspace = await db
            .selectFrom('workspaces')
            .select('repo_id')
            .where('id', '=', session.workspace_id)
            .executeTakeFirst();
          if (workspace) {
            const repo = await db
              .selectFrom('repos')
              .select('local_path')
              .where('id', '=', workspace.repo_id)
              .executeTakeFirst();
            repoPath = repo?.local_path ?? null;
          }
        }
      }

      // Delete in dependency order (no CASCADE on these FKs)
      // 1. messages -> agents
      if (ids.length > 0) {
        await db.deleteFrom('messages').where('agent_id', 'in', ids).execute();
      }
      // 2. artifacts, decisions, approvals -> agents & sessions
      await db.deleteFrom('artifacts').where('session_id', '=', sessionId).execute();
      await db.deleteFrom('decisions').where('session_id', '=', sessionId).execute();
      await db.deleteFrom('approvals').where('session_id', '=', sessionId).execute();
      // 3. agents -> sessions
      await db.deleteFrom('agents').where('session_id', '=', sessionId).execute();
      // 4. session itself
      await db.deleteFrom('sessions').where('id', '=', sessionId).execute();

      // 5. Clean up on-disk files (messages per agent + artifacts per session)
      for (const agentId of ids) {
        await services.contentStore.deleteTree(`sessions/${agentId}`);
      }
      await services.contentStore.deleteTree(`sessions/${sessionId}`);

      // 6. Remove git worktrees
      for (const wtPath of worktreePaths) {
        try {
          if (repoPath) {
            await services.worktreeManager.removeWorktree(repoPath, wtPath);
          }
        } catch (err) {
          console.warn(`Failed to remove worktree ${wtPath}:`, err);
        }
      }

      return { success: true };
    },
  );

  // Repo branch listing (for git strategy picker)
  registerSecureIpcHandler(
    mainWindow,
    'repo:list-branches',
    z.tuple([uuidSchema]),
    async (_event, workspaceId) => {
      try {
        const workspace = await db
          .selectFrom('workspaces')
          .select('repo_id')
          .where('id', '=', workspaceId)
          .executeTakeFirstOrThrow();
        const repo = await db
          .selectFrom('repos')
          .select('local_path')
          .where('id', '=', workspace.repo_id)
          .executeTakeFirstOrThrow();
        return await services.worktreeManager.listBranches(repo.local_path);
      } catch {
        // Repo path may not exist or not be a git repository
        return [];
      }
    },
  );
}
