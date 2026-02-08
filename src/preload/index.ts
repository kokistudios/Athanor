import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, PushChannel } from '../shared/types/ipc';

const ALLOWED_REQUEST_CHANNELS = new Set<IpcChannel>([
  'db:get-user',
  'db:list-repos',
  'db:add-repo',
  'db:update-repo',
  'db:delete-repo',
  'db:list-workspaces',
  'db:get-workspace',
  'db:create-workspace',
  'db:update-workspace',
  'db:delete-workspace',
  'db:workspace-repos',
  'db:workspace-add-repo',
  'db:workspace-remove-repo',
  'workflow:list',
  'workflow:get',
  'workflow:create',
  'workflow:update',
  'workflow:delete',
  'session:list',
  'session:get',
  'session:start',
  'session:pause',
  'session:resume',
  'session:delete',
  'agent:list',
  'agent:get-messages',
  'agent:send-input',
  'agent:kill',
  'approval:list-pending',
  'approval:list-pending-grouped',
  'approval:resolve',
  'decision:list',
  'decision:list-grouped',
  'decision:get',
  'decision:update',
  'decision:delete',
  'artifact:read',
  'artifact:toggle-pin',
  'artifact:delete',
  'shell:open-external',
  'shell:pick-folder',
  'window:open-spec-popout',
  'repo:list-branches',
]);

const ALLOWED_PUSH_CHANNELS = new Set<PushChannel>([
  'agent:token',
  'agent:message',
  'agent:status-change',
  'agent:completed',
  'approval:new',
  'approval:resolved',
  'session:status-change',
  'phase:advanced',
]);

function assertAllowedRequestChannel(channel: string): asserts channel is IpcChannel {
  if (!ALLOWED_REQUEST_CHANNELS.has(channel as IpcChannel)) {
    throw new Error(`Blocked IPC request channel: ${channel}`);
  }
}

function assertAllowedPushChannel(channel: string): asserts channel is PushChannel {
  if (!ALLOWED_PUSH_CHANNELS.has(channel as PushChannel)) {
    throw new Error(`Blocked IPC push channel: ${channel}`);
  }
}

contextBridge.exposeInMainWorld('athanor', {
  invoke: (channel: string, ...args: unknown[]) => {
    assertAllowedRequestChannel(channel);
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    assertAllowedPushChannel(channel);
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    assertAllowedPushChannel(channel);
    ipcRenderer.once(channel, (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args),
    );
  },
  openExternal: (url: string) => {
    return ipcRenderer.invoke('shell:open-external', url);
  },
});
