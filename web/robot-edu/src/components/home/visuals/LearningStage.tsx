import { cn } from '../../../utils/cn';

/**
 * Plan view of the 600 × 400 mm learning stage (TABLE in kinematics.ts). The origin is the
 * front-left corner; x grows to the right and y away from the learner, so y is flipped in SVG.
 * Target A is the seeded "Reach a Target" pose in the learning_preview_v1 frame.
 */
export const STAGE = { width: 600, depth: 400 } as const;
export const TARGET_A = { x: 240, y: 220, z: 120 } as const;

const TONES = {
  light: { minor: 'rgba(21,37,31,0.10)', major: 'rgba(21,37,31,0.20)', outline: '#2F3632', text: '#4E535A', accent: '#0D7369' },
  dark: { minor: 'rgba(168,221,208,0.12)', major: 'rgba(168,221,208,0.26)', outline: '#A8DDD0', text: '#C9D6CF', accent: '#A8DDD0' },
} as const;

interface LearningStageProps {
  tone?: keyof typeof TONES;
  showTarget?: boolean;
  /** Dimension lines and text labels. Text scales with the SVG, so hide it where the stage is drawn small. */
  showLabels?: boolean;
  /** Draws the outline and dimension lines once on load (skipped with reduced motion). */
  draw?: boolean;
  className?: string;
  labelClassName?: string;
}

const ys = (y: number) => STAGE.depth - y;

export function LearningStage({ tone = 'light', showTarget = true, showLabels = true, draw = false, className, labelClassName }: LearningStageProps) {
  const c = TONES[tone];
  const columns = Array.from({ length: STAGE.width / 50 + 1 }, (_, index) => index * 50);
  const rows = Array.from({ length: STAGE.depth / 50 + 1 }, (_, index) => index * 50);
  const label = `Learning stage, ${STAGE.width} by ${STAGE.depth} millimetres, with Target A at x ${TARGET_A.x}, y ${TARGET_A.y}, z ${TARGET_A.z} millimetres`;
  return (
    <svg viewBox="-60 -48 720 500" role="img" aria-label={label} className={cn('block h-full w-full', className)} preserveAspectRatio="xMidYMid meet">
      <title>{label}</title>
      <g aria-hidden>
        {columns.map((x) => <line key={`x${x}`} x1={x} y1={0} x2={x} y2={STAGE.depth} stroke={x % 100 === 0 ? c.major : c.minor} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {rows.map((y) => <line key={`y${y}`} x1={0} y1={y} x2={STAGE.width} y2={y} stroke={y % 100 === 0 ? c.major : c.minor} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <rect x={0} y={0} width={STAGE.width} height={STAGE.depth} fill="none" stroke={c.outline} strokeWidth={1.5} vectorEffect="non-scaling-stroke" pathLength={1} className={draw ? 'vh-draw' : undefined} />
        {/* Origin (front-left corner) */}
        <circle cx={0} cy={STAGE.depth} r={5} fill={c.outline} />
        {showTarget && (
          <g>
            <circle cx={TARGET_A.x} cy={ys(TARGET_A.y)} r={16} fill="none" stroke={c.accent} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <circle cx={TARGET_A.x} cy={ys(TARGET_A.y)} r={5} fill={c.accent} />
          </g>
        )}
        {showLabels && (
          <g className={labelClassName} fill={c.text} style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 14, fontWeight: 500 }}>
            <line x1={0} y1={-26} x2={STAGE.width} y2={-26} stroke={c.text} strokeWidth={1} vectorEffect="non-scaling-stroke" pathLength={1} className={draw ? 'vh-draw' : undefined} />
            <line x1={0} y1={-34} x2={0} y2={-18} stroke={c.text} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={STAGE.width} y1={-34} x2={STAGE.width} y2={-18} stroke={c.text} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={STAGE.width / 2} y={-34} textAnchor="middle">{STAGE.width} mm</text>
            <line x1={-30} y1={0} x2={-30} y2={STAGE.depth} stroke={c.text} strokeWidth={1} vectorEffect="non-scaling-stroke" pathLength={1} className={draw ? 'vh-draw' : undefined} />
            <line x1={-38} y1={0} x2={-22} y2={0} stroke={c.text} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={-38} y1={STAGE.depth} x2={-22} y2={STAGE.depth} stroke={c.text} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={-40} y={STAGE.depth / 2} textAnchor="middle" transform={`rotate(-90 -40 ${STAGE.depth / 2})`}>{STAGE.depth} mm</text>
            <text x={10} y={STAGE.depth - 10}>0, 0</text>
            {showTarget && <text x={TARGET_A.x + 24} y={ys(TARGET_A.y) - 6}>Target A</text>}
            {showTarget && <text x={TARGET_A.x + 24} y={ys(TARGET_A.y) + 14}>({TARGET_A.x}, {TARGET_A.y}, {TARGET_A.z}) mm</text>}
          </g>
        )}
      </g>
    </svg>
  );
}
