import type { OrchestrationRepository } from '../../application/orchestration/OrchestrationRepository';
import { JsonOrchestrationRepository } from './JsonOrchestrationRepository';

/** Main composition helper; constructing it neither opens Electron nor writes data. */
export function createOrchestrationRepository(app: { getPath(name: 'userData'): string }, projectAndWorktreeDirectories: readonly string[]): OrchestrationRepository {
  return new JsonOrchestrationRepository({ userDataDirectory: app.getPath('userData'), excludedDirectories: projectAndWorktreeDirectories });
}
