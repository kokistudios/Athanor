---
name: add-migration
description: Add a new database migration with Kysely schema builder and update TypeScript table types
disable-model-invocation: true
argument-hint: [description-of-schema-change]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Add Database Migration

Create a new Kysely migration for the Athanor SQLite database and update the corresponding TypeScript types.

**User request:** $ARGUMENTS

## Steps

### 1. Determine the next migration number

Check `src/main/database/migrations/` for the highest numbered migration file and increment by 1. Use zero-padded 3-digit format: `001`, `002`, `003`, etc.

### 2. Create migration file

Create `src/main/database/migrations/NNN_<descriptive_name>.ts` with this structure:

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Use db.schema builder for DDL operations
  // For new tables:
  await db.schema
    .createTable('table_name')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('optional_field', 'text')
    .addColumn('created_at', 'text', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // For altering tables:
  await db.schema
    .alterTable('existing_table')
    .addColumn('new_column', 'text')
    .execute();

  // For indexes:
  await db.schema
    .createIndex('idx_table_column')
    .on('table_name')
    .column('column_name')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse operations in opposite order
  // Drop tables, remove columns, drop indexes
}
```

**SQLite column types used in this project:**
- `'text'` for strings, UUIDs, JSON, timestamps, enums
- `'integer'` for numbers
- All IDs are UUIDs stored as `text` with `.primaryKey()`
- All timestamps stored as `text` with `CURRENT_TIMESTAMP` default
- Foreign keys use `.references('table.column')` with optional `.onDelete('cascade')`
- JSON data stored as `text` (serialized/deserialized in handlers)
- Enum values stored as `text` (validated by domain types)

### 3. Update TypeScript table types

Edit `src/shared/types/database.ts`:

- Add/modify the `*Table` interface for the affected table
- Use `Generated<string>` for columns with database defaults (created_at, status, etc.)
- Use `string | null` for nullable columns
- If adding a new table, add it to the `Database` interface

### 4. Update domain types if needed

If adding new enum-like columns, add const arrays and type unions to `src/shared/types/domain.ts`:

```typescript
export const MY_STATUSES = ['active', 'inactive'] as const;
export type MyStatus = typeof MY_STATUSES[number];
```

### 5. Register migration in migrator

Check `src/main/database/migrator.ts` and ensure the new migration is included in the migration provider. If it uses file-based discovery, no change needed. If it uses explicit imports, add the new migration.

## Conventions

- Always provide both `up` and `down` functions
- `down` should fully reverse `up` operations
- Drop tables in reverse dependency order (child tables first)
- Use unique constraints via `.addUniqueConstraint()` for composite uniqueness
- Enable foreign keys with `await sql\`PRAGMA foreign_keys = ON\`.execute(db)` if creating tables with FK references
