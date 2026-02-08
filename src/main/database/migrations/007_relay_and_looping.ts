import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Store phase summary and completion signal on agent rows
  await sql`ALTER TABLE agents ADD COLUMN phase_summary TEXT`.execute(db);
  await sql`ALTER TABLE agents ADD COLUMN completion_signal TEXT`.execute(db);

  // Store loop iteration state on sessions
  await sql`ALTER TABLE sessions ADD COLUMN loop_state TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite does not support DROP COLUMN before 3.35.0;
  // leave columns in place on rollback.
  await sql`SELECT 1`.execute(db);
}
