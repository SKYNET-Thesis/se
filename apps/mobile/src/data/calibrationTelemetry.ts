import { getRobotLinkMode, getRobotSetup, resolveDeviceTarget, RobotLinkMode } from "./robot";
import { getRobotProvider } from "./robotProviders/registry";
import { SO101_ENCODER_SCALE, SO101_JOINT_IDS } from "./robotProviders/so101";
import type { RobotCalibrationPhase, RobotJointId, RobotJointSample } from "./robotProviders/types";

// ── Calibration telemetry (domain) ────────────────────────────────────────
// While the user walks an arm through calibration, the screen shows where
// each joint is. The screen consumes CalibrationJointState[] (via
// useCalibrationTelemetry); readings come from the ACTIVE provider's
// telemetry for that arm's bound device, started here. Today that is the
// prototype provider's simulation, and the UI labels it as such.
//
// Providers only REPORT positions; they never command a motor. Observed
// min / max are derived from the reported samples by the hook, so the same
// rule holds for simulated and real data.

export type CalibrationJointId = RobotJointId;

// One joint as the calibration monitor shows it. Positions are in the
// provider's units (SO-ARM101: raw encoder counts). min / max are null until
// this phase has tracked a range (the centre step tracks none).
export type CalibrationJointState = {
  id: CalibrationJointId;
  label: string;
  current: number;
  minObserved: number | null;
  maxObserved: number | null;
};

const JOINT_LABEL: Record<RobotJointId, string> = {
  shoulder_pan: "Xoay đế",
  shoulder_lift: "Nâng vai",
  elbow_flex: "Gập khuỷu",
  wrist_flex: "Gập cổ tay",
  wrist_roll: "Xoay cổ tay",
  gripper: "Kẹp"
};

// The six SO-ARM101 joints, in the robot's own order, with human names.
// Raw ids stay in "Chi tiết kỹ thuật" for anyone matching them to hardware.
export const CALIBRATION_JOINTS: readonly { id: CalibrationJointId; label: string }[] = SO101_JOINT_IDS.map((id) => ({
  id,
  label: JOINT_LABEL[id]
}));

// Upper bound of the monitor's position track. SO-ARM101 encoder metadata
// (0 … 4095), kept as a constant for the monitor UI; a provider with other
// units would also need the track to read its positionScale.
export const JOINT_POSITION_MAX = SO101_ENCODER_SCALE.max;

// Which guided step is being monitored — a hint for the provider.
export type CalibrationPhase = RobotCalibrationPhase;

export type CalibrationTelemetryMode = RobotLinkMode;

// Same source as every other prototype disclosure.
export function getCalibrationTelemetryMode(): CalibrationTelemetryMode {
  return getRobotLinkMode();
}

const KNOWN_JOINTS = new Set<RobotJointId>(SO101_JOINT_IDS);

// Starts streaming one arm's joint positions; returns a stop function.
// Nothing streams (and the monitor keeps waiting) when the arm is unknown,
// offline, unbound, bound to another provider's device, or the provider has
// no joint telemetry. Samples arriving after stop are dropped, and only
// known joints with finite positions are passed on.
export function startCalibrationTelemetry(
  armId: string,
  phase: CalibrationPhase,
  onSample: (samples: readonly RobotJointSample[]) => void
): () => void {
  const arm = getRobotSetup().arms[armId];
  const provider = getRobotProvider();
  if (!arm?.connected || !provider.capabilities.jointTelemetry) return () => undefined;
  const resolved = resolveDeviceTarget(arm, provider);
  if (!("target" in resolved)) return () => undefined;

  let stopped = false;
  const stopProvider = provider.telemetry.start(resolved.target, phase, (samples) => {
    if (stopped) return;
    const valid = samples.filter((sample) => KNOWN_JOINTS.has(sample.jointId) && Number.isFinite(sample.position));
    if (valid.length > 0) onSample(valid);
  });
  return () => {
    stopped = true;
    stopProvider();
  };
}
