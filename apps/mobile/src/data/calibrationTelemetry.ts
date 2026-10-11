// ── Calibration telemetry seam ─────────────────────────────────────────────
// While the user walks the arm through calibration, the screen shows where
// each joint is. The screen consumes CalibrationJointState[] (via
// useCalibrationTelemetry) and never knows where positions come from: that
// is a provider. Today the only provider is the prototype one below, which
// reads no servo — the UI labels its data as simulated. A real SO-ARM101
// provider replaces it later without the screen changing.
//
// Providers only REPORT positions; they never command a motor. Observed
// min / max are derived from the reported samples by the hook, so the same
// rule holds for simulated and real data.

export type CalibrationJointId =
  | "shoulder_pan"
  | "shoulder_lift"
  | "elbow_flex"
  | "wrist_flex"
  | "wrist_roll"
  | "gripper";

// One joint as the calibration monitor shows it. Positions are raw encoder
// counts (0 … JOINT_POSITION_MAX). min / max are null until this phase has
// tracked a range (the centre step tracks none).
export type CalibrationJointState = {
  id: CalibrationJointId;
  label: string;
  current: number;
  minObserved: number | null;
  maxObserved: number | null;
};

// The six SO-ARM101 joints, in the robot's own order, with human names.
// Raw ids stay in "Chi tiết kỹ thuật" for anyone matching them to hardware.
export const CALIBRATION_JOINTS: readonly { id: CalibrationJointId; label: string }[] = [
  { id: "shoulder_pan", label: "Xoay đế" },
  { id: "shoulder_lift", label: "Nâng vai" },
  { id: "elbow_flex", label: "Gập khuỷu" },
  { id: "wrist_flex", label: "Gập cổ tay" },
  { id: "wrist_roll", label: "Xoay cổ tay" },
  { id: "gripper", label: "Kẹp" }
];

// 12-bit servo encoder: positions run 0 … 4095, mid-range at 2048.
export const JOINT_POSITION_MAX = 4095;

// Which guided step is being monitored. The provider may use it (the
// prototype simulates a different motion per step); real hardware ignores it.
export type CalibrationPhase = "center" | "range";

export type JointPositions = Record<CalibrationJointId, number>;

export type CalibrationTelemetryMode = "prototype" | "hardware";

export type CalibrationTelemetryProvider = {
  mode: CalibrationTelemetryMode;
  // Starts reporting joint positions for ONE arm (RobotArmState.id);
  // returns a stop function. Read only. Samples are only ever for `armId`.
  start: (armId: string, phase: CalibrationPhase, onSample: (positions: JointPositions) => void) => () => void;
};

// ── Prototype provider ─────────────────────────────────────────────────────
// Simulated positions only, so the monitor can be exercised without a robot.
// Centre step: joints start off-centre and settle near mid-range, as if the
// user were bringing them there. Range step: each joint sweeps back and forth
// with a widening swing, so the observed range visibly grows. Nothing here
// decides whether a joint is "done" — the simulation can't know that.
const PROTOTYPE_TICK_MS = 250;

const PROTOTYPE_MOTION: Record<CalibrationJointId, { center: number; swing: number; seed: number }> = {
  shoulder_pan: { center: 2048, swing: 1280, seed: 0 },
  shoulder_lift: { center: 1960, swing: 1060, seed: 0.9 },
  elbow_flex: { center: 2144, swing: 1180, seed: 1.7 },
  wrist_flex: { center: 2012, swing: 940, seed: 2.6 },
  wrist_roll: { center: 2090, swing: 1420, seed: 3.4 },
  gripper: { center: 1710, swing: 700, seed: 4.3 }
};

// Ticks for the range swing to open up to its full width (~10 s).
const PROTOTYPE_RANGE_RAMP_TICKS = 40;
// Ticks for the centre step's starting offset to mostly settle (~2 s).
const PROTOTYPE_SETTLE_TICKS = 8;

function clampPosition(value: number) {
  return Math.max(0, Math.min(JOINT_POSITION_MAX, Math.round(value)));
}

// Each arm gets its own simulation: a stable offset derived from its id
// shifts every joint's centre and phase, so two arms never show the same
// numbers. Derived from the id (not the name), so renaming changes nothing.
function armVariation(armId: string) {
  let hash = 0;
  for (let index = 0; index < armId.length; index += 1) hash = (hash * 31 + armId.charCodeAt(index)) | 0;
  const unit = (Math.abs(hash) % 1000) / 1000;
  return { centerShift: Math.round((unit - 0.5) * 160), seedShift: unit * Math.PI * 2 };
}

function prototypeSample(armId: string, phase: CalibrationPhase, tick: number): JointPositions {
  const positions = {} as JointPositions;
  const { centerShift, seedShift } = armVariation(armId);
  CALIBRATION_JOINTS.forEach(({ id }) => {
    const motion = PROTOTYPE_MOTION[id];
    const center = motion.center + centerShift;
    const swing = motion.swing;
    const seed = motion.seed + seedShift;
    // Small hand tremor so the reading never looks frozen.
    const tremor = 6 * Math.sin(tick * 0.9 + seed * 3);
    if (phase === "center") {
      const offset = swing * 0.45 * Math.sin(seed + 1) * Math.exp(-tick / PROTOTYPE_SETTLE_TICKS);
      positions[id] = clampPosition(center + offset + tremor);
    } else {
      const reach = swing * Math.min(1, tick / PROTOTYPE_RANGE_RAMP_TICKS);
      positions[id] = clampPosition(center + reach * Math.sin(tick * 0.22 + seed) + tremor);
    }
  });
  return positions;
}

const prototypeTelemetry: CalibrationTelemetryProvider = {
  mode: "prototype",
  start: (armId, phase, onSample) => {
    let tick = 0;
    onSample(prototypeSample(armId, phase, tick));
    const timer = setInterval(() => {
      tick += 1;
      onSample(prototypeSample(armId, phase, tick));
    }, PROTOTYPE_TICK_MS);
    return () => clearInterval(timer);
  }
};

export const calibrationTelemetry: CalibrationTelemetryProvider = prototypeTelemetry;

export function getCalibrationTelemetryMode(): CalibrationTelemetryMode {
  return calibrationTelemetry.mode;
}
