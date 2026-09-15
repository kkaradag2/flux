import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface SidebarItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon?: IconName;
  trailing?: ReactNode;
  selected?: boolean;
}
export function SidebarItem({ label, icon, trailing, selected = false, className = '', ...props }: SidebarItemProps) {
  return (
    <button type="button" {...props} className={['sidebar-item', selected ? 'is-selected' : '', className].join(' ')} aria-label={label} aria-current={selected ? 'page' : undefined} title={label}>
      {icon && <Icon name={icon} />}
      <span className="truncate">{label}</span>
      {trailing && <span className="sidebar-item-trailing">{trailing}</span>}
    </button>
  );
}
