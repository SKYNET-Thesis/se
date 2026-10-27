import { cn } from '../../../utils/cn';
import { LearningStage } from './LearningStage';
import { So101Illustration, SO101_JOINTS, type So101JointName } from './So101Illustration';

/** Tight view of the arm (same coordinate space as SO101_JOINTS) so it fills its frame. */
export const SO101_CROP = { x: 40, y: 176, width: 340, height: 290 };

// Elbow is omitted: the arm breaks out of its stage there, so a label would sit on the page ground.
const ANNOTATIONS: Array<{ joint: So101JointName; label: string; side: 'left' | 'right' | 'below' }> = [
  { joint: 'Pitch', label: 'Pitch', side: 'right' },
  { joint: 'Rotation', label: 'Rotation', side: 'right' },
  { joint: 'Jaw', label: 'Jaw', side: 'below' },
];

const LABEL = {
  dark: { dot: '#A8DDD0', ring: '#15251F', line: 'rgba(255,255,255,0.35)', text: '#C9D6CF' },
  light: { dot: '#0D7369', ring: '#F7F6F3', line: 'rgba(21,37,31,0.30)', text: '#4E535A' },
} as const;

/** Joint names from so101_new_calib.urdf, drawn in SVG units so they scale with the arm. */
function JointLabel({ joint, label, side, tone }: (typeof ANNOTATIONS)[number] & { tone: keyof typeof LABEL }) {
  const p = SO101_JOINTS[joint];
  const c = LABEL[tone];
  const text = { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontSize: 8.4, fontWeight: 500 };
  const dot = <circle cx={p.x} cy={p.y} r={3.2} fill={c.dot} stroke={c.ring} strokeWidth={1.5} />;
  if (side === 'below') {
    return (
      <g>
        {dot}
        <line x1={p.x} y1={p.y + 44} x2={p.x} y2={p.y + 52} stroke={c.line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <text x={p.x} y={p.y + 62} textAnchor="middle" fill={c.text} style={text}>{label}</text>
      </g>
    );
  }
  const dir = side === 'left' ? -1 : 1;
  return (
    <g>
      {dot}
      <line x1={p.x + dir * 12} y1={p.y} x2={p.x + dir * 54} y2={p.y} stroke={c.line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <text x={p.x + dir * 58} y={p.y + 2.5} textAnchor={side === 'left' ? 'end' : 'start'} fill={c.text} style={text}>{label}</text>
    </g>
  );
}

interface LabBayProps {
  jaw: 'open' | 'closed';
  tone?: keyof typeof LABEL;
  variant?: 'solid' | 'line';
  highlight?: boolean;
  annotations?: boolean;
  /** Draw the 600 × 400 mm stage as a floor plane under the arm. */
  floor?: boolean;
  className?: string;
  armClassName?: string;
}

/** The 600 × 400 mm stage as a floor plane with the single-arm SO-101 standing on it. Illustration only. */
export function LabBay({ jaw, tone = 'dark', variant = 'solid', highlight = false, annotations = false, floor = true, className, armClassName }: LabBayProps) {
  return (
    <div className={cn('absolute inset-0', className)}>
      {floor && (
        <div className="absolute inset-x-[-12%] bottom-0 h-[30%] [perspective:900px]" aria-hidden>
          <div className="h-full w-full origin-bottom [transform:rotateX(62deg)]">
            <LearningStage tone={tone} showLabels={false} showTarget={false} />
          </div>
        </div>
      )}
      <div className={cn('absolute inset-x-[4%] bottom-[5%] top-[13%]', armClassName)}>
        <So101Illustration
          tone={tone}
          variant={variant}
          jaw={jaw}
          highlight={highlight}
          crop={SO101_CROP}
          preserveAspectRatio="xMidYMax meet"
          title={`Illustration of the single-arm SO-101 robot arm, gripper ${jaw}`}>
          {annotations && (
            <g aria-hidden className="max-sm:hidden lg:max-xl:hidden">
              {ANNOTATIONS.map((annotation) => <JointLabel key={annotation.joint} {...annotation} tone={tone} />)}
            </g>
          )}
        </So101Illustration>
      </div>
    </div>
  );
}
