import { useEffect, useRef, useState } from 'react';
import { WorkspaceDownloadConfirmation } from './WorkspaceDownloadConfirmation';
import type { WorkspaceEnvironmentStatus, WorkspaceOnlineConsent, WorkspaceEnvironmentCode } from '../../../shared/workspace-environment';
const stages = { resolving_registry: 'Resolving registry', downloading_dependencies: 'Downloading dependencies', linking_workspace: 'Linking isolated workspace', verifying_lockfile: 'Verifying lockfile', validating_source: 'Validating source' } as const;
const messages = {
  user_cancelled: 'Download cancelled before starting.',
  registry_not_allowed: 'This registry is not allowed.',
  authentication_required: 'Dependencies require authentication. No credentials were requested.',
  integrity_failed: 'Dependency integrity verification failed.',
  download_failed: 'Dependency download failed.',
  ready: 'Workspace dependencies are ready. Task status has not changed.',
  offline_dependencies_unavailable: 'Required dependencies are not available in the local package cache. Network access remains disabled.',
  lockfile_changed: 'Workspace dependency inputs changed. Preparation must be checked again.',
  provider_unavailable: 'Workspace preparation is not available for this repository.',
  preparation_cancelled: 'Workspace preparation cancelled.',
  preparation_failed: 'Workspace preparation could not finish.',
} as const;
export function WorkspaceEnvironmentPanel({ runId, onPreparing }: { runId: string; onPreparing: (value: boolean) => void }) {
  const [status, setStatus] = useState<WorkspaceEnvironmentStatus | null>(null), [preparing, setPreparing] = useState(false), [error, setError] = useState<WorkspaceEnvironmentCode | null>(null);
  const [consent, setConsent] = useState<WorkspaceOnlineConsent | null>(null), [clock, setClock] = useState(Date.now());
  const pending = useRef(false), generation = useRef(0);
  const isPreparing = preparing || status?.state === 'preparing';
  useEffect(() => {
    const ticket = ++generation.current; setStatus(null); setError(null);
    void window.flux.getWorkspaceEnvironmentStatus({ runId }).then(result => { if (ticket === generation.current && result.ok) setStatus(result.value); }).catch(() => undefined);
    return () => { generation.current++; };
  }, [runId]);
  useEffect(() => {
    onPreparing(isPreparing);
    if (!isPreparing) return;
    const ticket = generation.current;
    const timer = window.setInterval(() => {
      setClock(Date.now());
      void window.flux.getWorkspaceEnvironmentStatus({ runId }).then(result => { if (ticket === generation.current && result.ok) setStatus(result.value); }).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPreparing, onPreparing, runId]);
  const prepare = async (online?: WorkspaceOnlineConsent) => {
    if (pending.current) return;
    pending.current = true; setPreparing(true); onPreparing(true); setError(null); const ticket = generation.current;
    setConsent(null);
    try { const result = await (online ? window.flux.prepareWorkspaceOnline({ runId, consentId: online.consentId }) : window.flux.prepareWorkspaceEnvironment({ runId })); if (ticket === generation.current) { if (result.ok) setStatus(result.value); else setError(result.code); } }
    catch { if (ticket === generation.current) setError('preparation_failed'); }
    finally { pending.current = false; if (ticket === generation.current) { setPreparing(false); onPreparing(false); } }
  };
  const openOnline = async () => {
    if (pending.current) return;
    pending.current = true; const ticket = generation.current; setError(null);
    try { const result = await window.flux.getWorkspaceOnlinePlan({ runId }); if (ticket === generation.current) { if (result.ok) setConsent(result.value); else setError(result.code); } }
    catch { if (ticket === generation.current) setError('preparation_failed'); }
    finally { pending.current = false; }
  };
  const cancelConsent = () => { if (consent) void window.flux.cancelWorkspaceOnlineConsent({ runId, consentId: consent.consentId }); setConsent(null); };
  const verify = async () => {
    if (pending.current) return;
    pending.current = true; setPreparing(true); setError(null); const ticket = generation.current;
    try { const result = await window.flux.verifyWorkspaceEnvironment({ runId }); if (ticket === generation.current) { if (result.ok) setStatus(result.value); else setError(result.code); } }
    catch { if (ticket === generation.current) setError('preparation_failed'); }
    finally { pending.current = false; if (ticket === generation.current) setPreparing(false); }
  };
  if (!status?.provider) return null;
  return <div className="workspace-environment" aria-label="Workspace environment">
    <strong>Workspace environment · {status.provider}</strong>
    <p>{status.mode === 'online' ? 'Dependencies are downloaded only for this worktree. Install scripts and agent network access remain disabled.' : 'Uses the local package cache. Network access and install scripts are disabled.'}</p>
    <div role="status" aria-live="polite">{isPreparing ? <><span className="environment-spinner" aria-hidden="true" /> {status.stage ? stages[status.stage] : 'Preparing workspace…'} · {status.startedAt ? Math.max(0, Math.floor((clock - Date.parse(status.startedAt)) / 1000)) : 0}s</> : error ? messages[error] : status.code ? messages[status.code] : 'Workspace preparation is available.'}</div>
    {isPreparing ? <button type="button" className="execution-action" onClick={() => { void window.flux.cancelWorkspaceEnvironment({ runId }).catch(() => setError('preparation_failed')); }}>Cancel</button>
      : status.preparationRequired && <button type="button" className="execution-action" onClick={() => { void prepare(); }}>Prepare workspace</button>}
    {!isPreparing && status.onlineAvailable && <button type="button" className="execution-action" onClick={() => { void openOnline(); }}>Download dependencies…</button>}
    {status.registryHost && <p>Registry: {status.registryHost}</p>}
    {!isPreparing && status.durationMs !== undefined && <p>Preparation: {(status.durationMs / 1000).toFixed(1)}s</p>}
    {status.validation && <p>Source validation — Signup: {status.validation.signup}; Typecheck: {status.validation.typecheck}; Build: {status.validation.build}; Diff: {status.validation.diff}. {status.validation.sourceUnchanged ? 'Source files preserved.' : 'Source changes detected; verification stopped.'}</p>}
    {!isPreparing && status.state === 'ready' && (!status.validation || [status.validation.signup, status.validation.typecheck, status.validation.build, status.validation.diff].some(value => value !== 'passed')) && <button type="button" className="execution-action" onClick={() => { void verify(); }}>Verify workspace</button>}
    {consent && <WorkspaceDownloadConfirmation plan={consent} onCancel={cancelConsent} onConfirm={() => { void prepare(consent); }} />}
  </div>;
}
