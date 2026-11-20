import { SO101_NAMES, toUrdfRadians, type So101JointName } from './so101Model';

export type JointReading = { name: So101JointName; position: number; unit: 'rad' | 'deg' | 'percent' };
export type JointState = {
  schema_version: 1; robot_id: string; source_mode: 'SIMULATION' | 'LIVE_PHYSICAL' | 'REPLAY'; controller_id: string;
  measured_at: string; sequence: number; connection: 'connected' | 'disconnected' | 'stale';
  measured: JointReading[]; calibrated?: JointReading[]; commanded?: JointReading[]; calibration_status: 'NOT_APPLICABLE' | 'UNCALIBRATED' | 'VERIFIED';
};
export type TwinHeartbeat = { type: 'heartbeat'; origin: 'mock' | 'simulation' | 'physical'; connection: 'connected' | 'disconnected' | 'stale'; sequence: number | null; serverTime: string };
export type TwinSnapshot = { frame: JointState | null; transport: 'connecting' | 'connected' | 'disconnected'; ageMs: number | null; fresh: boolean; error: string | null; heartbeat?: TwinHeartbeat | null };

/** Keepalive cadence requested from the Twin (server clamps to 0.25-10 s). A link silent for three intervals is dead. */
export const HEARTBEAT_SECONDS = 2;
export const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_SECONDS * 3000;

export function parseTwinHeartbeat(raw: unknown): TwinHeartbeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.type !== 'heartbeat' || value.schema_version !== 1) return null;
  if (!['mock', 'simulation', 'physical'].includes(value.origin as string) || !['connected', 'disconnected', 'stale'].includes(value.connection as string)) return null;
  if (typeof value.server_time !== 'string' || Number.isNaN(Date.parse(value.server_time))) return null;
  const sequence = typeof value.sequence === 'number' && Number.isInteger(value.sequence) && value.sequence >= 0 ? value.sequence : null;
  return { type: 'heartbeat', origin: value.origin as TwinHeartbeat['origin'], connection: value.connection as TwinHeartbeat['connection'], sequence, serverTime: value.server_time };
}

/** True when nothing (frame or heartbeat) arrived for the timeout while the socket claims to be open. */
export function linkSilent(lastMessageAt: number, now: number, timeoutMs = HEARTBEAT_TIMEOUT_MS): boolean {
  return now - lastMessageAt > timeoutMs;
}

export function withHeartbeat(url: string, seconds = HEARTBEAT_SECONDS): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('heartbeat')) parsed.searchParams.set('heartbeat', String(seconds));
  return parsed.toString();
}
const STALE_MS = 1000;

function readings(value: unknown): value is JointReading[] {
  if (!Array.isArray(value) || value.length !== SO101_NAMES.length) return false;
  const names = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return false;
    const reading = item as Record<string, unknown>;
    if (typeof reading.name !== 'string' || !SO101_NAMES.includes(reading.name as So101JointName) || names.has(reading.name)) return false;
    if (typeof reading.position !== 'number' || !Number.isFinite(reading.position)) return false;
    if (reading.unit !== 'rad' && reading.unit !== 'deg' && reading.unit !== 'percent') return false;
    if (reading.name !== 'gripper' && reading.unit === 'percent') return false;
    if (reading.name === 'gripper' && reading.unit === 'percent' && (reading.position < 0 || reading.position > 100)) return false;
    if (toUrdfRadians(reading.name as So101JointName, reading.position, reading.unit) === null) return false;
    names.add(reading.name);
  }
  return names.size === SO101_NAMES.length;
}

export function parseTwinFrame(raw: unknown, expectedRobotId?: string): JointState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const frame = raw as Record<string, unknown>;
  if (frame.schema_version !== 1 || typeof frame.robot_id !== 'string' || !frame.robot_id || (frame.source_mode !== 'SIMULATION' && frame.source_mode !== 'LIVE_PHYSICAL' && frame.source_mode !== 'REPLAY')) return null;
  if (frame.source_mode === 'SIMULATION' && frame.robot_id !== 'so101-mock' && (!expectedRobotId || frame.robot_id !== expectedRobotId)) return null;
  if (frame.calibration_status !== 'NOT_APPLICABLE' && frame.calibration_status !== 'UNCALIBRATED' && frame.calibration_status !== 'VERIFIED') return null;
  if (frame.source_mode === 'LIVE_PHYSICAL' && frame.calibration_status === 'NOT_APPLICABLE') return null;
  if (typeof frame.controller_id !== 'string' || !frame.controller_id) return null;
  if (!Number.isSafeInteger(frame.sequence) || (frame.sequence as number) < 0) return null;
  if (frame.connection !== 'connected' && frame.connection !== 'disconnected' && frame.connection !== 'stale') return null;
  if (typeof frame.measured_at !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(frame.measured_at) || !Number.isFinite(Date.parse(frame.measured_at))) return null;
  if (!readings(frame.measured) || (frame.calibrated !== undefined && !readings(frame.calibrated)) || (frame.commanded !== undefined && !readings(frame.commanded))) return null;
  if (frame.source_mode === 'LIVE_PHYSICAL' && frame.calibration_status === 'VERIFIED' && !readings(frame.calibrated)) return null;
  return frame as JointState;
}

export function isFresh(frame: JointState | null, transport: TwinSnapshot['transport'], now = Date.now()): boolean {
  return !!frame && transport === 'connected' && frame.connection === 'connected' && now >= Date.parse(frame.measured_at) && now - Date.parse(frame.measured_at) <= STALE_MS;
}

export function isPoseCalibrated(frame: JointState | null): boolean {
  return !!frame && (frame.source_mode !== 'LIVE_PHYSICAL' || frame.calibration_status === 'VERIFIED');
}

export function acceptTwinFrame(previous: JointState | null, next: JointState): boolean {
  return !previous || (next.sequence > previous.sequence && (next.connection !== 'connected' || Date.parse(next.measured_at) >= Date.parse(previous.measured_at)));
}

export function twinWebSocketUrl(): string | null {
  const configured = import.meta.env.VITE_DIGITAL_TWIN_WS_URL as string | undefined;
  if (configured) {
    try { const url = new URL(configured); return url.protocol === 'ws:' || url.protocol === 'wss:' ? url.toString() : null; }
    catch { return null; }
  }
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'ws://127.0.0.1:8767/ws/twin' : null;
}
