import { describe, expect, it } from 'vitest';
import { ORBIT_KEYS, ORBIT_PER_PX, ORBIT_RANGE, orbitFromDrag } from './orbitModel';

describe('Preview orbit model', () => {
  it('turns the view by the drag, and stays still for no drag', () => {
    expect(orbitFromDrag({ az: 0.2, el: 0.1 }, 0, 0)).toEqual({ azimuth: 0.2, elevation: 0.1 });
    const moved = orbitFromDrag({ azimuth: 0, elevation: 0 }, 50, -25);
    expect(moved.azimuth).toBeCloseTo(-50 * ORBIT_PER_PX);
    expect(moved.elevation).toBeCloseTo(-25 * ORBIT_PER_PX);
  });
  it('never leaves the range that keeps the arm in view', () => {
    expect(orbitFromDrag({ az: 0, el: 0 }, -10_000, 10_000)).toEqual({ azimuth: ORBIT_RANGE.azimuth[1], elevation: ORBIT_RANGE.elevation[1] });
    expect(orbitFromDrag({ az: 0, el: 0 }, 10_000, -10_000)).toEqual({ azimuth: ORBIT_RANGE.azimuth[0], elevation: ORBIT_RANGE.elevation[0] });
  });
  it('maps the four arrow keys to opposite orbit steps', () => {
    expect(Object.keys(ORBIT_KEYS).sort()).toEqual(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']);
    expect(ORBIT_KEYS.ArrowLeft[0]).toBe(-ORBIT_KEYS.ArrowRight[0]);
    expect(ORBIT_KEYS.ArrowUp[1]).toBe(-ORBIT_KEYS.ArrowDown[1]);
  });
});
