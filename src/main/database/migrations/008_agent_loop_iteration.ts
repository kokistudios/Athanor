import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE agents ADD COLUMN loop_iteration INTEGER DEFAULT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`SELECT 1`.execute(db);
}
