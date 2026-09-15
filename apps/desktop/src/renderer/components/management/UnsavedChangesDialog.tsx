import { useEffect, useRef } from 'react';
export function UnsavedChangesDialog({ onStay, onDiscard }: { onStay: () => void; onDiscard: () => void }) {
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); return () => { if (previous instanceof HTMLElement) previous.focus(); }; }, []);
 return <dialog ref={dialog} className="unsaved-dialog" onCancel={event => { event.preventDefault(); onStay(); }} aria-labelledby="unsaved-title"><h2 id="unsaved-title">Discard unsaved changes?</h2><p>Your changes have not been saved.</p><div><button type="button" className="agent-button" autoFocus onClick={onStay}>Keep editing</button><button type="button" className="agent-button agent-button-primary" onClick={onDiscard}>Discard changes</button></div></dialog>;
}
