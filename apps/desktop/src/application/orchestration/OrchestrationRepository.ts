import type { AgentTask, ExecutionPlan, OrchestrationEvent, OrchestrationResult, OrchestrationState, TeamRun } from '../../domain/orchestration';

export type RehydratedOrchestration = Readonly<{
  revision: number;
  state: OrchestrationState;
  currentPlan: ExecutionPlan | null;
  events: readonly OrchestrationEvent[];
}>;

/** One aggregate boundary: no task/plan write is separated from its domain events. */
export interface OrchestrationRepository {
  create(result: OrchestrationResult): Promise<RehydratedOrchestration>;
  save(result: OrchestrationResult, expectedRevision: number): Promise<RehydratedOrchestration>;
  update(runId: string, transition: (state: OrchestrationState) => OrchestrationResult): Promise<RehydratedOrchestration>;
  getRun(runId: string): Promise<TeamRun>;
  listAllRuns(): Promise<readonly TeamRun[]>;
  listRuns(conversationId: string): Promise<readonly TeamRun[]>;
  getActiveRun(conversationId: string): Promise<RehydratedOrchestration | null>;
  getCurrentPlan(runId: string): Promise<ExecutionPlan | null>;
  getTasks(runId: string): Promise<readonly AgentTask[]>;
  getEvents(runId: string): Promise<readonly OrchestrationEvent[]>;
  rehydrate(runId: string): Promise<RehydratedOrchestration>;
}
