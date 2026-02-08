import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create workspace_repos join table
  await sql`
    CREATE TABLE workspace_repos (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      repo_id TEXT NOT NULL REFERENCES repos(id),
      ordinal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (workspace_id, repo_id)
    )
  `.execute(db);

  // Backfill from existing workspaces.repo_id (skip orphaned FKs)
  await sql`
    INSERT INTO workspace_repos (workspace_id, repo_id, ordinal)
    SELECT w.id, w.repo_id, 0
    FROM workspaces w
    WHERE EXISTS (SELECT 1 FROM repos r WHERE r.id = w.repo_id)
  `.execute(db);

  // Add worktree_manifest column to agents
  await sql`ALTER TABLE agents ADD COLUMN worktree_manifest TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS workspace_repos`.execute(db);
  // SQLite does not support DROP COLUMN before 3.35.0;
  // leave worktree_manifest in place on rollback.
  await sql`SELECT 1`.execute(db);
}
