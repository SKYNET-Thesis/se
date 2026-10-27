import type { ReactNode } from 'react';
import { ArrowRightIcon, CheckCircle2Icon, HandIcon, LockIcon } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { LESSON_ONE, LESSON_ONE_RULES } from '../content/lessonOne';
import { BlockChip } from '../visuals/BlockStage';
import { STAGE, TARGET_A } from '../visuals/LearningStage';
import { So101Illustration } from '../visuals/So101Illustration';

/*
 * H4.2 designed fallbacks (S4–S7). Each fills its frame at any size: type is set in container
 * units (`.vh-cq`), so a fallback never reads as a small mockup inside a large empty frame.
 * Interface fallbacks are typographic representations of real VISTA screens, marked
 * "Illustrative", with no button-like controls and no invented records.
 */

function Marker({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return <span className={cn('absolute bottom-3 right-3 z-10 rounded-[8px] px-2 py-0.5 text-[13px] font-medium', tone === 'dark' ? 'bg-white/10 text-white/80' : 'bg-[var(--vh-ground)] text-[var(--vh-muted)]')}>Illustrative</span>;
}

function Canvas({ children, className, tone = 'light' }: { children: ReactNode; className?: string; tone?: 'light' | 'dark' }) {
  return <div className={cn('vh-cq absolute inset-0 overflow-hidden', tone === 'dark' ? 'bg-[var(--vh-deep)] text-white' : 'bg-[var(--vh-surface)] text-[var(--vh-ink)]', className)}>{children}<Marker tone={tone} /></div>;
}

/* ---- S4: the learning stage in 3D ---- */

export type StageAxis = 'x' | 'y' | 'z';

// Isometric-style projection: x runs right-down along the front edge, y right-up into the stage, z straight up.
const C = 0.866;
const S = 0.42;
const P = (x: number, y: number, z = 0) => ({ x: C * (x + y), y: S * (x - y) - z });
const pt = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
const SLAB = 16;

const AXIS_TEXT = { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontSize: 22, fontWeight: 600 } as const;

/**
 * The 600 × 400 mm stage (TABLE in kinematics.ts) drawn in 3D with Target A from the seeded
 * Reach a Target lesson. Guides show how far Target A is along x, y and z; `focus` brings one forward.
 */
export function StageAxonometric({ focus = null }: { focus?: StageAxis | null }) {
  const { width: W, depth: D } = STAGE;
  const { x: tx, y: ty, z: tz } = TARGET_A;
  const o = P(0, 0); const xEnd = P(W, 0); const xy = P(W, D); const yEnd = P(0, D);
  const down = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + SLAB });
  const floor = P(tx, ty); const target = P(tx, ty, tz);
  const onX = P(tx, 0); const onY = P(0, ty);
  const label = `Learning stage, ${W} by ${D} millimetres, drawn in 3D. Target A is ${tx} millimetres along x, ${ty} along y and ${tz} above the stage.`;
  const lit = (axis: StageAxis) => focus === null || focus === axis;
  const guide = (axis: StageAxis) => ({ stroke: '#A8DDD0', strokeWidth: focus === axis ? 5 : 2.5, strokeOpacity: lit(axis) ? 1 : 0.28, strokeDasharray: focus === axis ? undefined : '7 7', strokeLinecap: 'round' as const, className: 'transition-[stroke-opacity,stroke-width] duration-300' });
  const gridX = Array.from({ length: W / 100 - 1 }, (_, i) => (i + 1) * 100);
  const gridY = Array.from({ length: D / 100 - 1 }, (_, i) => (i + 1) * 100);

  return (
    <div className="absolute inset-0 bg-[var(--vh-deep)]">
      <svg viewBox="-70 -250 1010 560" role="img" aria-label={label} className="absolute inset-[4%] h-[92%] w-[92%]" preserveAspectRatio="xMidYMid meet">
        <title>{label}</title>
        <g aria-hidden>
          {/* Slab sides, then the stage top */}
          <polygon points={[o, xEnd, down(xEnd), down(o)].map(pt).join(' ')} fill="#0F1D18" />
          <polygon points={[xEnd, xy, down(xy), down(xEnd)].map(pt).join(' ')} fill="#0B1713" />
          <polygon points={[o, xEnd, xy, yEnd].map(pt).join(' ')} fill="#1F3B32" />
          {gridX.map((x) => <line key={`gx${x}`} x1={P(x, 0).x} y1={P(x, 0).y} x2={P(x, D).x} y2={P(x, D).y} stroke="#A8DDD0" strokeOpacity={0.12} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          {gridY.map((y) => <line key={`gy${y}`} x1={P(0, y).x} y1={P(0, y).y} x2={P(W, y).x} y2={P(W, y).y} stroke="#A8DDD0" strokeOpacity={0.12} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}

          {/* z axis at the origin, front-left corner */}
          <line x1={o.x} y1={o.y} x2={o.x} y2={o.y - 190} stroke="#C9D6CF" strokeOpacity={0.5} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <circle cx={o.x} cy={o.y} r={7} fill="#F7F6F3" />

          {/* Guides from the origin to Target A: along x, then y, then up z */}
          <line x1={o.x} y1={o.y} x2={onX.x} y2={onX.y} {...guide('x')} />
          <line x1={onX.x} y1={onX.y} x2={floor.x} y2={floor.y} {...guide('y')} />
          <line x1={onY.x} y1={onY.y} x2={floor.x} y2={floor.y} stroke="#A8DDD0" strokeOpacity={focus ? 0.12 : 0.28} strokeWidth={2} strokeDasharray="7 7" />
          <line x1={floor.x} y1={floor.y} x2={target.x} y2={target.y} {...guide('z')} />
          <ellipse cx={floor.x} cy={floor.y} rx={22} ry={10} fill="#A8DDD0" fillOpacity={0.22} />

          {/* Target A */}
          <circle cx={target.x} cy={target.y} r={26} fill="none" stroke="#A8DDD0" strokeWidth={3} />
          <circle cx={target.x} cy={target.y} r={10} fill="#F7F6F3" />

          <g className="max-lg:hidden" style={AXIS_TEXT}>
            <text x={xEnd.x + 18} y={xEnd.y + 30} fill="#C9D6CF">x</text>
            <text x={yEnd.x - 6} y={yEnd.y - 18} fill="#C9D6CF">y</text>
            <text x={o.x - 8} y={o.y - 204} fill="#C9D6CF">z</text>
            <text x={o.x - 18} y={o.y + 46} fill="#C9D6CF">0, 0, 0</text>
            <text x={target.x + 42} y={target.y + 8} fill="#F7F6F3">Target A</text>
            <text x={(xEnd.x + xy.x) / 2 + 24} y={(xEnd.y + xy.y) / 2 + 36} fill="#C9D6CF" style={{ fontWeight: 500 }}>{D} mm</text>
            <text x={(o.x + xEnd.x) / 2 - 40} y={(o.y + xEnd.y) / 2 + 52} fill="#C9D6CF" style={{ fontWeight: 500 }}>{W} mm</text>
          </g>
        </g>
      </svg>
      <Marker tone="dark" />
    </div>
  );
}

/* ---- S5: the three roles ---- */

const SEEDED_LESSONS = [
  { name: 'Open & Close Gripper', mode: 'Blocks and 3D preview' },
  { name: 'Reach a Target', mode: 'Coordinates in 3D' },
  { name: 'VR Robot Control', mode: 'VR session' },
  { name: 'Teach by Demonstration', mode: 'Recorded demonstration' },
] as const;

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[clamp(10px,2cqi,16px)] bg-[var(--vh-ground)] px-[4cqi] py-[2.4cqi]', className)}>{children}</div>;
}

export function RoleStudent() {
  return (
    <Canvas className="flex flex-col justify-center p-[6cqi]">
      <p className="vh-fb-title">My Learning</p>
      <p className="vh-fb-small mt-[1cqi] text-[var(--vh-muted)]">Robotics Class A</p>
      <ul className="mt-[4cqi] grid gap-[1.6cqi]">
        {SEEDED_LESSONS.map((lesson) => (
          <li key={lesson.name}>
            <Row className="flex items-baseline gap-[2.4cqi]">
              <BlockChip color="#0D7369" />
              <span className="vh-fb-body min-w-0 flex-1 font-semibold">{lesson.name}</span>
              <span className="vh-fb-small text-[var(--vh-muted)] max-[420px]:hidden">{lesson.mode}</span>
            </Row>
          </li>
        ))}
      </ul>
    </Canvas>
  );
}

export function RoleTeacher() {
  return (
    <Canvas className="flex flex-col justify-center p-[6cqi]">
      <p className="vh-fb-title">Submission review</p>
      <p className="vh-fb-small mt-[1cqi] text-[var(--vh-muted)]">Open &amp; Close Gripper, Robotics Class A</p>
      <div className="mt-[4cqi] grid flex-1 grid-cols-[1.1fr_1fr] gap-[2.4cqi]">
        <Row className="py-[3.2cqi]">
          <p className="vh-fb-body font-semibold">Rule checks</p>
          <ul className="mt-[2cqi] grid gap-[1.4cqi]">
            {LESSON_ONE_RULES.map((rule) => <li key={rule} className="vh-fb-small flex items-start gap-[1.4cqi]"><CheckCircle2Icon className="mt-[0.15em] h-[1.1em] w-[1.1em] shrink-0 text-[var(--vh-teal)]" aria-hidden />{rule}</li>)}
          </ul>
        </Row>
        <div className="grid content-start gap-[2.4cqi]">
          <Row className="py-[3.2cqi]">
            <p className="vh-fb-body font-semibold">Feedback</p>
            <p className="vh-fb-small mt-[1.4cqi] text-[var(--vh-muted)]">Written by the teacher and sent with the review.</p>
          </Row>
          <Row className="py-[3.2cqi]">
            <p className="vh-fb-body font-semibold">Rubric</p>
            <p className="vh-fb-small mt-[1.4cqi] text-[var(--vh-muted)]">Used when the assignment has criteria.</p>
          </Row>
        </div>
      </div>
    </Canvas>
  );
}

const CLASSROOM_GROUPS = [
  { name: 'Teachers', text: 'Assigned by the administrator' },
  { name: 'Students', text: 'Enrolled by the administrator' },
  { name: 'Lessons', text: 'Assigned to the classroom' },
] as const;

export function RoleSchool() {
  return (
    <Canvas className="flex flex-col justify-center p-[6cqi]">
      <p className="vh-fb-title">School administration</p>
      <p className="vh-fb-small mt-[1cqi] text-[var(--vh-muted)]">School membership is separate from classroom enrolment.</p>
      <Row className="mt-[4cqi] py-[3.2cqi]">
        <p className="vh-fb-body font-semibold">Robotics Class A <span className="font-normal text-[var(--vh-muted)]">ROBOTICS-A</span></p>
        <ul className="mt-[2.4cqi] grid grid-cols-3 gap-[2cqi]">
          {CLASSROOM_GROUPS.map((group) => (
            <li key={group.name} className="rounded-[clamp(8px,1.6cqi,12px)] bg-[var(--vh-surface)] p-[2.4cqi]">
              <span className="vh-fb-body block font-semibold">{group.name}</span>
              <span className="vh-fb-small mt-[0.8cqi] block text-[var(--vh-muted)]">{group.text}</span>
            </li>
          ))}
        </ul>
      </Row>
      <Row className="mt-[2cqi] py-[3.2cqi]">
        <p className="vh-fb-body font-semibold">Import users</p>
        <p className="vh-fb-small mt-[1cqi] text-[var(--vh-muted)]">CSV templates and a local preview. Accounts are not created from a file.</p>
      </Row>
    </Canvas>
  );
}

/* ---- S6: capability showcase (Blockly, 3D preview, VR, demonstration) ---- */

/**
 * Lesson one's toolbox (openCloseGripperToolbox in blocklyConfig.ts) laid out as loose blocks, not as an
 * assembled program: the capability shown is the limited toolbox. Colours follow PALETTE, with the
 * gripper amber darkened for white text as in LessonBlocks.
 */
const LESSON_ONE_TOOLBOX = [
  { name: 'Program', blocks: [{ label: 'when program starts', color: '#2B2F35' }, { label: 'use left arm', color: '#7A4F8F' }, { label: 'move selected arm home', color: '#0F7A6E' }] },
  { name: 'Gripper', blocks: [{ label: 'open gripper', color: '#94600F' }, { label: 'close gripper', color: '#94600F' }] },
  { name: 'Timing', blocks: [{ label: 'wait 1 seconds', color: '#5B6573' }] },
] as const;

/** Categories of the full toolbox that lesson one leaves out. */
const HIDDEN_CATEGORIES = ['Movement', 'Control', 'Dual arm', 'Vision / AI'] as const;

export function ModeBlockly() {
  const count = LESSON_ONE_TOOLBOX.reduce((sum, category) => sum + category.blocks.length, 0);
  return (
    <Canvas className="flex flex-col justify-between gap-[3cqi] p-[5cqi]">
      <div>
        <p className="vh-fb-title">{count} blocks in lesson one</p>
        <p className="vh-fb-small mt-[1.2cqi] text-[var(--vh-muted)]">Hidden in this lesson: {HIDDEN_CATEGORIES.join(', ')}</p>
      </div>
      <ul className="grid gap-[2.4cqi]" aria-label="Lesson one toolbox">
        {LESSON_ONE_TOOLBOX.map((category) => (
          <li key={category.name} className="grid grid-cols-[22%_1fr] items-start gap-[2cqi]">
            <p className="vh-fb-body pt-[0.9cqi] font-semibold">{category.name}</p>
            <p className="flex flex-wrap gap-[1.4cqi]">
              {category.blocks.map((block) => (
                <span key={block.label} className="vh-fb-body inline-flex min-h-[5.4cqi] items-center rounded-[clamp(6px,1.2cqi,10px)] px-[2.2cqi] font-semibold text-white" style={{ backgroundColor: block.color }}>{block.label}</span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </Canvas>
  );
}

/** S6 3D preview: a close-up of the gripper at the last step, with lesson one's four steps below it. */
export function ModePreview() {
  const last = LESSON_ONE[LESSON_ONE.length - 1];
  return (
    <Canvas className="bg-[var(--vh-ground)]">
      <div className="absolute inset-x-[6%] bottom-[34%] top-[6%]">
        <So101Illustration tone="light" variant="line" jaw="closed" crop={{ x: 280, y: 214, width: 128, height: 184 }} title="Close-up of the SO-101 gripper, closed" />
      </div>
      {/* Clears the Illustrative marker in the bottom-right corner at every frame size. */}
      <div className="absolute inset-x-[6cqi] bottom-[max(7cqi,48px)]">
        <p className="vh-fb-body font-semibold">Step {LESSON_ONE.length} of {LESSON_ONE.length}: {last.result}</p>
        <div className="mt-[2cqi] grid grid-cols-4 gap-[1.2cqi]" aria-hidden>
          {LESSON_ONE.map((step) => <span key={step.id} className="h-[1.6cqi] min-h-2 rounded-full" style={{ backgroundColor: step.color }} />)}
        </div>
      </div>
    </Canvas>
  );
}

/** A tile in the block-tab shape, used in the VR and Safety diagrams. */
function TabTile({ fill, className, children }: { fill: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('relative mt-[var(--vh-tab-h)] rounded-[clamp(12px,2.4cqi,20px)] rounded-tl-[10px] p-[3.2cqi]', className)} style={{ backgroundColor: fill }}>
      <span aria-hidden className="absolute bottom-full left-[14%] h-[var(--vh-tab-h)] w-[34%] rounded-t-[10px]" style={{ backgroundColor: fill }} />
      {children}
    </div>
  );
}

/** S6 VR: hand or controller motion drives a simulated arm; the physical robot stays locked. No robot drawing. */
export function ModeVr() {
  return (
    <Canvas tone="dark" className="vh-dark flex flex-col justify-between p-[6cqi]">
      <div>
        <p className="vh-fb-title text-white">VR session</p>
        <p className="vh-fb-small mt-[1.4cqi] text-[var(--vh-on-deep-soft)]">Offline, simulated follower</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-[2.4cqi]" role="img" aria-label="Hand or controller motion drives the simulated arm">
        <TabTile fill="rgba(255,255,255,0.08)" className="flex min-h-[26cqi] flex-col justify-between gap-[2cqi]">
          <HandIcon className="h-[10cqi] w-[10cqi] text-[var(--vh-teal-on-deep)]" strokeWidth={1.5} aria-hidden />
          <p className="vh-fb-body font-semibold text-white">Hand or controller</p>
        </TabTile>
        <ArrowRightIcon className="mb-[10cqi] h-[6cqi] w-[6cqi] text-[var(--vh-teal-on-deep)]" aria-hidden />
        <TabTile fill="var(--vh-teal-on-deep)" className="flex min-h-[26cqi] flex-col justify-end text-[var(--vh-deep)]">
          <p className="vh-fb-body font-semibold">Simulated arm</p>
        </TabTile>
      </div>
      <p className="vh-fb-small inline-flex w-fit items-center gap-[1.4cqi] rounded-[10px] bg-white/10 px-[2.4cqi] py-[1.4cqi] font-semibold text-[var(--vh-teal-on-deep)]"><LockIcon className="h-[1.1em] w-[1.1em] shrink-0" aria-hidden />Physical robot locked</p>
    </Canvas>
  );
}

// Schematic tracks of one recorded episode: relative lengths only, no recorded values.
const TRACKS = [
  { name: 'Observation', text: 'What the robot measured', color: '#0D7369', bars: [3, 2, 4, 2, 3, 5, 2, 3] },
  { name: 'Action', text: 'What the student commanded', color: '#7A4F8F', bars: [2, 4, 2, 3, 5, 2, 3, 2] },
] as const;

export function ModeDemonstration() {
  return (
    <Canvas className="flex flex-col justify-between p-[6cqi]">
      <div>
        <p className="vh-fb-title">One recorded episode</p>
        <p className="vh-fb-small mt-[1.4cqi] text-[var(--vh-muted)]">Recorded demonstration. No model training has run.</p>
      </div>
      <div className="grid gap-[3cqi]">
        {TRACKS.map((track) => (
          <div key={track.name}>
            <p className="vh-fb-body"><span className="font-semibold">{track.name}</span> <span className="text-[var(--vh-muted)]">{track.text}</span></p>
            <div className="mt-[1.4cqi] flex gap-[0.8cqi]" aria-hidden>
              {track.bars.map((size, index) => <span key={index} className="h-[3.4cqi] min-h-3 rounded-[4px]" style={{ flexGrow: size, backgroundColor: track.color }} />)}
            </div>
          </div>
        ))}
      </div>
    </Canvas>
  );
}

/* ---- S7: the boundary between preview and physical execution ---- */

function Lane({ open, title, text }: { open: boolean; title: string; text: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_minmax(0,38%)] items-end gap-[2.4cqi]">
      <p className="vh-fb-body mb-[2cqi] rounded-[10px] bg-white/10 px-[2.4cqi] py-[1.6cqi] font-semibold text-white">Your program</p>
      <div className="relative mb-[5.4cqi] flex items-center">
        <span className={cn('h-[0.9cqi] min-h-[3px] w-full rounded-full', open ? 'bg-[var(--vh-teal-on-deep)]' : 'bg-white/20')} />
        {open
          ? <ArrowRightIcon className="absolute -right-[1.6cqi] h-[4.4cqi] w-[4.4cqi] text-[var(--vh-teal-on-deep)]" aria-hidden />
          : <span className="absolute left-1/2 grid h-[9cqi] w-[9cqi] -translate-x-1/2 place-items-center rounded-full bg-[var(--vh-deep)] text-[var(--vh-teal-on-deep)]"><LockIcon className="h-[4.4cqi] w-[4.4cqi]" aria-hidden /></span>}
      </div>
      <TabTile fill={open ? 'var(--vh-teal-on-deep)' : 'rgba(255,255,255,0.08)'} className={open ? 'text-[var(--vh-deep)]' : 'text-white'}>
        <p className="vh-fb-body flex items-center gap-[1.2cqi] font-semibold">
          {open ? <CheckCircle2Icon className="h-[1.1em] w-[1.1em] shrink-0" aria-hidden /> : <LockIcon className="h-[1.1em] w-[1.1em] shrink-0 text-[var(--vh-teal-on-deep)]" aria-hidden />}
          {title}
        </p>
        <p className={cn('vh-fb-small mt-[1cqi]', open ? 'text-[var(--vh-deep)]' : 'text-[var(--vh-on-deep-soft)]')}>{text}</p>
      </TabTile>
    </div>
  );
}

/**
 * Two lanes from the same program: one reaches the 3D preview, the other stops at a lock before the
 * physical robot. A diagram of the boundary, not a control: nothing in it can be pressed.
 */
export function SafetyBoundary() {
  return (
    <div className="vh-cq vh-dark absolute inset-0 flex flex-col justify-center overflow-hidden bg-[var(--vh-deep-2)] p-[6cqi] text-white" role="img" aria-label="The same program reaches the 3D preview in every lesson. The path to the physical robot stops at a lock: physical runs are locked in this release.">
      <div aria-hidden className="grid gap-[10cqi]">
        <Lane open title="3D preview" text="In every lesson" />
        <Lane open={false} title="Physical robot" text="Locked in this release" />
      </div>
    </div>
  );
}

/** The H4.2 fallback id `safety-blocks` renders the boundary diagram too. */
export const SafetyBlocks = SafetyBoundary;
