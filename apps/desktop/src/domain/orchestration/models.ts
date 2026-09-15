export type TeamRunStatus = 'planning' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';
export type AgentTaskStatus = 'planned' | 'ready' | 'working' | 'blocked' | 'needs_review' | 'completed' | 'failed' | 'cancelled';

export type TeamRun = Readonly<{
  id: string;
  conversationId: string;
  projectId: string;
  teamId: string;
  organizerAgentId: string;
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

export type AgentTask = Readonly<{
  id: string;
  runId: string;
  title: string;
  description: string;
  assigneeAgentId: string;
  delegatorAgentId: string;
  status: AgentTaskStatus;
  dependsOn: readonly string[];
  acceptanceCriteria: readonly string[];
  requiresReview: boolean;
  /** Defaults to true; cancelling a required task does not satisfy the goal. */
  required: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}>;

export type OrchestrationState = Readonly<{
  run: TeamRun;
  plans: readonly ExecutionPlan[];
  tasks: readonly AgentTask[];
}>;

export type TeamRunInput = Pick<TeamRun, 'id' | 'conversationId' | 'projectId' | 'teamId' | 'organizerAgentId' | 'goal'>;
export type AgentTaskInput = Pick<AgentTask, 'id' | 'title' | 'description' | 'assigneeAgentId' | 'dependsOn' | 'acceptanceCriteria' | 'requiresReview'> & Readonly<{ required?: boolean }>;

/** IDs and the clock are supplied by the caller; the domain performs no I/O. */
export type OrchestrationDecision = Readonly<{ id: string; agentId: string; occurredAt: string }>;

export type OrchestrationCommand =
  | Readonly<{ type: 'tasks.create'; tasks: readonly AgentTaskInput[] }>
  | Readonly<{ type: 'task.assign'; taskId: string; assigneeAgentId: string }>
  | Readonly<{ type: 'task.set_dependencies'; taskId: string; dependsOn: readonly string[] }>
  | Readonly<{ type: 'task.transition'; taskId: string; status: AgentTaskStatus; reason?: string }>
  | Readonly<{ type: 'plan.create'; id: string; summary: string; taskIds: readonly string[] }>
  | Readonly<{ type: 'plan.revise'; summary: string; taskIds: readonly string[] }>
  | Readonly<{ type: 'run.transition'; status: TeamRunStatus; reason?: string }>;
