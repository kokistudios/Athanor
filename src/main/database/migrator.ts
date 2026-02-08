import { Migrator, type Migration, type MigrationProvider } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import * as m001 from './migrations/001_initial_schema';
import * as m002 from './migrations/002_add_waiting_approval_status';
import * as m003 from './migrations/003_add_session_description';
import * as m004 from './migrations/004_add_artifact_pinned';
import * as m005 from './migrations/005_add_session_git_strategy';
import * as m006 from './migrations/006_multi_repo_workspaces';
import * as m007 from './migrations/007_relay_and_looping';
import * as m008 from './migrations/008_agent_loop_iteration';
import * as m009 from './migrations/009_workflow_git_strategy';
import * as m010 from './migrations/010_decision_workspace_id';

const migrations: Record<string, Migration> = {
  '001_initial_schema': m001,
  '002_add_waiting_approval_status': m002,
  '003_add_session_description': m003,
  '004_add_artifact_pinned': m004,
  '005_add_session_git_strategy': m005,
  '006_multi_repo_workspaces': m006,
  '007_relay_and_looping': m007,
  '008_agent_loop_iteration': m008,
  '009_workflow_git_strategy': m009,
  '010_decision_workspace_id': m010,
};

class InlineMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  }
}

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new InlineMigrationProvider(),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`Migration "${result.migrationName}" executed successfully`);
    } else if (result.status === 'Error') {
      console.error(`Migration "${result.migrationName}" failed`);
    }
  });

  if (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}
