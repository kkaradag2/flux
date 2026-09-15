import { SidebarItem } from '../shared/SidebarItem';

interface SidebarNavigationProps {
  onNewTask?: (() => void) | undefined;
  onAgents?: (() => void) | undefined;
}
export function SidebarNavigation({ onNewTask, onAgents }: SidebarNavigationProps) {
  return (
    <nav className="sidebar-navigation" aria-label="Main navigation">
      <SidebarItem label="New task" icon="newTask" className="new-task-button" onClick={onNewTask} />
      <SidebarItem label="Agents" icon="agents" onClick={onAgents} />
    </nav>
  );
}
