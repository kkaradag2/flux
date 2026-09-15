import type { CodexUpdateStage } from '../../../shared/codex-update-progress';
export const updateStageMessages: Record<CodexUpdateStage, { message: string; detail?: string }> = {
  PREPARING: { message: 'Preparing the Codex update…' },
  INSTALLING: { message: 'Installing the latest Codex version…', detail: 'This may take a minute.' },
  CHECKING_VERSION: { message: 'Codex was installed. Checking the new version…' },
  VERIFYING_CONNECTION: { message: 'Connecting to Codex and verifying the installation…' },
  COMPLETED: { message: 'Codex is ready to use.' },
};
export function elapsedUpdateSeconds(startedAt: string, now: number): number {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}
