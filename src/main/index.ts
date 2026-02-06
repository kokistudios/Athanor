import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig } from './config/loader';
import { createDatabase } from './database/connection';
import { runMigrations } from './database/migrator';
import { createServices, type ServiceRegistry } from './services/service-registry';
import type { Kysely } from 'kysely';
import type { Database } from '../shared/types/database';
import type { AthanorConfig } from '../shared/types/config';

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
    `Config paths: db=${config.database.sqlite.path} storage=${config.storage.local.path} claude=${config.claude.path || 'claude'}`,
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

app.on('ready', async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error('Bootstrap failed:', err);
  }
  createWindow();

  // Register IPC handlers (Phase 3 will populate this)
  if (services && mainWindow) {
    const { registerIpcHandlers } = await import('./ipc/handlers');
    registerIpcHandlers(db, services, mainWindow);
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
  if (db) {
    await db.destroy();
  }
});

export { db, services, config, mainWindow };
