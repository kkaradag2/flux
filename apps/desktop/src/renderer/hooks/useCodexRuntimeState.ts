import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodexRuntimeSnapshot } from '../../shared/codex-runtime-state';
export function useCodexRuntimeState() {
  const [snapshot, setSnapshot] = useState<CodexRuntimeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestActivity, setRequestActivity] = useState<CodexRuntimeSnapshot['activity']>('checking');
  const mounted = useRef(false); const busy = useRef(false);
  const read = useCallback(async (): Promise<void> => {
    try { const result = await window.flux.getCodexRuntimeState(); if (mounted.current) { if (result.ok) { setSnapshot(current => JSON.stringify(current) === JSON.stringify(result.value) ? current : result.value); setError(null); } else setError('Codex could not be checked. Please try again.'); } }
    catch { if (mounted.current) setError('Codex could not be checked. Please try again.'); }
  }, []);
  const action = useCallback(async (kind: 'inspect' | 'retry' | 'update' | 'select', id?: string): Promise<void> => {
    if (busy.current) return; busy.current = true;
    if (mounted.current) { setError(null); setRequestActivity(kind === 'update' ? 'updating' : 'checking'); }
    try {
      const result = await (kind === 'select' && id ? window.flux.selectCodexInstallation(id) : kind === 'update' ? window.flux.updateCodexRuntime() : kind === 'retry' ? window.flux.retryCodexRuntime() : window.flux.inspectCodexRuntime());
      if (mounted.current) { if (result.ok) setSnapshot(result.value); else setError('Codex could not be checked. Please try again.'); }
    } catch { if (mounted.current) setError('Codex could not be checked. Please try again.'); }
    finally { busy.current = false; if (mounted.current) setRequestActivity(null); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void action('inspect');
    void read();
    return () => { mounted.current = false; };
  }, [read, action]);
  useEffect(() => {
    if (!requestActivity && !snapshot?.activity) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async (): Promise<void> => { await read(); if (!stopped) timer = setTimeout(() => void poll(), 2000); };
    timer = setTimeout(() => void poll(), 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [requestActivity, snapshot?.activity, read]);
  return { snapshot: snapshot ? { ...snapshot, activity: snapshot.activity === 'updating' ? 'updating' : requestActivity ?? snapshot.activity } : null, error, retry: () => void action('retry'), update: () => void action('update'), select: (id: string) => void action('select', id) };
}
