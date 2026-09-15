import { SettingsScreen } from './settings/SettingsScreen';
import { useSidebar } from '../hooks/useSidebar';
import { useWorkspace } from '../state/WorkspaceContext';
import { useNavigation } from '../state/NavigationContext';

import { AppSidebar } from './sidebar/AppSidebar';
import { ChatWorkspace } from './chat/ChatWorkspace';
import { useWorkspacePanel } from '../hooks/useWorkspacePanel';
import { WorkspaceRightPanel } from './panel/WorkspaceRightPanel';
import type { WorkspaceTaskItem } from './tasks/workspaceTask';
import { TeamPanel } from './team/TeamPanel';
import { WorkspaceLayout } from './WorkspaceLayout';
import { ManagementArea } from './management/ManagementArea';
const workspaceTasks: readonly WorkspaceTaskItem[] = []; // No task source is connected yet.
export function WorkspaceScreen() {
 const panel = useWorkspacePanel(workspaceTasks.length);
 const sidebar = useSidebar(); const { route, navigate } = useNavigation(); const workspace = route.view === 'workspace';
 const { newTask, projects, activeProject, loading, selectProject, running, opening, conversations, conversation, openConversation } = useWorkspace();
 return <WorkspaceLayout collapsed={sidebar.collapsed} sidebar={<AppSidebar projects={projects} activeProjectId={activeProject?.id ?? null} loading={loading} requests={conversations} selectedConversationId={conversation?.id ?? null} onConversationSelect={id => { if (!opening) void openConversation(id).then(opened => { if (opened) navigate({ view: 'workspace' }); }); }} collapsed={sidebar.collapsed} historyExpanded={sidebar.historyExpanded} onToggle={sidebar.toggle} onToggleHistory={sidebar.toggleHistory} activeView={workspace ? 'workspace' : route.view === 'settings' ? 'settings' : 'agents'} onSettings={() => navigate({ view: 'settings' })} onAgents={() => navigate({ view: 'agents-list' })} onNewTask={() => { newTask(); navigate({ view: 'workspace' }); }} onProjectSelect={id => { if (!running) void selectProject(id); }} />} inspector={workspace ? <WorkspaceRightPanel tasks={workspaceTasks} selectedTab={panel.selectedTab} onSelectTab={panel.selectTab} team={<TeamPanel />} /> : undefined}><div className="workspace-view" hidden={!workspace}><ChatWorkspace /></div>{!workspace && <div className="agents-view"><button type="button" className="workspace-return" onClick={() => navigate({ view: 'workspace' })}>Back to task</button>{route.view === 'settings' ? <SettingsScreen /> : <ManagementArea />}</div>}</WorkspaceLayout>;
}
