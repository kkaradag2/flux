import type { Project } from '../../../shared/project-api';
import type { ConversationSummary } from '../../../shared/conversation-api';
import { SidebarItem } from '../shared/SidebarItem';
import { ProjectList } from './ProjectList';
import { RequestHistoryList } from './RequestHistoryList';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavigation } from './SidebarNavigation';
interface AppSidebarProps {
  activeView: 'workspace' | 'agents' | 'settings';
  onSettings: () => void;
  onAgents: () => void;
  projects: readonly Project[];
  activeProjectId: string | null;
  loading: boolean;
  requests: readonly ConversationSummary[];
  selectedConversationId: string | null;
  onConversationSelect: (id: string) => void;
  collapsed: boolean;
  historyExpanded: boolean;
  onToggle: () => void;
  onToggleHistory: () => void;
  onNewTask: () => void;
  onProjectSelect: (id: string) => void;
}
export function AppSidebar({ activeView, onSettings, onAgents, projects, activeProjectId, loading, requests, selectedConversationId, onConversationSelect, collapsed, historyExpanded, onToggle, onToggleHistory, onNewTask, onProjectSelect }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Workspace sidebar">
      <SidebarHeader collapsed={collapsed} onToggle={onToggle} />
      <SidebarNavigation onNewTask={onNewTask} onAgents={onAgents} agentsActive={activeView === 'agents'} />
      <div className="sidebar-scroll">
        <ProjectList projects={projects} activeProjectId={activeProjectId} expanded={historyExpanded} collapsed={collapsed} loading={loading} onToggle={onToggleHistory} onSelect={onProjectSelect} history={projectId => <RequestHistoryList requests={requests.filter(request => request.projectId === projectId)} selectedId={selectedConversationId ?? undefined} onSelect={onConversationSelect} />} />
      </div>
      <footer className="sidebar-footer"><SidebarItem label="Settings" icon="settings" selected={activeView === 'settings'} onClick={onSettings} /></footer>
    </aside>
  );
}
