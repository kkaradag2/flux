import type { KeyboardEvent } from 'react';
import type { WorkspacePanelTab } from '../../hooks/useWorkspacePanel';

const tabs = ['tasks', 'team'] as const;
export function PanelTabs({ selectedTab, onSelect, id }: { selectedTab: WorkspacePanelTab; onSelect: (tab: WorkspacePanelTab) => void; id: string }) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: WorkspacePanelTab) {
    const next = event.key === 'Home' ? 'tasks' : event.key === 'End' ? 'team'
      : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? (tab === 'tasks' ? 'team' : 'tasks') : null;
    if (!next) return;
    event.preventDefault();
    onSelect(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[data-tab="' + next + '"]')?.focus();
  }
  return <div className="workspace-panel-tabs" role="tablist" aria-label="Workspace panel">{tabs.map(tab => <button key={tab} type="button" role="tab" data-tab={tab} id={id + '-' + tab} aria-controls={id + '-' + tab + '-panel'} aria-selected={selectedTab === tab} tabIndex={selectedTab === tab ? 0 : -1} onClick={() => onSelect(tab)} onKeyDown={event => onKeyDown(event, tab)}>{tab === 'tasks' ? 'Tasks' : 'Team'}</button>)}</div>;
}
