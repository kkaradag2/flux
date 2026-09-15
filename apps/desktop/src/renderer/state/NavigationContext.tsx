import { createContext, useContext, useState, type ReactNode } from 'react';
import { UnsavedChangesDialog } from '../components/management/UnsavedChangesDialog';
export type ManagementView = { view: 'workspace' | 'settings' | 'agents-list' | 'agent-create' | 'teams-list' | 'team-create' } | { view: 'agent-edit' | 'team-edit'; id: string };
interface Navigation { route: ManagementView; dirty: boolean; saving: boolean; setDirty: (value: boolean) => void; setSaving: (value: boolean) => void; navigate: (route: ManagementView) => void; saved: (route: ManagementView) => void; }
const NavigationContext = createContext<Navigation | null>(null);
export function NavigationProvider({ children }: { children: ReactNode }) {
 const [route, setRoute] = useState<ManagementView>({ view: 'workspace' }); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [pending, setPending] = useState<ManagementView | null>(null);
 const navigate = (next: ManagementView): void => { if (saving) return; if (dirty) setPending(next); else setRoute(next); };
 const saved = (next: ManagementView): void => { setDirty(false); setRoute(next); };
 return <NavigationContext.Provider value={{ route, dirty, saving, setDirty, setSaving, navigate, saved }}>{children}{pending && <UnsavedChangesDialog onStay={() => setPending(null)} onDiscard={() => { setDirty(false); setRoute(pending); setPending(null); }} />}</NavigationContext.Provider>;
}
export function useNavigation() { const value = useContext(NavigationContext); if (!value) throw new Error('Navigation provider required'); return value; }
