import { ipcMain } from 'electron';
import { singleAgentChannels as channels } from '../../shared/single-agent-channels';
import type { ApiResult } from '../../shared/project-api';
import type { RunIdentity } from '../../shared/single-agent-api';
import type { ConversationSummary, OpenConversationResult } from '../../shared/conversation-api';
import { SingleAgentError, type SingleAgentRunService } from './SingleAgentRunService';
export function registerSingleAgentIpc(service: SingleAgentRunService, trusted: Set<number>): void {
  const observed = new Set<number>();
  for (const channel of [channels.start, channels.cancel, channels.reset, channels.list, channels.open]) {
    ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ApiResult<RunIdentity | ConversationSummary[] | OpenConversationResult | void>> => {
      const owner = event.sender.id;
      if (!trusted.has(owner) || event.senderFrame !== event.sender.mainFrame || args.length !== (channel === channels.start || channel === channels.open ? 1 : 0)) return { ok: false, error: { code: 'UNTRUSTED', message: 'This request is not available.' } };
      if (!observed.has(owner)) {
        observed.add(owner);
        event.sender.once('destroyed', () => { observed.delete(owner); void service.reset(owner); });
        event.sender.on('render-process-gone', () => { void service.reset(owner); });
        event.sender.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => { if (isMainFrame && !inPlace) void service.reset(owner); });
      }
      try {
        if (channel === channels.list) return { ok: true, value: await service.getConversations() };
        if (channel === channels.open) return { ok: true, value: await service.open(owner, args[0]) };
        if (channel === channels.start) return { ok: true, value: service.start(owner, args[0], data => { if (!event.sender.isDestroyed()) event.sender.send(channels.event, data); }) };
        await (channel === channels.cancel ? service.cancel(owner) : service.reset(owner));
        return { ok: true, value: undefined };
      } catch (error) {
        const safe = error instanceof SingleAgentError ? error : new SingleAgentError('RUN_FAILED');
        return { ok: false, error: { code: safe.code, message: safe.message } };
      }
    });
  }
}
