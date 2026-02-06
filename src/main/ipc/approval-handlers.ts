import type { BrowserWindow } from 'electron';
import { sql, type Kysely } from 'kysely';
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

const decisionListGroupedArgsSchema = z.tuple([
  z
    .object({
      limit: z.number().int().min(1).max(100).optional().default(20),
      offset: z.number().int().min(0).optional().default(0),
      search: z.string().max(1000).optional(),
      filterType: z.string().max(64).optional(),
      filterStatus: z.string().max(64).optional(),
    })
    .strict()
    .optional(),
]);

const decisionUpdateArgsSchema = z.tuple([
  z
    .object({
      id: uuidSchema,
      question: z.string().max(10_000).optional(),
      choice: z.string().max(10_000).optional(),
      rationale: z.string().max(50_000).optional(),
      alternatives: z.array(z.string().max(10_000)).optional(),
      tags: z.array(z.string().max(256)).optional(),
      status: z.enum(['active', 'invalidated']).optional(),
    })
    .strict(),
]);

function parseSearchString(search: string): { tags: string[]; keywords: string[] } {
  const tags: string[] = [];
  const keywords: string[] = [];
  const tokens = search.match(/(?:tag|keyword):\S+|\S+/g) || [];
  for (const token of tokens) {
    if (token.startsWith('tag:')) {
      tags.push(token.slice(4));
    } else if (token.startsWith('keyword:')) {
      keywords.push(token.slice(8));
    } else {
      keywords.push(token);
    }
  }
  return { tags, keywords };
}

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
    'approval:list-pending-grouped',
    z.tuple([]),
    async () => {
      const approvals = await services.approvalRouter.getPendingApprovals();

      if (approvals.length === 0) {
        return { sessions: [] };
      }

      // Group approvals by session_id
      const approvalsBySession = new Map<string, typeof approvals>();
      for (const a of approvals) {
        const list = approvalsBySession.get(a.session_id) || [];
        list.push(a);
        approvalsBySession.set(a.session_id, list);
      }

      const sessionIds = [...approvalsBySession.keys()];

      // Fetch session metadata
      const sessionMeta = await db
        .selectFrom('sessions')
        .select(['id', 'description', 'status', 'created_at'])
        .where('id', 'in', sessionIds)
        .execute();

      const sessionMetaMap = new Map(sessionMeta.map((s) => [s.id, s]));

      // Build result ordered by earliest pending approval per session
      const sessions = sessionIds.map((sid) => {
        const meta = sessionMetaMap.get(sid);
        return {
          sessionId: sid,
          description: meta?.description ?? null,
          status: meta?.status ?? 'unknown',
          createdAt: meta?.created_at ?? '',
          approvals: approvalsBySession.get(sid) || [],
        };
      });

      return { sessions };
    },
  );

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

  registerSecureIpcHandler(
    mainWindow,
    'decision:list-grouped',
    decisionListGroupedArgsSchema,
    async (_event, opts) => {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;
      const { tags, keywords } = opts?.search
        ? parseSearchString(opts.search)
        : { tags: [] as string[], keywords: [] as string[] };

      // Helper: apply search/type/status filters to a decisions query
      function applyFilters<T>(query: T): T {
        let q = query as ReturnType<typeof db.selectFrom<'decisions'>>;
        if (opts?.filterType) {
          q = q.where('type', '=', opts.filterType) as typeof q;
        }
        if (opts?.filterStatus) {
          q = q.where('status', '=', opts.filterStatus) as typeof q;
        }
        for (const tag of tags) {
          q = q.where('tags', 'like', `%${tag}%`) as typeof q;
        }
        for (const kw of keywords) {
          q = q.where((eb) =>
            eb.or([
              eb('question', 'like', `%${kw}%`),
              eb('choice', 'like', `%${kw}%`),
              eb('rationale', 'like', `%${kw}%`),
            ]),
          ) as typeof q;
        }
        return q as T;
      }

      // Step 1: Get paginated session IDs ordered by most recent decision
      const sessionRows = await applyFilters(
        db
          .selectFrom('decisions')
          .select('session_id')
          .select(sql<string>`max(created_at)`.as('max_created')),
      )
        .groupBy('session_id')
        .orderBy(sql`max_created`, 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

      const sessionIds = sessionRows.map((r) => r.session_id);

      if (sessionIds.length === 0) {
        return { sessions: [], totalSessions: 0, hasMore: false };
      }

      // Step 2: Get total distinct session count
      const countResult = await applyFilters(
        db
          .selectFrom('decisions')
          .select(sql<number>`count(distinct session_id)`.as('total')),
      ).executeTakeFirstOrThrow();

      const totalSessions = Number(countResult.total);

      // Step 3: Fetch session metadata
      const sessionMeta = await db
        .selectFrom('sessions')
        .select(['id', 'description', 'status', 'created_at'])
        .where('id', 'in', sessionIds)
        .execute();

      const sessionMetaMap = new Map(sessionMeta.map((s) => [s.id, s]));

      // Step 4: Fetch all matching decisions for these sessions
      const allDecisions = await applyFilters(
        db
          .selectFrom('decisions')
          .selectAll()
          .where('session_id', 'in', sessionIds)
          .orderBy('created_at', 'desc'),
      ).execute();

      // Group decisions by session
      const decisionsBySession = new Map<string, typeof allDecisions>();
      for (const d of allDecisions) {
        const list = decisionsBySession.get(d.session_id) || [];
        list.push(d);
        decisionsBySession.set(d.session_id, list);
      }

      // Build result in session order
      const sessions = sessionIds.map((sid) => {
        const meta = sessionMetaMap.get(sid);
        return {
          sessionId: sid,
          description: meta?.description ?? null,
          status: meta?.status ?? 'unknown',
          createdAt: meta?.created_at ?? '',
          decisions: decisionsBySession.get(sid) || [],
        };
      });

      return {
        sessions,
        totalSessions,
        hasMore: offset + limit < totalSessions,
      };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'decision:update',
    decisionUpdateArgsSchema,
    async (_event, opts) => {
      const { id, ...fields } = opts;
      const updateObj: Record<string, unknown> = {};

      if (fields.question !== undefined) updateObj.question = fields.question;
      if (fields.choice !== undefined) updateObj.choice = fields.choice;
      if (fields.rationale !== undefined) updateObj.rationale = fields.rationale;
      if (fields.alternatives !== undefined) updateObj.alternatives = JSON.stringify(fields.alternatives);
      if (fields.tags !== undefined) updateObj.tags = JSON.stringify(fields.tags);
      if (fields.status !== undefined) updateObj.status = fields.status;

      if (Object.keys(updateObj).length > 0) {
        await db.updateTable('decisions').set(updateObj).where('id', '=', id).execute();
      }

      return db.selectFrom('decisions').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'decision:delete',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      await db.deleteFrom('decisions').where('id', '=', id).execute();
      return { success: true };
    },
  );
}
