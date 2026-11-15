import { describe, expect, it } from 'vitest';
import type { RobotProgram } from '../../types/robotProgram';
import { toCanonicalNestRobotProgram } from './toCanonicalNest';

const base = (commands: RobotProgram['commands']): RobotProgram => ({
  schema: 'vista.robot-program', schemaVersion: '1.0', programId: 'draft', name: 'contract',
  generatedAt: '2026-10-15T00:00:00.000Z', units: { length: 'mm', angle: 'deg', time: 's', speed: 'percent' }, arms: ['left', 'right'], commands,
});

describe('toCanonicalNestRobotProgram', () => {
  it('deterministically preserves the supported selected-arm subset', () => {
    const result = toCanonicalNestRobotProgram(base([
      { op: 'arm_select', blockId: 'select', arm: 'left' },
      { op: 'gripper', blockId: 'open', arm: 'left', action: 'open' },
      { op: 'wait', blockId: 'wait', seconds: 1.25 },
      { op: 'move_home', blockId: 'home', arms: ['left'] },
      { op: 'gripper', blockId: 'close', arm: 'left', action: 'close' },
    ]));
    expect(result).toEqual({ ok: true, program: { kind: 'robot_program', schemaVersion: 1, steps: [
      { type: 'arm.select', arm: 'left' }, { type: 'gripper.open' }, { type: 'wait', durationMs: 1250 }, { type: 'home', arm: 'left' }, { type: 'gripper.close' },
    ] } });
  });

  it('rejects unsupported movement instead of silently dropping it', () => {
    const result = toCanonicalNestRobotProgram(base([{ op: 'move_to', blockId: 'move', arm: 'left', target: { x: 1, y: 2, z: 3 }, speed: 10 }]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toMatchObject({ blockId: 'move', command: 'move_to' });
  });

  it('permits Move XYZ only when the C2 learning-preview profile is explicit', () => {
    const result = toCanonicalNestRobotProgram(base([{ op: 'arm_select', blockId: 'select', arm: 'left' }, { op: 'move_to', blockId: 'move', arm: 'left', target: { x: 240, y: 220, z: 120 }, speed: 60 }]), { allowLearningPreviewMove: true });
    expect(result).toEqual({ ok: true, program: { kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'arm.select', arm: 'left' }, { type: 'preview.move_xyz', mode: 'learning_preview', frame: 'learning_preview_v1', arm: 'left', position: { x: 240, y: 220, z: 120 } }] } });
  });

  it('rejects fractional learning-preview coordinates with a block-level message instead of letting the server refuse the save', () => {
    const result = toCanonicalNestRobotProgram(base([{ op: 'arm_select', blockId: 'select', arm: 'left' }, { op: 'move_to', blockId: 'move', arm: 'left', target: { x: 240.5, y: 220, z: 120 }, speed: 60 }]), { allowLearningPreviewMove: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toMatchObject({ blockId: 'move', command: 'move_to', message: expect.stringContaining('whole millimetres') });
  });

  const moveTo = (x: number, y: number, z: number) => toCanonicalNestRobotProgram(base([{ op: 'arm_select', blockId: 'select', arm: 'left' }, { op: 'move_to', blockId: 'move', arm: 'left', target: { x, y, z }, speed: 60 }]), { allowLearningPreviewMove: true });

  it.each([[0, 0, 10], [600, 400, 300], [240, 220, 120]])('accepts whole-millimetre coordinates inside the learning-preview bounds (%i, %i, %i)', (x, y, z) => {
    const result = moveTo(x, y, z);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.program.steps[1]).toMatchObject({ type: 'preview.move_xyz', position: { x, y, z } });
  });

  it.each([[240.5, 220, 120], [240, 220.5, 120], [240, 220, 120.5], [Number.NaN, 220, 120]])('rejects a non-integer coordinate (%s, %s, %s) with a block-level message', (x, y, z) => {
    const result = moveTo(x, y, z);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toMatchObject({ blockId: 'move', command: 'move_to', message: expect.stringContaining('whole millimetres') });
  });

  it.each([[-1, 220, 120], [601, 220, 120], [240, -1, 120], [240, 401, 120], [240, 220, 9], [240, 220, 301]])('rejects an out-of-range coordinate (%i, %i, %i) with a block-level message', (x, y, z) => {
    const result = moveTo(x, y, z);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toMatchObject({ blockId: 'move', command: 'move_to', message: expect.stringContaining('x 0-600, y 0-400, z 10-300') });
  });

  it('rejects a gripper command without an explicit selected-arm context', () => {
    const result = toCanonicalNestRobotProgram(base([{ op: 'gripper', blockId: 'open', arm: 'right', action: 'open' }]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain('selected-arm');
  });
});
