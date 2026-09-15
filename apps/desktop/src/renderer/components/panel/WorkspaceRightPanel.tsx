import { useId, type ReactNode } from 'react';
import type { WorkspacePanelTab } from '../../hooks/useWorkspacePanel';
import type { WorkspaceTaskItem } from '../tasks/workspaceTask';
import { TasksPanel } from '../tasks/TasksPanel';
import { PanelTabs } from './PanelTabs';

export function WorkspaceRightPanel({ tasks, selectedTab, onSelectTab, team }: {
  tasks: readonly WorkspaceTaskItem[];
  selectedTab: WorkspacePanelTab;
  onSelectTab: (tab: WorkspacePanelTab) => void;
  team: ReactNode;
}) {
  const id = useId();
  return <aside className="workspace-inspector" aria-label="Workspace details"><div className="workspace-right-panel">
    <PanelTabs selectedTab={selectedTab} onSelect={onSelectTab} id={id} />
    <div role="tabpanel" id={id + '-tasks-panel'} aria-labelledby={id + '-tasks'} hidden={selectedTab !== 'tasks'} tabIndex={0}><TasksPanel tasks={tasks} /></div>
    <div role="tabpanel" id={id + '-team-panel'} aria-labelledby={id + '-team'} hidden={selectedTab !== 'team'} tabIndex={0}>{team}</div>
  </div></aside>;
}
