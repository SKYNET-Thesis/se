import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { cn } from '../../../utils/cn';
import { ACTOR_ACCENT } from '../content';

/**
 * S8's relationship diagram (H6.9). Who creates, who is assigned or enrolled, where lessons appear, who
 * submits and who answers: the same facts as before, drawn as directed arrows with every label readable
 * from the first frame. Scrolling through the four steps only highlights the step's arrows in teal;
 * the meaning never depends on the animation. Two compositions: landscape and portrait, each scaled
 * uniformly so arrowheads keep their shape.
 */

type NodeId = 'admin' | 'lessons' | 'classroom' | 'teachers' | 'students';
/** `box`: each node's half width and half height in field units, so arrows stop at its edge. */
interface Layout { w: number; h: number; at: Record<NodeId, [number, number]>; box: Record<NodeId, [number, number]>; bend: Record<string, [number, number] | undefined> }

const NODES: Array<{ id: NodeId; label: string; accent?: string }> = [
  { id: 'admin', label: 'School administrator', accent: ACTOR_ACCENT['School administrator'] },
  { id: 'lessons', label: 'Lessons' },
  { id: 'classroom', label: 'Classroom' },
  { id: 'teachers', label: 'Teachers', accent: ACTOR_ACCENT.Teacher },
  { id: 'students', label: 'Students', accent: ACTOR_ACCENT.Student },
];

/** `step` is the SCHOOL_FLOW step that introduces each relationship. */
const EDGES: Array<{ id: string; from: NodeId; to: NodeId; label: string; step: number }> = [
  { id: 'creates', from: 'admin', to: 'classroom', label: 'creates', step: 0 },
  { id: 'teaches', from: 'teachers', to: 'classroom', label: 'assigned to', step: 1 },
  { id: 'enrolled', from: 'students', to: 'classroom', label: 'enrolled in', step: 1 },
  { id: 'lessons', from: 'lessons', to: 'classroom', label: 'assigned to', step: 2 },
  { id: 'mylearning', from: 'classroom', to: 'students', label: 'lessons in My Learning', step: 2 },
  { id: 'submission', from: 'students', to: 'teachers', label: 'submission', step: 3 },
  { id: 'feedback', from: 'teachers', to: 'students', label: 'feedback', step: 3 },
];

const WIDE: Layout = {
  w: 100, h: 62,
  at: { admin: [17, 9], lessons: [83, 9], classroom: [50, 28], teachers: [17, 52], students: [83, 52] },
  box: { admin: [15.5, 2.9], lessons: [7, 2.9], classroom: [8.2, 2.9], teachers: [8.5, 2.9], students: [8.5, 2.9] },
  bend: { mylearning: [96, 20], submission: [50, 45], feedback: [50, 60] },
};
const TALL: Layout = {
  w: 100, h: 126,
  at: { admin: [27, 7], lessons: [75, 7], classroom: [50, 42], teachers: [23, 84], students: [77, 84] },
  box: { admin: [17, 6.3], lessons: [11.5, 4.4], classroom: [13, 4.4], teachers: [13.5, 4.4], students: [13.5, 4.4] },
  bend: { mylearning: [102, 66], submission: [50, 102], feedback: [50, 122] },
};

/** Where the arrow leaves and arrives: at the edge of each node's box (plus a small gap), never under it. */
function geometry(layout: Layout, e: (typeof EDGES)[number]) {
  const [ax, ay] = layout.at[e.from]; const [bx, by] = layout.at[e.to];
  const c = layout.bend[e.id];
  const [cx, cy] = c ?? [(ax + bx) / 2, (ay + by) / 2];
  const edge = (id: NodeId, tx: number, ty: number, gap: number) => {
    const [x, y] = layout.at[id]; const [rx, ry] = layout.box[id];
    const len = Math.hypot(tx - x, ty - y) || 1; const ux = (tx - x) / len; const uy = (ty - y) / len;
    const d = Math.min(Math.abs(ux) > 1e-6 ? rx / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? ry / Math.abs(uy) : Infinity) + gap;
    return [x + ux * d, y + uy * d];
  };
  const [sx, sy] = edge(e.from, cx, cy, 0.8);
  const [ex, ey] = edge(e.to, cx, cy, 1.4);
  const d = c ? `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}` : `M ${sx} ${sy} L ${ex} ${ey}`;
  // Label at the curve's midpoint.
  const mx = c ? 0.25 * sx + 0.5 * cx + 0.25 * ex : (sx + ex) / 2;
  const my = c ? 0.25 * sy + 0.5 * cy + 0.25 * ey : (sy + ey) / 2;
  return { d, mx, my };
}

function Field({ layout, reached, current, className }: { layout: Layout; reached: number; current: number; className?: string }) {
  const lit = (step: number) => step < reached;
  const now = (step: number) => step === current;
  return (
    <div className={cn('relative w-full', className)} style={{ aspectRatio: `${layout.w} / ${layout.h}` }}>
      <svg aria-hidden viewBox={`0 0 ${layout.w} ${layout.h}`} className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <marker id={`v2-arrow-${layout.h}`} viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="2.2" markerHeight="2.2" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(238,242,240,0.62)" /></marker>
          <marker id={`v2-arrow-lit-${layout.h}`} viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="2.2" markerHeight="2.2" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--v2-teal)" /></marker>
        </defs>
        {EDGES.map((e) => {
          const { d } = geometry(layout, e);
          return (
            <g key={e.id}>
              {/* Always drawn and readable: the relationship itself. */}
              <path d={d} fill="none" vectorEffect="non-scaling-stroke" stroke="rgba(238,242,240,0.42)" strokeWidth={1.75} markerEnd={`url(#v2-arrow-${layout.h})`} />
              {/* Drawn over it in teal once its step is reached (the finished state without motion). */}
              <path d={d} fill="none" pathLength={1} vectorEffect="non-scaling-stroke" className={cn('v2-edge', lit(e.step) && 'is-lit')}
                stroke="var(--v2-teal)" strokeWidth={now(e.step) ? 2.75 : 2} markerEnd={lit(e.step) ? `url(#v2-arrow-lit-${layout.h})` : undefined} />
            </g>
          );
        })}
      </svg>
      {EDGES.map((e) => {
        const { mx, my } = geometry(layout, e);
        return (
          <span key={e.id} aria-hidden className={cn('absolute -translate-x-1/2 -translate-y-1/2 rounded-[3px]', layout === TALL && e.label.length > 14 ? 'max-w-[11ch] text-center leading-[1.15]' : 'whitespace-nowrap leading-none', 'bg-[var(--v2-graphite-2)] px-1.5 py-0.5 text-[13px] transition-colors duration-500',
            lit(e.step) ? 'text-[var(--v2-teal)]' : 'text-[var(--v2-soft)]', now(e.step) && 'font-semibold')}
            style={{ left: `${(mx / layout.w) * 100}%`, top: `${(my / layout.h) * 100}%` }}>{e.label}</span>
        );
      })}
      {NODES.map((n) => {
        const [x, y] = layout.at[n.id];
        return (
          <span key={n.id} aria-hidden className={cn('absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[4px] bg-[var(--v2-graphite-3)] px-3 py-2 text-[15px] font-semibold text-[var(--v2-text)] max-sm:px-2 max-sm:text-[14px]',
            n.id === 'classroom' && 'bg-[var(--v2-text)] text-[var(--v2-void)]', layout === TALL ? 'max-w-[12ch] text-center leading-tight' : 'whitespace-nowrap')}
            style={{ left: `${(x / layout.w) * 100}%`, top: `${(y / layout.h) * 100}%` }}>
            {n.accent && <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: n.accent }} />}{n.label}
          </span>
        );
      })}
    </div>
  );
}

const DESCRIPTION = 'Relationships: the school administrator creates classrooms; teachers are assigned to classrooms and students are enrolled in them; lessons are assigned to classrooms and appear for students in My Learning; students send submissions to teachers, and teachers answer with feedback.';

export function Relationships({ reached, current }: { reached: number; current: number }) {
  const wide = useMediaQuery('(min-width: 640px)');
  return (
    <div role="img" aria-label={DESCRIPTION}>
      <Field layout={wide ? WIDE : TALL} reached={reached} current={current} />
    </div>
  );
}
