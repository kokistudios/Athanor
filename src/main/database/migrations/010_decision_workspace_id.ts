import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE decisions ADD COLUMN workspace_id TEXT DEFAULT NULL`.execute(db);

  // Backfill existing decisions from their session's workspace_id
  await sql`
    UPDATE decisions
    SET workspace_id = (
      SELECT sessions.workspace_id
      FROM sessions
      WHERE sessions.id = decisions.session_id
    )
    WHERE workspace_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`SELECT 1`.execute(db);
}
