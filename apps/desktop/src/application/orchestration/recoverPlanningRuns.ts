import { applyOrchestrationCommand } from '../../domain/orchestration';
import type { OrchestrationRepository } from './OrchestrationRepository';

export const PLANNING_INTERRUPTED = 'PLANNING_INTERRUPTED';
/** Startup only, before accepting requests. Never resumes or calls a runtime. */
export async function recoverPlanningRuns(repository: OrchestrationRepository, values: { newId(): string; now(): string }): Promise<void> {
  for (const run of await repository.listAllRuns()) {
    if (run.status !== 'planning') continue;
    await repository.update(run.id, state => {
      if (state.run.status !== 'planning') return { state, events: [] };
      return applyOrchestrationCommand(state, { type: 'run.transition', status: 'failed', reason: PLANNING_INTERRUPTED },
        { id: values.newId(), agentId: state.run.organizerAgentId, occurredAt: new Date(Math.max(Date.parse(values.now()), Date.parse(state.run.updatedAt))).toISOString() });
    });
  }
}
