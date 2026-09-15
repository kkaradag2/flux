import { useEffect, useRef, useState } from 'react';
import { useNavigation, type ManagementView } from '../state/NavigationContext';
import { errorMessage } from './management-api';
export function useEditorDraft<T>(initial: T, save: (draft: T) => Promise<unknown>, destination: ManagementView, create: boolean) {
 const [draft, setDraft] = useState(initial); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const busy = useRef(false);
 const { setDirty, setSaving: navigationSaving, saved, navigate } = useNavigation();
 const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
 useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
 const submit = async (): Promise<void> => { if (busy.current || (!create && !dirty)) return; busy.current = true; setSaving(true); navigationSaving(true); setError(null); try { await save(draft); saved(destination); } catch (cause) { setError(errorMessage(cause)); } finally { busy.current = false; setSaving(false); navigationSaving(false); } };
 return { draft, change: (patch: Partial<T>) => setDraft(current => ({ ...current, ...patch })), dirty, saving, error, submit, cancel: () => navigate(destination) };
}
