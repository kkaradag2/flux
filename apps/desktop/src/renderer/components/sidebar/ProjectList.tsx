import type { ProjectPreview } from '../../data/workspace-preview';
import { Icon } from '../shared/Icon';
import { SidebarItem } from '../shared/SidebarItem';
interface ProjectListProps { projects: readonly ProjectPreview[]; expanded: boolean; onToggle: () => void; }
export function ProjectList({ projects, expanded, onToggle }: ProjectListProps) {
  return (
    <section className="project-list" aria-labelledby="projects-heading">
      <h2 className="section-label" id="projects-heading">Projects</h2>
      <ul className="plain-list">{projects.map(project => <li key={project.id}><SidebarItem label={project.name} icon="folder" aria-expanded={expanded} aria-controls="project-history" trailing={<span className={expanded ? '' : 'chevron-closed'}><Icon name="chevron" size={14} /></span>} onClick={onToggle} /></li>)}</ul>
    </section>
  );
}
