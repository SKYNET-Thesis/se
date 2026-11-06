import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SO101_JOINTS, SO101_MESHES, SO101_NAMES, resolveSo101Mesh, toUrdfRadians } from './so101Model';
import { acceptTwinFrame, isFresh, parseTwinFrame } from './twinTelemetry';

const root = resolve(process.cwd(), 'public/assets/so101');
const urdf = readFileSync(resolve(root, 'urdf/so101_new_calib.urdf'), 'utf8');
const fixture = {
  schema_version: 1, robot_id: 'so101-mock', source_mode: 'SIMULATION', controller_id: 'offline-fixture',
  measured_at: '2026-11-05T00:00:00Z', sequence: 1, connection: 'connected', calibration_status: 'NOT_APPLICABLE',
  measured: SO101_NAMES.map(name => ({ name, position: name === 'gripper' ? 20 : 0, unit: name === 'gripper' ? 'percent' : 'rad' })),
};

describe('so101_new_calib asset and mapping', () => {
  it('has exactly the six expected revolute joints with matching axes and limits', () => {
    const joints = [...urdf.matchAll(/<joint name="([^"]+)" type="revolute">([\s\S]*?)<\/joint>/g)];
    expect(joints).toHaveLength(6);
    for (const spec of Object.values(SO101_JOINTS)) {
      const joint = joints.find(match => match[1] === spec.urdf)?.[2];
      expect(joint).toBeDefined();
      expect(joint).toContain('<axis xyz="0 0 1"/>');
      expect(joint).toContain(`lower="${spec.lower}" upper="${spec.upper}"`);
    }
  });
  it('all visual meshes resolve to existing STL assets', () => {
    const filenames = [...urdf.matchAll(/<mesh filename="package:\/\/so_arm_description\/meshes\/([^"]+)"/g)].map(match => match[1]);
    expect([...new Set(filenames)].sort()).toEqual([...SO101_MESHES].sort());
    for (const filename of filenames) expect(existsSync(resolve(root, 'meshes', filename))).toBe(true);
    expect(() => resolveSo101Mesh('package://so_arm_description/meshes/unknown.stl')).toThrow();
  });
  it('converts LeLab SO-101 units without inventing signs or offsets, and enforces limits', () => {
    expect(toUrdfRadians('shoulder_pan', 90, 'deg')).toBeCloseTo(Math.PI / 2);
    expect(toUrdfRadians('shoulder_lift', -0.4, 'rad')).toBe(-0.4);
    expect(toUrdfRadians('elbow_flex', 2, 'rad')).toBeNull();
    // LeLab's existing SO-101 viewer maps the calibrated follower's 0–100
    // gripper observation directly to the URDF Jaw's -10°..100° range.
    expect(toUrdfRadians('gripper', 0, 'percent')).toBe(0);
    expect(toUrdfRadians('gripper', 50, 'percent')).toBeCloseTo(50 * Math.PI / 180);
    expect(toUrdfRadians('gripper', 100, 'percent')).toBeCloseTo(100 * Math.PI / 180);
    expect(toUrdfRadians('gripper', 101, 'percent')).toBeNull();
    expect(toUrdfRadians('gripper', 0.5, 'rad')).toBe(0.5);
    expect(toUrdfRadians('gripper', 90, 'deg')).toBeCloseTo(Math.PI / 2);
  });
});

describe('read-only mock telemetry boundary', () => {
  it('accepts only complete versioned mock SO-101 frames', () => {
    expect(parseTwinFrame(fixture)?.measured).toHaveLength(6);
    for (const field of [
      { schema_version: 2 }, { robot_id: 'other' }, { source_mode: 'LIVE_PHYSICAL' },
      { measured: fixture.measured.slice(0, 5) },
      { measured: [...fixture.measured.slice(0, 5), fixture.measured[0]] },
      { measured: fixture.measured.map((r, i) => i === 0 ? { ...r, position: Number.NaN } : r) },
      { measured_at: '2026-11-05T00:00:00' },
    ]) expect(parseTwinFrame({ ...fixture, ...field })).toBeNull();
  });
  it('rejects out-of-order packets and old measurements', () => {
    const first = parseTwinFrame(fixture)!;
    expect(acceptTwinFrame(first, { ...first, sequence: 1 })).toBe(false);
    expect(acceptTwinFrame(first, { ...first, sequence: 2, measured_at: '2026-11-04T00:00:00Z' })).toBe(false);
    expect(acceptTwinFrame(first, { ...first, sequence: 2 })).toBe(true);
  });
  it('marks stale/disconnected frames as not fresh', () => {
    const frame = parseTwinFrame(fixture)!;
    const at = Date.parse(frame.measured_at);
    expect(isFresh(frame, 'connected', at + 500)).toBe(true);
    expect(isFresh(frame, 'connected', at + 1001)).toBe(false);
    expect(isFresh(frame, 'disconnected', at + 100)).toBe(false);
    expect(isFresh({ ...frame, connection: 'disconnected' }, 'connected', at + 100)).toBe(false);
  });
});

describe('physical telemetry boundary', () => {
  it('accepts only explicitly uncalibrated or verified physical measured frames', () => {
    const physical = {
      ...fixture, robot_id: 'so101-lab-a', source_mode: 'LIVE_PHYSICAL',
      calibration_status: 'UNCALIBRATED', controller_id: 'lelab-teleop-a',
    };
    expect(parseTwinFrame(physical)?.source_mode).toBe('LIVE_PHYSICAL');
    expect(parseTwinFrame({ ...physical, calibration_status: 'invented' })).toBeNull();
    expect(parseTwinFrame({ ...physical, calibration_status: 'VERIFIED', calibrated: physical.measured.map(reading => ({ ...reading, unit: 'rad' as const, position: reading.name === 'gripper' ? 0.3 : 0 })) })?.calibration_status).toBe('VERIFIED');
    expect(parseTwinFrame({
      ...physical,
      measured: physical.measured.map(reading => reading.name === 'gripper'
        ? { ...reading, position: 2, unit: 'rad' as const }
        : reading),
    })).toBeNull();
  });
});
