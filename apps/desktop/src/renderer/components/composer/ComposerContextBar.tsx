import { useWorkspace } from '../../state/WorkspaceContext';
import { ProjectSelector } from './ProjectSelector';
import { BranchSelector } from './BranchSelector';
import { SelectorButton } from '../shared/SelectorButton';
export function ComposerContextBar() {
  const { selections, select } = useWorkspace();
  return (
    <div className="composer-context-bar" aria-label="Task context">
      <ProjectSelector value={selections.project} options={['Flux']} onSelect={value => select('project', value)} />
      <SelectorButton label="Environment" icon="terminal" value={selections.environment} options={['Local']} onSelect={value => select('environment', value)} />
      <BranchSelector value={selections.branch} options={['main']} onSelect={value => select('branch', value)} />
    </div>
  );
}
