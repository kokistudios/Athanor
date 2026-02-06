import type { BrowserWindow } from 'electron';
import type { ServiceRegistry } from '../services/service-registry';

export function setupStreamingBridge(services: ServiceRegistry, mainWindow: BrowserWindow): void {
  // Forward agent events to renderer
  services.agentManager.on('agent:token', (data: unknown) => {
    mainWindow.webContents.send('agent:token', data);
  });

  services.agentManager.on('agent:message', (data: unknown) => {
    console.log('[bridge] agent:message');
    mainWindow.webContents.send('agent:message', data);
  });

  services.agentManager.on('agent:status-change', (data: unknown) => {
    console.log('[bridge] agent:status-change');
    mainWindow.webContents.send('agent:status-change', data);
  });

  services.agentManager.on('agent:completed', (data: unknown) => {
    console.log('[bridge] agent:completed');
    mainWindow.webContents.send('agent:completed', data);
  });

  services.agentManager.on('agent:init', () => {
    console.log('[bridge] agent:init');
  });

  // Forward approval events to renderer
  services.approvalRouter.on('approval:new', (data: unknown) => {
    mainWindow.webContents.send('approval:new', data);
  });

  services.approvalRouter.on('approval:resolved', (data: unknown) => {
    mainWindow.webContents.send('approval:resolved', data);
  });

  // Forward session status events to renderer
  services.workflowEngine.on('session:status-change', (data: unknown) => {
    mainWindow.webContents.send('session:status-change', data);
  });

  services.workflowEngine.on('phase:advanced', (data: unknown) => {
    mainWindow.webContents.send('phase:advanced', data);
  });
}
