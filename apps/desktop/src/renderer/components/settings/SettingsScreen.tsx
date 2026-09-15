import { useState } from 'react';
import { useCodexRuntimeState } from '../../hooks/useCodexRuntimeState';
import { CodexRuntimeRow } from './CodexRuntimeRow';
import { CodexUpdateConfirmation } from './CodexUpdateConfirmation';
import { CodexInstallationDialog } from './CodexInstallationDialog';
export function SettingsScreen() {
  const runtime = useCodexRuntimeState(); const [confirm, setConfirm] = useState(false);
  const [choose, setChoose] = useState(false);
  return <section className="settings-screen"><h1>Settings</h1><h2>Runtimes</h2>
    {runtime.snapshot ? <CodexRuntimeRow snapshot={runtime.snapshot} onRetry={runtime.retry} onUpdate={() => setConfirm(true)} onChoose={() => setChoose(true)} /> : <p role="status">Checking Codex…</p>}
    {runtime.error && <p className="runtime-message" role="alert">{runtime.error} <button className="agent-button" onClick={runtime.retry}>Try again</button></p>}
    {confirm && <CodexUpdateConfirmation version={runtime.snapshot?.state.cliVersion ?? null} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); runtime.update(); }} />}
    {choose && <CodexInstallationDialog onCancel={() => setChoose(false)} onSelect={id => { setChoose(false); runtime.select(id); }} />}
  </section>;
}
