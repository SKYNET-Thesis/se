import type { ArmId, JointName, Joints, Point3, ZoneId } from '../../types/robotProgram';
import { sceneZones } from '../../data/simulationScene';

/**
 * Simplified kinematic model of the VISTA educational dual-arm tabletop robot.
 * Each arm: yaw base + two-link planar arm (shoulder, elbow) + cosmetic wrist.
 * This is a teaching model, not a calibrated model of real hardware.
 */
export const TABLE = { width: 600, depth: 400, minZ: 10, maxZ: 300 };
export const ARM_BASES: Record<ArmId, {x: number;y: number;}> = {
  left: { x: 150, y: -30 },
  right: { x: 450, y: -30 }
};
export const LINKS = { shoulderHeight: 120, upper: 220, fore: 200 };
export const MAX_REACH = LINKS.upper + LINKS.fore;
export const JOINT_NAMES: JointName[] = ['base', 'shoulder', 'elbow', 'wrist'];
export const JOINT_LIMITS: Record<JointName, [number, number]> = {
  base: [-100, 100],
  shoulder: [-20, 160],
  elbow: [-165, 0],
  wrist: [-90, 90]
};
export const ARMS: ArmId[] = ['left', 'right'];

const rad = (d: number) => d * Math.PI / 180;
const deg = (r: number) => r * 180 / Math.PI;

export function homeTarget(arm: ArmId): Point3 {
  return { x: ARM_BASES[arm].x, y: 220, z: 200 };
}

export function forward(arm: ArmId, j: Joints): {tool: Point3;elbow: {x: number;y: number;};} {
  const b = ARM_BASES[arm];
  const s = rad(j.shoulder);
  const e = rad(j.elbow);
  const yaw = rad(j.base);
  const r1 = LINKS.upper * Math.cos(s);
  const z1 = LINKS.shoulderHeight + LINKS.upper * Math.sin(s);
  const r = r1 + LINKS.fore * Math.cos(s + e);
  const z = z1 + LINKS.fore * Math.sin(s + e);
  return {
    tool: { x: b.x + r * Math.sin(yaw), y: b.y + r * Math.cos(yaw), z },
    elbow: { x: b.x + r1 * Math.sin(yaw), y: b.y + r1 * Math.cos(yaw) }
  };
}

export type IkResult = {ok: true;joints: Joints;} | {ok: false;reason: string;};

export function inverse(arm: ArmId, p: Point3, wrist = 0): IkResult {
  const b = ARM_BASES[arm];
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const r = Math.hypot(dx, dy);
  const h = p.z - LINKS.shoulderHeight;
  const d = Math.hypot(r, h);
  const { upper: u, fore: f } = LINKS;
  if (d > u + f - 0.5) {
    return { ok: false, reason: `${Math.round(d)} mm from the ${arm} shoulder; maximum reach is ${MAX_REACH} mm` };
  }
  if (d < Math.abs(u - f) + 40) {
    return { ok: false, reason: `too close to the ${arm} arm base to fold into` };
  }
  const base = deg(Math.atan2(dx, dy));
  const c2 = Math.min(1, Math.max(-1, (d * d - u * u - f * f) / (2 * u * f)));
  const elbow = -deg(Math.acos(c2));
  const shoulder = deg(Math.atan2(h, r) - Math.atan2(f * Math.sin(rad(elbow)), u + f * Math.cos(rad(elbow))));
  const joints: Joints = { base, shoulder, elbow, wrist };
  for (const name of JOINT_NAMES) {
    const [min, max] = JOINT_LIMITS[name];
    if (joints[name] < min - 0.01 || joints[name] > max + 0.01) {
      return { ok: false, reason: `${name} joint would need ${Math.round(joints[name])}°, outside its ${min}° to ${max}° range` };
    }
  }
  return { ok: true, joints };
}

export function homeJoints(arm: ArmId): Joints {
  const result = inverse(arm, homeTarget(arm));
  if (!result.ok) throw new Error(`Home pose unreachable: ${result.reason}`);
  return result.joints;
}

export function zoneAt(x: number, y: number): ZoneId | null {
  const zone = sceneZones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  return zone ? zone.id : null;
}