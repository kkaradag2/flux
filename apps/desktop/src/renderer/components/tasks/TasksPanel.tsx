import { TaskList } from './TaskList';
import { TaskProgressSummary } from './TaskProgressSummary';
import type { WorkspaceTaskItem } from './workspaceTask';

export function TasksPanel({ tasks }: { tasks: readonly WorkspaceTaskItem[] }) {
  return <section className="tasks-panel" aria-label="Tasks">
    <header className="team-summary-header"><h2>Tasks</h2>{tasks.length > 0 && <TaskProgressSummary tasks={tasks} />}</header>
    {tasks.length ? <TaskList tasks={tasks} /> : <div className="tasks-empty-state"><h3>No tasks yet</h3><p>Tasks will appear here when the team starts working.</p></div>}
  </section>;
}
