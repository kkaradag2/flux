import type { ReactNode } from 'react';
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
  history: ReactNode;
}
export function ProjectList({ projects, activeProjectId, expanded, collapsed, loading, onToggle, onSelect, history }: ProjectListProps) {
  return (
    <section className="project-list" aria-labelledby="projects-heading">
      <h2 className="section-label" id="projects-heading">Projects</h2>
      <ul className="plain-list">{projects.map(project => {
        const active = project.id === activeProjectId;
        return <li key={project.id}>
          <div className="project-sidebar-row">
            <SidebarItem label={project.name} icon="folder" selected={active} disabled={loading} onClick={() => onSelect(project.id)} />
            {active && !collapsed && <IconButton className={expanded ? 'project-history-toggle' : 'project-history-toggle chevron-closed'} icon="chevron" label={expanded ? 'Hide project history' : 'Show project history'} aria-expanded={expanded} aria-controls="project-history" onClick={onToggle} />}
          </div>
          {active && <div id="project-history" hidden={!expanded || collapsed}>{history}</div>}
        </li>;
      })}</ul>
    </section>
  );
}
