/**
 * S3's scroll model (H6.8), pure so it can be tested without a browser. The chapter pins one stage
 * while the reader scrolls a track `steps × stepLength` long; scroll position alone decides the step.
 */

/** How far past a boundary (in steps) the scroll must go before the step changes: no flicker at the edge. */
export const HYSTERESIS = 0.06;

/** Track position (0..1) from the section's top edge, its height, the pinned stage's height and the header. */
export function trackProgress(sectionTop: number, sectionHeight: number, stageHeight: number, header: number): number {
  const travel = sectionHeight - stageHeight;
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, (header - sectionTop) / travel));
}

/**
 * The step for a track position, given the step on screen now. A neighbouring step takes over only
 * once the position is clear of the boundary by `HYSTERESIS`; a jump of two or more steps (a fast
 * scroll, an anchor) applies at once.
 */
export function stepAt(progress: number, current: number, steps: number): number {
  const at = progress * steps;
  const raw = Math.min(steps - 1, Math.max(0, Math.floor(at)));
  if (raw === current || Math.abs(raw - current) > 1) return raw;
  const boundary = Math.max(raw, current);
  return Math.abs(at - boundary) < HYSTERESIS ? current : raw;
}

/** How far through its own step the position is (0..1). */
export function localProgress(progress: number, step: number, steps: number): number {
  return Math.min(1, Math.max(0, progress * steps - step));
}

/**
 * How many of a step's `parts` (blocks, program steps, rules) are shown at a local position. They
 * arrive over the first half of the step, so the step's centre (where a chosen step lands) is complete.
 */
export function partsShown(local: number, parts: number): number {
  if (parts <= 0) return 0;
  return Math.min(parts, Math.max(0, Math.floor(((local - 0.04) / 0.42) * parts) + 1));
}

/** The page offset that puts a step's centre on the pinned stage: where a chosen step scrolls to. */
export function scrollTargetFor(step: number, steps: number, sectionPageTop: number, sectionHeight: number, stageHeight: number, header: number): number {
  const travel = Math.max(0, sectionHeight - stageHeight);
  return Math.round(sectionPageTop - header + ((step + 0.5) / steps) * travel);
}
