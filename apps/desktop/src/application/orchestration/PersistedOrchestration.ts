import { applyOrchestrationCommand, createTeamRun, type OrchestrationCommand, type OrchestrationDecision, type TeamRunInput, type OrchestrationEvent } from '../../domain/orchestration';
import type { OrchestrationRepository, RehydratedOrchestration } from './OrchestrationRepository';

export type OrchestrationChange = Readonly<{ command: OrchestrationCommand; decision: OrchestrationDecision }>;

/** Coordinates domain results and storage only; it does not schedule or run agents. */
export class PersistedOrchestration {
  constructor(private repository: OrchestrationRepository) {}
  createRun(input: TeamRunInput, decision: OrchestrationDecision): Promise<RehydratedOrchestration> {
    return this.repository.create(createTeamRun(input, decision));
  }
  apply(runId: string, command: OrchestrationCommand, decision: OrchestrationDecision): Promise<RehydratedOrchestration> {
    return this.applyBatch(runId, [{ command, decision }]);
  }
  // For example tasks.create + plan.create is one disk commit, including all events.
  applyBatch(runId: string, changes: readonly OrchestrationChange[]): Promise<RehydratedOrchestration> {
    const snapshot = structuredClone(changes);
    return this.repository.update(runId, initial => {
      let state = initial; const events: OrchestrationEvent[] = [];
      for (const { command, decision } of snapshot) {
        const result = applyOrchestrationCommand(state, command, decision);
        state = result.state; events.push(...result.events);
      }
      return { state, events };
    });
  }
}
