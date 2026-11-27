import { useEffect, useState } from 'react';
import { digitalTwinApi, type DigitalTwinViewerScope } from '../../lib/api';

/** Attempt-bound Digital Twin scope for the student's own run; renewed shortly before it expires. Never falls back to a robot-wide scope. */
export function useAttemptViewerScope(accessToken: string | undefined, attemptId: string | undefined, robotId: string | undefined, enabled: boolean) {
  const [scope, setScope] = useState<DigitalTwinViewerScope | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'authorized' | 'unavailable'>('idle');
  useEffect(() => {
    if (!enabled || !accessToken || !attemptId || !robotId) { setScope(null); setStatus('idle'); return; }
    let active = true;
    let timer: number | undefined;
    const request = () => {
      setStatus((current) => (current === 'authorized' ? current : 'loading'));
      void digitalTwinApi.attemptViewerScope(attemptId, robotId, accessToken).then((next) => {
        if (!active) return;
        setScope(next); setStatus('authorized');
        timer = window.setTimeout(request, Math.max(1_000, Date.parse(next.expiresAt) - Date.now() - 5_000));
      }).catch(() => { if (active) { setScope(null); setStatus('unavailable'); } });
    };
    request();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [enabled, accessToken, attemptId, robotId]);
  return { scope, status };
}
