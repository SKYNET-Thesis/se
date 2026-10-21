import type { ArmId, Point3, Problem, ProblemSeverity, RobotCommand } from '../../types/robotProgram';
import { inverse, JOINT_LIMITS, TABLE } from './kinematics';

export type AddProblem = (severity: ProblemSeverity, message: string, blockId: string | null, hint?: string) => void;

const MAX_ESTIMATED_STEPS = 1500;

function checkPoint(arm: ArmId, p: Point3, blockId: string, add: AddProblem, label = ''): void {
  const prefix = label ? `${label}: ` : '';
  const bad: string[] = [];
  if (!Number.isFinite(p.x) || p.x < 0 || p.x > TABLE.width) bad.push(`x = ${p.x} (0–${TABLE.width})`);
  if (!Number.isFinite(p.y) || p.y < 0 || p.y > TABLE.depth) bad.push(`y = ${p.y} (0–${TABLE.depth})`);
  if (!Number.isFinite(p.z) || p.z < TABLE.minZ || p.z > TABLE.maxZ) bad.push(`z = ${p.z} (${TABLE.minZ}–${TABLE.maxZ})`);
  if (bad.length) {
    add('error', `${prefix}Target is outside the table workspace: ${bad.join(', ')}.`, blockId, 'Coordinates are in millimetres from the front-left table corner.');
    return;
  }
  const ik = inverse(arm, p);
  if (!ik.ok) {
    add('error', `${prefix}The ${arm} arm can't reach (${p.x}, ${p.y}, ${p.z}): ${ik.reason}.`, blockId, 'Move the target closer to this arm, or use the other arm.');
  }
}

function countSteps(cmds: RobotCommand[]): number {
  return cmds.reduce((sum, c) => {
    if (c.op === 'repeat') return sum + 1 + c.times * countSteps(c.body);
    if (c.op === 'if') return sum + 1 + Math.max(countSteps(c.then), countSteps(c.else));
    return sum + 1;
  }, 0);
}

export function validateCommands(commands: RobotCommand[], add: AddProblem): void {
  const visit = (cmds: RobotCommand[]) => {
    for (const c of cmds) {
      switch (c.op) {
        case 'move_to':
          checkPoint(c.arm, c.target, c.blockId, add);
          if (c.speed < 10 || c.speed > 100) add('error', `Speed ${c.speed}% is outside 10–100%.`, c.blockId);
          break;
        case 'move_joint':{
            const [min, max] = JOINT_LIMITS[c.joint];
            if (!Number.isFinite(c.angle) || c.angle < min || c.angle > max) {
              add('error', `${c.joint} joint angle ${c.angle}° is outside its ${min}° to ${max}° range.`, c.blockId);
            }
            break;
          }
        case 'wait':
          if (!(c.seconds >= 0.1 && c.seconds <= 30)) add('error', `Wait of ${c.seconds}s is outside 0.1–30 s.`, c.blockId);
          break;
        case 'repeat':
          if (!Number.isInteger(c.times) || c.times < 1 || c.times > 50) add('error', `Repeat count ${c.times} must be a whole number from 1 to 50.`, c.blockId);
          if (c.body.length === 0) add('warning', 'This repeat block is empty and does nothing.', c.blockId);
          visit(c.body);
          break;
        case 'if':
          if (c.then.length === 0 && c.else.length === 0) add('warning', 'Both branches of this if/else are empty.', c.blockId);
          visit(c.then);
          visit(c.else);
          break;
        case 'move_both':
          checkPoint('left', c.left, c.blockId, add, 'Left arm');
          checkPoint('right', c.right, c.blockId, add, 'Right arm');
          if (Math.abs(c.left.x - c.right.x) < 60 && Math.abs(c.left.y - c.right.y) < 60) {
            add('warning', 'Both arm targets are within 60 mm of each other.', c.blockId, 'The schematic simulator does not detect collisions. Keep a clear gap between grippers.');
          }
          break;
        default:
          break;
      }
    }
  };
  visit(commands);
  if (countSteps(commands) > MAX_ESTIMATED_STEPS) {
    add('error', `This program would run more than ${MAX_ESTIMATED_STEPS} steps.`, null, 'Reduce nested repeat counts.');
  }
}

export function hasErrors(problems: Problem[]): boolean {
  return problems.some((p) => p.severity === 'error');
}