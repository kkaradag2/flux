import { ipcMain } from 'electron';
import type { ApiResult } from '../../shared/project-api';
import type { CodexRuntimeSnapshot } from '../../shared/codex-runtime-state';
import { runtimeStateChannels as channels } from '../../shared/runtime-state-channels';
import type { CodexRuntimeStateService } from './CodexRuntimeStateService';
import type { CodexInstallationCandidate } from '../../shared/codex-installation';
import { validateCandidateId } from './CodexInstallationService';
export function registerRuntimeStateIpc(service: CodexRuntimeStateService, trusted: Set<number>): void {
  for (const channel of Object.values(channels)) ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ApiResult<CodexRuntimeSnapshot | CodexInstallationCandidate[]>> => {
    if (!trusted.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame || args.length !== (channel === channels.select ? 1 : 0)) return { ok: false, error: { code: 'UNTRUSTED', message: 'This request is not available.' } };
    try {
      if (channel === channels.candidates) return { ok: true, value: await service.candidates() };
      if (channel === channels.select) return { ok: true, value: await service.selectInstallation(validateCandidateId(args[0])) };
      const value = channel === channels.get ? service.snapshot() : await (channel === channels.update ? service.update() : service.inspect(channel === channels.retry));
      return { ok: true, value };
    } catch { return { ok: false, error: { code: 'CODEX_UNAVAILABLE', message: 'Codex could not be checked. Please try again.' } }; }
  });
}
