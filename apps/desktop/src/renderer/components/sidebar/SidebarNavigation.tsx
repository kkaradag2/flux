import { SidebarItem } from '../shared/SidebarItem';

interface SidebarNavigationProps {
  agentsActive?: boolean;
  onNewTask?: (() => void) | undefined;
  onAgents?: (() => void) | undefined;
}
export function SidebarNavigation({ onNewTask, onAgents, agentsActive = false }: SidebarNavigationProps) {
  return (
    <nav className="sidebar-navigation" aria-label="Main navigation">
      <SidebarItem label="New task" icon="newTask" className={agentsActive ? '' : 'new-task-button'} onClick={onNewTask} />
      <SidebarItem label="Agents" icon="agents" selected={agentsActive} onClick={onAgents} />
    </nav>
  );
}
