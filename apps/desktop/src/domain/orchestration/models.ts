import type { AgentSessionReference } from '../../shared/agent-runtime';
export type TeamRunStatus = 'planning' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';
export type AgentTaskStatus = import('../../shared/task-status').TaskStatus;

export type TeamRun = Readonly<{
  id: string;
  conversationId: string;
  projectId: string;
  teamId: string;
  organizerAgentId: string;
  organizerSession: AgentSessionReference | null;
  goal: string;
  status: TeamRunStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}>;

export type ExecutionPlan = Readonly<{
  id: string;
  runId: string;
  version: number;
  summary: string;
  taskIds: readonly string[];
  createdByAgentId: string;
  createdAt: string;
}>;

export type ExecutionPhase = 'worktree_preparation' | 'runtime_preparation' | 'model_execution' | 'unknown';
export type ExecutionFailure = 'WORKTREE_PREPARATION_FAILED' | 'RUNTIME_PREPARATION_FAILED' | 'EXECUTION_INTERRUPTED' | 'VALIDATION_FAILED' | 'SECURITY_VIOLATION' | 'RUNTIME_FAILED' | 'UNKNOWN_FAILURE';
export type TaskAttempt = Readonly<{ number: number; status: AgentTaskStatus; phase: ExecutionPhase; failure: ExecutionFailure | null; startedAt: string; finishedAt: string | null; report?: TaskExecutionReport }>;
export type TaskExecutionReport = Readonly<{ summary: string; evidence: readonly string[]; changedFiles: readonly string[]; durationMs: number; agentName: string }>;
export type AgentTask = Readonly<{
  revision?: number;
  id: string;
  runId: string;
  title: string;
  description: string;
  ownerAgentId: string;
  delegatorAgentId: string;
  session?: AgentSessionReference;
  attempts?: readonly TaskAttempt[];
  execution?: TaskExecutionReport;
  status: AgentTaskStatus;
  dependsOn: readonly string[];
  acceptanceCriteria: readonly string[];
  /** Defaults to true; cancelling a required task does not satisfy the goal. */
  required: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}>;

export type OrchestrationState = Readonly<{
  interventions?: readonly import('./interventions').TaskIntervention[];
  run: TeamRun;
  plans: readonly ExecutionPlan[];
  tasks: readonly AgentTask[];
}>;

export type TeamRunInput = Pick<TeamRun, 'id' | 'conversationId' | 'projectId' | 'teamId' | 'organizerAgentId' | 'goal'>;
export type AgentTaskInput = Pick<AgentTask, 'id' | 'title' | 'description' | 'ownerAgentId' | 'dependsOn' | 'acceptanceCriteria'> & Readonly<{ required?: boolean }>;

/** IDs and the clock are supplied by the caller; the domain performs no I/O. */
export type OrchestrationDecision = Readonly<{ id: string; agentId: string; occurredAt: string }>;

export type OrchestrationCommand =
  | Readonly<{ type: 'intervention.record'; intervention: import('./interventions').TaskIntervention }>
  | Readonly<{ type: 'task.accept_result'; taskId: string }>
  | Readonly<{ type: 'run.respond' }>
  | Readonly<{ type: 'run.resume_planning' }>
  | Readonly<{ type: 'run.set_organizer_session'; session: AgentSessionReference }>
  | Readonly<{ type: 'plan.initialize'; id: string; summary: string; tasks: readonly AgentTaskInput[] }>
  | Readonly<{ type: 'tasks.create'; tasks: readonly AgentTaskInput[] }>
  | Readonly<{ type: 'task.retry'; taskId: string; verifiedLegacyPreparationFailure?: boolean; verifiedRuntimePreparationFailure?: boolean }>
  | Readonly<{ type: 'task.execution_phase'; taskId: string; phase: ExecutionPhase }>
  | Readonly<{ type: 'task.set_session'; taskId: string; session: AgentSessionReference }>
  | Readonly<{ type: 'task.finish'; taskId: string; status: 'completed' | 'needs_attention' | 'blocked' | 'failed' | 'cancelled'; report: TaskExecutionReport; failure?: ExecutionFailure; reason?: string }>
  | Readonly<{ type: 'task.assign'; taskId: string; ownerAgentId: string }>
  | Readonly<{ type: 'task.set_dependencies'; taskId: string; dependsOn: readonly string[] }>
  | Readonly<{ type: 'task.transition'; taskId: string; status: AgentTaskStatus; reason?: string }>
  | Readonly<{ type: 'plan.create'; id: string; summary: string; taskIds: readonly string[] }>
  | Readonly<{ type: 'plan.revise'; summary: string; taskIds: readonly string[] }>
  | Readonly<{ type: 'run.transition'; status: TeamRunStatus; reason?: string }>;
