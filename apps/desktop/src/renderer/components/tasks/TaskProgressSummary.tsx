import type { WorkspaceTaskItem } from './workspaceTask';

export function TaskProgressSummary({ tasks }: { tasks: readonly WorkspaceTaskItem[] }) {
  return <p className="task-progress-summary">{tasks.filter(task => task.status === 'completed').length} of {tasks.length} done</p>;
}
