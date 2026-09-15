import { useState, type ReactNode } from 'react';
import type { Project } from '../../../shared/project-api';
import { IconButton } from '../shared/IconButton';
import { SidebarItem } from '../shared/SidebarItem';

interface ProjectListProps {
  projects: readonly Project[];
  activeProjectId: string | null;
  expanded: boolean;
  collapsed: boolean;
  loading: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  history: (projectId: string) => ReactNode;
}
export function ProjectList({ projects, activeProjectId, expanded, collapsed, loading, onToggle, onSelect, history }: ProjectListProps) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  return (
    <section className="project-list" aria-labelledby="projects-heading">
      <h2 className="section-label" id="projects-heading">Projects</h2>
      <ul className="plain-list">{projects.map(project => {
        const active = project.id === activeProjectId;
        const visible = active ? expanded : !closed.has(project.id);
        const toggle = (): void => { if (active) onToggle(); else setClosed(current => { const next = new Set(current); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next; }); };
        return <li key={project.id}>
          <div className="project-sidebar-row">
            <SidebarItem label={project.name} icon="folder" selected={active} disabled={loading} onClick={() => onSelect(project.id)} />
            {!collapsed && <IconButton className={visible ? 'project-history-toggle' : 'project-history-toggle chevron-closed'} icon="chevron" label={(visible ? 'Hide history: ' : 'Show history: ') + project.name} aria-expanded={visible} aria-controls={'project-history-' + project.id} onClick={toggle} />}
          </div>
          <div id={'project-history-' + project.id} hidden={!visible || collapsed}>{history(project.id)}</div>
        </li>;
      })}</ul>
    </section>
  );
}
