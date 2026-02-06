import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`PRAGMA foreign_keys = ON`.execute(db);

  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('email', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('repos')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('remote_url', 'text')
    .addColumn('local_path', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('workspaces')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id'))
    .addColumn('repo_id', 'text', (col) => col.notNull().references('repos.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('config', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('workflows')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('workflow_phases')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('workflow_id', 'text', (col) =>
      col.notNull().references('workflows.id').onDelete('cascade'),
    )
    .addColumn('ordinal', 'integer', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('prompt_template', 'text', (col) => col.notNull())
    .addColumn('allowed_tools', 'text')
    .addColumn('agents', 'text')
    .addColumn('approval', 'text', (col) => col.notNull().defaultTo('none'))
    .addColumn('config', 'text')
    .addUniqueConstraint('workflow_phases_workflow_ordinal', ['workflow_id', 'ordinal'])
    .execute();

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id'))
    .addColumn('workspace_id', 'text', (col) => col.notNull().references('workspaces.id'))
    .addColumn('workflow_id', 'text', (col) => col.notNull().references('workflows.id'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('current_phase', 'integer')
    .addColumn('context', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('completed_at', 'text')
    .execute();

  await db.schema
    .createTable('agents')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'text', (col) => col.notNull().references('sessions.id'))
    .addColumn('phase_id', 'text', (col) => col.notNull().references('workflow_phases.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('worktree_path', 'text')
    .addColumn('branch', 'text')
    .addColumn('claude_session_id', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('spawning'))
    .addColumn('spawned_by', 'text', (col) => col.references('agents.id'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('completed_at', 'text')
    .execute();

  await db.schema
    .createTable('messages')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('agent_id', 'text', (col) => col.notNull().references('agents.id'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('content_preview', 'text')
    .addColumn('content_path', 'text')
    .addColumn('parent_tool_use_id', 'text')
    .addColumn('metadata', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('artifacts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'text', (col) => col.notNull().references('sessions.id'))
    .addColumn('phase_id', 'text', (col) => col.notNull().references('workflow_phases.id'))
    .addColumn('agent_id', 'text', (col) => col.notNull().references('agents.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('file_path', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('decisions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'text', (col) => col.notNull().references('sessions.id'))
    .addColumn('agent_id', 'text', (col) => col.references('agents.id'))
    .addColumn('question', 'text', (col) => col.notNull())
    .addColumn('choice', 'text', (col) => col.notNull())
    .addColumn('alternatives', 'text')
    .addColumn('rationale', 'text', (col) => col.notNull())
    .addColumn('tags', 'text')
    .addColumn('type', 'text', (col) => col.notNull().defaultTo('decision'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('origin', 'text', (col) => col.notNull().defaultTo('agent'))
    .addColumn('supersedes', 'text', (col) => col.references('decisions.id'))
    .addColumn('superseded_by', 'text', (col) => col.references('decisions.id'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('approvals')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'text', (col) => col.notNull().references('sessions.id'))
    .addColumn('agent_id', 'text', (col) => col.references('agents.id'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('summary', 'text', (col) => col.notNull())
    .addColumn('payload', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('resolved_by', 'text', (col) => col.references('users.id'))
    .addColumn('response', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('resolved_at', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = [
    'approvals',
    'decisions',
    'artifacts',
    'messages',
    'agents',
    'sessions',
    'workflow_phases',
    'workflows',
    'workspaces',
    'repos',
    'users',
  ];
  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
