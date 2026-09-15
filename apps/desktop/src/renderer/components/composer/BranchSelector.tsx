import { SelectorButton, type SelectorProps } from '../shared/SelectorButton';

export function BranchSelector(props: SelectorProps) {
  return <SelectorButton {...props} label="Branch" icon="branch" />;
}
