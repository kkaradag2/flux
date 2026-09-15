import { useSidebar } from '../hooks/useSidebar';
import { useWorkspace } from '../state/WorkspaceContext';
import { previewRequests } from '../data/workspace-preview';
import { AppSidebar } from './sidebar/AppSidebar';
import { ChatWorkspace } from './chat/ChatWorkspace';
import { TeamPanel } from './team/TeamPanel';
import { WorkspaceLayout } from './WorkspaceLayout';
export function WorkspaceScreen() {
  const sidebar = useSidebar();
  const { newTask, projects, activeProject, loading, selectProject } = useWorkspace();
  return (
    <WorkspaceLayout collapsed={sidebar.collapsed} sidebar={<AppSidebar projects={projects} activeProjectId={activeProject?.id ?? null} loading={loading} requests={activeProject?.name === 'Flux' ? previewRequests : []} collapsed={sidebar.collapsed} historyExpanded={sidebar.historyExpanded} onToggle={sidebar.toggle} onToggleHistory={sidebar.toggleHistory} onNewTask={newTask} onProjectSelect={id => void selectProject(id)} />} inspector={<TeamPanel />}>
      <ChatWorkspace />
    </WorkspaceLayout>
  );
}
