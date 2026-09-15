export type WorkspaceTaskStatus = 'planned' | 'ready' | 'working' | 'blocked' | 'needs_review' | 'completed' | 'failed' | 'cancelled';

export type WorkspaceTaskItem = {
  id: string;
  title: string;
  status: WorkspaceTaskStatus;
  assignee: { id: string; name: string; avatar?: string };
  dependencySummary?: string;
};

export const taskStatusLabels: Record<WorkspaceTaskStatus, string> = {
  planned: 'Planned', ready: 'Ready', working: 'Working', blocked: 'Blocked',
  needs_review: 'Needs review', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled',
};
