import { Kysely, sql } from 'kysely';

/**
 * Corrective migration: finds sessions with status 'active' that have
 * pending phase_gate approvals and sets them to 'waiting_approval'.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite has no CHECK constraints to alter — status is just a text column.
  // Fix any sessions that are 'active' but actually waiting on a gate.
  await sql`
    UPDATE sessions
    SET status = 'waiting_approval'
    WHERE status = 'active'
      AND id IN (
        SELECT session_id FROM approvals
        WHERE type = 'phase_gate' AND status = 'pending'
      )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE sessions
    SET status = 'active'
    WHERE status = 'waiting_approval'
  `.execute(db);
}
