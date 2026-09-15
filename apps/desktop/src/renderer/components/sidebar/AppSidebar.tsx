import type { ProjectPreview, RequestPreview } from '../../data/workspace-preview';
import { SidebarItem } from '../shared/SidebarItem';
import { ProjectList } from './ProjectList';
import { RequestHistoryList } from './RequestHistoryList';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavigation } from './SidebarNavigation';
interface AppSidebarProps {
  projects: readonly ProjectPreview[];
  requests: readonly RequestPreview[];
  collapsed: boolean;
  historyExpanded: boolean;
  onToggle: () => void;
  onToggleHistory: () => void;
  onNewTask: () => void;
}
export function AppSidebar({ projects, requests, collapsed, historyExpanded, onToggle, onToggleHistory, onNewTask }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Workspace sidebar">
      <SidebarHeader collapsed={collapsed} onToggle={onToggle} />
      <SidebarNavigation onNewTask={onNewTask} />
      <div className="sidebar-scroll">
        <ProjectList projects={projects} expanded={historyExpanded} onToggle={onToggleHistory} />
        <div id="project-history" hidden={!historyExpanded || collapsed}><RequestHistoryList requests={requests} /></div>
      </div>
      <footer className="sidebar-footer"><SidebarItem label="Settings" icon="settings" /></footer>
    </aside>
  );
}
