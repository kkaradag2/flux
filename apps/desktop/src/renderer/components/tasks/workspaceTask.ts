export type WorkspaceTaskStatus = import('../../../shared/task-status').TaskStatus;

export type WorkspaceTaskItem = {
  id: string;
  title: string;
  status: WorkspaceTaskStatus;
  assignee: { id: string; name: string; avatar?: string };
  dependencySummary?: string;
};

export const taskStatusLabels: Record<WorkspaceTaskStatus, string> = {
  planned: 'Planned', ready: 'Ready', working: 'Working', blocked: 'Blocked',
  needs_attention: 'Needs attention', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
};
