import { realpath } from 'node:fs/promises';
import type { CodexRuntimeState } from '../../shared/codex-runtime-state';
import { candidateId, type CodexInstallationService } from '../runtime/CodexInstallationService';
import { RuntimeCommandRunner } from '../runtime/RuntimeCommandRunner';
import { CodexRuntimeProbe } from '../runtime/CodexRuntimeProbe';
import { CodexAppServerClient } from './CodexAppServerClient';
import type { CodexRuntimeSource } from './CodexAgentRuntimeAdapter';

// Fail closed on uninspected protocol versions; extend only after generated-type verification.
export const ORGANIZER_OUTPUT_SCHEMA_VERSIONS = ['0.154.0'] as const;
export class VerifiedOrganizerRuntimeSource implements CodexRuntimeSource {
 constructor(private installations: Pick<CodexInstallationService, 'resolve'>, private loadState: () => Promise<CodexRuntimeState | null>) {}
 async resolve(signal: AbortSignal) {
  const state = await this.loadState();
  if (signal.aborted || state?.operationalStatus !== 'READY' || state.verificationStatus !== 'passed' || !state.installationId) return null;
  const id = state.installationId;
  const executable = await this.installations.resolve();
  if (!executable || candidateId(await realpath(executable)) !== id || signal.aborted) return null;
  const runner = new RuntimeCommandRunner(async () => {
   const current = await this.installations.resolve();
   return current === executable ? current : null;
  });
  const health = await new CodexRuntimeProbe(runner).check();
  if (signal.aborted || health.status !== 'ready' || health.version !== state.cliVersion) return null;
  return { client: CodexAppServerClient.using(runner, true), structuredOutput: ORGANIZER_OUTPUT_SCHEMA_VERSIONS.some(version => version === health.version) };
 }
}
