import { describe, expect, it } from 'vitest';
import { homeAssets } from '../../home/media/homeAssets';
import { LEARNING_EXPERIENCES } from './experiences';

const all = (e: (typeof LEARNING_EXPERIENCES)[number]) => [e.name, e.where, e.outcome, e.illustration, e.limits].join(' ');

describe('learning experiences configuration', () => {
  it('has unique ids and the three documented experiences', () => {
    const ids = LEARNING_EXPERIENCES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['program', 'vr', 'demo']);
  });
  it('points only at existing, unchanged manifest asset IDs', () => {
    for (const e of LEARNING_EXPERIENCES) for (const id of e.assets) expect(homeAssets[id], id).toBeDefined();
  });
  it('gives every experience a camera preset inside the scene fog and a sensible light', () => {
    for (const e of LEARNING_EXPERIENCES) {
      expect(e.preset.rig.distance).toBeGreaterThan(1);
      expect(e.preset.rig.distance).toBeLessThan(7.5);
      expect(e.preset.light).toBeGreaterThan(0);
      expect(e.preset.light).toBeLessThanOrEqual(1);
    }
  });
  it('never claims the physical robot runs, the VR runtime runs here, or a model is trained', () => {
    for (const e of LEARNING_EXPERIENCES) {
      const text = all(e).toLowerCase();
      expect(text).not.toMatch(/runs? (on|the) (the )?(physical|real) robot|controls? the robot|(?<!no )model (is|was) trained|ai learns/);
    }
  });
  it('states the honest limits of each experience', () => {
    const [program, vr, demo] = LEARNING_EXPERIENCES;
    expect(program.where).toBe('In Practice');
    expect(all(program)).toMatch(/preview/i);
    expect(vr.availability).toBe('session');
    expect(all(vr)).toMatch(/offline/i);
    expect(all(vr)).toMatch(/not running here/i);
    expect(all(vr)).toMatch(/locked/i);
    expect(demo.availability).toBe('session');
    expect(demo.limits).toMatch(/No model is trained/);
    expect(demo.illustration).toMatch(/Nothing is saved or sent/);
  });
});
