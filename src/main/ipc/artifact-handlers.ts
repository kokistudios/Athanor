import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../../shared/types/database';
import type { ContentStore } from '../services/content-store';
import { registerSecureIpcHandler } from './security';

const uuidSchema = z.string().uuid();

export function registerArtifactHandlers(
  db: Kysely<Database>,
  contentStore: ContentStore,
  mainWindow: BrowserWindow,
): void {
  registerSecureIpcHandler(
    mainWindow,
    'artifact:read',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      const artifact = await db
        .selectFrom('artifacts')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!artifact) return null;

      try {
        const buf = await contentStore.read(artifact.file_path);
        return buf.toString('utf-8');
      } catch {
        return null;
      }
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'artifact:toggle-pin',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      const artifact = await db
        .selectFrom('artifacts')
        .select('pinned')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!artifact) return null;

      const newPinned = artifact.pinned ? 0 : 1;
      await db
        .updateTable('artifacts')
        .set({ pinned: newPinned })
        .where('id', '=', id)
        .execute();

      return { pinned: newPinned };
    },
  );

  registerSecureIpcHandler(
    mainWindow,
    'artifact:delete',
    z.tuple([uuidSchema]),
    async (_event, id) => {
      const artifact = await db
        .selectFrom('artifacts')
        .select('file_path')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!artifact) return { success: false };

      await contentStore.delete(artifact.file_path);
      await db.deleteFrom('artifacts').where('id', '=', id).execute();

      return { success: true };
    },
  );
}
