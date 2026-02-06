import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { BrowserWindow as ElectronBrowserWindow, ipcMain } from 'electron';
import { z } from 'zod';
import type { IpcChannel } from '../../shared/types/ipc';

function assertTrustedSender(event: IpcMainInvokeEvent, mainWindow: BrowserWindow): void {
  const trustedWindow = mainWindow.isDestroyed()
    ? ElectronBrowserWindow.getAllWindows()[0]
    : mainWindow;

  if (!trustedWindow) {
    throw new Error('No trusted window is available for IPC validation');
  }

  const trustedWebContents = trustedWindow.webContents;
  const trustedFrame = trustedWebContents.mainFrame;

  if (event.sender.id !== trustedWebContents.id) {
    throw new Error('Unauthorized IPC sender');
  }

  if (event.senderFrame !== trustedFrame) {
    throw new Error('Unauthorized IPC frame');
  }
}

export function registerSecureIpcHandler<TArgs extends unknown[]>(
  mainWindow: BrowserWindow,
  channel: IpcChannel,
  argsSchema: z.ZodType<TArgs>,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, ...rawArgs) => {
    assertTrustedSender(event, mainWindow);
    const args = argsSchema.parse(rawArgs);
    return handler(event, ...args);
  });
}
