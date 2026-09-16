import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { orchestrationChannels as channels } from '../../shared/orchestration-channels';
import { orchestrationError } from './OrchestrationBoundaryError';
import type { OrchestrationService } from './OrchestrationService';

export function registerOrchestrationIpc(ipc: Pick<IpcMain, 'handle' | 'removeHandler' | 'on' | 'removeListener'>,
  service: OrchestrationService, trusted: Set<number>): () => void {
  const owners = new Map<number, { contents: WebContents; unsubscribe: (() => void) | undefined; cleanup: () => void }>();
  const allowed = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => trusted.has(event.sender.id) && !event.sender.isDestroyed() && event.senderFrame === event.sender.mainFrame;
  function observe(contents: WebContents) {
    const existing = owners.get(contents.id); if (existing) return existing;
    const cleanup = (): void => {
      const current = owners.get(contents.id); current?.unsubscribe?.(); owners.delete(contents.id); service.closeOwner(contents.id);
      contents.removeListener('destroyed', cleanup); contents.removeListener('render-process-gone', cleanup); contents.removeListener('did-start-navigation', navigate);
    };
    const navigate = (_event: unknown, _url: string, inPlace: boolean, main: boolean): void => { if (main && !inPlace) cleanup(); };
    const owner = { contents, cleanup, unsubscribe: undefined as (() => void) | undefined }; owners.set(contents.id, owner);
    contents.once('destroyed', cleanup); contents.once('render-process-gone', cleanup); contents.on('did-start-navigation', navigate);
    return owner;
  }
  for (const channel of [channels.get, channels.start, channels.continue, channels.create, channels.cancel, channels.execute, channels.cancelExecution, channels.retryExecution]) {
    ipc.handle(channel, async (event, ...args: unknown[]) => {
      if (!allowed(event) || args.length !== 1) return { ok: false, error: orchestrationError(null) };
      observe(event.sender);
      try {
        const value = channel === channels.retryExecution ? await service.execute(event.sender.id, args[0], true) : channel === channels.execute ? await service.execute(event.sender.id, args[0]) : channel === channels.cancelExecution ? await service.cancelExecution(event.sender.id, args[0]) : channel === channels.create ? await service.create(args[0]) : channel === channels.cancel ? await service.cancel(event.sender.id, args[0]) : channel === channels.get ? await service.get(args[0]) : channel === channels.start ? await service.start(event.sender.id, args[0]) : await service.continue(event.sender.id, args[0]);
        return { ok: true, value };
      } catch (error) { return { ok: false, error: orchestrationError(error) }; }
    });
  }
  const subscribe = (event: IpcMainEvent, enabled: unknown, ...extra: unknown[]): void => {
    if (!allowed(event) || typeof enabled !== 'boolean' || extra.length) return;
    const owner = observe(event.sender);
    if (!enabled) { owner.unsubscribe?.(); owner.unsubscribe = undefined; return; }
    owner.unsubscribe ??= service.subscribe(change => {
      if (!trusted.has(owner.contents.id) || owner.contents.isDestroyed()) { owner.cleanup(); return; }
      owner.contents.send(channels.changed, change);
    });
  };
  ipc.on(channels.subscribe, subscribe);
  return () => {
    ipc.removeListener(channels.subscribe, subscribe);
    for (const channel of [channels.get, channels.start, channels.continue, channels.create, channels.cancel, channels.execute, channels.cancelExecution, channels.retryExecution]) ipc.removeHandler(channel);
    for (const owner of [...owners.values()]) owner.cleanup();
  };
}
