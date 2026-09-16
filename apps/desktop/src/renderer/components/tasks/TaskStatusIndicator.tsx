import type { WorkspaceTaskStatus } from './workspaceTask';

export function TaskStatusIndicator({ status }: { status: WorkspaceTaskStatus }) {
  return <svg className={'task-status-icon task-status-icon--' + status} width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="7" />
    {status === 'completed' ? <path d="m6 10 3 3 5-6" />
      : status === 'failed' || status === 'cancelled' ? <path d="m7 7 6 6m0-6-6 6" />
      : status === 'blocked' ? <path d="M6 10h8" />
      : status === 'needs_attention' ? <><path d="M10 6v5" /><circle cx="10" cy="14" r=".5" /></>
      : status === 'ready' ? <path d="m8 6 5 4-5 4Z" />
      : status === 'working' ? <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" /> : null}
  </svg>;
}
