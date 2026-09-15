import type { CodexRuntimeHealth, RuntimeHealthStatus } from '../../../shared/runtime-health';
const labels: Record<RuntimeHealthStatus, string> = { checking: 'Checking...', ready: 'Ready', 'not-installed': 'Not installed', 'not-authenticated': 'Sign-in required', error: 'Error' };
export function CodexRuntimeRow({ health, checking, onRefresh }: { health: CodexRuntimeHealth; checking: boolean; onRefresh: () => void }) {
  const status = checking ? 'checking' : health.status;
  return <section className="runtime-health" aria-labelledby="codex-runtime-title" aria-busy={checking}>
    <header><div><h3 id="codex-runtime-title">Codex</h3><span className={'runtime-status runtime-status--' + status} role="status"><span aria-hidden="true" />{labels[status]}</span></div><button className="agent-button" type="button" disabled={checking} onClick={onRefresh}>Refresh</button></header>
    <dl><div><dt>Version</dt><dd>{health.version ?? '—'}</dd></div><div><dt>Authentication</dt><dd>{health.authenticationMethod ?? (health.status === 'ready' ? 'Authenticated · Method unavailable' : '—')}</dd></div><div><dt>Last checked</dt><dd>{health.checkedAt ? <time dateTime={health.checkedAt}>{new Date(health.checkedAt).toLocaleString()}</time> : '—'}</dd></div></dl>
    <p className="runtime-message">{checking ? 'Checking Codex CLI…' : health.message}</p>
  </section>;
}
