import { Icon } from '../shared/Icon';
import { TaskStatusIndicator } from './TaskStatusIndicator';
import { taskStatusLabels, type WorkspaceTaskItem } from './workspaceTask';

export function TaskRow({ task }: { task: WorkspaceTaskItem }) {
  return <li className="workspace-task-row">
    <TaskStatusIndicator status={task.status} />
    <div className="workspace-task-content">
      <h3>{task.title}</h3>
      <div className="workspace-task-meta">
        <span className="workspace-task-owner">
          <span className="workspace-task-avatar" aria-hidden="true">{task.assignee.avatar ? <img src={task.assignee.avatar} alt="" /> : <Icon name="agents" size={13} />}</span>
          <span>{task.assignee.name}</span>
        </span>
        <span className={'task-status-label task-status-label--' + task.status}>{taskStatusLabels[task.status]}</span>
      </div>
      {task.dependencySummary && <p className="task-dependency-summary">{task.dependencySummary}</p>}
    </div>
  </li>;
}
