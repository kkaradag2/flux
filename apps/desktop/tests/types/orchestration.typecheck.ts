import type { AgentTask, OrchestrationCommand, OrchestrationEvent, OrchestrationState } from '../../src/domain/orchestration';

export function immutableContracts(task: AgentTask, state: OrchestrationState): void {
  // @ts-expect-error State transitions belong to the domain API.
  task.status = 'working';
  // @ts-expect-error One assignee, never an array.
  task.assigneeAgentId = ['lead', 'developer'];
  // @ts-expect-error Nested collections are readonly too.
  task.dependsOn.push('another');
  // @ts-expect-error Run status is immutable.
  state.run.status = 'completed';
  // @ts-expect-error Plans cannot be revised in place.
  state.plans[0]!.version = 2;
}

export function eventNarrowing(event: OrchestrationEvent): string {
  if (event.type === 'task.started') {
    const status: 'working' = event.status;
    const from: 'ready' = event.from;
    return event.taskId + event.agentId + from + status;
  }
  if (event.type === 'plan.revised') return event.plan.id + event.previousVersion;
  if (event.type === 'run.completed') {
    // @ts-expect-error A run completion has no task ID.
    event.taskId;
    return event.completedAt;
  }
  return event.runId;
}

// @ts-expect-error A task event must identify the task and agent.
export const invalidEvent: OrchestrationEvent = { type: 'task.started', id: 'event', runId: 'run', occurredAt: 'now', actorAgentId: 'lead', from: 'ready', status: 'working' };
// @ts-expect-error A dependency edit cannot smuggle a status mutation.
export const invalidCommand: OrchestrationCommand = { type: 'task.set_dependencies', taskId: 'task', dependsOn: [], status: 'completed' };
