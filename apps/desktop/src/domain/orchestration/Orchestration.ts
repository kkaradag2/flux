import type {
  AgentTask, AgentTaskInput, AgentTaskStatus, ExecutionPlan, OrchestrationCommand,
  OrchestrationDecision, OrchestrationState, TeamRunInput, TeamRunStatus,
} from './models';
import type { OrchestrationEvent, OrchestrationEventPayload, OrchestrationResult } from './events';
import { invariant, nonEmpty, OrchestrationError } from './OrchestrationError';
import { dependenciesCompleted, validateTaskGraph } from './taskGraph';

const taskTransitions: Readonly<Record<AgentTaskStatus, readonly AgentTaskStatus[]>> = {
  planned: ['ready', 'blocked', 'cancelled'],
  ready: ['working', 'blocked', 'cancelled'],
  working: ['blocked', 'needs_review', 'completed', 'failed', 'cancelled'],
  blocked: ['ready', 'failed', 'cancelled'],
  needs_review: ['ready', 'blocked', 'completed', 'failed', 'cancelled'],
  failed: ['ready', 'cancelled'],
  completed: [], cancelled: [],
};
const runTransitions: Readonly<Record<TeamRunStatus, readonly TeamRunStatus[]>> = {
  planning: ['running', 'waiting_input', 'failed', 'cancelled'],
  running: ['waiting_input', 'completed', 'failed', 'cancelled'],
  waiting_input: ['planning', 'running', 'completed', 'failed', 'cancelled'],
  completed: [], failed: [], cancelled: [],
};

/** Copy before freezing: even caller-owned input arrays remain untouched. */
function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze((value as readonly unknown[]).map(item => immutable(item))) as T;
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, immutable(item)]))) as T;
  }
  return value;
}
function validateDecision(decision: OrchestrationDecision, updatedAt?: string): void {
  nonEmpty(decision.id, 'Decision ID'); nonEmpty(decision.agentId, 'Decision agent ID');
  invariant(typeof decision.occurredAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(decision.occurredAt)
    && Number.isFinite(Date.parse(decision.occurredAt)), 'INVALID_INPUT', 'Decision time must be an ISO timestamp.');
  if (updatedAt) invariant(Date.parse(decision.occurredAt) >= Date.parse(updatedAt), 'TIME_ORDER', 'Decision time cannot precede the current state.');
}
function requireOrganizer(state: OrchestrationState, decision: OrchestrationDecision): void {
  invariant(decision.agentId === state.run.organizerAgentId, 'ORGANIZER_REQUIRED', 'Only the Organizer can make this run or plan decision.');
}
function requireTaskOwner(state: OrchestrationState, task: AgentTask, decision: OrchestrationDecision): void {
  invariant(decision.agentId === state.run.organizerAgentId || decision.agentId === task.delegatorAgentId,
    'ACTOR_NOT_AUTHORIZED', 'Only the Organizer or delegator can change this task decision.');
}
function requireReason(value: unknown): asserts value is string {
  invariant(typeof value === 'string' && value.trim().length > 0, 'DECISION_REQUIRED', 'An explicit reason is required for this decision.');
}
function mutableTask(task: AgentTask): void {
  invariant(task.status !== 'completed' && task.status !== 'cancelled', 'TERMINAL_TASK', 'Completed and cancelled tasks cannot be changed.');
}
function taskById(state: OrchestrationState, id: string): AgentTask {
  const task = state.tasks.find(task => task.id === id);
  invariant(task, 'TASK_NOT_FOUND', 'This task does not exist in the run.'); return task;
}
function replaceTask(state: OrchestrationState, task: AgentTask): OrchestrationState {
  return { ...state, tasks: state.tasks.map(existing => existing.id === task.id ? task : existing) };
}
function eventCollector(runId: string, decision: OrchestrationDecision) {
  const events: OrchestrationEvent[] = [];
  return { events, emit: (payload: OrchestrationEventPayload): void => {
    events.push({ ...payload, id: `${decision.id}:${events.length + 1}`, runId, occurredAt: decision.occurredAt, actorAgentId: decision.agentId });
  } };
}
type Emit = ReturnType<typeof eventCollector>['emit'];

function statusEvent(task: AgentTask, from: AgentTaskStatus, reason: string | null, emit: Emit): void {
  const fields = { taskId: task.id, agentId: task.assigneeAgentId, from, reason };
  switch (task.status) {
    case 'ready': emit({ ...fields, type: 'task.ready', status: 'ready' }); break;
    case 'working': emit({ taskId: task.id, agentId: task.assigneeAgentId, type: 'task.started', from: 'ready', status: 'working' }); break;
    case 'blocked': emit({ ...fields, type: 'task.blocked', status: 'blocked' }); break;
    case 'needs_review': emit({ ...fields, type: 'task.needs_review', status: 'needs_review' }); break;
    case 'completed': emit({ ...fields, type: 'task.completed', status: 'completed' }); break;
    case 'failed': emit({ ...fields, type: 'task.failed', status: 'failed' }); break;
    case 'cancelled': emit({ ...fields, type: 'task.cancelled', status: 'cancelled' }); break;
    case 'planned': throw new OrchestrationError('INVALID_TASK_TRANSITION', 'Use dependency editing to change a ready task back to planned.');
  }
}

function promoteReady(state: OrchestrationState, at: string, emit: Emit): OrchestrationState {
  return { ...state, tasks: state.tasks.map(task => {
    if (task.status !== 'planned' || !dependenciesCompleted(task, state.tasks)) return task;
    const ready: AgentTask = { ...task, status: 'ready', updatedAt: at };
    statusEvent(ready, task.status, null, emit); return ready;
  }) };
}
function createTask(input: AgentTaskInput, runId: string, decision: OrchestrationDecision): AgentTask {
  for (const [field, value] of Object.entries({ id: input.id, title: input.title, description: input.description, assigneeAgentId: input.assigneeAgentId })) nonEmpty(value, field);
  invariant(Array.isArray(input.dependsOn) && Array.isArray(input.acceptanceCriteria), 'INVALID_INPUT', 'Task dependencies and acceptance criteria must be arrays.');
  input.acceptanceCriteria.forEach(value => nonEmpty(value, 'Acceptance criterion'));
  invariant(typeof input.requiresReview === 'boolean' && (input.required === undefined || typeof input.required === 'boolean'), 'INVALID_INPUT', 'Task requirement flags must be boolean.');
  return {
    id: input.id, runId, title: input.title, description: input.description, assigneeAgentId: input.assigneeAgentId,
    delegatorAgentId: decision.agentId, dependsOn: [...input.dependsOn], acceptanceCriteria: [...input.acceptanceCriteria],
    requiresReview: input.requiresReview, required: input.required ?? true, status: 'planned',
    createdAt: decision.occurredAt, updatedAt: decision.occurredAt, startedAt: null, completedAt: null,
  };
}

function transitionTask(state: OrchestrationState, command: Extract<OrchestrationCommand, { type: 'task.transition' }>, decision: OrchestrationDecision, emit: Emit): OrchestrationState {
  const task = taskById(state, command.taskId); mutableTask(task);
  invariant(taskTransitions[task.status]?.includes(command.status), 'INVALID_TASK_TRANSITION', `Cannot change task from ${task.status} to ${command.status}.`);
  if (command.status === 'ready' || command.status === 'working') {
    invariant(dependenciesCompleted(task, state.tasks), 'DEPENDENCIES_NOT_COMPLETED', 'All task dependencies must be completed first.');
  }
  if (command.status === 'working') {
    invariant(state.run.status === 'running', 'INVALID_TASK_TRANSITION', 'The run must be running before a task can start.');
    invariant(decision.agentId === task.assigneeAgentId, 'ACTOR_NOT_AUTHORIZED', 'Only the assigned agent can start this task.');
  }
  if (task.status === 'working' && command.status === 'completed') {
    invariant(!task.requiresReview, 'REVIEW_REQUIRED', 'This task must enter needs_review before it can be completed.');
  }
  if (command.status === 'blocked' || command.status === 'failed' || command.status === 'cancelled') requireReason(command.reason);
  if (command.status === 'ready' && task.status !== 'planned') {
    requireReason(command.reason); requireTaskOwner(state, task, decision);
  }
  const terminal = command.status === 'completed' || command.status === 'failed' || command.status === 'cancelled';
  const changed: AgentTask = {
    ...task, status: command.status, updatedAt: decision.occurredAt,
    startedAt: command.status === 'working' ? task.startedAt ?? decision.occurredAt : task.startedAt,
    completedAt: terminal ? decision.occurredAt : null,
  };
  statusEvent(changed, task.status, command.reason ?? null, emit);
  const next = replaceTask(state, changed);
  return command.status === 'completed' ? promoteReady(next, decision.occurredAt, emit) : next;
}

function changePlan(state: OrchestrationState, command: Extract<OrchestrationCommand, { type: 'plan.create' | 'plan.revise' }>, decision: OrchestrationDecision, emit: Emit): OrchestrationState {
  requireOrganizer(state, decision); nonEmpty(command.summary, 'Plan summary');
  invariant(Array.isArray(command.taskIds) && new Set(command.taskIds).size === command.taskIds.length, 'INVALID_PLAN', 'Plan task IDs must be unique.');
  for (const id of command.taskIds) {
    const task = taskById(state, id);
    invariant(task.dependsOn.every(dependency => command.taskIds.includes(dependency)), 'INVALID_PLAN', 'A plan must include its tasks’ dependencies.');
  }
  invariant(state.tasks.filter(task => task.required).every(task => command.taskIds.includes(task.id)), 'INVALID_PLAN', 'A plan must include every required task.');
  const previous = state.plans.at(-1);
  if (command.type === 'plan.create') {
    invariant(!previous, 'INVALID_PLAN', 'Revise the existing plan instead of replacing its history.'); nonEmpty(command.id, 'Plan ID');
  } else invariant(previous, 'INVALID_PLAN', 'Create a plan before revising it.');
  const plan: ExecutionPlan = {
    id: command.type === 'plan.create' ? command.id : previous!.id,
    runId: state.run.id, version: (previous?.version ?? 0) + 1, summary: command.summary, taskIds: [...command.taskIds],
    createdByAgentId: decision.agentId, createdAt: decision.occurredAt,
  };
  if (previous) emit({ type: 'plan.revised', agentId: decision.agentId, previousVersion: previous.version, plan });
  else emit({ type: 'plan.created', agentId: decision.agentId, plan });
  return { ...state, plans: [...state.plans, plan] };
}

function transitionRun(state: OrchestrationState, command: Extract<OrchestrationCommand, { type: 'run.transition' }>, decision: OrchestrationDecision, emit: Emit, response = false): OrchestrationState {
  requireOrganizer(state, decision);
  invariant(runTransitions[state.run.status]?.includes(command.status) || (response && state.run.status === 'planning' && command.status === 'completed'), 'INVALID_RUN_TRANSITION', `Cannot change run from ${state.run.status} to ${command.status}.`);
  if (command.status === 'completed') {
    invariant(state.tasks.every(task => !task.required || task.status === 'completed'), 'REQUIRED_TASKS_INCOMPLETE', 'Complete every required task before completing the run.');
    invariant(!state.tasks.some(task => task.status === 'working' || task.status === 'needs_review'), 'ACTIVE_TASKS_REMAIN', 'Finish or cancel active optional tasks before completing the run.');
  }
  if (command.status === 'failed' || command.status === 'cancelled') requireReason(command.reason);
  let next = state;
  if (command.status === 'failed' || command.status === 'cancelled') {
    // A terminal run cannot leave runnable/working tasks behind.
    next = { ...state, tasks: state.tasks.map(task => {
      if (task.status === 'completed' || task.status === 'cancelled' || (task.status === 'failed' && command.status === 'failed')) return task;
      const cancelled: AgentTask = { ...task, status: 'cancelled', updatedAt: decision.occurredAt, completedAt: decision.occurredAt };
      statusEvent(cancelled, task.status, command.reason!, emit); return cancelled;
    }) };
  }
  const terminal = command.status === 'completed' || command.status === 'failed' || command.status === 'cancelled';
  next = { ...next, run: { ...state.run, status: command.status, updatedAt: decision.occurredAt, completedAt: terminal ? decision.occurredAt : null } };
  emit({ type: 'run.status_changed', agentId: decision.agentId, from: state.run.status, to: command.status, reason: command.reason ?? null });
  if (command.status === 'completed') emit({ type: 'run.completed', agentId: decision.agentId, completedAt: decision.occurredAt });
  else if (command.status === 'failed') emit({ type: 'run.failed', agentId: decision.agentId, reason: command.reason! });
  else if (command.status === 'cancelled') emit({ type: 'run.cancelled', agentId: decision.agentId, reason: command.reason! });
  return next;
}

export function createTeamRun(input: TeamRunInput, decision: OrchestrationDecision): OrchestrationResult {
  validateDecision(decision);
  for (const field of ['id', 'conversationId', 'projectId', 'teamId', 'organizerAgentId', 'goal'] as const) nonEmpty(input[field], field);
  invariant(input.organizerAgentId === decision.agentId, 'ORGANIZER_REQUIRED', 'The Organizer must create the run.');
  const state: OrchestrationState = { run: {
    id: input.id, conversationId: input.conversationId, projectId: input.projectId, teamId: input.teamId, organizerAgentId: input.organizerAgentId, goal: input.goal,
    organizerSession: null, status: 'planning', createdAt: decision.occurredAt, updatedAt: decision.occurredAt, completedAt: null,
  }, tasks: [], plans: [] };
  const { events, emit } = eventCollector(input.id, decision);
  emit({ type: 'run.created', agentId: input.organizerAgentId, run: state.run });
  return immutable({ state, events });
}

/** The only mutation entry point. Invalid commands throw; input state is never changed. */
export function applyOrchestrationCommand(state: OrchestrationState, command: OrchestrationCommand, decision: OrchestrationDecision): OrchestrationResult {
  validateDecision(decision, state.run.updatedAt);
  invariant(command.type === 'run.resume_planning' || !['completed', 'failed', 'cancelled'].includes(state.run.status), 'TERMINAL_RUN', 'This run has ended; create a new run to continue.');
  validateTaskGraph(state.run.id, state.tasks);
  const { events, emit } = eventCollector(state.run.id, decision);
  let next: OrchestrationState;
  switch (command.type) {
    case 'run.resume_planning': {
      requireOrganizer(state, decision);
      invariant(['completed', 'failed', 'cancelled'].includes(state.run.status) && state.tasks.length === 0 && state.plans.length === 0 && state.run.organizerSession !== null,
        'INVALID_RUN_TRANSITION', 'Only an explicit follow-up can resume a saved planning-only session.');
      next = { ...state, run: { ...state.run, status: 'planning', completedAt: null } };
      emit({ type: 'run.status_changed', agentId: decision.agentId, from: state.run.status, to: 'planning', reason: 'USER_FOLLOW_UP' }); break;
    }
    case 'run.respond': {
      invariant(state.tasks.length === 0 && state.plans.length === 0 && (state.run.status === 'planning' || state.run.status === 'waiting_input'), 'INVALID_RUN_TRANSITION', 'A direct response must not complete planned work.');
      next = transitionRun(state, { type: 'run.transition', status: 'completed' }, decision, emit, true); break;
    }
    case 'run.set_organizer_session': {
      requireOrganizer(state, decision);
      invariant(command.session.runtime === 'codex' || command.session.runtime === 'claude', 'INVALID_INPUT', 'Unsupported session runtime.');
      nonEmpty(command.session.externalSessionId, 'Session ID');
      const previous = state.run.organizerSession;
      invariant(!previous || (previous.runtime === command.session.runtime && previous.externalSessionId === command.session.externalSessionId), 'INVALID_INPUT', 'The Organizer session cannot be replaced.');
      if (previous) return immutable({ state, events: [] });
      next = { ...state, run: { ...state.run, organizerSession: { ...command.session } } };
      emit({ type: 'run.organizer_session_set', agentId: decision.agentId, session: command.session }); break;
    }
    case 'plan.initialize': {
      requireOrganizer(state, decision);
      invariant(state.tasks.length === 0 && state.plans.length === 0 && command.tasks.length > 0, 'INVALID_PLAN', 'Only an initial non-empty plan can be initialized.');
      const tasks = command.tasks.map(input => createTask(input, state.run.id, decision));
      next = { ...state, tasks }; validateTaskGraph(state.run.id, tasks);
      next = changePlan(next, { type: 'plan.create', id: command.id, summary: command.summary, taskIds: tasks.map(task => task.id) }, decision, emit);
      for (const task of tasks) emit({ type: 'task.created', taskId: task.id, agentId: task.assigneeAgentId, delegatorAgentId: task.delegatorAgentId, task });
      for (const task of tasks) emit({ type: 'task.assigned', taskId: task.id, agentId: task.assigneeAgentId, previousAgentId: null });
      next = promoteReady(next, decision.occurredAt, emit);
      next = transitionRun(next, { type: 'run.transition', status: 'running' }, decision, emit); break;
    }
    case 'tasks.create': {
      invariant(Array.isArray(command.tasks) && command.tasks.length > 0, 'INVALID_INPUT', 'Provide at least one task.');
      const tasks = command.tasks.map(input => createTask(input, state.run.id, decision));
      next = { ...state, tasks: [...state.tasks, ...tasks] }; validateTaskGraph(state.run.id, next.tasks);
      for (const task of tasks) emit({ type: 'task.created', taskId: task.id, agentId: task.assigneeAgentId, delegatorAgentId: task.delegatorAgentId, task });
      next = promoteReady(next, decision.occurredAt, emit); break;
    }
    case 'task.assign': {
      const task = taskById(state, command.taskId); mutableTask(task); requireTaskOwner(state, task, decision); nonEmpty(command.assigneeAgentId, 'Assignee');
      invariant(task.status !== 'working' && task.status !== 'needs_review' && task.assigneeAgentId !== command.assigneeAgentId,
        'INVALID_ASSIGNMENT', 'Reassign only inactive tasks to a different single agent.');
      next = replaceTask(state, { ...task, assigneeAgentId: command.assigneeAgentId, updatedAt: decision.occurredAt });
      emit({ type: 'task.assigned', taskId: task.id, agentId: command.assigneeAgentId, previousAgentId: task.assigneeAgentId }); break;
    }
    case 'task.set_dependencies': {
      const task = taskById(state, command.taskId); mutableTask(task); requireTaskOwner(state, task, decision);
      invariant((task.status === 'planned' || task.status === 'ready') && task.startedAt === null, 'INVALID_TASK_TRANSITION', 'Dependencies can only change before a task first starts.');
      invariant(Array.isArray(command.dependsOn), 'INVALID_INPUT', 'Dependencies must be an array.');
      let updated: AgentTask = { ...task, dependsOn: [...command.dependsOn], updatedAt: decision.occurredAt };
      next = replaceTask(state, updated); validateTaskGraph(state.run.id, next.tasks);
      if (task.status === 'ready' && !dependenciesCompleted(updated, next.tasks)) updated = { ...updated, status: 'planned' };
      next = replaceTask(next, updated);
      emit({ type: 'task.dependencies_changed', taskId: task.id, agentId: task.assigneeAgentId, dependsOn: updated.dependsOn, from: task.status, status: updated.status });
      next = promoteReady(next, decision.occurredAt, emit); break;
    }
    case 'task.transition': next = transitionTask(state, command, decision, emit); break;
    case 'plan.create': case 'plan.revise': next = changePlan(state, command, decision, emit); break;
    case 'run.transition': next = transitionRun(state, command, decision, emit); break;
    default: throw new OrchestrationError('INVALID_INPUT', 'Unknown orchestration command.');
  }
  return immutable({ state: { ...next, run: { ...next.run, updatedAt: decision.occurredAt } }, events });
}
