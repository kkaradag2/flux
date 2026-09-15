import type { OrchestrationRepository, RehydratedOrchestration } from '../../application/orchestration/OrchestrationRepository';
import type { OrchestrationResult, OrchestrationState } from '../../domain/orchestration';

/** Publish only committed snapshots. Notification failures never undo a successful commit. */
export class ObservedOrchestrationRepository implements OrchestrationRepository {
  constructor(private repository: OrchestrationRepository, private publish: (snapshot: RehydratedOrchestration) => Promise<void>) {}
  private async committed(operation: Promise<RehydratedOrchestration>) {
    const result = await operation;
    try { await this.publish(result); } catch { /* A later read returns the committed state. */ }
    return result;
  }
  create(result: OrchestrationResult) { return this.committed(this.repository.create(result)); }
  save(result: OrchestrationResult, revision: number) { return this.committed(this.repository.save(result, revision)); }
  update(id: string, transition: (state: OrchestrationState) => OrchestrationResult) { return this.committed(this.repository.update(id, transition)); }
  getRun(id: string) { return this.repository.getRun(id); }
  listRuns(id: string) { return this.repository.listRuns(id); }
  listAllRuns() { return this.repository.listAllRuns(); }
  getActiveRun(id: string) { return this.repository.getActiveRun(id); }
  getCurrentPlan(id: string) { return this.repository.getCurrentPlan(id); }
  getTasks(id: string) { return this.repository.getTasks(id); }
  getEvents(id: string) { return this.repository.getEvents(id); }
  rehydrate(id: string) { return this.repository.rehydrate(id); }
}
