import { ipcMain } from 'electron';
import type { ApiResult } from '../../shared/project-api';
import type { CodexRuntimeHealth } from '../../shared/runtime-health';
import { runtimeHealthChannels as channels } from '../../shared/runtime-health-channels';
import type { RuntimeHealthService } from './RuntimeHealthService';
export function registerRuntimeHealthIpc(service: RuntimeHealthService, trusted: Set<number>): void {
  for (const channel of Object.values(channels)) ipcMain.handle(channel, async (event): Promise<ApiResult<CodexRuntimeHealth>> => {
    try {
      if (!trusted.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame) return { ok: false, error: { code: 'UNTRUSTED', message: 'This window cannot check runtimes.' } };
      return { ok: true, value: await (channel === channels.refresh ? service.refresh() : service.get()) };
    } catch { return { ok: false, error: { code: 'RUNTIME_CHECK_FAILED', message: 'Codex runtime health could not be checked.' } }; }
  });
}
