import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SO101_NAMES, toUrdfRadians, type So101JointName } from './so101Model';
import { acceptTwinFrame, isFresh, twinWebSocketUrl, type JointState } from './twinTelemetry';
import { ARM_IDENTITIES, type ArmIdentity, type ArmPair, type ViewLayoutMode, type PairTrackingDelta } from './types';
import { MockTelemetryProvider, type MotionPattern } from './mockTelemetryProvider';
import {
  isMessageFromCurrentSession,
  parseMultiArmMessage,
  type ClientSubscribeMessage,
  type MultiArmServerMessage,
} from './multiArmContract';

export type TelemetrySourceType = 'mock' | 'websocket';

export interface ArmTelemetryStats {
  armId: ArmIdentity;
  ageMs: number | null;
  fresh: boolean;
  sequence: number;
  packetsReceived: number;
  rejectedPackets: number;
  hz: number;
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'stale';
}

export type { PairTrackingDelta } from './types';

export interface DigitalTwinWorkspaceOptions {
  initialArm?: ArmIdentity;
  sessionId?: string;
  organizationId?: string;
  robotId?: string;
  viewerScopeToken?: string;
  onScopeRevoked?: () => void;
}

export function useDigitalTwinWorkspace(options: DigitalTwinWorkspaceOptions = {}) {
  const {
    initialArm = 'follower_left',
    sessionId = 'session-tabletop-01',
    organizationId,
    robotId,
    viewerScopeToken,
    onScopeRevoked,
  } = options;

  const [sourceType, setSourceType] = useState<TelemetrySourceType>('mock');
  const [activeArmId, setActiveArmId] = useState<ArmIdentity>(initialArm);
  const [activePairId, setActivePairId] = useState<ArmPair>('left_pair');
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>('pair');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [motionPattern, setMotionPattern] = useState<MotionPattern>('pick_and_place');
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [wsUrl, setWsUrl] = useState<string>(() => twinWebSocketUrl() ?? 'ws://127.0.0.1:8767/ws/twin');
  const [wsTransport, setWsTransport] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);

  // Per-arm frame storage
  const [frames, setFrames] = useState<Record<ArmIdentity, JointState | null>>({
    leader_left: null,
    follower_left: null,
    leader_right: null,
    follower_right: null,
  });

  // Per-arm packet stats tracking
  const [stats, setStats] = useState<Record<ArmIdentity, ArmTelemetryStats>>(() => {
    const init: Partial<Record<ArmIdentity, ArmTelemetryStats>> = {};
    for (const id of ARM_IDENTITIES) {
      init[id] = {
        armId: id,
        ageMs: null,
        fresh: false,
        sequence: 0,
        packetsReceived: 0,
        rejectedPackets: 0,
        hz: 0,
        connectionState: 'disconnected',
      };
    }
    return init as Record<ArmIdentity, ArmTelemetryStats>;
  });

  // Track packet arrival times to calculate real-time Hz
  const packetTimestamps = useRef<Record<ArmIdentity, number[]>>({
    leader_left: [],
    follower_left: [],
    leader_right: [],
    follower_right: [],
  });

  const mockProviderRef = useRef<MockTelemetryProvider | null>(null);
  const activeArmIdRef = useRef<ArmIdentity>(activeArmId);
  activeArmIdRef.current = activeArmId;

  // Reset all frames and stats when active session or robot changes to prevent any visual leakage
  useEffect(() => {
    setFrames({
      leader_left: null,
      follower_left: null,
      leader_right: null,
      follower_right: null,
    });
    setStats(() => {
      const init: Partial<Record<ArmIdentity, ArmTelemetryStats>> = {};
      for (const id of ARM_IDENTITIES) {
        init[id] = {
          armId: id,
          ageMs: null,
          fresh: false,
          sequence: 0,
          packetsReceived: 0,
          rejectedPackets: 0,
          hz: 0,
          connectionState: 'disconnected',
        };
      }
      return init as Record<ArmIdentity, ArmTelemetryStats>;
    });
  }, [sessionId, robotId, organizationId]);

  // Initialize Mock Provider
  useEffect(() => {
    const provider = new MockTelemetryProvider(30);
    provider.setPattern(motionPattern);
    provider.setSpeed(simSpeed);
    mockProviderRef.current = provider;

    if (sourceType === 'mock' && isPlaying) {
      provider.start();
    }

    const unsubscribe = provider.subscribe((newFrames) => {
      const now = Date.now();
      setFrames(newFrames);

      setStats((prev) => {
        const next = { ...prev };
        for (const armId of ARM_IDENTITIES) {
          const frame = newFrames[armId];
          const isConn = frame.connection === 'connected';
          const age = Math.max(0, now - Date.parse(frame.measured_at));
          const fresh = isFresh(frame, 'connected', now);

          const ts = packetTimestamps.current[armId];
          ts.push(now);
          while (ts.length > 0 && now - ts[0] > 1000) ts.shift();

          next[armId] = {
            armId,
            ageMs: age,
            fresh,
            sequence: frame.sequence,
            packetsReceived: prev[armId].packetsReceived + 1,
            rejectedPackets: prev[armId].rejectedPackets,
            hz: ts.length,
            connectionState: isConn ? (fresh ? 'connected' : 'stale') : 'disconnected',
          };
        }
        return next;
      });
    });

    return () => {
      unsubscribe();
      provider.stop();
    };
  }, [sourceType]);

  // Handle play/pause and pattern changes for mock
  useEffect(() => {
    if (!mockProviderRef.current) return;
    mockProviderRef.current.setPattern(motionPattern);
    mockProviderRef.current.setSpeed(simSpeed);
    if (sourceType === 'mock') {
      if (isPlaying) {
        mockProviderRef.current.start();
      } else {
        mockProviderRef.current.stop();
      }
    }
  }, [isPlaying, motionPattern, simSpeed, sourceType]);

  // Handle live WebSocket connection supporting multi-arm envelopes and legacy Contract v1
  useEffect(() => {
    if (sourceType !== 'websocket') return;

    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    const previousFrames: Partial<Record<string, JointState>> = {};

    setWsTransport('connecting');
    setLastError(null);

    const connect = () => {
      if (!active) return;
      setWsTransport('connecting');

      const protocols = viewerScopeToken ? [`vista.twin.${viewerScopeToken}`] : undefined;

      try {
        socket = new WebSocket(wsUrl, protocols);
      } catch (err) {
        setWsTransport('disconnected');
        setLastError(err instanceof Error ? err.message : 'WebSocket connection failed.');
        reconnectTimer = window.setTimeout(connect, 2000);
        return;
      }

      socket.onopen = () => {
        if (!active) return;
        setWsTransport('connected');
        setLastError(null);

        // Send subscription message for authorized arms
        const subMsg: ClientSubscribeMessage = {
          type: 'subscribe',
          session_id: sessionId,
          organization_id: organizationId,
          robot_id: robotId,
          arm_ids: ARM_IDENTITIES,
        };
        socket?.send(JSON.stringify(subMsg));
      };

      socket.onmessage = (event) => {
        if (!active || typeof event.data !== 'string') return;
        try {
          const raw = JSON.parse(event.data);
          const msg: MultiArmServerMessage | null = parseMultiArmMessage(raw);

          if (!msg) {
            setLastError('Received invalid or malformed telemetry payload');
            return;
          }

          // Enforce session isolation: reject messages not from current session
          if (!isMessageFromCurrentSession(msg, { session_id: sessionId, organization_id: organizationId, robot_id: robotId })) {
            return; // Dropped to prevent visual leakage
          }

          const now = Date.now();

          // 1. Snapshot replacement
          if (msg.type === 'snapshot') {
            const nextFrames: Partial<Record<ArmIdentity, JointState>> = {};
            for (const [armKey, state] of Object.entries(msg.arms)) {
              if (ARM_IDENTITIES.includes(armKey as ArmIdentity)) {
                const id = armKey as ArmIdentity;
                previousFrames[id] = state;
                nextFrames[id] = state;
              }
            }
            setFrames((prev) => ({ ...prev, ...nextFrames }));

            setStats((prev) => {
              const next = { ...prev };
              for (const [armKey, state] of Object.entries(msg.arms)) {
                if (ARM_IDENTITIES.includes(armKey as ArmIdentity)) {
                  const id = armKey as ArmIdentity;
                  const ts = packetTimestamps.current[id];
                  ts.push(now);
                  while (ts.length > 0 && now - ts[0] > 1000) ts.shift();

                  next[id] = {
                    armId: id,
                    ageMs: Math.max(0, now - Date.parse(state.measured_at)),
                    fresh: isFresh(state, 'connected', now),
                    sequence: state.sequence,
                    packetsReceived: prev[id].packetsReceived + 1,
                    rejectedPackets: prev[id].rejectedPackets,
                    hz: ts.length,
                    connectionState: state.connection === 'connected' ? 'connected' : 'disconnected',
                  };
                }
              }
              return next;
            });
            return;
          }

          // 2. Update event (incremental frame for a specific arm)
          if (msg.type === 'update') {
            const armId = msg.arm_id as ArmIdentity;
            if (!ARM_IDENTITIES.includes(armId)) return;

            const prev = previousFrames[armId] ?? null;
            if (!acceptTwinFrame(prev, msg.state)) {
              setStats((current) => ({
                ...current,
                [armId]: {
                  ...current[armId],
                  rejectedPackets: current[armId].rejectedPackets + 1,
                },
              }));
              return;
            }

            previousFrames[armId] = msg.state;
            setFrames((prev) => ({ ...prev, [armId]: msg.state }));

            const ts = packetTimestamps.current[armId];
            ts.push(now);
            while (ts.length > 0 && now - ts[0] > 1000) ts.shift();

            setStats((current) => ({
              ...current,
              [armId]: {
                armId,
                ageMs: Math.max(0, now - Date.parse(msg.state.measured_at)),
                fresh: isFresh(msg.state, 'connected', now),
                sequence: msg.state.sequence,
                packetsReceived: current[armId].packetsReceived + 1,
                rejectedPackets: current[armId].rejectedPackets,
                hz: ts.length,
                connectionState: msg.state.connection === 'connected' ? 'connected' : 'disconnected',
              },
            }));
            return;
          }

          // 3. Stale event
          if (msg.type === 'stale') {
            const targets = msg.arm_id && ARM_IDENTITIES.includes(msg.arm_id as ArmIdentity)
              ? [msg.arm_id as ArmIdentity]
              : ARM_IDENTITIES;

            setStats((current) => {
              const next = { ...current };
              for (const armId of targets) {
                next[armId] = {
                  ...next[armId],
                  fresh: false,
                  connectionState: 'stale',
                };
              }
              return next;
            });
            return;
          }

          // 4. Disconnected event
          if (msg.type === 'disconnected') {
            const targets = msg.arm_id && ARM_IDENTITIES.includes(msg.arm_id as ArmIdentity)
              ? [msg.arm_id as ArmIdentity]
              : ARM_IDENTITIES;

            setStats((current) => {
              const next = { ...current };
              for (const armId of targets) {
                next[armId] = {
                  ...next[armId],
                  fresh: false,
                  connectionState: 'disconnected',
                };
              }
              return next;
            });
            return;
          }

          // 5. Legacy Contract v1 single frame
          if (msg.type === 'legacy_v1') {
            const frame = msg.state;
            const targetArmId = ARM_IDENTITIES.includes(frame.robot_id as ArmIdentity)
              ? (frame.robot_id as ArmIdentity)
              : activeArmIdRef.current;

            const prev = previousFrames[targetArmId] ?? null;
            if (!acceptTwinFrame(prev, frame)) {
              setStats((current) => ({
                ...current,
                [targetArmId]: {
                  ...current[targetArmId],
                  rejectedPackets: current[targetArmId].rejectedPackets + 1,
                },
              }));
              return;
            }

            previousFrames[targetArmId] = frame;
            setFrames((current) => ({ ...current, [targetArmId]: frame }));

            const ts = packetTimestamps.current[targetArmId];
            ts.push(now);
            while (ts.length > 0 && now - ts[0] > 1000) ts.shift();

            const isConn = frame.connection === 'connected';
            const fresh = isConn ? isFresh(frame, 'connected', now) : false;

            setStats((current) => ({
              ...current,
              [targetArmId]: {
                armId: targetArmId,
                ageMs: Math.max(0, now - Date.parse(frame.measured_at)),
                fresh,
                sequence: frame.sequence,
                packetsReceived: current[targetArmId].packetsReceived + 1,
                rejectedPackets: current[targetArmId].rejectedPackets,
                hz: ts.length,
                connectionState: frame.connection,
              },
            }));
          }
        } catch {
          setLastError('Failed to decode incoming telemetry JSON');
        }
      };

      socket.onclose = (event) => {
        if (!active) return;
        setWsTransport('disconnected');

        // Check for 4403 unauthorized or expired viewer scope
        if (event?.code === 4403) {
          setLastError('Viewer scope token expired or unauthorized by backend (code 4403).');
          onScopeRevoked?.();
          return;
        }

        reconnectTimer = window.setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        if (!active) return;
        setLastError('WebSocket network error occurred');
      };
    };

    connect();

    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [sourceType, wsUrl, sessionId, organizationId, robotId, viewerScopeToken, onScopeRevoked]);

  // Calculate Tracking Delta between Leader and Follower
  const calculatePairDelta = useCallback(
    (leaderId: ArmIdentity, followerId: ArmIdentity, pairId: 'left_pair' | 'right_pair'): PairTrackingDelta => {
      const leaderFrame = frames[leaderId];
      const followerFrame = frames[followerId];

      const deltas: Record<So101JointName, { rad: number; deg: number; percent?: number }> = {
        shoulder_pan: { rad: 0, deg: 0 },
        shoulder_lift: { rad: 0, deg: 0 },
        elbow_flex: { rad: 0, deg: 0 },
        wrist_flex: { rad: 0, deg: 0 },
        wrist_roll: { rad: 0, deg: 0 },
        gripper: { rad: 0, deg: 0, percent: 0 },
      };

      let maxDelta = 0;
      let gripDelta = 0;

      if (leaderFrame && followerFrame) {
        for (const name of SO101_NAMES) {
          const lReading = leaderFrame.measured.find((r) => r.name === name);
          const fReading = followerFrame.measured.find((r) => r.name === name);
          if (lReading && fReading) {
            if (name === 'gripper') {
              const diffPct = Math.abs(lReading.position - fReading.position);
              gripDelta = diffPct;
              const radDiff = (diffPct * Math.PI) / 180;
              deltas[name] = {
                rad: radDiff,
                deg: diffPct,
                percent: diffPct,
              };
              if (radDiff > maxDelta) maxDelta = radDiff;
            } else {
              const lRad = toUrdfRadians(name, lReading.position, lReading.unit) ?? 0;
              const fRad = toUrdfRadians(name, fReading.position, fReading.unit) ?? 0;
              const diffRad = Math.abs(lRad - fRad);
              const diffDeg = (diffRad * 180) / Math.PI;
              deltas[name] = { rad: diffRad, deg: diffDeg };
              if (diffRad > maxDelta) maxDelta = diffRad;
            }
          }
        }
      }

      return {
        pairId,
        leaderArmId: leaderId,
        followerArmId: followerId,
        jointDeltas: deltas,
        maxDeltaRad: maxDelta,
        gripperDeltaPercent: gripDelta,
      };
    },
    [frames]
  );

  const leftPairDelta = useMemo(
    () => calculatePairDelta('leader_left', 'follower_left', 'left_pair'),
    [calculatePairDelta]
  );
  const rightPairDelta = useMemo(
    () => calculatePairDelta('leader_right', 'follower_right', 'right_pair'),
    [calculatePairDelta]
  );

  const simulateDrop = useCallback((durationMs = 2000) => {
    mockProviderRef.current?.simulatePacketDrop(durationMs);
  }, []);

  return {
    sourceType,
    setSourceType,
    activeArmId,
    setActiveArmId,
    activePairId,
    setActivePairId,
    layoutMode,
    setLayoutMode,
    isPlaying,
    setIsPlaying,
    motionPattern,
    setMotionPattern,
    simSpeed,
    setSimSpeed,
    wsUrl,
    setWsUrl,
    wsTransport,
    lastError,
    frames,
    stats,
    leftPairDelta,
    rightPairDelta,
    simulateDrop,
    sessionId,
    organizationId,
    robotId,
    viewerScopeToken,
  };
}
