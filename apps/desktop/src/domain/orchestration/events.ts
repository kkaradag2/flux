import type { AgentTask, AgentTaskStatus, ExecutionPlan, OrchestrationState, TeamRun, TeamRunStatus } from './models';

export type OrchestrationEventEnvelope = Readonly<{
  id: string;
  runId: string;
  occurredAt: string;
  actorAgentId: string;
}>;
type TaskEvent = Readonly<{ taskId: string; agentId: string }>;
type TaskStatusEvent = {
  [Status in Exclude<AgentTaskStatus, 'planned' | 'working'>]: Readonly<{
    type: `task.${Status}`;
    from: AgentTaskStatus;
    status: Status;
    reason: string | null;
  }> & TaskEvent;
}[Exclude<AgentTaskStatus, 'planned' | 'working'>];

export type OrchestrationEventPayload =
  | Readonly<{ type: 'run.organizer_session_set'; agentId: string; session: NonNullable<TeamRun['organizerSession']> }>
  | Readonly<{ type: 'run.created'; agentId: string; run: TeamRun }>
  | Readonly<{ type: 'run.status_changed'; agentId: string; from: TeamRunStatus; to: TeamRunStatus; reason: string | null }>
  | Readonly<{ type: 'run.completed'; agentId: string; completedAt: string }>
  | Readonly<{ type: 'run.failed' | 'run.cancelled'; agentId: string; reason: string }>
  | Readonly<{ type: 'plan.created'; agentId: string; plan: ExecutionPlan }>
  | Readonly<{ type: 'plan.revised'; agentId: string; previousVersion: number; plan: ExecutionPlan }>
  | (Readonly<{ type: 'task.created'; delegatorAgentId: string; task: AgentTask }> & TaskEvent)
  | (Readonly<{ type: 'task.assigned'; previousAgentId: string | null }> & TaskEvent)
  | (Readonly<{ type: 'task.started'; from: 'ready'; status: 'working' }> & TaskEvent)
  | (Readonly<{ type: 'task.dependencies_changed'; dependsOn: readonly string[]; from: AgentTaskStatus; status: AgentTaskStatus }> & TaskEvent)
  | TaskStatusEvent;

export type OrchestrationEvent = OrchestrationEventEnvelope & OrchestrationEventPayload;
export type OrchestrationResult = Readonly<{ state: OrchestrationState; events: readonly OrchestrationEvent[] }>;
