import { TaskRow } from './TaskRow';
import type { WorkspaceTaskItem } from './workspaceTask';

export function TaskList({ tasks }: { tasks: readonly WorkspaceTaskItem[] }) {
  return <ul className="plain-list workspace-task-list" aria-label="Tasks in plan order">{tasks.map(task => <TaskRow key={task.id} task={task} />)}</ul>;
}
