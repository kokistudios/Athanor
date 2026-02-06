import type { BrowserWindow } from 'electron';
import { dialog, shell } from 'electron';
import { z } from 'zod';
import { registerSecureIpcHandler } from './security';

const openExternalArgsSchema = z.tuple([z.string().min(1).max(4096)]);

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function normalizeExternalUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Blocked URL protocol: ${url.protocol}`);
  }
  return url.toString();
}

export function registerShellHandlers(mainWindow: BrowserWindow): void {
  registerSecureIpcHandler(
    mainWindow,
    'shell:open-external',
    openExternalArgsSchema,
    async (_event, rawUrl) => {
      const safeUrl = normalizeExternalUrl(rawUrl);
      await shell.openExternal(safeUrl);
      return { success: true };
    },
  );

  registerSecureIpcHandler(mainWindow, 'shell:pick-folder', z.tuple([]), async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Repository Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
