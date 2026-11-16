import { parseTwinFrame, type JointState } from './twinTelemetry';

export type MultiArmMessageType = 'snapshot' | 'update' | 'stale' | 'disconnected' | 'legacy_v1';

export interface SnapshotEnvelope {
  type: 'snapshot';
  schema_version?: number;
  session_id?: string;
  organization_id?: string;
  robot_id?: string;
  timestamp: string;
  arms: Record<string, JointState>;
}

export interface UpdateEvent {
  type: 'update';
  session_id?: string;
  organization_id?: string;
  robot_id?: string;
  arm_id: string;
  state: JointState;
}

export interface StaleEvent {
  type: 'stale';
  session_id?: string;
  organization_id?: string;
  robot_id?: string;
  arm_id?: string; // If omitted, applies to all arms
  reason?: string;
}

export interface DisconnectedEvent {
  type: 'disconnected';
  session_id?: string;
  organization_id?: string;
  robot_id?: string;
  arm_id?: string;
  reason?: string;
}

export type MultiArmServerMessage =
  | SnapshotEnvelope
  | UpdateEvent
  | StaleEvent
  | DisconnectedEvent
  | { type: 'legacy_v1'; state: JointState };

export interface ClientSubscribeMessage {
  type: 'subscribe';
  session_id?: string;
  organization_id?: string;
  robot_id?: string;
  arm_ids?: string[];
}

/**
 * Validates and parses incoming server messages.
 * Supports Snapshot envelopes, Update events, Stale events, Disconnected events,
 * and Legacy Contract v1 frames.
 */
export function parseMultiArmMessage(raw: unknown): MultiArmServerMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Case 1: Structured Multi-Arm Envelopes
  if (typeof obj.type === 'string') {
    switch (obj.type) {
      case 'snapshot': {
        if (!obj.arms || typeof obj.arms !== 'object' || Array.isArray(obj.arms)) {
          return null;
        }
        const parsedArms: Record<string, JointState> = {};
        const rawArms = obj.arms as Record<string, unknown>;
        for (const [armKey, rawState] of Object.entries(rawArms)) {
          const parsed = parseTwinFrame(rawState);
          if (parsed) {
            parsedArms[armKey] = parsed;
          }
        }
        if (Object.keys(parsedArms).length === 0) return null;

        const ts = typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString();
        return {
          type: 'snapshot',
          schema_version: typeof obj.schema_version === 'number' ? obj.schema_version : 1,
          session_id: typeof obj.session_id === 'string' ? obj.session_id : undefined,
          organization_id: typeof obj.organization_id === 'string' ? obj.organization_id : undefined,
          robot_id: typeof obj.robot_id === 'string' ? obj.robot_id : undefined,
          timestamp: ts,
          arms: parsedArms,
        };
      }

      case 'update': {
        if (typeof obj.arm_id !== 'string' || !obj.arm_id) return null;
        const state = parseTwinFrame(obj.state);
        if (!state) return null;
        return {
          type: 'update',
          session_id: typeof obj.session_id === 'string' ? obj.session_id : undefined,
          organization_id: typeof obj.organization_id === 'string' ? obj.organization_id : undefined,
          robot_id: typeof obj.robot_id === 'string' ? obj.robot_id : undefined,
          arm_id: obj.arm_id,
          state,
        };
      }

      case 'stale': {
        return {
          type: 'stale',
          session_id: typeof obj.session_id === 'string' ? obj.session_id : undefined,
          organization_id: typeof obj.organization_id === 'string' ? obj.organization_id : undefined,
          robot_id: typeof obj.robot_id === 'string' ? obj.robot_id : undefined,
          arm_id: typeof obj.arm_id === 'string' ? obj.arm_id : undefined,
          reason: typeof obj.reason === 'string' ? obj.reason : undefined,
        };
      }

      case 'disconnected': {
        return {
          type: 'disconnected',
          session_id: typeof obj.session_id === 'string' ? obj.session_id : undefined,
          organization_id: typeof obj.organization_id === 'string' ? obj.organization_id : undefined,
          robot_id: typeof obj.robot_id === 'string' ? obj.robot_id : undefined,
          arm_id: typeof obj.arm_id === 'string' ? obj.arm_id : undefined,
          reason: typeof obj.reason === 'string' ? obj.reason : undefined,
        };
      }

      default:
        break;
    }
  }

  // Case 2: Legacy Contract v1 single frame
  const legacyFrame = parseTwinFrame(raw);
  if (legacyFrame) {
    return {
      type: 'legacy_v1',
      state: legacyFrame,
    };
  }

  return null;
}

/**
 * Validates that an incoming message belongs to the current active session.
 * Rejects messages with mismatched session_id, organization_id, or robot_id.
 * Prevents visual leakage between different sessions.
 */
export function isMessageFromCurrentSession(
  msg: MultiArmServerMessage,
  expected: { session_id?: string; organization_id?: string; robot_id?: string }
): boolean {
  if (msg.type === 'legacy_v1') {
    if (expected.robot_id && msg.state.robot_id !== expected.robot_id && msg.state.robot_id !== 'so101-mock') {
      return false;
    }
    return true;
  }

  if (expected.session_id && msg.session_id && msg.session_id !== expected.session_id) {
    return false;
  }
  if (expected.organization_id && msg.organization_id && msg.organization_id !== expected.organization_id) {
    return false;
  }
  if (expected.robot_id && msg.robot_id && msg.robot_id !== expected.robot_id) {
    return false;
  }

  return true;
}
