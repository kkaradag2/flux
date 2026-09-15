import { useEffect, useRef, useState } from 'react';
import type { CodexInstallationCandidate } from '../../../shared/codex-installation';
export function CodexInstallationDialog({ onCancel, onSelect }: { onCancel: () => void; onSelect: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [candidates, setCandidates] = useState<CodexInstallationCandidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true; const element = dialog.current; element?.showModal();
    void window.flux.getCodexInstallations().then(result => {
      if (!current) return;
      if (result.ok) setCandidates(result.value); else setError('Available installations could not be listed. Please try again.');
    }).catch(() => { if (current) setError('Available installations could not be listed. Please try again.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; element?.close(); };
  }, []);
  return <dialog ref={dialog} className="unsaved-dialog installation-dialog" aria-labelledby="installation-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="installation-title">Choose Codex installation</h2>
    <p>Flux found more than one Codex CLI installation.<br />Choose the installation Flux should use.</p>
    {loading && <p role="status">Finding available installations…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !candidates.length && <p>No verified Codex installation is available. Install Codex and reopen this dialog.</p>}
    <fieldset className="installation-candidates" disabled={loading}><legend className="sr-only">Available installations</legend>
      {candidates.map(candidate => <label className="installation-option" key={candidate.id}>
        <input type="radio" name="codex-installation" value={candidate.id} checked={selected === candidate.id} onChange={() => setSelected(candidate.id)} />
        <span><strong>Codex {candidate.version}</strong><small>{candidate.installationMethod}</small>
          <span className="installation-path" title={candidate.executablePath}>{candidate.displayPath}</span>
          <span className="installation-badges">{candidate.isCurrentlySelected && <small>Currently used by Flux</small>}{candidate.isFirstOnPath && <small>First on PATH</small>}</span>
        </span>
      </label>)}
    </fieldset>
    <div><button className="agent-button" onClick={onCancel}>Cancel</button><button className="agent-button agent-button-primary" disabled={!selected || loading} onClick={() => { if (selected) onSelect(selected); }}>Use this installation</button></div>
  </dialog>;
}
