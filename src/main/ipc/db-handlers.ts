import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../../shared/types/database';
import { registerSecureIpcHandler } from './security';

const uuidSchema = z.string().uuid();
const optionalStringSchema = z.string().max(4096).optional();
const nullableOptionalStringSchema = z.string().max(4096).optional().nullable();

const addRepoArgsSchema = z.tuple([
  z
    .object({
      name: z.string().min(1).max(256),
      localPath: z.string().min(1).max(4096),
      remoteUrl: nullableOptionalStringSchema,
    })
    .strict(),
]);

const updateRepoArgsSchema = z.tuple([
  z
    .object({
      id: uuidSchema,
      name: optionalStringSchema,
      localPath: optionalStringSchema,
      remoteUrl: nullableOptionalStringSchema,
    })
    .strict(),
]);

const createWorkspaceArgsSchema = z.tuple([
  z
    .object({
      userId: uuidSchema,
      repoId: uuidSchema,
      name: z.string().min(1).max(256),
      config: z.unknown().optional(),
    })
    .strict(),
]);

const updateWorkspaceArgsSchema = z.tuple([
  z
    .object({
      id: uuidSchema,
      name: optionalStringSchema,
      repoId: uuidSchema.optional(),
      config: z.unknown().optional(),
    })
    .strict(),
]);

export function registerDbHandlers(db: Kysely<Database>, mainWindow: BrowserWindow): void {
  registerSecureIpcHandler(mainWindow, 'db:get-user', z.tuple([]), async () => {
    return db.selectFrom('users').selectAll().executeTakeFirst();
  });

  registerSecureIpcHandler(mainWindow, 'db:list-repos', z.tuple([]), async () => {
    return db.selectFrom('repos').selectAll().orderBy('created_at', 'desc').execute();
  });

  registerSecureIpcHandler(mainWindow, 'db:add-repo', addRepoArgsSchema, async (_event, opts) => {
    const id = crypto.randomUUID();
    await db
      .insertInto('repos')
      .values({
        id,
        name: opts.name,
        local_path: opts.localPath,
        remote_url: opts.remoteUrl || null,
      })
      .execute();
    return db.selectFrom('repos').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  });

  registerSecureIpcHandler(
    mainWindow,
    'db:update-repo',
    updateRepoArgsSchema,
    async (_event, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.name !== undefined) updates.name = opts.name;
      if (opts.localPath !== undefined) updates.local_path = opts.localPath;
      if (opts.remoteUrl !== undefined) updates.remote_url = opts.remoteUrl;
      if (Object.keys(updates).length > 0) {
        await db.updateTable('repos').set(updates).where('id', '=', opts.id).execute();
      }
      return db.selectFrom('repos').selectAll().where('id', '=', opts.id).executeTakeFirstOrThrow();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'db:delete-repo',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      await db.deleteFrom('repos').where('id', '=', id).execute();
      return { success: true };
    },
  );

  registerSecureIpcHandler(mainWindow, 'db:list-workspaces', z.tuple([]), async () => {
    return db.selectFrom('workspaces').selectAll().orderBy('created_at', 'desc').execute();
  });

  registerSecureIpcHandler(
    mainWindow,
    'db:get-workspace',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      const workspace = await db
        .selectFrom('workspaces')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!workspace) return null;
      const repo = await db
        .selectFrom('repos')
        .selectAll()
        .where('id', '=', workspace.repo_id)
        .executeTakeFirst();
      return { ...workspace, repo };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'db:create-workspace',
    createWorkspaceArgsSchema,
    async (_event, opts) => {
      const id = crypto.randomUUID();
      await db
        .insertInto('workspaces')
        .values({
          id,
          user_id: opts.userId,
          repo_id: opts.repoId,
          name: opts.name,
          config: opts.config ? JSON.stringify(opts.config) : null,
        })
        .execute();
      return db.selectFrom('workspaces').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'db:update-workspace',
    updateWorkspaceArgsSchema,
    async (_event, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.name !== undefined) updates.name = opts.name;
      if (opts.repoId !== undefined) updates.repo_id = opts.repoId;
      if (opts.config !== undefined)
        updates.config = opts.config ? JSON.stringify(opts.config) : null;
      if (Object.keys(updates).length > 0) {
        await db.updateTable('workspaces').set(updates).where('id', '=', opts.id).execute();
      }
      return db
        .selectFrom('workspaces')
        .selectAll()
        .where('id', '=', opts.id)
        .executeTakeFirstOrThrow();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'db:delete-workspace',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      await db.deleteFrom('workspaces').where('id', '=', id).execute();
      return { success: true };
    },
  );
}
