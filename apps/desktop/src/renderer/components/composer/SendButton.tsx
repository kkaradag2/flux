import { IconButton } from '../shared/IconButton';

interface SendButtonProps {
  disabled?: boolean | undefined;
  onClick?: (() => void) | undefined;
}
export function SendButton({ disabled = true, onClick }: SendButtonProps) {
  return <IconButton icon="arrowUp" label="Send task" className="send-button" disabled={disabled} onClick={onClick} />;
}
