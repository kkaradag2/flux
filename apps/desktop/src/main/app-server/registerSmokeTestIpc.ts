import { ipcMain } from 'electron';
import type { CodexSmokeTestService } from './CodexSmokeTestService';
import type { CodexSmokeTestResult } from '../../shared/codex-smoke-test';
import type { ApiResult } from '../../shared/project-api';
import { smokeTestChannel } from '../../shared/smoke-test-channel';
export function registerSmokeTestIpc(service: CodexSmokeTestService, trusted: Set<number>): void {
  ipcMain.handle(smokeTestChannel, async (event): Promise<ApiResult<CodexSmokeTestResult>> => {
    if (!trusted.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame) return { ok: false, error: { code: 'UNTRUSTED', message: 'This window cannot run connection tests.' } };
    const cancel = (): void => service.cancel(); event.sender.once('destroyed', cancel);
    try { return { ok: true, value: await service.run() }; }
    finally { event.sender.off('destroyed', cancel); }
  });
}
