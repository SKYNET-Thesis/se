import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX, MAX_EPISODE_MS, JOINT_LIMITS, SAMPLE_EPISODE, followerPose, initialModesState, isDrag, modesReducer, nextTab, padKey, padTarget, sampleAt,
  type Joint, type ModesAction, type ModesState,
} from './model';

const run = (s: ModesState, ...actions: ModesAction[]) => actions.reduce(modesReducer, s);

describe('simulated follower', () => {
  it('keeps every joint inside the URDF limits for any hand position', () => {
    for (let x = -1.5; x <= 1.5; x += 0.25) for (let y = -1.5; y <= 1.5; y += 0.25) for (const grip of [false, true]) {
      const pose = followerPose({ x, y }, grip);
      for (const [joint, [lo, hi]] of Object.entries(JOINT_LIMITS)) {
        expect(pose[joint as Joint]).toBeGreaterThanOrEqual(lo);
        expect(pose[joint as Joint]).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('turns with the hand and closes the jaw when gripping', () => {
    expect(followerPose({ x: 1, y: 0 }).Rotation).toBeGreaterThan(followerPose({ x: -1, y: 0 }).Rotation);
    expect(followerPose({ x: 0, y: 0 }, true).Jaw).toBeLessThan(followerPose({ x: 0, y: 0 }, false).Jaw);
  });
});

describe('keyboard', () => {
  it('moves between tabs with arrows (wrapping), Home and End', () => {
    expect(nextTab('ArrowRight', 0, 3)).toBe(1);
    expect(nextTab('ArrowDown', 2, 3)).toBe(0);
    expect(nextTab('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTab('ArrowUp', 1, 3)).toBe(0);
    expect(nextTab('Home', 2, 3)).toBe(0);
    expect(nextTab('End', 0, 3)).toBe(2);
    expect(nextTab('a', 0, 3)).toBeNull();
  });
  it('moves the hand with arrows (clamped), toggles the grip with Space or Enter, centres with Home', () => {
    expect(padKey('ArrowRight', { x: 0, y: 0 }, false)).toEqual({ hand: { x: 0.1, y: 0 }, grip: false });
    expect(padKey('ArrowUp', { x: 0, y: -0.98 }, false)?.hand.y).toBe(-1);
    expect(padKey(' ', { x: 0.2, y: 0.2 }, false)).toEqual({ hand: { x: 0.2, y: 0.2 }, grip: true });
    expect(padKey('Enter', { x: 0, y: 0 }, true)?.grip).toBe(false);
    expect(padKey('Home', { x: 0.7, y: -0.4 }, true)).toEqual({ hand: { x: 0, y: 0 }, grip: true });
    expect(padKey('Tab', { x: 0, y: 0 }, false)).toBeNull();
  });
});

describe('pointer', () => {
  it('treats small movements as a tap and larger ones as a drag', () => {
    expect(isDrag(DRAG_THRESHOLD_PX - 1, 0)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD_PX, 0)).toBe(true);
    expect(isDrag(4, 4)).toBe(false);
  });
  it('maps the pad rectangle to -1…1, clamping outside it', () => {
    const r = { left: 100, top: 100, width: 200, height: 200 };
    expect(padTarget(100, 100, r)).toEqual({ x: -1, y: -1 });
    expect(padTarget(200, 200, r)).toEqual({ x: 0, y: 0 });
    expect(padTarget(500, 50, r)).toEqual({ x: 1, y: -1 });
  });
});

describe('chapter state', () => {
  const s0 = initialModesState(SAMPLE_EPISODE);

  it('switching experience stops playback, recording and replay', () => {
    const playing = run(s0, { type: 'play', last: 3 });
    expect(playing.playing).toBe(true);
    expect(run(playing, { type: 'select', index: 1 })).toMatchObject({ index: 1, playing: false });
    const recording = run(s0, { type: 'select', index: 2 }, { type: 'record' });
    expect(run(recording, { type: 'select', index: 1 }).status).toBe('idle');
    const replaying = run(s0, { type: 'select', index: 2 }, { type: 'replay' });
    expect(replaying.status).toBe('replaying');
    expect(run(replaying, { type: 'select', index: 0 })).toMatchObject({ status: 'idle', cursor: 0 });
  });
  it('selecting the current experience changes nothing', () => {
    expect(modesReducer(s0, { type: 'select', index: 0 })).toBe(s0);
  });
  it('plays lesson one step by step and stops on the last step', () => {
    let s = run(s0, { type: 'play', last: 3 });
    expect(s.step).toBe(-1);
    for (let i = 0; i < 6; i++) s = modesReducer(s, { type: 'advance', last: 3 });
    expect(s).toMatchObject({ step: 3, playing: false });
  });
  it('choosing a step stops playback', () => {
    expect(run(s0, { type: 'play', last: 3 }, { type: 'step', step: 2 })).toMatchObject({ step: 2, playing: false });
  });
  it('records the commanded hand, ends at the episode limit, and replays', () => {
    let s = run(s0, { type: 'select', index: 2 }, { type: 'record' });
    expect(s.samples).toEqual([]);
    s = run(s, { type: 'move', hand: { x: 0.5, y: 0 } }, { type: 'sample', t: 100 }, { type: 'grip' }, { type: 'sample', t: 200 });
    expect(s.samples).toEqual([{ t: 100, x: 0.5, y: 0, grip: false }, { t: 200, x: 0.5, y: 0, grip: true }]);
    expect(run(s, { type: 'sample', t: MAX_EPISODE_MS + 1 }).status).toBe('idle');
    s = run(s, { type: 'stop' }, { type: 'replay' });
    expect(s.status).toBe('replaying');
    expect(run(s, { type: 'cursor', t: 150 }).cursor).toBe(150);
    expect(run(s, { type: 'cursor', t: 999 })).toMatchObject({ status: 'idle', cursor: 200 });
  });
  it('does not replay an empty episode, and ignores the pad while replaying', () => {
    const empty = run(s0, { type: 'record' }, { type: 'stop' });
    expect(run(empty, { type: 'replay' }).status).toBe('idle');
    const replaying = run(s0, { type: 'replay' });
    expect(run(replaying, { type: 'move', hand: { x: -1, y: -1 } }).hand).toEqual(replaying.hand);
    expect(run(replaying, { type: 'grip' }).grip).toBe(replaying.grip);
  });
  it('finds the commanded sample in force at a time', () => {
    const samples = [{ t: 0, x: 0, y: 0, grip: false }, { t: 100, x: 1, y: 0, grip: false }];
    expect(sampleAt(samples, 50)?.x).toBe(0);
    expect(sampleAt(samples, 100)?.x).toBe(1);
    expect(sampleAt([], 10)).toBeNull();
  });
});
