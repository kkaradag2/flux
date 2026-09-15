import type { CodexSmokeTestResult, SmokeTestErrorCode } from '../../shared/codex-smoke-test';
import { HELLO, SmokeTestError } from './contracts';
import { reasonForCode } from './verificationReason';
import type { VerificationReason } from '../../shared/codex-runtime-state';
const messages: Record<SmokeTestErrorCode, string> = {
  RUNTIME_INCOMPATIBLE: 'Codex could not verify compatibility with the current model.',
  NOT_INSTALLED: 'Codex CLI is not available on PATH.', START_FAILED: 'Codex App Server could not start.', PROTOCOL_ERROR: 'Codex App Server returned an unsupported response.', PROCESS_EXIT: 'Codex App Server stopped before the test completed.', TIMEOUT: 'The connection test timed out.', CANCELLED: 'The connection test was cancelled.', TURN_FAILED: 'Codex could not complete the connection test.', APPROVAL_REQUESTED: 'The connection test requested approval and was declined.', TOOL_REQUESTED: 'The connection test attempted to use a tool and was stopped.', UNEXPECTED_RESPONSE: 'Codex did not return the expected hello response.', CLEANUP_FAILED: 'The connection test could not complete process cleanup.',
};
export class CodexSmokeTestService {
  private pending: Promise<CodexSmokeTestResult> | null = null;
  private controller: AbortController | null = null;
  constructor(private client: { run(cwd: string, signal: AbortSignal): Promise<string> }, private cwd: string, private timeoutMs = 43000) {}
  run(): Promise<CodexSmokeTestResult> {
    if (this.pending) return this.pending;
    this.pending = this.check().finally(() => { this.pending = null; }); return this.pending;
  }
  get running(): boolean { return this.pending !== null; }
  async shutdown(): Promise<void> { this.cancel(); await this.pending; }
  cancel(): void { this.controller?.abort(); }
  private async check(): Promise<CodexSmokeTestResult> {
    const started = performance.now(); const controller = new AbortController(); this.controller = controller;
    let timedOut = false;
    // Reserve 2s for the shared runner's process-tree cleanup: total budget <=45s.
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(this.timeoutMs, 43000));
    let errorCode: SmokeTestErrorCode | null = null;
    let verificationReason: VerificationReason | null = null;
    try { const response = await this.client.run(this.cwd, controller.signal); if (controller.signal.aborted) throw new SmokeTestError(timedOut ? 'TIMEOUT' : 'CANCELLED'); if (response !== HELLO) throw new SmokeTestError('UNEXPECTED_RESPONSE'); }
    catch (error) { errorCode = timedOut ? 'TIMEOUT' : error instanceof SmokeTestError ? error.code : 'START_FAILED'; verificationReason = !timedOut && error instanceof SmokeTestError ? error.verificationReason : null; }
    finally { clearTimeout(timer); this.controller = null; }
    return { status: errorCode ? 'failed' : 'passed', response: errorCode ? null : HELLO, durationMs: Math.round(performance.now() - started), checkedAt: new Date().toISOString(), errorCode, verificationReason: verificationReason ?? reasonForCode(errorCode), message: errorCode ? messages[errorCode] : 'Connection test passed' };
  }
}
