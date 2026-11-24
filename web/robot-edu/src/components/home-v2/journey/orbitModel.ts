/** Reader orbit around the SO-101 in the Preview stage: pure maths, so it is tested without a browser. The scene clamps the result. */
export const ORBIT_RANGE = { azimuth: [-1.2, 1.2], elevation: [-0.45, 0.7] } as const;
/** Radians of orbit per pixel dragged. */
export const ORBIT_PER_PX = 0.008;

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** The orbit after dragging `dx`, `dy` pixels from `start`: drag right turns the arm toward you, drag up raises the camera. */
export function orbitFromDrag(start: { az: number; el: number } | { azimuth: number; elevation: number }, dx: number, dy: number) {
  const az = 'az' in start ? start.az : start.azimuth; const el = 'el' in start ? start.el : start.elevation;
  return { azimuth: clamp(az - dx * ORBIT_PER_PX, ORBIT_RANGE.azimuth), elevation: clamp(el + dy * ORBIT_PER_PX, ORBIT_RANGE.elevation) };
}

/** Arrow keys orbit in 0.15 rad steps: [azimuth, elevation]. */
export const ORBIT_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1],
};
