import type {
  PoseControlSession,
  PoseEndpoint,
  PoseFrame,
  PoseSessionEvent,
  PoseSessionOptions,
  PoseSessionState,
  RobotPoseControlProvider,
  RobotPoseTarget
} from "./types";

// ── LeRobot bridge pose transport (WebSocket, protocol v1) ────────────────
// The real Phone Control transport, moved here unchanged from
// PhoneTeleopScreen: the direct-USB LeRobot worker (dual_arm_vr_teleop)
// accepts phone and Quest clients on a plain LAN WebSocket at
// ws(s)://host:port/ws. Messages, payload fields and their order are
// exactly what the screen sent before:
//
//   hello            { type, protocolVersion, platform, sessionId, arm }      on open
//   phone_pose       { type, protocolVersion, platform, sessionId, sequence,
//                      timestampNs, trackingState, enabled, fineMode,
//                      position, quaternion, gripperVelocity }               while held
//   control_disabled { type, protocolVersion, reason }                        on stop
//   recenter         { type, protocolVersion }
//
// Cadence is the caller's (Phone sends at 20 Hz). The bridge also releases
// on its own after 250 ms without a pose. No auto-reconnect: a dropped
// session stays closed until the user opens it again.

export const LEROBOT_BRIDGE_POSE_PROVIDER_ID = "lerobot-bridge";

const PROTOCOL_VERSION = 1;

// LEGACY WIRE MAPPING. The bridge's protocol v1 has one fixed phone channel,
// `arm: "right"`, sent in `hello`. That string is a bridge protocol value,
// NOT SkyNex arm identity: the logical arm (target.armId, its binding) is
// chosen and validated above this transport by the domain, and nothing
// infers identity from "right". When the bridge supports several arms,
// replace only this function (e.g. map target.binding.deviceId to the
// bridge's channel) — no caller changes.
function legacyBridgeArm(_target: RobotPoseTarget): "right" {
  return "right";
}

function createSession({ platform, sessionId, target }: PoseSessionOptions): PoseControlSession {
  const arm = legacyBridgeArm(target);
  let socket: WebSocket | null = null;
  let state: PoseSessionState = "disconnected";
  // Per session (= per Phone screen mount), never reset on reconnect —
  // as before.
  let sequence = 0;
  const stateListeners = new Set<() => void>();
  const eventListeners = new Set<(event: PoseSessionEvent) => void>();

  const setState = (next: PoseSessionState) => {
    if (state === next) return;
    state = next;
    stateListeners.forEach((listener) => listener());
  };
  const emit = (event: PoseSessionEvent) => eventListeners.forEach((listener) => listener(event));
  const isOpen = () => socket?.readyState === WebSocket.OPEN;
  const sendJson = (payload: object) => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };

  return {
    getState: () => state,
    isOpen,
    subscribe: (listener) => {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    onEvent: (listener) => {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },

    open: (endpoint: PoseEndpoint) => {
      if (socket) return false;
      const host = endpoint.host.trim();
      const port = endpoint.port.trim();
      if (!host || !port) return false;
      const next = new WebSocket(`${endpoint.secure ? "wss" : "ws"}://${host}:${port}/ws`);
      socket = next;
      setState("connecting");
      // Events from a socket this session has already let go of are
      // ignored, so a late close can't mark a newer session disconnected.
      next.onopen = () => {
        if (socket !== next) return;
        setState("connected");
        emit("open");
        next.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, platform, sessionId, arm }));
      };
      next.onerror = () => {
        if (socket !== next) return;
        emit("error");
      };
      next.onclose = () => {
        if (socket !== next) return;
        socket = null;
        setState("disconnected");
        emit("close");
      };
      return true;
    },

    close: () => {
      const current = socket;
      socket = null;
      setState("disconnected");
      current?.close();
      emit("close");
    },

    // Letting go of the socket first means its close fires no events (see
    // the stale-socket guard). Listeners stay registered so the same session
    // object can be reopened (e.g. React StrictMode's remount).
    shutdown: () => {
      const current = socket;
      socket = null;
      setState("disconnected");
      current?.close();
    },

    sendPose: (frame: PoseFrame) => {
      if (!isOpen()) return;
      sendJson({
        type: "phone_pose",
        protocolVersion: PROTOCOL_VERSION,
        platform,
        sessionId,
        sequence: sequence++,
        timestampNs: Date.now() * 1e6,
        trackingState: frame.trackingState,
        enabled: true,
        fineMode: frame.fineMode,
        position: frame.position,
        quaternion: frame.quaternion,
        gripperVelocity: frame.gripperVelocity
      });
    },

    stopMotion: (reason: string) => sendJson({ type: "control_disabled", protocolVersion: PROTOCOL_VERSION, reason }),

    recenter: () => sendJson({ type: "recenter", protocolVersion: PROTOCOL_VERSION })
  };
}

export const lerobotBridgePoseControl: RobotPoseControlProvider = {
  id: LEROBOT_BRIDGE_POSE_PROVIDER_ID,
  createSession
};
