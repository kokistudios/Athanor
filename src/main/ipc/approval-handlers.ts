import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../../shared/types/database';
import type { ServiceRegistry } from '../services/service-registry';
import { registerSecureIpcHandler } from './security';

const uuidSchema = z.string().uuid();

const resolveApprovalArgsSchema = z.tuple([
  z
    .object({
      id: uuidSchema,
      status: z.enum(['approved', 'rejected']),
      userId: uuidSchema,
      response: z.string().max(50_000).optional(),
    })
    .strict(),
]);

const decisionListArgsSchema = z.tuple([
  z
    .object({
      sessionId: uuidSchema.optional(),
      agentId: uuidSchema.optional(),
      tags: z.array(z.string().max(256)).optional(),
      status: z.string().max(64).optional(),
    })
    .strict()
    .optional(),
]);

export function registerApprovalHandlers(
  db: Kysely<Database>,
  services: ServiceRegistry,
  mainWindow: BrowserWindow,
): void {
  registerSecureIpcHandler(mainWindow, 'approval:list-pending', z.tuple([]), async () => {
    return services.approvalRouter.getPendingApprovals();
  });

  registerSecureIpcHandler(
    mainWindow,
    'approval:resolve',
    resolveApprovalArgsSchema,
    async (_event, opts) => {
      await services.approvalRouter.resolveApproval(opts);
      return { success: true };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'decision:list',
    decisionListArgsSchema,
    async (_event, filters) => {
      let query = db.selectFrom('decisions').selectAll().orderBy('created_at', 'desc');

      if (filters?.sessionId) {
        query = query.where('session_id', '=', filters.sessionId);
      }
      if (filters?.agentId) {
        query = query.where('agent_id', '=', filters.agentId);
      }
      if (filters?.status) {
        query = query.where('status', '=', filters.status);
      }
      if (filters?.tags && filters.tags.length > 0) {
        for (const tag of filters.tags) {
          query = query.where('tags', 'like', `%${tag}%`);
        }
      }

      return query.execute();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'decision:get',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      return db.selectFrom('decisions').selectAll().where('id', '=', id).executeTakeFirst();
    },
  );
}
