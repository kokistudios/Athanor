import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { ApprovalType, ApprovalStatus } from '../../shared/types/domain';
import type { McpBridge } from './mcp-bridge';

export interface CreateApprovalOptions {
  sessionId: string;
  agentId?: string;
  type: ApprovalType;
  summary: string;
  payload?: unknown;
}

export interface ResolveApprovalOptions {
  id: string;
  status: 'approved' | 'rejected';
  userId: string;
  response?: string;
}

export class ApprovalRouter extends EventEmitter {
  private bridge: McpBridge | null = null;

  constructor(private db: Kysely<Database>) {
    super();
  }

  registerBridge(bridge: McpBridge): void {
    this.bridge = bridge;
  }

  async createApproval(opts: CreateApprovalOptions): Promise<string> {
    const id = crypto.randomUUID();

    // Register with bridge before DB insert to prevent double-emission
    this.bridge?.markKnown(id);

    await this.db
      .insertInto('approvals')
      .values({
        id,
        session_id: opts.sessionId,
        agent_id: opts.agentId || null,
        type: opts.type,
        summary: opts.summary,
        payload: opts.payload ? JSON.stringify(opts.payload) : null,
      })
      .execute();

    const approval = await this.db
      .selectFrom('approvals')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    this.emit('approval:new', approval);
    return id;
  }

  async resolveApproval(opts: ResolveApprovalOptions): Promise<void> {
    await this.db
      .updateTable('approvals')
      .set({
        status: opts.status,
        resolved_by: opts.userId,
        response: opts.response || null,
        resolved_at: new Date().toISOString(),
      })
      .where('id', '=', opts.id)
      .execute();

    const approval = await this.db
      .selectFrom('approvals')
      .selectAll()
      .where('id', '=', opts.id)
      .executeTakeFirstOrThrow();

    this.emit('approval:resolved', approval);
  }

  async getPendingApprovals() {
    return this.db
      .selectFrom('approvals')
      .selectAll()
      .where('status', '=', 'pending')
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getApproval(id: string) {
    return this.db.selectFrom('approvals').selectAll().where('id', '=', id).executeTakeFirst();
  }
}
