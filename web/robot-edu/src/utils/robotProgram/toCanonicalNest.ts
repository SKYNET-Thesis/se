import type { RobotCommand, RobotProgram } from '../../types/robotProgram';

export type CanonicalNestStep =
  | { type: 'arm.select'; arm: 'left' | 'right' }
  | { type: 'gripper.open' }
  | { type: 'gripper.close' }
  | { type: 'home'; arm: 'left' | 'right' }
  | { type: 'wait'; durationMs: number }
  /** A classroom-only coordinate declaration. It is never a robot command. */
  | { type: 'preview.move_xyz'; mode: 'learning_preview'; frame: 'learning_preview_v1'; arm: 'left' | 'right'; position: { x: number; y: number; z: number } };
export interface CanonicalNestRobotProgram { kind: 'robot_program'; schemaVersion: 1; steps: CanonicalNestStep[]; }
export interface CompatibilityIssue { blockId: string; command: string; message: string; }
export type CanonicalTransform = { ok: true; program: CanonicalNestRobotProgram } | { ok: false; issues: CompatibilityIssue[] };

/** Only maps semantics proven by the current Nest ProgrammingService. Never
 * guesses movement, concurrency, condition, vision, or hardware semantics. */
export function toCanonicalNestRobotProgram(source: RobotProgram, options: { allowLearningPreviewMove?: boolean } = {}): CanonicalTransform {
  const steps: CanonicalNestStep[] = []; const issues: CompatibilityIssue[] = [];
  let selectedArm: 'left' | 'right' | null = null;
  const unsupported = (command: RobotCommand, message: string) => issues.push({ blockId: command.blockId, command: command.op, message });
  for (const command of source.commands) {
    switch (command.op) {
      case 'arm_select': selectedArm = command.arm; steps.push({ type: 'arm.select', arm: command.arm }); break;
      case 'wait': steps.push({ type: 'wait', durationMs: Math.round(command.seconds * 1000) }); break;
      case 'move_home':
        if (command.arms.length !== 1) unsupported(command, 'Both-arm home has no canonical backend concurrency semantics.');
        else steps.push({ type: 'home', arm: command.arms[0] });
        break;
      case 'gripper':
        if (!selectedArm) unsupported(command, 'Gripper action requires an explicit selected-arm context.');
        else steps.push({ type: command.action === 'open' ? 'gripper.open' : 'gripper.close' });
        break;
      case 'move_to':
        if (!options.allowLearningPreviewMove) unsupported(command, 'Cartesian movement has no canonical backend movement semantics.');
        else if (!selectedArm) unsupported(command, 'Learning preview movement requires an explicit selected-arm context.');
        else steps.push({ type: 'preview.move_xyz', mode: 'learning_preview', frame: 'learning_preview_v1', arm: selectedArm, position: { x: command.target.x, y: command.target.y, z: command.target.z } });
        break;
      case 'move_joint': unsupported(command, 'Joint movement has no canonical backend movement semantics.'); break;
      case 'move_both': unsupported(command, 'Dual-arm concurrency has no canonical backend semantics.'); break;
      case 'sync': unsupported(command, 'Dual-arm synchronization has no canonical backend semantics.'); break;
      case 'repeat': unsupported(command, 'Repeat control flow has no canonical backend semantics.'); break;
      case 'if': unsupported(command, 'Conditional/sensor control flow has no canonical backend semantics.'); break;
      default: { const exhaustive: never = command; void exhaustive; }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, program: { kind: 'robot_program', schemaVersion: 1, steps } };
}
