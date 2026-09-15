import { useEffect, useState } from 'react';
import type { CodexUpdateProgress } from '../../../shared/codex-update-progress';
import { elapsedUpdateSeconds, updateStageMessages } from './updateProgressPresentation';
export function CodexUpdateProgressView({ progress }: { progress: CodexUpdateProgress | null }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const text = updateStageMessages[progress?.stage ?? 'PREPARING'];
  return <div className="codex-update-progress">
    <div role="status" aria-live="polite" aria-atomic="true"><p className="runtime-message">{text.message}</p>{text.detail && <p className="runtime-message update-progress-detail">{text.detail}</p>}</div>
    <div className="update-progress-track" role="progressbar" aria-label="Codex update in progress"><span /></div>
    {progress && <small className="update-progress-elapsed">{elapsedUpdateSeconds(progress.startedAt, now)}s elapsed</small>}
  </div>;
}
