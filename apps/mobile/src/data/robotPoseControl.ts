import { getLiveReadiness, getRobotSetup, subscribeRobotLink } from "./robot";
import { ControlGate, getControlledFollowerArmId } from "./robotCommands";
import { getRobotProvider } from "./robotProviders/registry";
import type {
  PoseControlSession,
  PoseEndpoint,
  PoseFrame,
  PoseSessionEvent,
  PoseSessionState,
  RobotPoseTarget,
  RobotProvider
} from "./robotProviders/types";

export type { PoseEndpoint, PoseFrame, PoseSessionEvent, PoseSessionState, PoseTrackingState } from "./robotProviders/types";

// ── Phone Control session (domain) ────────────────────────────────────────
// The only path from Phone Control to a pose-control transport.
//
//   Phone UI / sensors → session for ONE logical arm (gate) → arm binding
//     → provider poseControl → transport
//
// A session is created for one logical arm (by default the active setup's
// controlled follower) and stays tied to it: it never switches to another
// arm. Renaming that arm is fine; if it leaves the active setup, goes
// offline, is unbound/rebound, loses calibration, or the provider changes,
// sends block, a stop goes out, and control needs a new deliberate hold.
//
// Two state layers stay separate: the ROBOT (shared readiness, arms) and
// this SESSION (the phone as a controller: its own connection to whatever
// serves pose control). An open session is no evidence the robot is online.
//
// Every pose is gated HERE at the moment it is sent, on top of the screen's
// own 50 ms check. Stopping is never gated. Nothing reconnects or resumes
// control by itself.

// Domain-level event on top of the transport's open / error / close: the
// session's target arm stopped being controllable. The screen releases the
// hold, as on a transport error.
export type PhoneControlEvent = PoseSessionEvent | "target_lost";

export type PhoneControlSession = {
  // The logical arm this session drives; null when there was none to drive.
  armId: string | null;
  // false when no valid target arm / pose provider existed at creation —
  // the session can never open.
  available: boolean;
  getState: () => PoseSessionState;
  isOpen: () => boolean;
  subscribe: (listener: () => void) => () => void;
  onEvent: (listener: (event: PhoneControlEvent) => void) => () => void;
  open: (endpoint: PoseEndpoint) => boolean;
  close: () => void;
  shutdown: () => void;
  // Called when the user deliberately takes control (starts a hold). Poses
  // are only sent after this, and again only after a new call once a stop
  // or target loss ended control — so nothing can resume on its own.
  beginControl: () => void;
  // true only if the frame passed every check and the session was open.
  sendPose: (frame: PoseFrame, gate: ControlGate) => boolean;
  // Never gated: stopping is the safe direction. Ends control.
  stopMotion: (reason: string) => void;
  // Gated on E-STOP (as Phone's "Căn giữa" always was) and on the session's
  // own provider: it drops the target on THIS session's arm and ends control.
  recenter: (gate: { emergencyStopped: boolean }) => boolean;
};

// No target arm, binding or pose provider: a session that can never open.
function unavailableSession(armId: string | null): PhoneControlSession {
  return {
    armId,
    available: false,
    getState: () => "disconnected",
    isOpen: () => false,
    subscribe: () => () => undefined,
    onEvent: () => () => undefined,
    open: () => false,
    close: () => undefined,
    shutdown: () => undefined,
    beginControl: () => undefined,
    sendPose: () => false,
    stopMotion: () => undefined,
    recenter: () => false
  };
}

// Resolves a logical arm to a pose target on a provider: the arm must exist,
// be in the active setup, be bound to a device of that provider, and the
// provider must offer pose control. Connection / calibration are checked
// per send, not here — a session may be opened before the robot is ready.
function resolvePoseTarget(armId: string, provider: RobotProvider): RobotPoseTarget | null {
  const setup = getRobotSetup();
  const arm = setup.arms[armId];
  if (!arm || !setup.activeArmIds.includes(armId) || !arm.binding) return null;
  if (arm.binding.providerId !== provider.id) return null;
  if (!provider.capabilities.poseControl || !provider.poseControl) return null;
  return { armId, binding: arm.binding, model: arm.model, role: arm.role, side: arm.side };
}

// Is this session's target arm controllable right now? Same arm, still in
// the active setup, connected, calibrated, not mid-calibration, still bound
// to the same device, and the provider is still the session's provider.
function targetIsValid(target: RobotPoseTarget, provider: RobotProvider): boolean {
  const setup = getRobotSetup();
  const arm = setup.arms[target.armId];
  return (
    !!arm &&
    setup.activeArmIds.includes(target.armId) &&
    arm.connected &&
    arm.calibrated &&
    !arm.calibrating &&
    arm.binding?.providerId === target.binding.providerId &&
    arm.binding.deviceId === target.binding.deviceId &&
    getRobotProvider() === provider
  );
}

function createGatedSession(inner: PoseControlSession, target: RobotPoseTarget, provider: RobotProvider): PhoneControlSession {
  const listeners = new Set<(event: PhoneControlEvent) => void>();
  const emit = (event: PhoneControlEvent) => listeners.forEach((listener) => listener(event));
  // Set by beginControl(); cleared by any stop, close or target loss.
  let controlling = false;
  let stopWatching: (() => void) | null = null;

  const unwatch = () => {
    stopWatching?.();
    stopWatching = null;
  };

  // While open: when the target arm stops being controllable, end control
  // and tell the screen. If control was active, also send the existing
  // safe stop (`robot_offline`, a reason the bridge already receives) —
  // once per loss.
  const watch = () => {
    unwatch();
    let wasValid = targetIsValid(target, provider);
    const offRobot = subscribeRobotLink(() => {
      const valid = targetIsValid(target, provider);
      if (wasValid && !valid) {
        const wasControlling = controlling;
        controlling = false;
        if (wasControlling) inner.stopMotion("robot_offline");
        emit("target_lost");
      }
      wasValid = valid;
    });
    const offClose = inner.onEvent((event) => {
      if (event === "close") {
        controlling = false;
        unwatch();
      }
    });
    stopWatching = () => {
      offRobot();
      offClose();
    };
  };

  inner.onEvent((event) => emit(event));

  return {
    armId: target.armId,
    available: true,
    getState: inner.getState,
    isOpen: inner.isOpen,
    subscribe: inner.subscribe,
    onEvent: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open: (endpoint) => {
      const opened = inner.open(endpoint);
      if (opened) watch();
      return opened;
    },
    close: () => {
      controlling = false;
      unwatch();
      inner.close();
    },
    shutdown: () => {
      controlling = false;
      unwatch();
      inner.shutdown();
    },
    beginControl: () => {
      controlling = true;
    },
    sendPose: (frame, gate) => {
      if (gate.emergencyStopped) return false;
      if (getLiveReadiness(gate.emergencyStopped) !== "ready") return false;
      if (!gate.controlEnabled || !controlling) return false;
      if (!targetIsValid(target, provider)) return false;
      if (!inner.isOpen()) return false;
      inner.sendPose(frame);
      return true;
    },
    stopMotion: (reason) => {
      controlling = false;
      inner.stopMotion(reason);
    },
    recenter: ({ emergencyStopped }) => {
      controlling = false;
      if (emergencyStopped || getRobotProvider() !== provider || !inner.recenter || !inner.isOpen()) return false;
      inner.recenter();
      return true;
    }
  };
}

// One session per Phone screen mount: its id and pose sequence live as long
// as the screen does, across reconnects — as before. Tied to the arm and the
// provider resolved at creation. `armId` defaults to the active setup's
// controlled follower; a new session (re-entering Phone) picks it again.
export function createRobotPoseControlSession({
  armId = getControlledFollowerArmId(),
  platform
}: {
  armId?: string | null;
  platform: "android" | "ios";
}): PhoneControlSession {
  if (!armId) return unavailableSession(null);
  const provider = getRobotProvider();
  const target = resolvePoseTarget(armId, provider);
  if (!target || !provider.poseControl) return unavailableSession(armId);
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return createGatedSession(provider.poseControl.createSession({ platform, sessionId, target }), target, provider);
}
