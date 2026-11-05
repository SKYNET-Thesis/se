import { useEffect, useState } from 'react';
import { acceptTwinFrame, isFresh, parseTwinFrame, twinWebSocketUrl, type JointState, type TwinSnapshot } from './twinTelemetry';

export function useTwinTelemetry(viewerScopeToken?: string, onScopeRejected?: () => void): TwinSnapshot {
  const [frame, setFrame] = useState<JointState | null>(null);
  const [transport, setTransport] = useState<TwinSnapshot['transport']>('connecting');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = twinWebSocketUrl();
    if (!url) { setTransport('disconnected'); setError('Configure VITE_DIGITAL_TWIN_WS_URL for this host.'); return; }
    let active = true;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let previous: JointState | null = null;
    const clock = window.setInterval(() => setNow(Date.now()), 250);
    const connect = () => {
      if (!active) return;
      setTransport('connecting');
      try { socket = new WebSocket(url, viewerScopeToken ? [`vista.twin.${viewerScopeToken}`] : undefined); }
      catch { setTransport('disconnected'); retry = window.setTimeout(connect, 2000); return; }
      socket.onopen = () => { if (active) { setTransport('connected'); setFrame(null); setError(null); previous = null; } };
      socket.onmessage = event => {
        if (!active || typeof event.data !== 'string') return;
        let raw: unknown;
        try { raw = JSON.parse(event.data); } catch { setError('Malformed telemetry frame.'); return; }
        const next = parseTwinFrame(raw);
        if (!next) { setError('Rejected invalid or non-mock telemetry.'); return; }
        if (!acceptTwinFrame(previous, next)) { setError('Rejected out-of-order telemetry.'); return; }
        previous = next;
        setFrame(next); setNow(Date.now()); setError(null);
      };
      socket.onclose = (event?: CloseEvent) => {
        if (!active) return;
        if (event?.code === 4403 && viewerScopeToken) { setError('Physical telemetry scope expired or was revoked.'); onScopeRejected?.(); return; }
        setTransport('disconnected');
        retry = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => { if (active) setError('Mock telemetry connection failed.'); };
    };
    connect();
    return () => { active = false; window.clearInterval(clock); window.clearTimeout(retry); socket?.close(); };
  }, [viewerScopeToken, onScopeRejected]);

  return { frame, transport, ageMs: frame ? Math.max(0, now - Date.parse(frame.measured_at)) : null, fresh: isFresh(frame, transport, now), error };
}
