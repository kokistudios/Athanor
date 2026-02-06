import type { IpcChannel, PushChannel } from '../shared/types/ipc';

interface AthanorApi {
  invoke(channel: IpcChannel, ...args: unknown[]): Promise<unknown>;
  on(channel: PushChannel, callback: (...args: unknown[]) => void): () => void;
  once(channel: PushChannel, callback: (...args: unknown[]) => void): void;
  openExternal(url: string): Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    athanor: AthanorApi;
  }
}
