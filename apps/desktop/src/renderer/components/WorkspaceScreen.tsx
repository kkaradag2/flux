import { useSidebar } from '../hooks/useSidebar';
import { useWorkspace } from '../state/WorkspaceContext';
import { previewProjects, previewRequests } from '../data/workspace-preview';
import { AppSidebar } from './sidebar/AppSidebar';
import { ChatWorkspace } from './chat/ChatWorkspace';
import { TeamPanel } from './team/TeamPanel';
import { WorkspaceLayout } from './WorkspaceLayout';
export function WorkspaceScreen() {
  const sidebar = useSidebar();
  const { newTask } = useWorkspace();
  return (
    <WorkspaceLayout collapsed={sidebar.collapsed} sidebar={<AppSidebar projects={previewProjects} requests={previewRequests} collapsed={sidebar.collapsed} historyExpanded={sidebar.historyExpanded} onToggle={sidebar.toggle} onToggleHistory={sidebar.toggleHistory} onNewTask={newTask} />} inspector={<TeamPanel />}>
      <ChatWorkspace />
    </WorkspaceLayout>
  );
}
