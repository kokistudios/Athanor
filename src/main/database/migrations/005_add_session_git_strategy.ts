import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE sessions ADD COLUMN git_strategy TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite does not support DROP COLUMN before 3.35.0;
  // for safety we leave the column in place on rollback.
  await sql`SELECT 1`.execute(db);
}
