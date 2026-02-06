import type { BrowserWindow } from 'electron';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { ServiceRegistry } from '../services/service-registry';
import { registerDbHandlers } from './db-handlers';
import { registerAgentHandlers } from './agent-handlers';
import { registerWorkflowHandlers } from './workflow-handlers';
import { registerApprovalHandlers } from './approval-handlers';
import { setupStreamingBridge } from './streaming-bridge';
import { registerArtifactHandlers } from './artifact-handlers';
import { registerShellHandlers } from './shell-handlers';

export function registerIpcHandlers(
  db: Kysely<Database>,
  services: ServiceRegistry,
  mainWindow: BrowserWindow,
): void {
  registerDbHandlers(db, mainWindow);
  registerAgentHandlers(db, services, mainWindow);
  registerWorkflowHandlers(db, services, mainWindow);
  registerApprovalHandlers(db, services, mainWindow);
  registerArtifactHandlers(db, services.contentStore, mainWindow);
  registerShellHandlers(mainWindow);
  setupStreamingBridge(services, mainWindow);

  console.log('IPC handlers registered');
}
