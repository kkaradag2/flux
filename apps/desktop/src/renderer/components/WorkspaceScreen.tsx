import { SettingsScreen } from './settings/SettingsScreen';
import { useSidebar } from '../hooks/useSidebar';
import { useWorkspace } from '../state/WorkspaceContext';
import { useNavigation } from '../state/NavigationContext';
import { previewRequests } from '../data/workspace-preview';
import { AppSidebar } from './sidebar/AppSidebar';
import { ChatWorkspace } from './chat/ChatWorkspace';
import { TeamPanel } from './team/TeamPanel';
import { WorkspaceLayout } from './WorkspaceLayout';
import { ManagementArea } from './management/ManagementArea';
export function WorkspaceScreen() {
 const sidebar = useSidebar(); const { route, navigate } = useNavigation(); const workspace = route.view === 'workspace';
 const { newTask, projects, activeProject, loading, selectProject } = useWorkspace();
 return <WorkspaceLayout collapsed={sidebar.collapsed} sidebar={<AppSidebar projects={projects} activeProjectId={activeProject?.id ?? null} loading={loading} requests={activeProject?.name === 'Flux' ? previewRequests : []} collapsed={sidebar.collapsed} historyExpanded={sidebar.historyExpanded} onToggle={sidebar.toggle} onToggleHistory={sidebar.toggleHistory} activeView={workspace ? 'workspace' : route.view === 'settings' ? 'settings' : 'agents'} onSettings={() => navigate({ view: 'settings' })} onAgents={() => navigate({ view: 'agents-list' })} onNewTask={() => { if (workspace) newTask(); navigate({ view: 'workspace' }); }} onProjectSelect={id => void selectProject(id)} />} inspector={workspace ? <TeamPanel /> : undefined}><div className="workspace-view" hidden={!workspace}><ChatWorkspace /></div>{!workspace && <div className="agents-view">{route.view === 'settings' ? <SettingsScreen /> : <ManagementArea />}</div>}</WorkspaceLayout>;
}
