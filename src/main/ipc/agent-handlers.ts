import type { BrowserWindow } from 'electron';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../../shared/types/database';
import type { ServiceRegistry } from '../services/service-registry';
import { registerSecureIpcHandler } from './security';

const agentIdSchema = z.string().uuid();
const sendInputArgsSchema = z.tuple([agentIdSchema, z.string().min(1).max(200_000)]);

export function registerAgentHandlers(
  db: Kysely<Database>,
  services: ServiceRegistry,
  mainWindow: BrowserWindow,
): void {
  registerSecureIpcHandler(mainWindow, 'agent:list', z.tuple([]), async () => {
    return db
      .selectFrom('agents')
      .innerJoin('sessions', 'sessions.id', 'agents.session_id')
      .innerJoin('workflows', 'workflows.id', 'sessions.workflow_id')
      .select([
        'agents.id',
        'agents.session_id',
        'agents.phase_id',
        'agents.name',
        'agents.status',
        'agents.created_at',
        'sessions.description as session_description',
        'sessions.status as session_status',
        'sessions.current_phase as session_current_phase',
        'sessions.created_at as session_created_at',
        'workflows.name as workflow_name',
        sql<number>`(select count(*) from workflow_phases where workflow_phases.workflow_id = sessions.workflow_id)`.as('session_total_phases'),
      ])
      .orderBy('sessions.created_at', 'desc')
      .orderBy('agents.created_at', 'desc')
      .orderBy(sql`agents.rowid`, 'desc')
      .execute();
  });

  registerSecureIpcHandler(
    mainWindow,
    'agent:get-messages',
    z.tuple([agentIdSchema]),
    async (_event, agentId) => {
      const messages = await db
        .selectFrom('messages')
        .selectAll()
        .where('agent_id', '=', agentId)
        .orderBy('created_at', 'asc')
        .execute();

      return Promise.all(
        messages.map(async (message) => {
          if (!message.content_path) {
            return message;
          }
          try {
            const fullContent = await services.contentStore.read(message.content_path);
            return {
              ...message,
              content_preview: fullContent.toString('utf-8'),
            };
          } catch {
            // Fallback to preview if backing content cannot be read.
            return message;
          }
        }),
      );
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'agent:send-input',
    sendInputArgsSchema,
    async (_event, agentId, input) => {
      // Check if the agent was waiting before sending input
      const agent = await db
        .selectFrom('agents')
        .select(['status', 'session_id'])
        .where('id', '=', agentId)
        .executeTakeFirst();

      await services.agentManager.sendInput(agentId, input);

      if (agent && agent.status === 'waiting') {
        // Set agent status back to running
        await db
          .updateTable('agents')
          .set({ status: 'running' })
          .where('id', '=', agentId)
          .execute();
        mainWindow.webContents.send('agent:status-change', { agentId, status: 'running' });

        // Auto-resolve any pending agent_idle/needs_input approvals for this agent
        const pendingApprovals = await db
          .selectFrom('approvals')
          .select(['id'])
          .where('agent_id', '=', agentId)
          .where('status', '=', 'pending')
          .where((eb) =>
            eb.or([eb('type', '=', 'agent_idle'), eb('type', '=', 'needs_input')]),
          )
          .execute();

        for (const approval of pendingApprovals) {
          await db
            .updateTable('approvals')
            .set({
              status: 'approved' as const,
              response: 'Resolved via chat',
              resolved_at: new Date().toISOString(),
            })
            .where('id', '=', approval.id)
            .execute();
          mainWindow.webContents.send('approval:resolved', {
            id: approval.id,
            agent_id: agentId,
            type: 'agent_idle',
            status: 'approved',
          });
        }

        // Set session back to active
        await services.workflowEngine.setSessionStatus(agent.session_id, 'active');
      }

      return { success: true };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'agent:kill',
    z.tuple([agentIdSchema]),
    async (_event, agentId) => {
      await services.agentManager.killAgent(agentId);
      return { success: true };
    },
  );
}
