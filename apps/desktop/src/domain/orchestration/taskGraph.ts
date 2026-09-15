import type { AgentTask } from './models';
import { invariant, nonEmpty } from './OrchestrationError';

export function validateTaskGraph(runId: string, tasks: readonly AgentTask[]): void {
  const byId = new Map<string, AgentTask>();
  for (const task of tasks) {
    nonEmpty(task.id, 'Task ID'); nonEmpty(task.assigneeAgentId, 'Assignee'); nonEmpty(task.delegatorAgentId, 'Delegator');
    invariant(task.runId === runId, 'RUN_MISMATCH', 'All dependencies must belong to the same run.');
    invariant(!byId.has(task.id), 'DUPLICATE_TASK_ID', 'Task IDs must be unique within a run.');
    byId.set(task.id, task);
  }
  const dependents = new Map<string, string[]>(), remaining = new Map<string, number>();
  for (const task of tasks) {
    invariant(Array.isArray(task.dependsOn), 'INVALID_INPUT', 'Dependencies must be an array of task IDs.');
    invariant(!task.dependsOn.includes(task.id), 'SELF_DEPENDENCY', 'A task cannot depend on itself.');
    invariant(new Set(task.dependsOn).size === task.dependsOn.length, 'DUPLICATE_DEPENDENCY', 'Dependencies must be unique.');
    remaining.set(task.id, task.dependsOn.length);
    for (const dependency of task.dependsOn) {
      nonEmpty(dependency, 'Dependency ID');
      invariant(byId.has(dependency), 'MISSING_DEPENDENCY', 'A dependency must refer to an existing task in this run.');
      const children = dependents.get(dependency) ?? []; children.push(task.id); dependents.set(dependency, children);
    }
  }
  // Iterative topological traversal also handles long plans without recursive stacks.
  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  for (let index = 0; index < ready.length; index++) {
    for (const id of dependents.get(ready[index]!) ?? []) {
      const count = remaining.get(id)! - 1; remaining.set(id, count);
      if (count === 0) ready.push(id);
    }
  }
  invariant(ready.length === tasks.length, 'DEPENDENCY_CYCLE', 'Task dependencies cannot contain a cycle.');
}

export function dependenciesCompleted(task: AgentTask, tasks: readonly AgentTask[]): boolean {
  return task.dependsOn.every(id => tasks.some(dependency => dependency.id === id && dependency.status === 'completed'));
}
