import { useId } from 'react';
import { usePopover } from '../../hooks/usePopover';
import { Icon, type IconName } from './Icon';

export interface SelectorOption { value: string; label: string; description?: string; }
export interface SelectorProps {
  value: string;
  displayValue?: string;
  title?: string;
  options?: readonly (string | SelectorOption)[];
  onSelect?: (value: string) => void;
  disabled?: boolean;
  action?: { label: string; onSelect: () => void };
}
interface SelectorButtonProps extends SelectorProps { label: string; icon: IconName; }
export function SelectorButton({ value, displayValue = value, title, options = [value], label, icon, onSelect, disabled, action }: SelectorButtonProps) {
  const menu = usePopover();
  const id = useId();
  return (
    <div className={'selector-container' + (label === 'Project' ? ' project-selector' : '')} ref={menu.container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) menu.close(); }}>
      <button ref={menu.trigger} type="button" className="selector-button" onClick={() => menu.setOpen(!menu.open)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); menu.setOpen(true); } }} disabled={disabled} aria-label={label + ': ' + displayValue} title={title ?? label + ': ' + displayValue} aria-haspopup="menu" aria-expanded={menu.open} aria-controls={id}>
        <Icon name={icon} size={16} /><span className="truncate">{displayValue}</span><Icon name="chevron" size={13} />
      </button>
      {menu.open && <div className="selection-menu" id={id} role="menu" aria-label={label}>
        <div className="selection-options">{options.map(item => {
          const option = typeof item === 'string' ? { value: item, label: item } : item;
          return <button type="button" role="menuitemradio" aria-checked={option.value === value} key={option.value} title={option.description ?? option.label} onClick={() => { menu.close(true); onSelect?.(option.value); }}>
            <span className="selection-option-label"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>
            <span aria-hidden="true">{option.value === value ? '✓' : ''}</span>
          </button>;
        })}</div>
        {action && <button type="button" className="selection-action" role="menuitem" onClick={() => { menu.close(true); action.onSelect(); }}>{action.label}</button>}
      </div>}
    </div>
  );
}
