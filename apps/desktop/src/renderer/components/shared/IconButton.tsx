import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  label: string;
}
export function IconButton({ icon, label, className = '', ...props }: IconButtonProps) {
  return (
    <button type="button" {...props} className={['icon-button', className].join(' ')} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}
