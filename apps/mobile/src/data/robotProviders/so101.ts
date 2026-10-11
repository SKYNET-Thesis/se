import type { JointPositionScale, RobotArmModel, RobotJointId } from "./types";

// SO-ARM101 model metadata, shared by every provider that drives one.

export const SO101_MODEL: RobotArmModel = "SO-ARM101";

// The six joints, in the robot's own order.
export const SO101_JOINT_IDS: readonly RobotJointId[] = [
  "shoulder_pan",
  "shoulder_lift",
  "elbow_flex",
  "wrist_flex",
  "wrist_roll",
  "gripper"
];

// Its servos report raw 12-bit encoder counts: 0 … 4095, mid-range ≈ 2048.
// This is SO-ARM101 metadata, not a generic domain assumption.
export const SO101_ENCODER_SCALE: JointPositionScale = { unit: "encoder_counts", min: 0, max: 4095 };
