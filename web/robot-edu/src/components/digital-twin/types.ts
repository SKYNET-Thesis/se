import { SO101_JOINTS, type So101JointName } from './so101Model';

export type ArmIdentity = 'leader_left' | 'follower_left' | 'leader_right' | 'follower_right';

export type ArmPair = 'left_pair' | 'right_pair' | 'all_arms';

export type ViewLayoutMode = 'single' | 'pair' | 'quad';

export type CameraPreset = 'isometric' | 'top' | 'front' | 'side';

export interface ArmMeta {
  id: ArmIdentity;
  label: string;
  shortLabel: string;
  role: 'leader' | 'follower';
  side: 'left' | 'right';
  pairId: 'left_pair' | 'right_pair';
  colorHex: string;
  accentTailwind: string;
  description: string;
}

export const ARM_IDENTITIES: ArmIdentity[] = [
  'leader_left',
  'follower_left',
  'leader_right',
  'follower_right',
];

export const ARM_METADATA: Record<ArmIdentity, ArmMeta> = {
  leader_left: {
    id: 'leader_left',
    label: 'Leader (Left)',
    shortLabel: 'L-Left',
    role: 'leader',
    side: 'left',
    pairId: 'left_pair',
    colorHex: '#0284c7', // Sky 600
    accentTailwind: 'text-sky-600 border-sky-500 bg-sky-50',
    description: 'Operator control arm for left-hand teleoperation',
  },
  follower_left: {
    id: 'follower_left',
    label: 'Follower (Left)',
    shortLabel: 'F-Left',
    role: 'follower',
    side: 'left',
    pairId: 'left_pair',
    colorHex: '#059669', // Emerald 600
    accentTailwind: 'text-emerald-600 border-emerald-500 bg-emerald-50',
    description: 'Manipulator arm executing left-hand tasks',
  },
  leader_right: {
    id: 'leader_right',
    label: 'Leader (Right)',
    shortLabel: 'L-Right',
    role: 'leader',
    side: 'right',
    pairId: 'right_pair',
    colorHex: '#7c3aed', // Violet 600
    accentTailwind: 'text-violet-600 border-violet-500 bg-violet-50',
    description: 'Operator control arm for right-hand teleoperation',
  },
  follower_right: {
    id: 'follower_right',
    label: 'Follower (Right)',
    shortLabel: 'F-Right',
    role: 'follower',
    side: 'right',
    pairId: 'right_pair',
    colorHex: '#d97706', // Amber 600
    accentTailwind: 'text-amber-600 border-amber-500 bg-amber-50',
    description: 'Manipulator arm executing right-hand tasks',
  },
};

export interface JointInfo {
  name: So101JointName;
  urdfName: string;
  label: string;
  description: string;
  lowerRad: number;
  upperRad: number;
  lowerDeg: number;
  upperDeg: number;
}

export const JOINT_DETAILS: Record<So101JointName, JointInfo> = {
  shoulder_pan: {
    name: 'shoulder_pan',
    urdfName: SO101_JOINTS.shoulder_pan.urdf,
    label: 'Shoulder Pan',
    description: 'Base yaw rotation (Z axis)',
    lowerRad: SO101_JOINTS.shoulder_pan.lower,
    upperRad: SO101_JOINTS.shoulder_pan.upper,
    lowerDeg: Math.round((SO101_JOINTS.shoulder_pan.lower * 180) / Math.PI),
    upperDeg: Math.round((SO101_JOINTS.shoulder_pan.upper * 180) / Math.PI),
  },
  shoulder_lift: {
    name: 'shoulder_lift',
    urdfName: SO101_JOINTS.shoulder_lift.urdf,
    label: 'Shoulder Lift',
    description: 'Main pitch elevation (Z axis)',
    lowerRad: SO101_JOINTS.shoulder_lift.lower,
    upperRad: SO101_JOINTS.shoulder_lift.upper,
    lowerDeg: Math.round((SO101_JOINTS.shoulder_lift.lower * 180) / Math.PI),
    upperDeg: Math.round((SO101_JOINTS.shoulder_lift.upper * 180) / Math.PI),
  },
  elbow_flex: {
    name: 'elbow_flex',
    urdfName: SO101_JOINTS.elbow_flex.urdf,
    label: 'Elbow Flex',
    description: 'Forearm pitch articulation',
    lowerRad: SO101_JOINTS.elbow_flex.lower,
    upperRad: SO101_JOINTS.elbow_flex.upper,
    lowerDeg: Math.round((SO101_JOINTS.elbow_flex.lower * 180) / Math.PI),
    upperDeg: Math.round((SO101_JOINTS.elbow_flex.upper * 180) / Math.PI),
  },
  wrist_flex: {
    name: 'wrist_flex',
    urdfName: SO101_JOINTS.wrist_flex.urdf,
    label: 'Wrist Flex',
    description: 'Wrist pitch tilt',
    lowerRad: SO101_JOINTS.wrist_flex.lower,
    upperRad: SO101_JOINTS.wrist_flex.upper,
    lowerDeg: Math.round((SO101_JOINTS.wrist_flex.lower * 180) / Math.PI),
    upperDeg: Math.round((SO101_JOINTS.wrist_flex.upper * 180) / Math.PI),
  },
  wrist_roll: {
    name: 'wrist_roll',
    urdfName: SO101_JOINTS.wrist_roll.urdf,
    label: 'Wrist Roll',
    description: 'End-effector axial roll',
    lowerRad: SO101_JOINTS.wrist_roll.lower,
    upperRad: SO101_JOINTS.wrist_roll.upper,
    lowerDeg: Math.round((SO101_JOINTS.wrist_roll.lower * 180) / Math.PI),
    upperDeg: Math.round((SO101_JOINTS.wrist_roll.upper * 180) / Math.PI),
  },
  gripper: {
    name: 'gripper',
    urdfName: SO101_JOINTS.gripper.urdf,
    label: 'Gripper Jaw',
    description: 'Parallel moving jaw aperture',
    lowerRad: SO101_JOINTS.gripper.lower,
    upperRad: SO101_JOINTS.gripper.upper,
    lowerDeg: Math.round((SO101_JOINTS.gripper.lower * 180) / Math.PI),
    upperDeg: Math.round((SO101_JOINTS.gripper.upper * 180) / Math.PI),
  },
};

export interface PairTrackingDelta {
  pairId: 'left_pair' | 'right_pair';
  leaderArmId: ArmIdentity;
  followerArmId: ArmIdentity;
  jointDeltas: Record<So101JointName, { rad: number; deg: number; percent?: number }>;
  maxDeltaRad: number;
  gripperDeltaPercent: number;
}
