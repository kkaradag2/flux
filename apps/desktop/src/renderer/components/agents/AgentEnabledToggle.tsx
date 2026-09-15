export function AgentEnabledToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <label className="agent-enabled"><span>Enabled</span><input type="checkbox" role="switch" checked={enabled} onChange={event => onChange(event.target.checked)} /><span className="agent-switch-track" aria-hidden="true" /></label>;
}
