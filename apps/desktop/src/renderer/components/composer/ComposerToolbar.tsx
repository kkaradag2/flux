import { IconButton } from '../shared/IconButton';
import { SendButton } from './SendButton';
export interface ComposerToolbarProps { sendDisabled?: boolean; onAttach?: () => void; onSend?: () => void; }
export function ComposerToolbar({ sendDisabled, onAttach, onSend }: ComposerToolbarProps) {
  return <div className="composer-toolbar"><div className="composer-context"><IconButton icon="attachment" label="Attach files" onClick={onAttach} /></div><div className="composer-actions"><SendButton disabled={sendDisabled} onClick={onSend} /></div></div>;
}
