/**
 * Adaptive quality for the 3D preview. A device that cannot hold the frame rate steps down through fixed levels (smaller render
 * resolution first, then no shadows) instead of stuttering or freezing the page; a device that is still hopelessly slow at the lowest
 * level is reported once so the page can fall back to its text/poster path. It never steps back up, so quality cannot oscillate.
 *
 * Pure and clock-free: the scene feeds it the time between rendered frames.
 */
export interface QualityLevel {
  /** Upper bound on the device pixel ratio the renderer may use. */
  maxPixelRatio: number;
  shadows: boolean;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { maxPixelRatio: 2, shadows: true },
  { maxPixelRatio: 1.5, shadows: true },
  { maxPixelRatio: 1, shadows: false },
  { maxPixelRatio: 0.75, shadows: false },
];

export interface GovernorOptions {
  /** Frames in the window the decision is taken over. */
  window?: number;
  /** Median frame time above which quality steps down (ms). 24 ms is about 42 fps. */
  slowMs?: number;
  /** Median frame time at the lowest level above which the preview is reported as too slow (ms). */
  hopelessMs?: number;
  /** Gaps longer than this are a throttled tab or an idle wake-up, not rendering cost (ms). */
  ignoreAboveMs?: number;
  /** Quality level to begin at. */
  startLevel?: number;
  onLevel?: (level: number, quality: QualityLevel) => void;
  onTooSlow?: () => void;
}

const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

export class QualityGovernor {
  private samples: number[] = [];
  private current: number;
  private reported = false;
  private readonly o: Required<Omit<GovernorOptions, 'onLevel' | 'onTooSlow'>> & Pick<GovernorOptions, 'onLevel' | 'onTooSlow'>;

  constructor(options: GovernorOptions = {}) {
    this.o = { window: 40, slowMs: 24, hopelessMs: 120, ignoreAboveMs: 1000, startLevel: 0, ...options };
    this.current = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, this.o.startLevel));
  }

  get level() { return this.current; }
  get quality(): QualityLevel { return QUALITY_LEVELS[this.current]; }

  /** Forget the window (a chapter change, a resize or a warm-up frame makes the next samples unrepresentative). */
  reset() { this.samples = []; }

  /** Feed the time since the previous rendered frame. Returns the level when it changed, otherwise null. */
  sample(frameMs: number): number | null {
    if (!(frameMs > 0) || frameMs > this.o.ignoreAboveMs) return null;
    this.samples.push(frameMs);
    if (this.samples.length < this.o.window) return null;
    const m = median(this.samples);
    this.samples = [];
    if (m <= this.o.slowMs) return null;
    if (this.current < QUALITY_LEVELS.length - 1) {
      this.current += 1;
      this.o.onLevel?.(this.current, this.quality);
      return this.current;
    }
    if (m > this.o.hopelessMs && !this.reported) { this.reported = true; this.o.onTooSlow?.(); }
    return null;
  }
}
