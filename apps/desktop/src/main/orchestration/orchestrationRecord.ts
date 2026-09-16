import { validateFollowUpDecision } from '../../application/orchestration/organizer/FollowUpDecision';
import type { TaskIntervention } from '../../domain/orchestration/interventions';
import { migrateOrchestrationRecord, parseLegacyMetadata, type LegacyEventMetadata } from './orchestrationMigration';
import { validateTaskGraph, type AgentTask, type AgentTaskStatus, type ExecutionPlan, type OrchestrationEvent, type OrchestrationState, type TeamRun, type TeamRunStatus } from '../../domain/orchestration';
import { OrchestrationPersistenceError as PersistenceError } from '../../application/orchestration/OrchestrationPersistenceError';
import type { RehydratedOrchestration } from '../../application/orchestration/OrchestrationRepository';

export type OrchestrationRecord = Readonly<{ schemaVersion: 2; interventions?: readonly TaskIntervention[]; legacyEventMetadata?: readonly LegacyEventMetadata[]; revision: number; run: TeamRun; plans: readonly ExecutionPlan[]; tasks: readonly AgentTask[]; events: readonly OrchestrationEvent[] }>;
const runStatuses: readonly TeamRunStatus[] = ['planning', 'running', 'waiting_input', 'completed', 'failed', 'cancelled'];
import { taskStatuses } from '../../shared/task-status';
function check(condition: unknown): asserts condition { if (!condition) throw new PersistenceError('INVALID_RECORD'); }
function object(value: unknown): Record<string, unknown> { check(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>; }
export function recordId(value: unknown): string { check(typeof value === 'string' && value.trim().length > 0 && !value.includes('\0')); return value; }
function text(value: unknown): string { check(typeof value === 'string'); return value; }
function boolean(value: unknown): boolean { check(typeof value === 'boolean'); return value; }
function integer(value: unknown): number { check(typeof value === 'number' && Number.isSafeInteger(value) && value >= 1); return value; }
function array<T>(value: unknown, parse: (value: unknown) => T): T[] { check(Array.isArray(value)); return value.map(parse); }
function date(value: unknown): string {
  const result = recordId(value);
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) && Number.isFinite(Date.parse(result)));
  const calendarDate = result.slice(0, 10);
  check(new Date(calendarDate + 'T00:00:00.000Z').toISOString().slice(0, 10) === calendarDate);
  return result; // Domain dates are ISO strings, not Date objects.
}
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function choice<T extends string>(value: unknown, values: readonly T[]): T { check(typeof value === 'string' && values.includes(value as T)); return value as T; }
function session(value: unknown): NonNullable<TeamRun['organizerSession']> {
  const data = object(value);
  return { runtime: choice(data.runtime, ['codex', 'claude']), externalSessionId: recordId(data.externalSessionId) };
}
function run(value: unknown): TeamRun {
  const data = object(value);
  return { id: recordId(data.id), conversationId: recordId(data.conversationId), projectId: recordId(data.projectId), teamId: recordId(data.teamId), organizerAgentId: recordId(data.organizerAgentId), goal: recordId(data.goal),
    organizerSession: nullable(data.organizerSession === undefined ? null : data.organizerSession, session),
    status: choice(data.status, runStatuses), createdAt: date(data.createdAt), updatedAt: date(data.updatedAt), completedAt: nullable(data.completedAt, date) };
}
function execution(value: unknown): NonNullable<AgentTask['execution']> {
  const data = object(value); check(typeof data.durationMs === 'number' && Number.isFinite(data.durationMs) && data.durationMs >= 0);
  return { summary: recordId(data.summary), evidence: array(data.evidence, text), changedFiles: array(data.changedFiles, recordId), durationMs: data.durationMs, agentName: recordId(data.agentName) };
}
function attempt(value: unknown): import('../../domain/orchestration/models').TaskAttempt {
  const data = object(value);
  return { number: integer(data.number), status: choice(data.status, taskStatuses), phase: choice(data.phase, ['worktree_preparation','runtime_preparation','model_execution','unknown']),
    failure: nullable(data.failure, value => choice(value, ['WORKTREE_PREPARATION_FAILED','RUNTIME_PREPARATION_FAILED','EXECUTION_INTERRUPTED','VALIDATION_FAILED','SECURITY_VIOLATION','RUNTIME_FAILED','UNKNOWN_FAILURE'])), startedAt: date(data.startedAt), finishedAt: nullable(data.finishedAt, date), ...(data.report ? { report: execution(data.report) } : {}) };
}
function task(value: unknown): AgentTask {
  const data = object(value);
  const attempts = data.attempts === undefined ? undefined : array(data.attempts, attempt);
  if (attempts) check(attempts.every((attempt, index) => attempt.number === index + 1));
  return { ...(data.revision === undefined ? {} : { revision: integer(data.revision) }), ...(attempts ? { attempts } : {}), ...(data.session ? { session: session(data.session) } : {}), ...(data.execution ? { execution: execution(data.execution) } : {}), id: recordId(data.id), runId: recordId(data.runId), title: recordId(data.title), description: recordId(data.description), ownerAgentId: recordId(data.ownerAgentId), delegatorAgentId: recordId(data.delegatorAgentId),
    status: choice(data.status, taskStatuses), dependsOn: array(data.dependsOn, recordId), acceptanceCriteria: array(data.acceptanceCriteria, recordId), required: boolean(data.required),
    createdAt: date(data.createdAt), updatedAt: date(data.updatedAt), startedAt: nullable(data.startedAt, date), completedAt: nullable(data.completedAt, date) };
}
function plan(value: unknown): ExecutionPlan {
  const data = object(value);
  return { id: recordId(data.id), runId: recordId(data.runId), version: integer(data.version), summary: recordId(data.summary), taskIds: array(data.taskIds, recordId), createdByAgentId: recordId(data.createdByAgentId), createdAt: date(data.createdAt) };
}
function event(value: unknown): OrchestrationEvent {
  const data = object(value), type = recordId(data.type);
  const common = { id: recordId(data.id), runId: recordId(data.runId), occurredAt: date(data.occurredAt), actorAgentId: recordId(data.actorAgentId), agentId: recordId(data.agentId) };
  switch (type) {
    case 'intervention.recorded': return { ...common, type, interventionId: recordId(data.interventionId) };
    case 'run.organizer_session_set': return { ...common, type, session: session(data.session) };
    case 'run.created': return { ...common, type, run: run(data.run) };
    case 'run.status_changed': return { ...common, type, from: choice(data.from, runStatuses), to: choice(data.to, runStatuses), reason: nullable(data.reason, text) };
    case 'run.completed': return { ...common, type, completedAt: date(data.completedAt) };
    case 'run.failed': case 'run.cancelled': return { ...common, type, reason: recordId(data.reason) };
    case 'plan.created': return { ...common, type, plan: plan(data.plan) };
    case 'plan.revised': return { ...common, type, previousVersion: integer(data.previousVersion), plan: plan(data.plan) };
    case 'task.created': return { ...common, type, taskId: recordId(data.taskId), delegatorAgentId: recordId(data.delegatorAgentId), task: task(data.task) };
    case 'task.assigned': return { ...common, type, taskId: recordId(data.taskId), previousAgentId: nullable(data.previousAgentId, recordId) };
    case 'task.execution_phase_changed': return { ...common, type, taskId: recordId(data.taskId), phase: choice(data.phase, ['worktree_preparation','runtime_preparation','model_execution','unknown']) };
    case 'task.session_set': return { ...common, type, taskId: recordId(data.taskId), session: session(data.session) };
    case 'task.execution_recorded': return { ...common, type, taskId: recordId(data.taskId), report: execution(data.report) };
    case 'task.started': return { ...common, type, taskId: recordId(data.taskId), from: choice(data.from, ['ready']), status: choice(data.status, ['working']) };
    case 'task.dependencies_changed': return { ...common, type, taskId: recordId(data.taskId), from: choice(data.from, taskStatuses), status: choice(data.status, taskStatuses), dependsOn: array(data.dependsOn, recordId) };
    case 'task.ready': case 'task.blocked': case 'task.needs_attention': case 'task.completed': case 'task.failed': case 'task.cancelled': {
      const fields = { ...common, taskId: recordId(data.taskId), from: choice(data.from, taskStatuses), reason: nullable(data.reason, text) };
      switch (type) {
        case 'task.ready': return { ...fields, type, status: choice(data.status, ['ready']) };
        case 'task.blocked': return { ...fields, type, status: choice(data.status, ['blocked']) };
        case 'task.needs_attention': return { ...fields, type, status: choice(data.status, ['needs_attention']) };
        case 'task.completed': return { ...fields, type, status: choice(data.status, ['completed']) };
        case 'task.failed': return { ...fields, type, status: choice(data.status, ['failed']) };
        case 'task.cancelled': return { ...fields, type, status: choice(data.status, ['cancelled']) };
      }
    }
    default: throw new PersistenceError('INVALID_RECORD');
  }
}
function intervention(value: unknown): TaskIntervention {
  const data = object(value), taskId = recordId(data.taskId);
  const decision = data.decision === null ? null : validateFollowUpDecision(data.decision, taskId, true);
  const status = choice(data.status, ['pending', 'decided', 'applied', 'cancelled', 'failed'] as const);
  check(!['decided', 'applied'].includes(status) || decision);
  check(data.durationMs === undefined || typeof data.durationMs === 'number' && Number.isFinite(data.durationMs) && data.durationMs >= 0);
  return { id: recordId(data.id), taskId, sourceTaskRevision: integer(data.sourceTaskRevision), sourceResultRevision: integer(data.sourceResultRevision), status, decision,
    createdAt: date(data.createdAt), updatedAt: date(data.updatedAt), ...(data.durationMs === undefined ? {} : { durationMs: data.durationMs as number }) };
}
export function planKey(value: ExecutionPlan): string { return JSON.stringify([value.runId, value.id, value.version]); }
export function parseOrchestrationRecord(value: unknown): OrchestrationRecord {
  const data = object(migrateOrchestrationRecord(value));
  if (data.schemaVersion !== 2) throw new PersistenceError('UNSUPPORTED_SCHEMA');
  const metadata = parseLegacyMetadata(data.legacyEventMetadata);
  const result: OrchestrationRecord = { schemaVersion: 2, ...(metadata.length ? { legacyEventMetadata: metadata } : {}), ...(data.interventions === undefined ? {} : { interventions: array(data.interventions, intervention) }), revision: integer(data.revision), run: run(data.run), plans: array(data.plans, plan), tasks: array(data.tasks, task), events: array(data.events, event) };
  if (new Set(result.events.map(event => event.id)).size !== result.events.length) throw new PersistenceError('DUPLICATE_EVENT');
  if (new Set(result.plans.map(plan => plan.version)).size !== result.plans.length) throw new PersistenceError('DUPLICATE_PLAN_VERSION');
  const id = result.run.id, tasks = new Set(result.tasks.map(task => task.id));
  if (result.interventions) {
    check(new Set(result.interventions.map(item => item.id)).size === result.interventions.length);
    check(new Set(result.interventions.map(item => `${item.taskId}:${item.sourceResultRevision}`)).size === result.interventions.length);
    check(result.interventions.every(item => tasks.has(item.taskId)));
  }
  try { validateTaskGraph(id, result.tasks); } catch { throw new PersistenceError('INVALID_RECORD'); }
  for (const plan of result.plans) {
    check(plan.runId === id && new Set(plan.taskIds).size === plan.taskIds.length && plan.taskIds.every(id => tasks.has(id)));
  }
  const created = result.events.filter(event => event.type === 'run.created'); check(created.length === 1);
  for (const event of result.events) {
    check(event.runId === id);
    if ('taskId' in event) check(tasks.has(event.taskId));
    if (event.type === 'run.created') check(event.run.id === id && event.run.conversationId === result.run.conversationId && event.run.organizerAgentId === event.agentId);
    if (event.type === 'task.created') check(event.task.id === event.taskId && event.task.runId === id && event.task.ownerAgentId === event.agentId && event.task.delegatorAgentId === event.delegatorAgentId);
    if (event.type === 'plan.created' || event.type === 'plan.revised') check(event.plan.runId === id && event.plan.createdByAgentId === event.agentId && result.plans.some(plan => planKey(plan) === planKey(event.plan) && JSON.stringify(plan) === JSON.stringify(event.plan)));
  }
  for (const plan of result.plans) check(result.events.some(event => (event.type === 'plan.created' || event.type === 'plan.revised') && planKey(event.plan) === planKey(plan)));
  for (const task of result.tasks) check(result.events.filter(event => event.type === 'task.created' && event.taskId === task.id).length === 1);
  return result;
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
export function rehydrated(record: OrchestrationRecord): RehydratedOrchestration {
  const plans = [...record.plans].sort((left, right) => left.version - right.version);
  const state: OrchestrationState = { ...(record.interventions ? { interventions: record.interventions } : {}), run: record.run, plans, tasks: record.tasks };
  // Stable sorting preserves append order for events emitted in the same decision.
  const events = [...record.events].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  return freeze({ revision: record.revision, state, currentPlan: plans.at(-1) ?? null, events });
}
