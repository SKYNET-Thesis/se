export const SO101_URDF = '/assets/so101/urdf/so101_new_calib.urdf';
export const SO101_MESH_ROOT = '/assets/so101/meshes/';

// The URDF defines the axes, zero poses and limits. No motor calibration is implied.
export const SO101_JOINTS = {
  shoulder_pan: { urdf: 'Rotation', axis: [0, 0, 1], lower: -1.91986, upper: 1.91986 },
  shoulder_lift: { urdf: 'Pitch', axis: [0, 0, 1], lower: -1.74533, upper: 1.74533 },
  elbow_flex: { urdf: 'Elbow', axis: [0, 0, 1], lower: -1.74533, upper: 1.5708 },
  wrist_flex: { urdf: 'Wrist_Pitch', axis: [0, 0, 1], lower: -1.65806, upper: 1.65806 },
  wrist_roll: { urdf: 'Wrist_Roll', axis: [0, 0, 1], lower: -2.79253, upper: 2.79253 },
  gripper: { urdf: 'Jaw', axis: [0, 0, 1], lower: -0.174533, upper: 1.74533 },
} as const;
export type So101JointName = keyof typeof SO101_JOINTS;
export const SO101_NAMES = Object.keys(SO101_JOINTS) as So101JointName[];
export const SO101_ARM_NAMES = SO101_NAMES.filter(name => name !== 'gripper');
export const SO101_MESHES = [
  'base_motor_holder_so101_v1.stl', 'base_so101_v2.stl', 'sts3215_03a_v1.stl',
  'waveshare_mounting_plate_so101_v2.stl', 'motor_holder_so101_base_v1.stl',
  'rotation_pitch_so101_v1.stl', 'upper_arm_so101_v1.stl', 'under_arm_so101_v1.stl',
  'motor_holder_so101_wrist_v1.stl', 'sts3215_03a_no_horn_v1.stl',
  'wrist_roll_pitch_so101_v2.stl', 'wrist_roll_follower_so101_v1.stl',
  'moving_jaw_so101_v1.stl',
] as const;

export function resolveSo101Mesh(path: string): string {
  const filename = path.split('/').pop();
  if (!filename || !SO101_MESHES.includes(filename as typeof SO101_MESHES[number])) {
    throw new Error(`Unexpected SO-101 mesh: ${path}`);
  }
  return `${SO101_MESH_ROOT}${filename}`;
}

export function toUrdfRadians(name: So101JointName, position: number, unit: 'rad' | 'deg' | 'percent'): number | null {
  // Reuse LeLab's SO-101 URDF mapping: its calibrated follower reports
  // gripper.pos in 0..100, which is the Jaw angle expressed in degrees.
  // This only converts a unit; physical frames still require VERIFIED before
  // So101DigitalTwinViewer will apply any pose.
  if (name === 'gripper' && unit === 'percent') {
    const radians = position * Math.PI / 180;
    const spec = SO101_JOINTS[name];
    return Number.isFinite(radians) && radians >= spec.lower && radians <= spec.upper ? radians : null;
  }
  if (unit === 'percent') return null;
  const radians = unit === 'deg' ? position * Math.PI / 180 : position;
  const spec = SO101_JOINTS[name];
  return Number.isFinite(radians) && radians >= spec.lower && radians <= spec.upper ? radians : null;
}
