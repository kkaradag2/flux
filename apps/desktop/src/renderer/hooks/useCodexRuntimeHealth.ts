import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodexRuntimeHealth } from '../../shared/runtime-health';
const initial: CodexRuntimeHealth = { runtime: 'codex', status: 'checking', version: null, authenticationMethod: null, message: 'Checking Codex CLI…', checkedAt: '' };
export function useCodexRuntimeHealth() {
  const [health, setHealth] = useState<CodexRuntimeHealth>(initial);
  const [checking, setChecking] = useState(true);
  const pending = useRef(false); const mounted = useRef(false);
  const check = useCallback(async (refresh: boolean): Promise<void> => {
    if (pending.current) return; pending.current = true; setChecking(true);
    try {
      const result = await (refresh ? window.flux.refreshCodexRuntimeHealth() : window.flux.getCodexRuntimeHealth());
      if (mounted.current) setHealth(result.ok ? result.value : { ...initial, status: 'error', message: 'Codex runtime health could not be checked.', checkedAt: new Date().toISOString() });
    } catch { if (mounted.current) setHealth({ ...initial, status: 'error', message: 'Codex runtime health could not be checked.', checkedAt: new Date().toISOString() }); }
    finally { pending.current = false; if (mounted.current) setChecking(false); }
  }, []);
  useEffect(() => { mounted.current = true; void check(false); return () => { mounted.current = false; }; }, [check]);
  return { health, checking, refresh: () => void check(true) };
}
