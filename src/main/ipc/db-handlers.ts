import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Database } from '../../shared/types/database';
import { registerSecureIpcHandler } from './security';

const execFileAsync = promisify(execFile);

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
      repoId: uuidSchema.optional(),
      repoIds: z.array(uuidSchema).optional(),
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
    // Validate that the path is a git repository
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: opts.localPath });
    } catch {
      throw new Error(
        `"${opts.localPath}" is not a git repository. Please select a folder that contains a .git directory.`,
      );
    }

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

      // Load repos from join table
      const repos = await db
        .selectFrom('workspace_repos')
        .innerJoin('repos', 'repos.id', 'workspace_repos.repo_id')
        .selectAll('repos')
        .where('workspace_repos.workspace_id', '=', id)
        .orderBy('workspace_repos.ordinal', 'asc')
        .execute();

      // Fall back to legacy repo_id if join table is empty
      if (repos.length === 0 && workspace.repo_id) {
        const legacyRepo = await db
          .selectFrom('repos')
          .selectAll()
          .where('id', '=', workspace.repo_id)
          .executeTakeFirst();
        return { ...workspace, repos: legacyRepo ? [legacyRepo] : [], repo: legacyRepo };
      }

      return { ...workspace, repos, repo: repos[0] || null };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'db:create-workspace',
    createWorkspaceArgsSchema,
    async (_event, opts) => {
      const id = crypto.randomUUID();
      // Determine repo IDs: prefer repoIds array, fall back to single repoId
      const repoIds = opts.repoIds && opts.repoIds.length > 0
        ? opts.repoIds
        : opts.repoId
          ? [opts.repoId]
          : [];

      if (repoIds.length === 0) {
        throw new Error('At least one repository is required');
      }

      // Write legacy repo_id (first repo) for backward compat
      await db
        .insertInto('workspaces')
        .values({
          id,
          user_id: opts.userId,
          repo_id: repoIds[0],
          name: opts.name,
          config: opts.config ? JSON.stringify(opts.config) : null,
        })
        .execute();

      // Insert into workspace_repos join table
      for (let i = 0; i < repoIds.length; i++) {
        await db
          .insertInto('workspace_repos')
          .values({
            workspace_id: id,
            repo_id: repoIds[i],
            ordinal: i,
          })
          .execute();
      }

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

  // Workspace repos management
  registerSecureIpcHandler(
    mainWindow,
    'db:workspace-repos',
    z.tuple([uuidSchema]),
    async (_event, workspaceId) => {
      return db
        .selectFrom('workspace_repos')
        .innerJoin('repos', 'repos.id', 'workspace_repos.repo_id')
        .selectAll('repos')
        .select('workspace_repos.ordinal')
        .where('workspace_repos.workspace_id', '=', workspaceId)
        .orderBy('workspace_repos.ordinal', 'asc')
        .execute();
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'db:workspace-add-repo',
    z.tuple([z.object({ workspaceId: uuidSchema, repoId: uuidSchema }).strict()]),
    async (_event, opts) => {
      // Determine next ordinal
      const last = await db
        .selectFrom('workspace_repos')
        .select('ordinal')
        .where('workspace_id', '=', opts.workspaceId)
        .orderBy('ordinal', 'desc')
        .executeTakeFirst();
      const nextOrdinal = last ? last.ordinal + 1 : 0;

      await db
        .insertInto('workspace_repos')
        .values({
          workspace_id: opts.workspaceId,
          repo_id: opts.repoId,
          ordinal: nextOrdinal,
        })
        .execute();

      // Update legacy repo_id if this is the first repo
      if (nextOrdinal === 0) {
        await db
          .updateTable('workspaces')
          .set({ repo_id: opts.repoId })
          .where('id', '=', opts.workspaceId)
          .execute();
      }

      return { success: true };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'db:workspace-remove-repo',
    z.tuple([z.object({ workspaceId: uuidSchema, repoId: uuidSchema }).strict()]),
    async (_event, opts) => {
      await db
        .deleteFrom('workspace_repos')
        .where('workspace_id', '=', opts.workspaceId)
        .where('repo_id', '=', opts.repoId)
        .execute();

      // Update legacy repo_id to the new primary (ordinal 0)
      const primary = await db
        .selectFrom('workspace_repos')
        .select('repo_id')
        .where('workspace_id', '=', opts.workspaceId)
        .orderBy('ordinal', 'asc')
        .executeTakeFirst();
      if (primary) {
        await db
          .updateTable('workspaces')
          .set({ repo_id: primary.repo_id })
          .where('id', '=', opts.workspaceId)
          .execute();
      }

      return { success: true };
    },
  );
}
