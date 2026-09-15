import { SelectorButton, type SelectorProps } from '../shared/SelectorButton';

export function ProjectSelector(props: SelectorProps) {
  return <SelectorButton {...props} label="Project" icon="folder" />;
}
