import { useEffect, useRef } from 'react';
import type { WorkspaceOnlineConsent } from '../../../shared/workspace-environment';
export function WorkspaceDownloadConfirmation({ plan, onCancel, onConfirm }: { plan: WorkspaceOnlineConsent; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current, previous = document.activeElement; element?.showModal(); return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); }; }, []);
  return <dialog ref={dialog} className="unsaved-dialog" aria-labelledby="workspace-download-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="workspace-download-title">Download workspace dependencies?</h2>
    <p>Package manager: pnpm<br />Registry: <strong>{plan.registryHost}</strong></p>
    <p>The lockfile will stay frozen. Install scripts will not run. Downloads are only for this isolated worktree.</p>
    <p>Codex agents will not receive internet access. No task will start automatically.</p>
    <div><button type="button" className="agent-button" autoFocus onClick={onCancel}>Cancel</button><button type="button" className="agent-button agent-button-primary" onClick={onConfirm}>Download dependencies</button></div>
  </dialog>;
}
