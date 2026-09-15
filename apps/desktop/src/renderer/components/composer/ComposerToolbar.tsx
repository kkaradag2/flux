import { IconButton } from '../shared/IconButton';
import { SendButton } from './SendButton';
export interface ComposerToolbarProps { sendDisabled?: boolean; onSend?: () => void; running?: boolean; onStop?: () => void; }
export function ComposerToolbar({ sendDisabled, onSend, running, onStop }: ComposerToolbarProps) {
  return <div className="composer-toolbar"><div className="composer-context"><IconButton icon="attachment" label="Attachments are not available yet" disabled /></div><div className="composer-actions">{running ? <IconButton icon="stop" label="Stop" className="send-button stop-button" onClick={onStop} /> : <SendButton disabled={sendDisabled} onClick={onSend} />}</div></div>;
}
