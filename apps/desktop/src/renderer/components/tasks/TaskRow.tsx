import { agentIconNames } from '../avatars/AgentAvatar';
import { Icon } from '../shared/Icon';
import { TaskStatusIndicator } from './TaskStatusIndicator';
import { taskStatusLabels, type WorkspaceTaskItem } from './workspaceTask';

export function TaskRow({ task }: { task: WorkspaceTaskItem }) {
  const builtin = task.assignee.avatar && Object.prototype.hasOwnProperty.call(agentIconNames, task.assignee.avatar) ? agentIconNames[task.assignee.avatar as keyof typeof agentIconNames] : null;
  return <li className="workspace-task-row">
    <TaskStatusIndicator status={task.status} />
    <div className="workspace-task-content">
      <h3>{task.title}</h3>
      <div className="workspace-task-meta">
        <span className="workspace-task-owner">
          <span className="workspace-task-avatar" aria-hidden="true">{builtin ? <Icon name={builtin} size={13} /> : task.assignee.avatar ? <img src={task.assignee.avatar} alt="" /> : <Icon name="agents" size={13} />}</span>
          <span>{task.assignee.name}</span>
        </span>
        <span className={'task-status-label task-status-label--' + task.status}>{taskStatusLabels[task.status]}</span>
      </div>
      {task.dependencySummary && <p className="task-dependency-summary">{task.dependencySummary}</p>}
    </div>
  </li>;
}
