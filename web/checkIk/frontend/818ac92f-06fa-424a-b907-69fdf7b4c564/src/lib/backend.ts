import type { RobotDevice, SerialPort } from '../types';

export interface BackendTask {
  kind: string;
  running: boolean;
  exitCode: number | null;
  startedAt: number;
  output: string[];
  implementation?: 'vr_control' | 'vr_lekiwi';
  mode?: 'left-only' | 'right-only' | 'dual-arm' | null;
  activeArms?: string[];
  processHealth?: string;
  relayHealth?: string;
  operatorUrl?: string | null;
  lastError?: string | null;
  calibration?: {
    target: 'followers' | 'leaders';
    arm: 'left' | 'right';
    stage: 'profile' | 'middle' | 'range' | 'saving' | 'complete';
    instruction: string;
    joints: Array<{
      name: string;
      min: number | null;
      position: number | null;
      max: number | null;
      targetRange?: number | null;
      status: 'waiting' | 'observed' | 'automatic' | 'done';
    }>;
  };
}

export interface BackendSnapshot {
  backend: {
    name: string;
    version: string;
    simulated: boolean;
    motionEnabled: boolean;
    supportsVRControl: boolean;
    latchedMotionLock?: boolean;
  };
  ports: SerialPort[];
  devices: Array<Partial<RobotDevice> & Pick<RobotDevice, 'id'>>;
  cameras: Array<{ path: string; connection: string; resolution: string | null; fps: number | null }>;
  task: BackendTask | null;
  readiness?: {
    mode: string;
    activeArms: string[];
    ready: boolean;
    checks: Record<string, boolean>;
  };
  telemetry: null | {
    timestamp: number;
    left: Record<string, number>;
    right: Record<string, number>;
  };
}

const configured = import.meta.env.VITE_BACKEND_URL as string | undefined;
export const BACKEND_URL = configured?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `${response.status} ${response.statusText}`);
  return payload as T;
}

export const backend = {
  status: () => request<BackendSnapshot>('/api/status'),
  post: (path: string, body: Record<string, unknown> = {}) =>
    request<BackendSnapshot>(path, { method: 'POST', body: JSON.stringify(body) }),
};
