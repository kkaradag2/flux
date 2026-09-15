import { useWorkspace } from '../../state/WorkspaceContext';
import { ProjectSelector } from './ProjectSelector';
import { BranchSelector } from './BranchSelector';
import { SelectorButton } from '../shared/SelectorButton';
export function ComposerContextBar() {
  const { projects, activeProject, branches, loading, selectProject, addProject, selectBranch, running, opening, conversation } = useWorkspace();
  return (
    <div className="composer-context-bar" aria-label="Task context" aria-busy={loading}>
      <ProjectSelector value={activeProject?.id ?? ''} displayValue={activeProject?.name ?? 'Select project'} options={projects.map(project => ({ value: project.id, label: project.name, description: project.path }))} disabled={loading || running || opening || !!conversation} onSelect={id => void selectProject(id)} action={{ label: 'Add project...', onSelect: () => void addProject() }} />
      <SelectorButton label="Environment" icon="terminal" value="Local" options={['Local']} />
      <BranchSelector value={activeProject?.selectedBranch ?? ''} displayValue={activeProject?.selectedBranch || 'Select branch'} options={branches} disabled={loading || running || opening || !!conversation || !branches.length} onSelect={branch => void selectBranch(branch)} />
    </div>
  );
}
