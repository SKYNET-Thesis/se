import { useEffect, useState } from 'react';
import { acceptTwinFrame, isFresh, linkSilent, parseTwinFrame, parseTwinHeartbeat, twinWebSocketUrl, withHeartbeat, type JointState, type TwinHeartbeat, type TwinSnapshot } from './twinTelemetry';

export function useTwinTelemetry(viewerScopeToken?: string, onScopeRejected?: () => void, expectedRobotId?: string, enabled = true): TwinSnapshot {
  const [frame, setFrame] = useState<JointState | null>(null);
  const [transport, setTransport] = useState<TwinSnapshot['transport']>('connecting');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [heartbeat, setHeartbeat] = useState<TwinHeartbeat | null>(null);

  useEffect(() => {
    if (!enabled) { setFrame(null); setError(null); setTransport('disconnected'); return; }
    setFrame(null); setError(null); setTransport('connecting');
    const baseUrl = twinWebSocketUrl();
    const url = baseUrl ? withHeartbeat(baseUrl) : null;
    if (!url) { setTransport('disconnected'); setError('Configure VITE_DIGITAL_TWIN_WS_URL for this host.'); return; }
    let active = true;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let previous: JointState | null = null;
    let lastMessageAt = Date.now();
    const clock = window.setInterval(() => {
      const current = Date.now(); setNow(current);
      // A silent-but-open link (dead peer, NAT drop) emits no close event: the heartbeat lets us detect it and reconnect.
      if (socket && socket.readyState === WebSocket.OPEN && linkSilent(lastMessageAt, current)) { setError('Telemetry link went silent; reconnecting.'); setHeartbeat(null); socket.close(); }
    }, 250);
    const connect = () => {
      if (!active) return;
      setTransport('connecting');
      try { socket = new WebSocket(url, viewerScopeToken ? [`vista.twin.${viewerScopeToken}`] : undefined); }
      catch { setTransport('disconnected'); retry = window.setTimeout(connect, 2000); return; }
      socket.onopen = () => { if (active) { setTransport('connected'); setFrame(null); setError(null); setHeartbeat(null); previous = null; lastMessageAt = Date.now(); } };
      socket.onmessage = event => {
        if (!active || typeof event.data !== 'string') return;
        let raw: unknown;
        try { raw = JSON.parse(event.data); } catch { setError('Malformed telemetry frame.'); return; }
        lastMessageAt = Date.now();
        if (raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'heartbeat') {
          const beat = parseTwinHeartbeat(raw);
          if (beat) setHeartbeat(beat); else setError('Rejected malformed heartbeat.');
          return;
        }
        const next = parseTwinFrame(raw, expectedRobotId);
        if (!next) { setError('Rejected invalid or unauthorized telemetry.'); return; }
        if (expectedRobotId && next.robot_id !== expectedRobotId) { setError('Telemetry does not match the selected robot.'); return; }
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
  }, [viewerScopeToken, onScopeRejected, expectedRobotId, enabled]);

  return { frame, transport, ageMs: frame ? Math.max(0, now - Date.parse(frame.measured_at)) : null, fresh: isFresh(frame, transport, now), error, heartbeat };
}
