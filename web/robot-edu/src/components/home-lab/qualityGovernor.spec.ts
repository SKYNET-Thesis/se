import { describe, expect, it, vi } from 'vitest';
import { QUALITY_LEVELS, QualityGovernor } from './qualityGovernor';

const feed = (g: QualityGovernor, ms: number, n: number) => { const changes: Array<number | null> = []; for (let i = 0; i < n; i += 1) changes.push(g.sample(ms)); return changes.filter((c) => c !== null); };

describe('QualityGovernor', () => {
  it('stays at full quality while the device holds the frame rate', () => {
    const g = new QualityGovernor();
    expect(feed(g, 16.7, 400)).toEqual([]);
    expect(g.level).toBe(0); expect(g.quality).toEqual(QUALITY_LEVELS[0]);
  });

  it('is not moved by a few hitches: the decision is the median of a window', () => {
    const g = new QualityGovernor();
    for (let i = 0; i < 6; i += 1) feed(g, 16.7, 6), g.sample(140);          // a 140 ms hitch every 7th frame
    expect(g.level).toBe(0);
  });

  it('steps down one level per slow window: resolution first, then shadows', () => {
    const onLevel = vi.fn(); const g = new QualityGovernor({ onLevel });
    expect(feed(g, 40, 40)).toEqual([1]); expect(g.quality).toMatchObject({ maxPixelRatio: 1.5, shadows: true });
    expect(feed(g, 40, 40)).toEqual([2]); expect(g.quality).toMatchObject({ maxPixelRatio: 1, shadows: false });
    expect(feed(g, 40, 40)).toEqual([3]); expect(g.quality.maxPixelRatio).toBe(0.75);
    expect(onLevel).toHaveBeenCalledTimes(3);
  });

  it('never steps back up, so quality cannot oscillate', () => {
    const g = new QualityGovernor(); feed(g, 40, 40);
    expect(feed(g, 10, 400)).toEqual([]); expect(g.level).toBe(1);
  });

  it('reports a hopeless device once, only after the lowest level, and never goes below it', () => {
    const onTooSlow = vi.fn(); const g = new QualityGovernor({ onTooSlow, startLevel: 3 });
    feed(g, 400, 40); expect(onTooSlow).toHaveBeenCalledTimes(1);
    feed(g, 400, 200); expect(onTooSlow).toHaveBeenCalledTimes(1); expect(g.level).toBe(3);
  });

  it('does not call a slow-but-working lowest level hopeless', () => {
    const onTooSlow = vi.fn(); const g = new QualityGovernor({ onTooSlow, startLevel: 3 });
    feed(g, 60, 200); expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('ignores gaps that are not rendering cost (a throttled tab, an idle wake-up) and invalid values', () => {
    const g = new QualityGovernor();
    expect(feed(g, 5000, 100)).toEqual([]); expect(g.sample(0)).toBeNull(); expect(g.sample(-4)).toBeNull(); expect(g.sample(Number.NaN)).toBeNull();
    expect(g.level).toBe(0);
  });

  it('reset forgets the window and clamps the start level', () => {
    const g = new QualityGovernor(); feed(g, 40, 39); g.reset(); expect(feed(g, 40, 39)).toEqual([]);
    expect(new QualityGovernor({ startLevel: 99 }).level).toBe(QUALITY_LEVELS.length - 1);
    expect(new QualityGovernor({ startLevel: -3 }).level).toBe(0);
  });
});
