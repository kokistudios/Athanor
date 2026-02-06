import { Kysely, SqliteDialect } from 'kysely';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from '../shared/types/database';

export function createMcpDatabase(dbPath: string): Kysely<Database> {
  const sqliteDb = new BetterSqlite3(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  const dialect = new SqliteDialect({
    database: sqliteDb,
  });

  return new Kysely<Database>({ dialect });
}
