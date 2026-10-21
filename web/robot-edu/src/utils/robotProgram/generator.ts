import type { Block, Workspace } from 'blockly';
import type {
  ArmId,
  Condition,
  GenerationResult,
  JointName,
  Problem,
  ProblemSeverity,
  RobotCommand,
  RobotProgram,
  ZoneId } from
'../../types/robotProgram';
import { validateCommands } from './validator';

interface Ctx {
  arm: ArmId | null;
}

const NEEDS_ARM_HINT = 'Place this block inside a "use … arm" block so VISTA knows which arm to move.';

/**
 * Converts a Blockly workspace into a structured RobotProgram.
 * Only known, enabled robot blocks produce commands; nothing is evaluated as code.
 */
export function generateProgram(workspace: Workspace, meta: {id: string;name: string;}): GenerationResult {
  const problems: Problem[] = [];
  const add = (severity: ProblemSeverity, message: string, blockId: string | null, hint?: string) => {
    problems.push({ id: `p${problems.length}`, severity, message, blockId, hint });
  };

  const num = (b: Block, field: string) => Number(b.getFieldValue(field));
  const point = (b: Block, px: string, py: string, pz: string) => ({ x: num(b, px), y: num(b, py), z: num(b, pz) });

  const parseCondition = (b: Block | null, ctx: Ctx, ownerId: string): Condition | null => {
    if (!b) {
      add('error', 'This if/else has no condition.', ownerId, 'Attach a condition block from the Control category.');
      return null;
    }
    if (b.type === 'robot_cond_holding') {
      const choice = b.getFieldValue('ARM') as ArmId | 'selected';
      const arm = choice === 'selected' ? ctx.arm : choice;
      if (!arm) {
        add('error', 'The condition refers to "selected arm" but no arm is selected here.', b.id, NEEDS_ARM_HINT);
        return null;
      }
      return { kind: 'gripper_holding', arm };
    }
    if (b.type === 'robot_cond_zone') return { kind: 'zone_occupied', zone: b.getFieldValue('ZONE') as ZoneId };
    add('error', 'Unsupported condition block.', b.id);
    return null;
  };

  const walk = (first: Block | null, ctx: Ctx): RobotCommand[] => {
    const out: RobotCommand[] = [];
    let b = first;
    // The arm selector is intentionally a visual container for young learners,
    // but its choice also remains active for blocks snapped after the container.
    // That makes `use left arm → open → wait → close` behave like the lesson
    // reads, rather than requiring children to understand scope boundaries.
    let activeCtx = ctx;
    while (b) {
      if (b.isEnabled()) {
        out.push(...toCommands(b, activeCtx));
        if (b.type === 'robot_select_arm') activeCtx = { arm: b.getFieldValue('ARM') as ArmId };
      }
      b = b.getNextBlock();
    }
    return out;
  };

  const requireArm = (b: Block, ctx: Ctx): ArmId | null => {
    if (!ctx.arm) add('error', 'No arm selected for this block.', b.id, NEEDS_ARM_HINT);
    return ctx.arm;
  };

  const toCommands = (b: Block, ctx: Ctx): RobotCommand[] => {
    switch (b.type) {
      case 'robot_select_arm':{
          const body = walk(b.getInputTargetBlock('DO'), { arm: b.getFieldValue('ARM') as ArmId });
          if (body.length === 0) add('warning', 'This "use arm" block is empty.', b.id);
          // Preserve the editor's arm-context semantic for the canonical API
          // transformer; local schematic playback may treat this as a no-op.
          return [{ op: 'arm_select', blockId: b.id, arm: b.getFieldValue('ARM') as ArmId }, ...body];
        }
      case 'robot_move_to':{
          const arm = requireArm(b, ctx);
          return arm ? [{ op: 'move_to', blockId: b.id, arm, target: point(b, 'X', 'Y', 'Z'), speed: num(b, 'SPEED') }] : [];
        }
      case 'robot_move_joint':{
          const arm = requireArm(b, ctx);
          return arm ? [{ op: 'move_joint', blockId: b.id, arm, joint: b.getFieldValue('JOINT') as JointName, angle: num(b, 'ANGLE') }] : [];
        }
      case 'robot_move_home':{
          if (b.getFieldValue('TARGET') === 'both') return [{ op: 'move_home', blockId: b.id, arms: ['left', 'right'] }];
          const arm = requireArm(b, ctx);
          return arm ? [{ op: 'move_home', blockId: b.id, arms: [arm] }] : [];
        }
      case 'robot_gripper_open':
      case 'robot_gripper_close':{
          const arm = requireArm(b, ctx);
          const action = b.type === 'robot_gripper_open' ? 'open' : 'close';
          return arm ? [{ op: 'gripper', blockId: b.id, arm, action }] : [];
        }
      case 'robot_wait':
        return [{ op: 'wait', blockId: b.id, seconds: num(b, 'SECONDS') }];
      case 'robot_repeat':
        return [{ op: 'repeat', blockId: b.id, times: num(b, 'TIMES'), body: walk(b.getInputTargetBlock('DO'), ctx) }];
      case 'robot_if':{
          const condition = parseCondition(b.getInputTargetBlock('COND'), ctx, b.id);
          const thenCmds = walk(b.getInputTargetBlock('DO'), ctx);
          const elseCmds = walk(b.getInputTargetBlock('ELSE'), ctx);
          return condition ? [{ op: 'if', blockId: b.id, condition, then: thenCmds, else: elseCmds }] : [];
        }
      case 'robot_move_both':
        return [{ op: 'move_both', blockId: b.id, left: point(b, 'LX', 'LY', 'LZ'), right: point(b, 'RX', 'RY', 'RZ'), speed: 60 }];
      case 'robot_wait_both':
        return [{ op: 'sync', blockId: b.id }];
      case 'vision_detect_object':
      case 'vision_ai_plan':
        add('error', 'Vision / AI blocks are experimental and no vision service is connected.', b.id, 'Remove this block to run the program.');
        return [];
      default:
        add('error', `Unknown block "${b.type}".`, b.id);
        return [];
    }
  };

  const tops = workspace.getTopBlocks(true);
  const starts = tops.filter((b) => b.type === 'robot_start' && b.isEnabled());

  if (starts.length === 0) {
    add('error', 'Your program needs a "when program starts" block.', null, 'Drag it in from the Program category and attach blocks beneath it.');
  }
  starts.slice(1).forEach((b) => add('error', 'Only one "when program starts" block is allowed.', b.id, 'Delete the extra start block.'));

  tops.
  filter((b) => b.type !== 'robot_start').
  forEach((b) => {
    add('warning', 'Disconnected blocks: this stack is not attached to "when program starts" and will not run.', b.id, 'Snap it under the start block, or delete it.');
  });

  const commands = starts[0] ? walk(starts[0].getNextBlock(), { arm: null }) : [];
  if (starts[0] && commands.length === 0 && !problems.some((p) => p.severity === 'error')) {
    add('warning', 'The program is empty. Attach blocks under "when program starts".', starts[0].id);
  }

  validateCommands(commands, add);

  const program: RobotProgram = {
    schema: 'vista.robot-program',
    schemaVersion: '1.0',
    programId: meta.id,
    name: meta.name,
    generatedAt: new Date().toISOString(),
    units: { length: 'mm', angle: 'deg', time: 's', speed: 'percent' },
    arms: ['left', 'right'],
    commands
  };

  problems.sort((a, b) => a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1);
  return { program, problems };
}

export function countCommands(cmds: RobotCommand[]): number {
  return cmds.reduce((n, c) => {
    if (c.op === 'repeat') return n + 1 + countCommands(c.body);
    if (c.op === 'if') return n + 1 + countCommands(c.then) + countCommands(c.else);
    return n + 1;
  }, 0);
}

export function containsOp(cmds: RobotCommand[], op: RobotCommand['op']): boolean {
  return cmds.some((c) => {
    if (c.op === op) return true;
    if (c.op === 'repeat') return containsOp(c.body, op);
    if (c.op === 'if') return containsOp(c.then, op) || containsOp(c.else, op);
    return false;
  });
}
