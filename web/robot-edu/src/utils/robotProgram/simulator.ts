import type { ExecutionHandlers, ExecutionResult } from '../../types/robot';
import type { ArmId, Condition, Joints, LogLevel, RobotCommand, RobotProgram, SimState } from '../../types/robotProgram';
import { sceneObjects, sceneZones } from '../../data/simulationScene';
import { createId } from '../id';
import { ARMS, forward, homeJoints, inverse, JOINT_NAMES, zoneAt } from './kinematics';

/**
 * Schematic, kinematic-only tabletop simulator.
 * No physics, no dynamics, no collision detection. Teaching tool only.
 */
class StoppedError extends Error {}

export interface SimulationOptions {
  signal: AbortSignal;
  speed?: number;
  instant?: boolean;
  handlers?: ExecutionHandlers;
  maxSteps?: number;
}

const GRASP_RADIUS = 30;
const GRASP_MAX_Z = 50;

export function createInitialState(): SimState {
  const arms = {} as SimState['arms'];
  for (const arm of ARMS) {
    const joints = homeJoints(arm);
    const pose = forward(arm, joints);
    arms[arm] = { joints, tool: pose.tool, elbow: pose.elbow, gripper: 'open', holding: null, busy: false };
  }
  return { arms, objects: sceneObjects.map((o) => ({ ...o })) };
}

function cloneState(s: SimState): SimState {
  return {
    arms: {
      left: { ...s.arms.left, joints: { ...s.arms.left.joints }, tool: { ...s.arms.left.tool }, elbow: { ...s.arms.left.elbow } },
      right: { ...s.arms.right, joints: { ...s.arms.right.joints }, tool: { ...s.arms.right.tool }, elbow: { ...s.arms.right.elbow } }
    },
    objects: s.objects.map((o) => ({ ...o }))
  };
}

const easeInOut = (k: number) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const zoneLabel = (x: number, y: number) => {
  const id = zoneAt(x, y);
  return id ? sceneZones.find((z) => z.id === id)?.label ?? id : 'the table';
};

export function describeCondition(c: Condition): string {
  return c.kind === 'gripper_holding' ? `${c.arm} gripper is holding an object` : `zone ${c.zone} has an object`;
}

export async function runSimulation(program: RobotProgram, options: SimulationOptions): Promise<ExecutionResult> {
  const { signal, speed = 1, instant = false, handlers = {}, maxSteps = 1500 } = options;
  const state = createInitialState();
  const started = performance.now();
  let steps = 0;
  const busy: Record<ArmId, Promise<void>> = { left: Promise.resolve(), right: Promise.resolve() };

  const log = (level: LogLevel, message: string, blockId?: string) => {
    if (instant) return;
    handlers.onLog?.({ id: createId('log'), t: performance.now() - started, level, message, blockId });
  };
  const emit = () => {
    if (!instant) handlers.onState?.(cloneState(state));
  };
  const checkStop = () => {
    if (signal.aborted) throw new StoppedError();
  };
  const sleep = (ms: number) =>
  instant ?
  Promise.resolve() :
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new StoppedError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms / speed);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const step = (c: RobotCommand, label: string) => {
    checkStop();
    steps += 1;
    if (steps > maxSteps) throw new Error(`Step limit of ${maxSteps} reached. Check for very large repeat counts.`);
    if (!instant) handlers.onStep?.({ blockId: c.blockId, label, index: steps });
    log('step', label, c.blockId);
  };

  const syncPose = (arm: ArmId) => {
    const a = state.arms[arm];
    const pose = forward(arm, a.joints);
    a.tool = pose.tool;
    a.elbow = pose.elbow;
    if (a.holding) {
      const obj = state.objects.find((o) => o.id === a.holding);
      if (obj) {
        obj.x = a.tool.x;
        obj.y = a.tool.y;
        obj.z = Math.max(0, a.tool.z - 20);
      }
    }
  };

  const animateArm = async (arm: ArmId, target: Joints, speedPct: number) => {
    const a = state.arms[arm];
    const from = { ...a.joints };
    const delta = Math.max(...JOINT_NAMES.map((k) => Math.abs(target[k] - from[k])));
    const duration = Math.max(250, delta / (20 + speedPct * 1.6) * 1000) / speed;
    a.busy = true;
    emit();
    if (!instant) {
      const t0 = performance.now();
      for (;;) {
        await frame();
        checkStop();
        const k = Math.min(1, (performance.now() - t0) / duration);
        const e = easeInOut(k);
        for (const name of JOINT_NAMES) a.joints[name] = from[name] + (target[name] - from[name]) * e;
        syncPose(arm);
        emit();
        if (k >= 1) break;
      }
    }
    a.joints = { ...target };
    syncPose(arm);
    a.busy = false;
    emit();
  };

  const startMotion = (arm: ArmId, target: Joints, speedPct: number) => {
    const p = animateArm(arm, target, speedPct);
    p.catch(() => undefined);
    busy[arm] = p;
    return p;
  };

  const solve = (arm: ArmId, p: {x: number;y: number;z: number;}, wrist: number) => {
    const ik = inverse(arm, p, wrist);
    if (!ik.ok) throw new Error(`The ${arm} arm cannot reach (${p.x}, ${p.y}, ${p.z}): ${ik.reason}.`);
    return ik.joints;
  };

  const evaluate = (c: Condition): boolean => {
    if (c.kind === 'gripper_holding') return state.arms[c.arm].holding !== null;
    return state.objects.some((o) => o.heldBy === null && zoneAt(o.x, o.y) === c.zone);
  };

  const exec = async (cmds: RobotCommand[]): Promise<void> => {
    for (const c of cmds) {
      checkStop();
      switch (c.op) {
        case 'move_to':{
            await busy[c.arm];
            step(c, `${cap(c.arm)} arm → (${c.target.x}, ${c.target.y}, ${c.target.z}) at ${c.speed}%`);
            await startMotion(c.arm, solve(c.arm, c.target, state.arms[c.arm].joints.wrist), c.speed);
            break;
          }
        case 'move_joint':{
            await busy[c.arm];
            step(c, `${cap(c.arm)} ${c.joint} joint → ${c.angle}°`);
            await startMotion(c.arm, { ...state.arms[c.arm].joints, [c.joint]: c.angle }, 50);
            break;
          }
        case 'move_home':{
            await Promise.all(c.arms.map((arm) => busy[arm]));
            step(c, c.arms.length === 2 ? 'Both arms → home' : `${cap(c.arms[0])} arm → home`);
            await Promise.all(c.arms.map((arm) => startMotion(arm, homeJoints(arm), 60)));
            break;
          }
        case 'gripper':{
            await busy[c.arm];
            const a = state.arms[c.arm];
            step(c, `${cap(c.arm)} gripper ${c.action}`);
            a.busy = true;
            emit();
            await sleep(350);
            if (c.action === 'close') {
              if (a.gripper === 'closed') log('warn', `${cap(c.arm)} gripper is already closed.`, c.blockId);
              a.gripper = 'closed';
              const target = state.objects.find(
                (o) => o.heldBy === null && Math.hypot(o.x - a.tool.x, o.y - a.tool.y) <= GRASP_RADIUS && a.tool.z <= GRASP_MAX_Z
              );
              if (target && !a.holding) {
                target.heldBy = c.arm;
                a.holding = target.id;
                log('info', `Grasped ${target.label.toLowerCase()}.`, c.blockId);
              } else if (!a.holding) {
                log('warn', `Closed on nothing. No object within ${GRASP_RADIUS} mm and below ${GRASP_MAX_Z} mm.`, c.blockId);
              }
            } else {
              a.gripper = 'open';
              if (a.holding) {
                const obj = state.objects.find((o) => o.id === a.holding);
                a.holding = null;
                if (obj) {
                  obj.heldBy = null;
                  obj.z = 0;
                  if (a.tool.z > 70) log('warn', `Released ${obj.label.toLowerCase()} from ${Math.round(a.tool.z)} mm; it dropped.`, c.blockId);
                  log('info', `Placed ${obj.label.toLowerCase()} in ${zoneLabel(obj.x, obj.y)}.`, c.blockId);
                }
              }
            }
            syncPose(c.arm);
            a.busy = false;
            emit();
            break;
          }
        case 'wait':
          step(c, `Wait ${c.seconds} s`);
          await sleep(c.seconds * 1000);
          break;
        case 'repeat':
          step(c, `Repeat ${c.times}×`);
          for (let i = 0; i < c.times; i += 1) {
            log('info', `Iteration ${i + 1} of ${c.times}`, c.blockId);
            await exec(c.body);
          }
          break;
        case 'if':{
            await Promise.all([busy.left, busy.right]);
            step(c, `Check: ${describeCondition(c.condition)}`);
            const result = evaluate(c.condition);
            log('info', `Condition is ${result ? 'true' : 'false'}; running the ${result ? 'do' : 'else'} branch.`, c.blockId);
            await exec(result ? c.then : c.else);
            break;
          }
        case 'move_both':{
            await Promise.all([busy.left, busy.right]);
            step(c, `Both arms start moving: L(${c.left.x}, ${c.left.y}, ${c.left.z}) R(${c.right.x}, ${c.right.y}, ${c.right.z})`);
            const lj = solve('left', c.left, state.arms.left.joints.wrist);
            const rj = solve('right', c.right, state.arms.right.joints.wrist);
            startMotion('left', lj, c.speed);
            startMotion('right', rj, c.speed);
            log('info', 'Both arms are moving; the program continues without waiting.', c.blockId);
            break;
          }
        case 'sync':
          step(c, 'Wait for both arms');
          await Promise.all([busy.left, busy.right]);
          break;
        default:
          break;
      }
    }
  };

  try {
    log('info', `Simulation started: "${program.name}".`);
    emit();
    await exec(program.commands);
    await Promise.all([busy.left, busy.right]);
    const durationMs = performance.now() - started;
    log('success', `Program completed: ${steps} steps.`);
    return { outcome: 'completed', steps, durationMs, finalState: cloneState(state) };
  } catch (err) {
    const durationMs = performance.now() - started;
    ARMS.forEach((arm) => state.arms[arm].busy = false);
    emit();
    if (err instanceof StoppedError) {
      log('warn', 'Stopped by user. Arms halted at their current simulated pose.');
      return { outcome: 'stopped', steps, durationMs, finalState: cloneState(state) };
    }
    const message = err instanceof Error ? err.message : 'Unknown simulation error.';
    log('error', message);
    return { outcome: 'failed', steps, durationMs, finalState: cloneState(state), error: message };
  }
}

/** Fast, silent run used to estimate the total step count for progress display. */
export async function estimateSteps(program: RobotProgram): Promise<number> {
  const result = await runSimulation(program, { signal: new AbortController().signal, instant: true });
  return Math.max(1, result.steps);
}