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

  it('rejects a gripper command without an explicit selected-arm context', () => {
    const result = toCanonicalNestRobotProgram(base([{ op: 'gripper', blockId: 'open', arm: 'right', action: 'open' }]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain('selected-arm');
  });
});
