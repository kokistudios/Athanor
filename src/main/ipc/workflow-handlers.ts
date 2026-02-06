import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../../shared/types/database';
import type { ServiceRegistry } from '../services/service-registry';
import { registerSecureIpcHandler } from './security';

const uuidSchema = z.string().uuid();
const permissionModeSchema = z.enum(['default', 'bypassPermissions']);
const workflowPhaseConfigSchema = z
  .object({
    permission_mode: permissionModeSchema.optional(),
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
        // Delete existing phases and recreate
        await db.deleteFrom('workflow_phases').where('workflow_id', '=', opts.id).execute();

        for (let i = 0; i < opts.phases.length; i++) {
          const phase = opts.phases[i];
          await db
            .insertInto('workflow_phases')
            .values({
              id: phase.id || crypto.randomUUID(),
              workflow_id: opts.id,
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
    return db.selectFrom('sessions').selectAll().orderBy('created_at', 'desc').execute();
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

    return { ...session, agents, decisions };
  });

  registerSecureIpcHandler(
    mainWindow,
    'session:start',
    sessionStartArgsSchema,
    async (_event, opts) => {
      const sessionId = await services.workflowEngine.startSession(opts);
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

      // Delete in dependency order (no CASCADE on these FKs)
      // 1. messages -> agents
      const agentIds = await db
        .selectFrom('agents')
        .select('id')
        .where('session_id', '=', sessionId)
        .execute();
      const ids = agentIds.map((a) => a.id);

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

      return { success: true };
    },
  );
}
