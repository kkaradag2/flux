export function AgentStatus({ enabled }: { enabled: boolean }) { return <span className={'agent-status' + (enabled ? '' : ' is-disabled')}>{enabled ? 'Enabled' : 'Disabled'}</span>; }
