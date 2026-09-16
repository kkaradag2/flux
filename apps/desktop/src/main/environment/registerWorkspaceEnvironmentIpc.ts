import { workspaceEnvironmentCodes } from '../../shared/workspace-environment';
import type { IpcMain, WebContents } from 'electron';
import type { WorkspaceEnvironmentService } from '../../application/environment/WorkspaceEnvironmentService';
export const environmentChannels = { status: 'environment:status', prepare: 'environment:prepare', cancel: 'environment:cancel', onlinePlan: 'environment:online-plan', onlinePrepare: 'environment:online-prepare', cancelConsent: 'environment:cancel-consent', verify: 'environment:verify' } as const;
export function registerWorkspaceEnvironmentIpc(ipc: Pick<IpcMain, 'handle' | 'removeHandler'>, service: WorkspaceEnvironmentService, trusted: Set<number>) {
  const owners = new Map<number, { contents: WebContents; cleanup: () => void; navigate: (...args: unknown[]) => void }>();
  const pending = new Set<Promise<void>>();
  for (const channel of Object.values(environmentChannels)) ipc.handle(channel, async (event, ...args: unknown[]) => {
    if (!trusted.has(event.sender.id) || event.sender.isDestroyed() || event.senderFrame !== event.sender.mainFrame || args.length !== 1) return { ok: false, code: 'preparation_failed' };
    if (!owners.has(event.sender.id)) {
      const contents = event.sender;
      const cleanup = () => {
        contents.removeListener('destroyed', cleanup); contents.removeListener('render-process-gone', cleanup); contents.removeListener('did-start-navigation', navigate); owners.delete(contents.id);
        const done = service.closeOwner(contents.id); pending.add(done); void done.finally(() => pending.delete(done));
      };
      const navigate = (...values: unknown[]) => { if (!values[2] && values[3]) cleanup(); };
      owners.set(contents.id, { contents, cleanup, navigate }); contents.once('destroyed', cleanup); contents.once('render-process-gone', cleanup); contents.on('did-start-navigation', navigate);
    }
    try {
      if (channel === environmentChannels.cancel) { await service.cancel(event.sender.id, args[0]); return { ok: true }; }
      if (channel === environmentChannels.verify) return { ok: true, value: await service.verify(event.sender.id, args[0]) };
      if (channel === environmentChannels.onlinePlan) return { ok: true, value: await service.onlinePlan(event.sender.id, args[0]) };
      if (channel === environmentChannels.onlinePrepare) return { ok: true, value: await service.prepareOnline(event.sender.id, args[0]) };
      if (channel === environmentChannels.cancelConsent) return { ok: true, value: service.cancelConsent(event.sender.id, args[0]) };
      return { ok: true, value: await (channel === environmentChannels.prepare ? service.prepare(event.sender.id, args[0]) : service.status(args[0])) };
    } catch (error) { const code = error instanceof Error && (workspaceEnvironmentCodes as readonly string[]).includes(error.message) ? error.message : 'preparation_failed'; return { ok: false, code }; }
  });
  return async () => { for (const channel of Object.values(environmentChannels)) ipc.removeHandler(channel); for (const owner of [...owners.values()]) owner.cleanup(); await service.shutdown(); await Promise.allSettled([...pending]); };
}
