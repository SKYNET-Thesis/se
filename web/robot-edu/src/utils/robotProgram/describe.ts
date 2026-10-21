import type { RobotCommand } from '../../types/robotProgram';
import { describeCondition } from './simulator';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeCommand(c: RobotCommand): string {
  switch (c.op) {
    case 'move_to':
      return `Move ${c.arm} arm to (${c.target.x}, ${c.target.y}, ${c.target.z}) mm at ${c.speed}% speed`;
    case 'move_joint':
      return `Rotate ${c.arm} ${c.joint} joint to ${c.angle}°`;
    case 'move_home':
      return c.arms.length === 2 ? 'Move both arms home' : `Move ${c.arms[0]} arm home`;
    case 'gripper':
      return `${cap(c.action)} ${c.arm} gripper`;
    case 'wait':
      return `Wait ${c.seconds} s`;
    case 'repeat':
      return `Repeat ${c.times} times`;
    case 'if':
      return `If ${describeCondition(c.condition)}`;
    case 'move_both':
      return `Start both arms: left → (${c.left.x}, ${c.left.y}, ${c.left.z}), right → (${c.right.x}, ${c.right.y}, ${c.right.z})`;
    case 'sync':
      return 'Wait until both arms finish moving';
    default:
      return 'Unknown command';
  }
}