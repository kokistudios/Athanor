import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { ApprovalRouter } from './approval-router';

/**
 * Polls the database for approvals created outside the main Electron process
 * (e.g. by the MCP server writing directly to SQLite) and feeds them into
 * the normal ApprovalRouter event pipeline so the renderer stays in sync.
 */
export class McpBridge {
  private knownIds = new Set<string>();
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Kysely<Database>,
    private approvalRouter: ApprovalRouter,
    private pollMs = 2000,
  ) {}

  /** Seed known IDs from current pending approvals, then begin polling. */
  async start(): Promise<void> {
    const existing = await this.db
      .selectFrom('approvals')
      .select('id')
      .where('status', '=', 'pending')
      .execute();

    for (const row of existing) {
      this.knownIds.add(row.id);
    }

    this.interval = setInterval(() => {
      void this.poll();
    }, this.pollMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Called by ApprovalRouter.createApproval() to register in-process approvals. */
  markKnown(id: string): void {
    this.knownIds.add(id);
  }

  private async poll(): Promise<void> {
    try {
      const pending = await this.db
        .selectFrom('approvals')
        .selectAll()
        .where('status', '=', 'pending')
        .execute();

      for (const approval of pending) {
        if (!this.knownIds.has(approval.id)) {
          this.knownIds.add(approval.id);
          this.approvalRouter.emit('approval:new', approval);
        }
      }
    } catch (err) {
      console.error('[McpBridge] poll error:', err);
    }
  }
}
