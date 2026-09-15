import type { ReactNode } from 'react';
interface WorkspaceLayoutProps { sidebar: ReactNode; children: ReactNode; inspector?: ReactNode; collapsed?: boolean; }
export function WorkspaceLayout({ sidebar, children, inspector, collapsed = false }: WorkspaceLayoutProps) {
  return <div className={['workspace-layout', inspector ? 'has-inspector' : '', collapsed ? 'sidebar-collapsed' : ''].join(' ')}>{sidebar}{children}{inspector}</div>;
}
