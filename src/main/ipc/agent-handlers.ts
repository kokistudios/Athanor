import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
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
    return db.selectFrom('agents').selectAll().orderBy('created_at', 'desc').execute();
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
      await services.agentManager.sendInput(agentId, input);
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
