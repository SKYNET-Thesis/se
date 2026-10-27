import { JAW } from '../../home-lab/jaw';

/**
 * The learning-modes chapter's logic, kept free of React and the DOM so it can be tested directly:
 * the simulated follower, keyboard handling, the pad's drag threshold, episode samples, and the
 * chapter's state machine.
 */

/** A hand target on the pad: x from -1 (left) to 1 (right), y from -1 (high) to 1 (low). */
export interface HandTarget { x: number; y: number }

/** One commanded hand position, sampled while recording. `t` in ms from the start of the episode. */
export interface Sample { t: number; x: number; y: number; grip: boolean }

/** Joint limits from so101_new_calib.urdf (radians). The follower never leaves them. */
export const JOINT_LIMITS = {
  Rotation: [-1.91986, 1.91986],
  Pitch: [-1.74533, 1.74533],
  Elbow: [-1.74533, 1.5708],
  Wrist_Pitch: [-1.65806, 1.65806],
  Wrist_Roll: [-2.79253, 2.79253],
  Jaw: [-0.174533, 1.74533],
} as const;
export type Joint = keyof typeof JOINT_LIMITS;
export type Pose = Record<Joint, number>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const unit = (v: number) => clamp(v, -1, 1);

/**
 * The simulated follower: a readable mapping from a hand position to an arm pose for the preview, not
 * VISTA's VR inverse kinematics. The scene's own damping gives the follower its slight lag.
 */
export function followerPose(t: HandTarget, grip = false): Pose {
  const reach = (1 - unit(t.y)) / 2; // 0 low … 1 high
  const raw: Pose = {
    Rotation: unit(t.x) * 0.95,
    Pitch: -0.15 - reach * 1.05,
    Elbow: 1.45 - reach * 0.9,
    Wrist_Pitch: 0.75 - reach * 0.25,
    Wrist_Roll: 0,
    Jaw: grip ? JAW.closed : JAW.open,
  };
  return Object.fromEntries(Object.entries(raw).map(([j, v]) => { const [lo, hi] = JOINT_LIMITS[j as Joint]; return [j, clamp(v, lo, hi)]; })) as Pose;
}

/** Roving-tabindex keys for a horizontal or vertical tablist. Returns the new index, or null. */
export function nextTab(key: string, index: number, count: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export const PAD_STEP = 0.1;

/** Pad keys: arrows move the hand, Space or Enter toggle the grip, Home centres. Null for other keys. */
export function padKey(key: string, hand: HandTarget, grip: boolean): { hand: HandTarget; grip: boolean } | null {
  const d: Record<string, [number, number]> = { ArrowLeft: [-PAD_STEP, 0], ArrowRight: [PAD_STEP, 0], ArrowUp: [0, -PAD_STEP], ArrowDown: [0, PAD_STEP] };
  if (d[key]) return { hand: { x: unit(hand.x + d[key][0]), y: unit(hand.y + d[key][1]) }, grip };
  if (key === ' ' || key === 'Enter') return { hand, grip: !grip };
  if (key === 'Home') return { hand: { x: 0, y: 0 }, grip };
  return null;
}

/**
 * Below this many pixels a press on the pad is a tap (the hand jumps there on release); past it, a
 * drag (the hand follows the pointer). A press that ends in a page scroll moves nothing.
 */
export const DRAG_THRESHOLD_PX = 6;
export const isDrag = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;

/** A pad position from a pointer position inside the pad's rectangle. */
export const padTarget = (px: number, py: number, rect: { left: number; top: number; width: number; height: number }): HandTarget =>
  ({ x: unit(((px - rect.left) / rect.width) * 2 - 1), y: unit(((py - rect.top) / rect.height) * 2 - 1) });

export const SAMPLE_MS = 100;
export const MAX_EPISODE_MS = 6000;

/** Appends a sample while recording; returns null once the episode is full. */
export function appendSample(samples: Sample[], t: number, hand: HandTarget, grip: boolean): Sample[] | null {
  if (t > MAX_EPISODE_MS) return null;
  return [...samples, { t, x: hand.x, y: hand.y, grip }];
}

/** The commanded sample in force at time `t` of an episode. */
export function sampleAt(samples: Sample[], t: number): Sample | null {
  if (!samples.length) return null;
  let i = 0; while (i < samples.length - 1 && samples[i + 1].t <= t) i++;
  return samples[i];
}

export const episodeLength = (samples: Sample[]) => (samples.length ? samples[samples.length - 1].t : 0);

// ---- The chapter's state --------------------------------------------------------------------------

export type EpisodeStatus = 'idle' | 'recording' | 'replaying';

export interface ModesState {
  index: number;
  /** Program and preview: -1 is the initial state, i is "after block i". */
  step: number;
  playing: boolean;
  hand: HandTarget;
  grip: boolean;
  samples: Sample[];
  status: EpisodeStatus;
  cursor: number;
}

export type ModesAction =
  | { type: 'select'; index: number }
  | { type: 'step'; step: number }
  | { type: 'play'; last: number }
  | { type: 'advance'; last: number }
  | { type: 'move'; hand: HandTarget }
  | { type: 'grip'; grip?: boolean }
  | { type: 'record' }
  | { type: 'sample'; t: number }
  | { type: 'stop' }
  | { type: 'replay' }
  | { type: 'cursor'; t: number };

export const initialModesState = (samples: Sample[] = []): ModesState =>
  ({ index: 0, step: -1, playing: false, hand: { x: 0.3, y: -0.2 }, grip: false, samples, status: 'idle', cursor: 0 });

export function modesReducer(s: ModesState, a: ModesAction): ModesState {
  switch (a.type) {
    // Switching experience always stops whatever was running: playback, recording or replay.
    case 'select': return a.index === s.index ? s : { ...s, index: a.index, playing: false, status: 'idle', cursor: 0 };
    case 'step': return { ...s, step: a.step, playing: false };
    case 'play': return { ...s, step: -1, playing: a.last >= 0 };
    case 'advance': {
      if (!s.playing) return s;
      const step = s.step + 1;
      return step >= a.last ? { ...s, step: a.last, playing: false } : { ...s, step };
    }
    case 'move': return s.status === 'replaying' ? s : { ...s, hand: a.hand };
    case 'grip': return s.status === 'replaying' ? s : { ...s, grip: a.grip ?? !s.grip };
    case 'record': return { ...s, status: 'recording', samples: [], cursor: 0 };
    case 'sample': {
      if (s.status !== 'recording') return s;
      const next = appendSample(s.samples, a.t, s.hand, s.grip);
      return next ? { ...s, samples: next } : { ...s, status: 'idle' };
    }
    case 'stop': return s.status === 'recording' ? { ...s, status: 'idle' } : s;
    case 'replay': return s.samples.length >= 2 && s.status === 'idle' ? { ...s, status: 'replaying', cursor: 0 } : s;
    case 'cursor': {
      if (s.status !== 'replaying') return s;
      const end = episodeLength(s.samples);
      return a.t >= end ? { ...s, status: 'idle', cursor: end } : { ...s, cursor: a.t };
    }
    default: return s;
  }
}

/** A deterministic hand path for the ready-made illustrative episode (not data from any robot). */
export function scriptedHand(ms: number): HandTarget & { grip: boolean } {
  const s = ms / 1000;
  return { x: Math.sin(s * 0.9) * 0.75, y: Math.cos(s * 1.3) * 0.55 - 0.1, grip: Math.sin(s * 0.9) > 0.55 };
}

/** The illustrative episode shown before the visitor records one, so the lanes are never empty. */
export const SAMPLE_EPISODE: Sample[] = Array.from({ length: 46 }, (_, i) => ({ t: i * SAMPLE_MS, ...scriptedHand(i * SAMPLE_MS) }));
