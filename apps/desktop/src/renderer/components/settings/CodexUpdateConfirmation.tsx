import { useEffect, useRef } from 'react';
export function CodexUpdateConfirmation({ version, onCancel, onConfirm }: { version: string | null; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="unsaved-dialog" aria-labelledby="codex-update-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="codex-update-title">Update Codex?</h2>
    <p>Current version: {version ?? '—'}</p>
    <p>Flux will update the local Codex CLI and verify that it is ready.</p>
    <div><button className="agent-button" autoFocus onClick={onCancel}>Cancel</button><button className="agent-button agent-button-primary" onClick={onConfirm}>Update</button></div>
  </dialog>;
}
