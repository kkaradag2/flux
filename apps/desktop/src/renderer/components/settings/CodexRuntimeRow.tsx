import type { CodexRuntimeSnapshot } from '../../../shared/codex-runtime-state';
import { runtimePresentation } from './runtimePresentation';
import { CodexUpdateProgressView } from './CodexUpdateProgressView';
export function CodexRuntimeRow({ snapshot, onRetry, onUpdate, onChoose }: { snapshot: CodexRuntimeSnapshot; onRetry: () => void; onUpdate: () => void; onChoose: () => void }) {
  const view = runtimePresentation(snapshot); const { state } = snapshot;
  const date = state.operationalStatus === 'READY' ? state.verifiedAt : state.updatedAt;
  return <section className="runtime-health" aria-labelledby="codex-runtime-title" aria-busy={view.busy}>
    <header><div><h3 id="codex-runtime-title">Codex</h3><span className={'runtime-status runtime-status--' + view.tone} role="status"><span className={view.updating ? 'runtime-update-spinner' : undefined} aria-hidden="true" />{view.label}</span></div>
      <div className="runtime-actions">
        {view.canChoose && <button className="agent-button agent-button-primary" disabled={view.busy} onClick={onChoose}>{view.chooseLabel}</button>}
        {view.canUpdate && <button className="agent-button agent-button-primary" disabled={view.busy} onClick={onUpdate}>Update Codex</button>}
        {view.canRetry && <button className="agent-button" disabled={view.busy} onClick={onRetry}>{view.retryLabel}</button>}
      </div>
    </header>
    {state.operationalStatus !== 'INSTALLATION_SELECTION_REQUIRED' && <dl><div><dt>Version</dt><dd>{state.cliVersion ?? '—'}</dd></div><div><dt>Authentication</dt><dd>{state.authenticationMethod ?? '—'}</dd></div><div><dt>{state.operationalStatus === 'READY' ? 'Last verified' : 'Last checked'}</dt><dd>{date ? <time dateTime={date}>{new Date(date).toLocaleString()}</time> : '—'}</dd></div></dl>}
    {view.showUpdateProgress ? <CodexUpdateProgressView progress={snapshot.updateProgress ?? null} /> : <p className="runtime-message">{view.message}</p>}
    {view.detail && <p className="runtime-message runtime-guidance" role="status">{view.detail}</p>}
  </section>;
}
