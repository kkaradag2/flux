import type { Project } from '../../../shared/project-api';
import type { RequestPreview } from '../../data/workspace-preview';
import { SidebarItem } from '../shared/SidebarItem';
import { ProjectList } from './ProjectList';
import { RequestHistoryList } from './RequestHistoryList';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavigation } from './SidebarNavigation';
interface AppSidebarProps {
  activeView: 'workspace' | 'agents';
  onAgents: () => void;
  projects: readonly Project[];
  activeProjectId: string | null;
  loading: boolean;
  requests: readonly RequestPreview[];
  collapsed: boolean;
  historyExpanded: boolean;
  onToggle: () => void;
  onToggleHistory: () => void;
  onNewTask: () => void;
  onProjectSelect: (id: string) => void;
}
export function AppSidebar({ activeView, onAgents, projects, activeProjectId, loading, requests, collapsed, historyExpanded, onToggle, onToggleHistory, onNewTask, onProjectSelect }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Workspace sidebar">
      <SidebarHeader collapsed={collapsed} onToggle={onToggle} />
      <SidebarNavigation onNewTask={onNewTask} onAgents={onAgents} agentsActive={activeView === 'agents'} />
      <div className="sidebar-scroll">
        <ProjectList projects={projects} activeProjectId={activeProjectId} expanded={historyExpanded} collapsed={collapsed} loading={loading} onToggle={onToggleHistory} onSelect={onProjectSelect} history={<RequestHistoryList requests={requests} />} />
      </div>
      <footer className="sidebar-footer"><SidebarItem label="Settings" icon="settings" /></footer>
    </aside>
  );
}
