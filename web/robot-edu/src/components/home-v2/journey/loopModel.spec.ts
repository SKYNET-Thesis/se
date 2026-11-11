import { describe, expect, it } from 'vitest';
import { HYSTERESIS, localProgress, partsShown, scrollTargetFor, stepAt, trackProgress } from './loopModel';

describe('S3 learning loop scroll model', () => {
  it('measures the track from the moment the stage pins', () => {
    expect(trackProgress(500, 3000, 800, 68)).toBe(0);
    expect(trackProgress(68, 3000, 800, 68)).toBe(0);
    expect(trackProgress(68 - 1100, 3000, 800, 68)).toBeCloseTo(0.5);
    expect(trackProgress(-5000, 3000, 800, 68)).toBe(1);
    expect(trackProgress(0, 800, 800, 68)).toBe(0);
  });

  it('starts on Learn, advances going down and reverses going up', () => {
    let step = 0;
    const down = [0, 0.1, 0.25, 0.45, 0.65, 0.85, 1].map((p) => (step = stepAt(p, step, 5)));
    expect(down).toEqual([0, 0, 1, 2, 3, 4, 4]);
    const up = [0.85, 0.65, 0.45, 0.25, 0.1, 0].map((p) => (step = stepAt(p, step, 5)));
    expect(up).toEqual([4, 3, 2, 1, 0, 0]);
  });

  it('holds the step near a boundary, so a small scroll back and forth does not flicker', () => {
    const edge = 2 / 5;
    const jitter = HYSTERESIS / 2 / 5;
    expect(stepAt(edge + jitter, 1, 5)).toBe(1);
    expect(stepAt(edge - jitter, 2, 5)).toBe(2);
    expect(stepAt(edge + 2 * HYSTERESIS / 5, 1, 5)).toBe(2);
  });

  it('applies a jump of several steps at once (fast scroll, anchor)', () => {
    expect(stepAt(0.95, 0, 5)).toBe(4);
    expect(stepAt(0.01, 4, 5)).toBe(0);
  });

  it('completes a step’s parts by its centre, where a chosen step lands', () => {
    expect(partsShown(0, 3)).toBe(0);
    expect(partsShown(0.2, 3)).toBeGreaterThan(0);
    expect(partsShown(0.5, 3)).toBe(3);
    expect(partsShown(1, 4)).toBe(4);
    expect(localProgress(0.5, 2, 5)).toBeCloseTo(0.5);
  });

  it('scrolls a chosen step to its centre, which reads back as that step', () => {
    const top = 4000; const height = 3000; const stage = 800; const header = 68;
    for (let i = 0; i < 5; i++) {
      const y = scrollTargetFor(i, 5, top, height, stage, header);
      const p = trackProgress(top - y, height, stage, header);
      expect(stepAt(p, i === 0 ? 4 : 0, 5)).toBe(i);
      expect(localProgress(p, i, 5)).toBeCloseTo(0.5, 1);
    }
  });
});
