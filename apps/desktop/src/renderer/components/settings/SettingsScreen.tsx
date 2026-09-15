import { useCodexRuntimeHealth } from '../../hooks/useCodexRuntimeHealth';
import { CodexRuntimeRow } from './CodexRuntimeRow';
export function SettingsScreen() {
  const { health, checking, refresh } = useCodexRuntimeHealth();
  return <section className="settings-screen"><h1>Settings</h1><h2>Runtimes</h2><CodexRuntimeRow health={health} checking={checking} onRefresh={refresh} /></section>;
}
