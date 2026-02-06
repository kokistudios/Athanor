import { Migrator, type Migration, type MigrationProvider } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import * as m001 from './migrations/001_initial_schema';
import * as m002 from './migrations/002_add_waiting_approval_status';
import * as m003 from './migrations/003_add_session_description';
import * as m004 from './migrations/004_add_artifact_pinned';

const migrations: Record<string, Migration> = {
  '001_initial_schema': m001,
  '002_add_waiting_approval_status': m002,
  '003_add_session_description': m003,
  '004_add_artifact_pinned': m004,
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
