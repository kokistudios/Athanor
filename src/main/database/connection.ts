import { Kysely, SqliteDialect } from 'kysely';
import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { Database } from '../../shared/types/database';

export function createDatabase(dbPath: string): Kysely<Database> {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(dbDir, 0o700);
  } catch {
    // Best-effort hardening.
  }

  const sqliteDb = new BetterSqlite3(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  try {
    fs.chmodSync(dbPath, 0o600);
  } catch {
    // Best-effort hardening.
  }

  const dialect = new SqliteDialect({
    database: sqliteDb,
  });

  return new Kysely<Database>({ dialect });
}
