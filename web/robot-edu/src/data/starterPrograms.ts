import { block, moveTo, program, start, withArm } from '../utils/robotProgram/blockJson';

export interface StarterProgram {
  id: string;
  name: string;
  description: string;
  workspace: Record<string, unknown>;
}

export const starterPrograms: StarterProgram[] = [
{
  id: 'blank',
  name: 'Blank program',
  description: 'Just the start block.',
  workspace: program({ x: 40, y: 40, blocks: [start()] })
},
{
  id: 'pick-red',
  name: 'Pick and place: red cube',
  description: 'Left arm moves the red cube into Bin A.',
  workspace: program({
    x: 40,
    y: 40,
    blocks: [
    start(),
    withArm('left', [
    block('robot_move_home', { TARGET: 'selected' }),
    block('robot_gripper_open'),
    moveTo(120, 150, 120),
    moveTo(120, 150, 20, 30),
    block('robot_gripper_close'),
    moveTo(120, 150, 150),
    moveTo(120, 325, 150),
    moveTo(120, 325, 30, 30),
    block('robot_gripper_open'),
    moveTo(120, 325, 150),
    block('robot_move_home', { TARGET: 'selected' })]
    )]

  })
},
{
  id: 'wave',
  name: 'Wave hello',
  description: 'Right arm raises and waves three times.',
  workspace: program({
    x: 40,
    y: 40,
    blocks: [
    start(),
    withArm('right', [
    block('robot_move_home', { TARGET: 'selected' }),
    moveTo(450, 260, 220, 80),
    block('robot_repeat', { TIMES: 3 }, {
      DO: [block('robot_move_joint', { JOINT: 'base', ANGLE: -25 }), block('robot_move_joint', { JOINT: 'base', ANGLE: 25 })]
    }),
    block('robot_move_home', { TARGET: 'selected' })]
    )]

  })
},
{
  id: 'reach-draft',
  name: 'Reach test (draft)',
  description: 'Contains a deliberate out-of-range target and a disconnected block.',
  workspace: program(
    {
      x: 40,
      y: 40,
      blocks: [start(), withArm('left', [moveTo(100, 100, 60), moveTo(640, 200, 100), moveTo(150, 360, 60)])]
    },
    { x: 460, y: 60, blocks: [block('robot_gripper_close')] }
  )
},
{
  id: 'handoff-skeleton',
  name: 'Handoff starter',
  description: 'Both arms reach their start poses; finish the handoff.',
  workspace: program({
    x: 40,
    y: 40,
    blocks: [
    start(),
    block('robot_move_home', { TARGET: 'both' }),
    block('robot_move_both', { LX: 220, LY: 200, LZ: 160, RX: 480, RY: 150, RZ: 120 }),
    block('robot_wait_both'),
    withArm('right', [block('robot_gripper_open'), moveTo(480, 150, 20, 30), block('robot_gripper_close'), moveTo(480, 150, 160)])]

  })
}];
