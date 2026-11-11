import type { ReactNode } from 'react';
import { cn } from '../../../utils/cn';

/**
 * Schematic side view of the single-arm SO-101 (joint names from so101_new_calib.urdf).
 * It is an illustration, not a measured drawing, and never represents robot telemetry.
 * The viewBox is 400 × 500 (4:5) so annotation positions can be expressed in percent.
 */
export const SO101_VIEWBOX = { width: 400, height: 500 } as const;

export const SO101_JOINTS = {
  Rotation: { x: 150, y: 404 },
  Pitch: { x: 150, y: 352 },
  Elbow: { x: 262, y: 214 },
  Wrist_Pitch: { x: 338, y: 262 },
  Jaw: { x: 334, y: 336 },
} as const;

export type So101JointName = keyof typeof SO101_JOINTS;

export function jointPercent(joint: So101JointName): { left: string; top: string } {
  const point = SO101_JOINTS[joint];
  return { left: `${(point.x / SO101_VIEWBOX.width) * 100}%`, top: `${(point.y / SO101_VIEWBOX.height) * 100}%` };
}

const TONES = {
  light: { link: '#2F3632', edge: '#4A5550', joint: '#1D2320', ring: '#F7F6F3', accent: '#0D7369' },
  dark: { link: '#DCE3DE', edge: '#B7C3BC', joint: '#F2F5F3', ring: '#15251F', accent: '#A8DDD0' },
} as const;

/** Line-art palettes: precise outlines on a flat fill, the technical drawing language of the Homepage. */
const LINE_TONES = {
  light: { fill: '#FFFFFF', line: '#17191C', joint: '#F7F6F3', accent: '#0D7369' },
  dark: { fill: '#1C3129', line: '#A8DDD0', joint: '#15251F', accent: '#F7F6F3' },
} as const;

function OutlinedBar({ x1, y1, x2, y2, width, fill, line }: { x1: number; y1: number; x2: number; y2: number; width: number; fill: string; line: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={line} strokeWidth={width} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={fill} strokeWidth={width - 3.2} strokeLinecap="round" />
    </g>
  );
}

function LineArm({ jaw, tone, highlight }: { jaw: 'open' | 'closed'; tone: keyof typeof LINE_TONES; highlight: boolean }) {
  const c = LINE_TONES[tone];
  const outline = { fill: c.fill, stroke: c.line, strokeWidth: 1.6 };
  return (
    <g>
      <rect x="58" y="432" width="184" height="22" rx="8" {...outline} />
      <rect x="104" y="374" width="92" height="62" rx="14" {...outline} />
      <rect x="118" y="390" width="64" height="30" rx="7" fill="none" stroke={highlight ? c.accent : c.line} strokeWidth={highlight ? 2.4 : 1.2} />
      <rect x="122" y="330" width="56" height="50" rx="12" {...outline} />
      <OutlinedBar x1={150} y1={352} x2={262} y2={214} width={46} fill={c.fill} line={highlight ? c.accent : c.line} />
      <line x1="166" y1="330" x2="246" y2="232" stroke={c.line} strokeWidth="1" strokeLinecap="round" opacity="0.55" />
      <OutlinedBar x1={262} y1={214} x2={338} y2={262} width={36} fill={c.fill} line={c.line} />
      {[[150, 352, 24, 9], [262, 214, 26, 10], [338, 262, 18, 6]].map(([cx, cy, r, inner]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={r} fill={c.joint} stroke={c.line} strokeWidth="1.6" />
          <circle cx={cx} cy={cy} r={inner} fill="none" stroke={c.line} strokeWidth="1.6" />
        </g>
      ))}
      <rect x="320" y="270" width="40" height="40" rx="9" {...outline} transform="rotate(12 340 290)" />
      <OutlinedBar x1={354} y1={304} x2={364} y2={374} width={12} fill={c.fill} line={c.line} />
      <g className="vh-jaw" style={{ transformBox: 'view-box', transformOrigin: '332px 302px', transform: `rotate(${jaw === 'open' ? 14 : -17}deg)` }}>
        <OutlinedBar x1={332} y1={302} x2={334} y2={374} width={12} fill={c.fill} line={c.line} />
      </g>
    </g>
  );
}

interface So101IllustrationProps {
  jaw?: 'open' | 'closed';
  tone?: keyof typeof TONES;
  /** `line` draws precise outlines on a flat fill; the default `solid` keeps the original filled drawing. */
  variant?: 'solid' | 'line';
  /** Highlights the arm, e.g. while a lesson step selects it. */
  highlight?: boolean;
  title?: string;
  className?: string;
  /** Optional tighter viewBox (same coordinate space as SO101_JOINTS). Defaults to the full 400 × 500 view. */
  crop?: { x: number; y: number; width: number; height: number };
  preserveAspectRatio?: string;
  /** Extra SVG content drawn in the same coordinate space, e.g. joint annotations. */
  children?: ReactNode;
}

export function So101Illustration({ jaw = 'open', tone = 'light', variant = 'solid', highlight = false, title = 'Illustration of the SO-101 robot arm', className, crop, preserveAspectRatio = 'xMidYMid meet', children }: So101IllustrationProps) {
  const c = TONES[tone];
  const edge = highlight ? c.accent : c.edge;
  const viewBox = crop ? `${crop.x} ${crop.y} ${crop.width} ${crop.height}` : `0 0 ${SO101_VIEWBOX.width} ${SO101_VIEWBOX.height}`;
  if (variant === 'line') {
    return (
      <svg viewBox={viewBox} role="img" aria-label={title} className={cn('block h-full w-full', className)} preserveAspectRatio={preserveAspectRatio}>
        <title>{title}</title>
        <LineArm jaw={jaw} tone={tone} highlight={highlight} />
        {children}
      </svg>
    );
  }
  return (
    <svg viewBox={viewBox} role="img" aria-label={title} className={cn('block h-full w-full', className)} preserveAspectRatio={preserveAspectRatio}>
      <title>{title}</title>
      {/* Base plate and rotation housing */}
      <rect x="58" y="432" width="184" height="22" rx="8" fill={c.link} />
      <rect x="104" y="374" width="92" height="62" rx="14" fill={c.link} />
      <rect x="116" y="388" width="68" height="34" rx="8" fill="none" stroke={edge} strokeWidth="2" />
      {/* Shoulder bracket */}
      <rect x="122" y="330" width="56" height="50" rx="12" fill={c.link} />
      {/* Upper arm and forearm links */}
      <line x1="150" y1="352" x2="262" y2="214" stroke={c.link} strokeWidth="46" strokeLinecap="round" />
      <line x1="150" y1="352" x2="262" y2="214" stroke={edge} strokeWidth="2" strokeLinecap="round" strokeDasharray="0 26 120 999" />
      <line x1="262" y1="214" x2="338" y2="262" stroke={c.link} strokeWidth="36" strokeLinecap="round" />
      {/* Joints */}
      <circle cx="150" cy="352" r="24" fill={c.joint} />
      <circle cx="150" cy="352" r="9" fill="none" stroke={c.ring} strokeWidth="3" />
      <circle cx="262" cy="214" r="26" fill={c.joint} />
      <circle cx="262" cy="214" r="10" fill="none" stroke={c.ring} strokeWidth="3" />
      <circle cx="338" cy="262" r="18" fill={c.joint} />
      <circle cx="338" cy="262" r="6" fill="none" stroke={c.ring} strokeWidth="3" />
      {/* Wrist and gripper body */}
      <rect x="320" y="270" width="40" height="40" rx="9" fill={c.link} transform="rotate(12 340 290)" />
      {/* Fixed jaw */}
      <line x1="354" y1="304" x2="364" y2="374" stroke={c.joint} strokeWidth="12" strokeLinecap="round" />
      {/* Moving jaw rotates about its pivot: open swings away, closed meets the fixed jaw */}
      <g className="vh-jaw" style={{ transformBox: 'view-box', transformOrigin: '332px 302px', transform: `rotate(${jaw === 'open' ? 14 : -17}deg)` }}>
        <line x1="332" y1="302" x2="334" y2="374" stroke={c.joint} strokeWidth="12" strokeLinecap="round" />
      </g>
      {children}
    </svg>
  );
}
