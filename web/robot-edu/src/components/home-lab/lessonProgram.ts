/**
 * Lesson one ("Open & Close Gripper") as a tiny, pure model for the Home Lab prototypes.
 * Block labels and colours mirror blocklyConfig.ts; the steps are the exact canonical steps that
 * toCanonicalNest produces for these blocks; the preview starts with the gripper open
 * (createInitialState), so "open gripper" changes nothing visible and only "close gripper" moves the jaw.
 * Nothing here talks to a robot: it drives a 3D preview only.
 */
export type BlockKind = 'select' | 'open' | 'wait' | 'close';

export type CanonicalStep =
  | { type: 'arm.select'; arm: 'left' }
  | { type: 'gripper.open' }
  | { type: 'wait'; durationMs: number }
  | { type: 'gripper.close' };

export interface LessonBlock { kind: BlockKind; label: string; color: string; step: CanonicalStep }

export const BLOCKS: Record<BlockKind, LessonBlock> = {
  select: { kind: 'select', label: 'use left arm', color: '#7A4F8F', step: { type: 'arm.select', arm: 'left' } },
  open: { kind: 'open', label: 'open gripper', color: '#94600F', step: { type: 'gripper.open' } },
  wait: { kind: 'wait', label: 'wait 1 second', color: '#5B6573', step: { type: 'wait', durationMs: 1000 } },
  close: { kind: 'close', label: 'close gripper', color: '#94600F', step: { type: 'gripper.close' } },
};

export const LESSON_ONE_PROGRAM: BlockKind[] = ['select', 'open', 'wait', 'close'];

export interface PreviewState { jaw: 'open' | 'closed'; armSelected: boolean; note: string }

export const INITIAL_STATE: PreviewState = { jaw: 'open', armSelected: false, note: 'Gripper open, initial state.' };

/** Formats a canonical step the way it reads in the program trace. */
export function describeStep(step: CanonicalStep): string {
  switch (step.type) {
    case 'arm.select': return `arm.select  arm: ${step.arm}`;
    case 'wait': return `wait  durationMs: ${step.durationMs}`;
    default: return step.type;
  }
}

/** Preview state after each block (index i = state after block i). */
export function simulate(program: BlockKind[]): PreviewState[] {
  const states: PreviewState[] = [];
  let state = INITIAL_STATE;
  for (const kind of program) {
    switch (kind) {
      case 'select': state = { ...state, armSelected: true, note: 'Left arm selected.' }; break;
      case 'open': state = { ...state, jaw: 'open', note: state.jaw === 'open' ? 'No visible change: the gripper is already open.' : 'The gripper opens.' }; break;
      case 'wait': state = { ...state, note: 'The arm holds its pose for one second.' }; break;
      case 'close': state = { ...state, jaw: 'closed', note: state.jaw === 'closed' ? 'No visible change: the gripper is already closed.' : 'The gripper closes.' }; break;
    }
    states.push(state);
  }
  return states;
}

/**
 * The three rules seeded for lesson one, checked here in the browser for the preview only.
 * The real check runs on the VISTA server when a learner submits; this is not a submission or a grade.
 */
export function checkRules(program: BlockKind[]): Array<{ rule: string; passed: boolean }> {
  const selected = program.indexOf('select');
  const gripperOps = program.map((kind, index) => ({ kind, index })).filter((b) => b.kind === 'open' || b.kind === 'close');
  const opensThenCloses = program.some((kind, i) => kind === 'open' && program.slice(i + 1).includes('close'));
  const final = simulate(program).at(-1) ?? INITIAL_STATE;
  return [
    { rule: 'Left arm is selected', passed: selected !== -1 && gripperOps.every((b) => b.index > selected) },
    { rule: 'Gripper opens, then closes', passed: opensThenCloses },
    { rule: 'Left gripper ends closed', passed: selected !== -1 && final.jaw === 'closed' },
  ];
}
