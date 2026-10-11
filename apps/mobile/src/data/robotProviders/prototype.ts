import { lerobotBridgePoseControl } from "./lerobotBridgePoseTransport";
import { SO101_ENCODER_SCALE, SO101_JOINT_IDS, SO101_MODEL } from "./so101";
import {
  PhysicalArmBinding,
  RobotCalibrationPhase,
  RobotDeviceDescriptor,
  RobotJointId,
  RobotJointSample,
  RobotProvider,
  RobotProviderError
} from "./types";

// ── Prototype provider ─────────────────────────────────────────────────────
// Arm connection, calibration, joint telemetry and joint commands talk to
// nothing: each is a short simulated wait or a simulated reading, so the
// whole app can be exercised without a robot — and the UI discloses it
// (provider mode "prototype"). The one exception is pose control (Phone),
// which uses the real LeRobot bridge — see `poseControl` below. It
// implements the same contract a hardware provider will.

export const PROTOTYPE_PROVIDER_ID = "prototype";

// Two simulated devices, one per default arm.
export const PROTOTYPE_DEVICES: readonly RobotDeviceDescriptor[] = [
  { providerId: PROTOTYPE_PROVIDER_ID, deviceId: "prototype-arm-01", model: SO101_MODEL, displayName: "Prototype arm 1", roleHint: "leader" },
  { providerId: PROTOTYPE_PROVIDER_ID, deviceId: "prototype-arm-02", model: SO101_MODEL, displayName: "Prototype arm 2", roleHint: "follower" }
];

export function prototypeBinding(deviceId: string): PhysicalArmBinding {
  return { providerId: PROTOTYPE_PROVIDER_ID, deviceId };
}

const PROTOTYPE_CONNECT_MS = 1200;
const PROTOTYPE_CALIBRATION_MS = 1000;

// In-flight simulated waits, per device, so cancel / disconnect can end them
// (they reject with "cancelled"; the domain ignores stale results anyway).
const pendingConnect = new Map<string, () => void>();
const pendingCalibration = new Map<string, () => void>();

function simulatedWait<T>(pending: Map<string, () => void>, deviceId: string, ms: number, value: T): Promise<T> {
  pending.get(deviceId)?.();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(deviceId);
      resolve(value);
    }, ms);
    pending.set(deviceId, () => {
      clearTimeout(timer);
      pending.delete(deviceId);
      reject(new RobotProviderError("cancelled"));
    });
  });
}

// ── Simulated joint telemetry ──────────────────────────────────────────────
// Centre step: joints start off-centre and settle near mid-range, as if the
// user were bringing them there. Range step: each joint sweeps with a
// widening swing, so the observed range visibly grows. Nothing here decides
// whether a joint is "done" — a simulation can't know that.
const TELEMETRY_TICK_MS = 250;

const MOTION: Record<RobotJointId, { center: number; swing: number; seed: number }> = {
  shoulder_pan: { center: 2048, swing: 1280, seed: 0 },
  shoulder_lift: { center: 1960, swing: 1060, seed: 0.9 },
  elbow_flex: { center: 2144, swing: 1180, seed: 1.7 },
  wrist_flex: { center: 2012, swing: 940, seed: 2.6 },
  wrist_roll: { center: 2090, swing: 1420, seed: 3.4 },
  gripper: { center: 1710, swing: 700, seed: 4.3 }
};

// Ticks for the range swing to open up fully (~10 s) / the centre offset to
// mostly settle (~2 s).
const RANGE_RAMP_TICKS = 40;
const SETTLE_TICKS = 8;

function clampPosition(value: number) {
  return Math.max(SO101_ENCODER_SCALE.min, Math.min(SO101_ENCODER_SCALE.max, Math.round(value)));
}

// Each simulated device gets its own motion, derived from its device id —
// so two arms never show the same numbers, and renaming changes nothing.
function deviceVariation(deviceId: string) {
  let hash = 0;
  for (let index = 0; index < deviceId.length; index += 1) hash = (hash * 31 + deviceId.charCodeAt(index)) | 0;
  const unit = (Math.abs(hash) % 1000) / 1000;
  return { centerShift: Math.round((unit - 0.5) * 160), seedShift: unit * Math.PI * 2 };
}

function simulatedSample(deviceId: string, phase: RobotCalibrationPhase, tick: number): RobotJointSample[] {
  const { centerShift, seedShift } = deviceVariation(deviceId);
  return SO101_JOINT_IDS.map((jointId) => {
    const motion = MOTION[jointId];
    const center = motion.center + centerShift;
    const seed = motion.seed + seedShift;
    // Small hand tremor so the reading never looks frozen.
    const tremor = 6 * Math.sin(tick * 0.9 + seed * 3);
    const position =
      phase === "center"
        ? center + motion.swing * 0.45 * Math.sin(seed + 1) * Math.exp(-tick / SETTLE_TICKS) + tremor
        : center + motion.swing * Math.min(1, tick / RANGE_RAMP_TICKS) * Math.sin(tick * 0.22 + seed) + tremor;
    return { jointId, position: clampPosition(position) };
  });
}

export const prototypeProvider: RobotProvider = {
  id: PROTOTYPE_PROVIDER_ID,
  mode: "prototype",
  capabilities: { discovery: true, connection: true, calibration: true, jointTelemetry: true, jointControl: true, poseControl: true },

  connection: {
    // No discovery, pairing or handshake: a short wait. It reports nothing
    // about calibration, so the app keeps its own record for the arm.
    connect: (target) => simulatedWait(pendingConnect, target.binding.deviceId, PROTOTYPE_CONNECT_MS, {}),
    disconnect: async (target) => {
      pendingConnect.get(target.binding.deviceId)?.();
      pendingCalibration.get(target.binding.deviceId)?.();
    },
    cancelConnect: (target) => pendingConnect.get(target.binding.deviceId)?.(),
    discover: async () => [...PROTOTYPE_DEVICES]
  },

  calibration: {
    // Reads no servo and writes nothing: a short wait.
    calibrate: (target) => simulatedWait(pendingCalibration, target.binding.deviceId, PROTOTYPE_CALIBRATION_MS, undefined),
    cancelCalibration: (target) => pendingCalibration.get(target.binding.deviceId)?.()
  },

  telemetry: {
    positionScale: SO101_ENCODER_SCALE,
    start: (target, phase, onSample) => {
      const deviceId = target.binding.deviceId;
      let tick = 0;
      onSample(simulatedSample(deviceId, phase, tick));
      const timer = setInterval(() => {
        tick += 1;
        onSample(simulatedSample(deviceId, phase, tick));
      }, TELEMETRY_TICK_MS);
      return () => clearInterval(timer);
    }
  },

  // Accepts commands and does nothing: there is no device. Manual Control's
  // on-screen positions remain its own simulation.
  command: {
    jogJoint: async () => undefined,
    stopMotion: async () => undefined,
    recenter: async () => undefined
  },

  // NOT simulated: Phone Control sessions go to the real LeRobot bridge,
  // exactly as Phone did before providers existed. The prototype only
  // simulates arm connection / calibration (which gate whether a pose may
  // be sent); the pose session itself is real, and the bridge decides what
  // reaches the robot.
  poseControl: lerobotBridgePoseControl
};
