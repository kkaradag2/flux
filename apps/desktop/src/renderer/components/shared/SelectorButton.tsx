import { useId } from 'react';
import { usePopover } from '../../hooks/usePopover';
import { Icon, type IconName } from './Icon';
export interface SelectorProps { value: string; options?: readonly string[]; onSelect?: (value: string) => void; disabled?: boolean; }
interface SelectorButtonProps extends SelectorProps { label: string; icon: IconName; }
export function SelectorButton({ value, options = [value], label, icon, onSelect, disabled }: SelectorButtonProps) {
  const menu = usePopover();
  const id = useId();
  return (
    <div className="selector-container" ref={menu.container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) menu.close(); }}>
      <button ref={menu.trigger} type="button" className="selector-button" onClick={() => menu.setOpen(!menu.open)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); menu.setOpen(true); } }} disabled={disabled} aria-label={label + ': ' + value} title={label + ': ' + value} aria-haspopup="menu" aria-expanded={menu.open} aria-controls={id}>
        <Icon name={icon} size={16} /><span className="truncate">{value}</span><Icon name="chevron" size={13} />
      </button>
      {menu.open && <div className="selection-menu" id={id} role="menu" aria-label={label}>{options.map(option => <button type="button" role="menuitemradio" aria-checked={option === value} key={option} onClick={() => { onSelect?.(option); menu.close(true); }}>{option}<span aria-hidden="true">{option === value ? '✓' : ''}</span></button>)}</div>}
    </div>
  );
}
