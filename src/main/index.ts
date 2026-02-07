import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig } from './config/loader';
import { createDatabase } from './database/connection';
import { runMigrations } from './database/migrator';
import { createServices, type ServiceRegistry } from './services/service-registry';
import type { Kysely } from 'kysely';
import type { Database } from '../shared/types/database';
import type { AthanorConfig } from '../shared/types/config';
import type { ContentStore } from './services/content-store';

app.name = 'Athanor';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require('electron-squirrel-startup')) {
  app.quit();
}

let db: Kysely<Database>;
let services: ServiceRegistry;
let config: AthanorConfig;
let mainWindow: BrowserWindow | null = null;

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

async function ensureUser(db: Kysely<Database>): Promise<void> {
  const existing = await db.selectFrom('users').selectAll().executeTakeFirst();
  if (existing) return;

  let name = 'Athanor User';
  let email: string | null = null;

  try {
    name = execSync('git config user.name', { encoding: 'utf-8' }).trim() || name;
  } catch {
    // ignore
  }
  try {
    email = execSync('git config user.email', { encoding: 'utf-8' }).trim() || null;
  } catch {
    // ignore
  }

  await db
    .insertInto('users')
    .values({
      id: crypto.randomUUID(),
      name,
      email,
    })
    .execute();

  console.log(`Created user: ${name} <${email}>`);
}

async function bootstrap(): Promise<void> {
  config = loadConfig();
  console.log('Loaded config');
  console.log(
    `Config paths: db=${config.database.sqlite.path} storage=${config.storage.local.path} claude=${config.claude.path || 'claude'} codex=${config.codex.path || 'codex'}`,
  );

  // Initialize database
  db = createDatabase(config.database.sqlite.path);
  await runMigrations(db);
  console.log('Database initialized');

  // Auto-create user
  await ensureUser(db);

  // Initialize services
  services = createServices(db, config);
  console.log('Services initialized');
}

async function cleanupExpiredArtifacts(
  database: Kysely<Database>,
  contentStore: ContentStore,
): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const expired = await database
    .selectFrom('artifacts')
    .selectAll()
    .where('pinned', '=', 0)
    .where('created_at', '<', sevenDaysAgo)
    .execute();

  if (expired.length === 0) return;

  for (const artifact of expired) {
    await contentStore.delete(artifact.file_path);
  }

  await database
    .deleteFrom('artifacts')
    .where('pinned', '=', 0)
    .where('created_at', '<', sevenDaysAgo)
    .execute();

  console.log(`Cleaned up ${expired.length} expired artifact(s)`);
}

const getIconPath = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon_logo.png');
  }
  return path.join(app.getAppPath(), 'icon_logo.png');
};

const createWindow = (): void => {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon);
  }

  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    title: 'Athanor',
    icon,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Never allow renderer-initiated popups/new windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  let initialLoadComplete = false;
  mainWindow.webContents.once('did-finish-load', () => {
    initialLoadComplete = true;
  });

  // Prevent renderer from navigating away from the app shell.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!initialLoadComplete) return;
    const currentUrl = mainWindow?.webContents.getURL();
    if (!currentUrl) return;
    if (url !== currentUrl) {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const specWindows = new Set<BrowserWindow>();

function openSpecPopout(opts?: { x?: number; y?: number }): void {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  const winOpts: Electron.BrowserWindowConstructorOptions = {
    width: 720,
    height: 600,
    title: 'Athanor — Spec Editor',
    icon,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (opts?.x != null && opts?.y != null) {
    winOpts.x = Math.round(opts.x - 360);
    winOpts.y = Math.round(opts.y - 40);
  }

  const specWin = new BrowserWindow(winOpts);
  specWindows.add(specWin);

  specWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const entryUrl = `${MAIN_WINDOW_WEBPACK_ENTRY}#spec-popout`;
  specWin.loadURL(entryUrl);

  specWin.on('closed', () => {
    specWindows.delete(specWin);
  });
}

app.on('ready', async () => {
  try {
    await bootstrap();
    await cleanupExpiredArtifacts(db, services.contentStore);
  } catch (err) {
    console.error('Bootstrap failed:', err);
  }
  createWindow();

  // Spec popout window — no services dependency, register unconditionally
  ipcMain.handle('window:open-spec-popout', (_event, opts?: { x?: number; y?: number }) => {
    openSpecPopout(opts);
  });

  // Register IPC handlers (Phase 3 will populate this)
  if (services && mainWindow) {
    const { registerIpcHandlers } = await import('./ipc/handlers');
    registerIpcHandlers(db, services, mainWindow);

    // Start MCP bridge polling and recover orphaned sessions
    await services.mcpBridge.start();
    await services.workflowEngine.recoverSessions();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('quit', async () => {
  if (services) {
    services.mcpBridge.stop();
  }
  if (db) {
    await db.destroy();
  }
});

export { db, services, config, mainWindow };
