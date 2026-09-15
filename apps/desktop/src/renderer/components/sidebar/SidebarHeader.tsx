import { IconButton } from '../shared/IconButton';
interface SidebarHeaderProps { name?: string; collapsed: boolean; onToggle: () => void; }
export function SidebarHeader({ name = 'Flux', collapsed, onToggle }: SidebarHeaderProps) {
  return <header className="sidebar-header"><span className="wordmark">{name}</span><IconButton icon="panel" label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={onToggle} /></header>;
}
