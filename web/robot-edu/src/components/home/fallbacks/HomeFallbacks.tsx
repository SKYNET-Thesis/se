import type { ReactNode } from 'react';
import { CheckCircle2Icon, LockIcon } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { LESSON_ONE, LESSON_ONE_RULES } from '../content/lessonOne';
import type { HomeFallbackId } from '../media/homeAssets';
import { LabBay, SO101_CROP } from '../visuals/LabBay';
import { LearningStage } from '../visuals/LearningStage';
import { LessonBlocks } from '../visuals/LessonBlocks';
import { So101Illustration } from '../visuals/So101Illustration';
import { ModeBlockly, ModeDemonstration, ModePreview, ModeVr, RoleSchool, RoleStudent, RoleTeacher, SafetyBlocks, SafetyBoundary, StageAxonometric } from './H42Fallbacks';

/*
 * Designed fallbacks for every Homepage asset. Interface fallbacks are simplified, clearly marked
 * representations of real VISTA screens; their wording is taken from the actual pages.
 */

function Marker({ children = 'Illustrative' }: { children?: string }) {
  return <span className="absolute bottom-3 left-3 z-10 rounded-[8px] bg-[var(--vh-surface)] px-2 py-0.5 text-[12px] font-medium text-[var(--vh-muted)] ring-1 ring-inset ring-[var(--vh-line)]">{children}</span>;
}

function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('absolute inset-0 overflow-hidden bg-[var(--vh-ground)] p-[clamp(14px,4%,32px)] text-[var(--vh-ink)]', className)}>{children}<Marker /></div>;
}

function Pill({ children, tone = 'teal' }: { children: string; tone?: 'teal' | 'quiet' }) {
  return <span className={cn('inline-flex h-8 items-center rounded-[10px] px-3.5 text-[13px] font-semibold', tone === 'teal' ? 'bg-[var(--vh-teal)] text-white' : 'bg-[var(--vh-surface)] text-[var(--vh-ink)] ring-1 ring-inset ring-[var(--vh-line-strong)]')}>{children}</span>;
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[12px] bg-[var(--vh-surface)] p-3 ring-1 ring-inset ring-[var(--vh-line)]', className)}>{children}</div>;
}

/** Blockly workspace ground (24 px dot grid, as configured in BlocklyCanvas) with lesson one's blocks. */
export function BlocklyGround({ activeIndex = null }: { activeIndex?: number | null }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-white bg-[radial-gradient(#E3E1DA_1.4px,transparent_1.4px)] [background-size:24px_24px]">
      <div className="absolute left-[8%] top-[10%] origin-top-left scale-[0.86] sm:scale-100">
        <LessonBlocks activeIndex={activeIndex} />
      </div>
    </div>
  );
}

export function UiLesson() {
  return (
    <Screen>
      <p className="text-[12px] text-[var(--vh-muted)]">Lesson 1</p>
      <p className="vh-display mt-1 text-[clamp(20px,2.4vw,32px)] leading-[1.05] tracking-[-0.03em]">Open &amp; Close Gripper</p>
      <p className="mt-2 max-w-[40ch] text-[13px] leading-5 text-[var(--vh-muted)]">Choose the left arm, open its gripper, wait one second, then close it.</p>
      <Panel className="mt-4 max-w-[46ch]">
        <p className="text-[13px] font-semibold">Your mission</p>
        <p className="mt-1 text-[13px] leading-5 text-[var(--vh-muted)]">Select the left arm. Open its gripper, wait at least one second, then close it.</p>
      </Panel>
      <div className="mt-4"><Pill>Start practice</Pill></div>
    </Screen>
  );
}

export function UiProgram() {
  return <div className="absolute inset-0"><BlocklyGround /><Marker /></div>;
}

export function UiPreview() {
  const last = LESSON_ONE[LESSON_ONE.length - 1];
  return (
    <Screen className="p-0">
      <LabBay tone="light" jaw="closed" className="bottom-[18%]" />
      <div className="absolute inset-x-[5%] bottom-[5%]">
        <div className="grid grid-cols-4 gap-1.5" aria-hidden>{LESSON_ONE.map((step) => <span key={step.id} className="h-1.5 rounded-full bg-[var(--vh-teal)]" />)}</div>
        <p className="mt-2 text-right text-[12px] text-[var(--vh-muted)]">Step 4 of 4: {last.result}</p>
      </div>
    </Screen>
  );
}

export function UiEvaluate() {
  return (
    <Screen>
      <p className="text-[13px] font-semibold">Machine evaluation, symbolic</p>
      <p className="mt-1 text-[13px] text-[var(--vh-muted)]">Passed, {LESSON_ONE_RULES.length} of {LESSON_ONE_RULES.length} rules</p>
      <ul className="mt-4 grid max-w-[44ch] gap-2">
        {LESSON_ONE_RULES.map((rule) => (
          <li key={rule}><Panel className="flex items-center gap-2.5 py-2.5 text-[13px]"><CheckCircle2Icon className="h-4 w-4 shrink-0 text-[var(--vh-teal)]" aria-hidden />{rule}</Panel></li>
        ))}
      </ul>
      <p className="mt-3 max-w-[44ch] text-[12px] leading-4 text-[var(--vh-muted)]">Checks the preview trace. It is not a robot result or a teacher grade.</p>
    </Screen>
  );
}

export function UiReflect() {
  return (
    <Screen>
      <p className="text-[13px] font-semibold">Teacher feedback &amp; reflection</p>
      <Panel className="mt-3 max-w-[48ch] text-[13px] text-[var(--vh-muted)]">No teacher feedback has been recorded yet.</Panel>
      <div className="mt-3 max-w-[48ch] rounded-[12px] bg-[var(--vh-surface)] p-3 text-[13px] text-[var(--vh-muted)] ring-1 ring-inset ring-[var(--vh-line-strong)]">What did you learn from this submission?</div>
      <div className="mt-3"><Pill tone="quiet">Save reflection</Pill></div>
    </Screen>
  );
}

const SEEDED_LESSONS = ['Open & Close Gripper', 'Reach a Target', 'VR Robot Control', 'Teach by Demonstration'] as const;

export function UiStudent() {
  return (
    <Screen>
      <p className="vh-display text-[clamp(20px,2.2vw,28px)] tracking-[-0.03em]">My Learning</p>
      <ul className="mt-4 grid max-w-[52ch] gap-2">
        {SEEDED_LESSONS.map((lesson) => (
          <li key={lesson}><Panel className="flex items-center justify-between gap-3 py-2.5"><span><span className="block text-[13px] font-semibold">{lesson}</span><span className="block text-[12px] text-[var(--vh-muted)]">Robotics Class A</span></span><Pill tone="quiet">Start</Pill></Panel></li>
        ))}
      </ul>
    </Screen>
  );
}

export function UiTeacher() {
  return (
    <Screen>
      <p className="text-[13px] font-semibold">Instructor submission review</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
        <div className="grid content-start gap-2">
          {['submitted', 'submitted'].map((status, index) => <Panel key={index} className="py-2.5 text-[13px]"><span className="block font-semibold">Student submission</span><span className="text-[12px] text-[var(--vh-muted)]">{status}</span></Panel>)}
        </div>
        <Panel className="hidden sm:block">
          <p className="text-[13px] font-semibold">Review submission</p>
          <div className="mt-2 h-16 rounded-[8px] p-2 text-[12px] text-[var(--vh-muted)] ring-1 ring-inset ring-[var(--vh-line-strong)]">Teacher feedback</div>
          <div className="mt-2"><Pill tone="quiet">Send feedback</Pill></div>
        </Panel>
      </div>
    </Screen>
  );
}

export function UiSchool() {
  return (
    <Screen>
      <div className="flex flex-wrap gap-1 border-b border-[var(--vh-line)] pb-2 text-[13px]">
        {['Overview', 'Users', 'Classrooms', 'Import users'].map((tab, index) => <span key={tab} className={cn('rounded-[8px] px-2.5 py-1', index === 1 ? 'bg-[var(--vh-surface)] font-semibold ring-1 ring-inset ring-[var(--vh-line)]' : 'text-[var(--vh-muted)]')}>{tab}</span>)}
      </div>
      <p className="vh-display mt-4 text-[clamp(18px,2vw,26px)] tracking-[-0.03em]">People in your school</p>
      <p className="mt-1 max-w-[46ch] text-[13px] leading-5 text-[var(--vh-muted)]">Organization membership is separate from classroom enrollment.</p>
      <Panel className="mt-3 max-w-[52ch] py-2.5 text-[13px]"><span className="font-semibold">Robotics Class A</span><span className="ml-2 text-[var(--vh-muted)]">ROBOTICS-A</span></Panel>
    </Screen>
  );
}

export function UiVr() {
  return (
    <Screen>
      <p className="text-[13px] font-semibold">VR Learning Session</p>
      <p className="mt-1 text-[13px] text-[var(--vh-muted)]">Mode: VR Learning — Offline/Fake Follower</p>
      <p className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-[#FBF1DC] px-3 py-2 text-[12px] font-medium text-[#7A4D06]"><LockIcon className="h-3.5 w-3.5" aria-hidden />Physical Robot: LOCKED — hardware commissioning required.</p>
    </Screen>
  );
}

export function UiDemonstration() {
  return (
    <Screen>
      <p className="text-[13px] font-semibold">Teach by Demonstration</p>
      <div className="mt-3 grid max-w-[52ch] grid-cols-2 gap-2 text-[12px] leading-4">
        <Panel><span className="block font-semibold text-[13px]">Observation</span><span className="text-[var(--vh-muted)]">What the robot measured</span></Panel>
        <Panel><span className="block font-semibold text-[13px]">Action</span><span className="text-[var(--vh-muted)]">What the human commanded</span></Panel>
      </div>
      <p className="mt-3 text-[12px] font-medium text-[#1E7A48]">Recorded learning demonstration — no model training has run.</p>
    </Screen>
  );
}

/** Lock drawn from the VISTA mark's two strokes and dot. */
export function SafetyLock() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--vh-deep)]">
      <svg viewBox="0 0 120 140" role="img" aria-label="Lock symbol: the physical robot is locked" className="h-[58%] w-auto">
        <path d="M36 60 V44 a24 24 0 0 1 48 0 V60" fill="none" stroke="#A8DDD0" strokeWidth="9" strokeLinecap="round" />
        <rect x="18" y="58" width="84" height="70" rx="16" fill="#1E3A31" stroke="#A8DDD0" strokeWidth="3" />
        <path d="M44 80 L56 100 L60 92" stroke="#F7F6F3" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M76 80 L64 100 L60 92" stroke="#A8DDD0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="60" cy="112" r="4" fill="#A8DDD0" />
      </svg>
    </div>
  );
}

export function So101Light() {
  return (
    <div className="absolute inset-0 bg-[var(--vh-paper-2)]">
      <div className="absolute inset-x-[6%] bottom-[4%] top-[10%]">
        <So101Illustration tone="light" jaw="closed" crop={SO101_CROP} preserveAspectRatio="xMidYMax meet" title="Illustration of the SO-101 robot arm at rest" />
      </div>
    </div>
  );
}

/* ---- H4.1 fallbacks: line-art robot and the learning-loop stages (no fake form controls) ---- */

/** Single-arm SO-101 in line art, standing on the bottom edge of its box. */
export function RobotFigure({ tone, jaw = 'open', highlight = false, annotations = false }: { tone: 'dark' | 'light'; jaw?: 'open' | 'closed'; highlight?: boolean; annotations?: boolean }) {
  return <LabBay tone={tone} variant="line" jaw={jaw} highlight={highlight} annotations={annotations} floor={false} armClassName="inset-x-0 bottom-0 top-0" />;
}

function StageMarker() {
  return <span className="absolute bottom-3 right-3 z-10 rounded-[8px] bg-[var(--vh-ground)] px-2 py-0.5 text-[13px] font-medium text-[var(--vh-muted)]">Illustrative</span>;
}

function LoopCanvas({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('absolute inset-0 overflow-hidden bg-[var(--vh-surface)] text-[var(--vh-ink)]', className)}>{children}<StageMarker /></div>;
}

export function LoopLearn() {
  return (
    <LoopCanvas className="flex flex-col justify-between p-[clamp(20px,7%,48px)]">
      <div>
        <p className="vh-display text-[clamp(26px,2.6vw,40px)] leading-[1] tracking-[-0.035em]">Open &amp; Close Gripper</p>
        <p className="mt-3 max-w-[40ch] text-[clamp(14px,1.05vw,16px)] leading-[1.55] text-[var(--vh-muted)]">Choose the left arm, open its gripper, wait one second, then close it.</p>
      </div>
      <div className="max-w-[44ch] rounded-[14px] bg-[var(--vh-ground)] p-[clamp(14px,4%,24px)]">
        <p className="text-[clamp(14px,1.05vw,16px)] font-semibold">Your mission</p>
        <p className="mt-1.5 text-[clamp(14px,1.15vw,18px)] leading-[1.5]">Select the left arm. Open its gripper, wait at least one second, then close it.</p>
      </div>
      <p className="text-[14px] text-[var(--vh-muted)]">Lesson 1 of Robot Discovery</p>
    </LoopCanvas>
  );
}

export function LoopProgram() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-white bg-[radial-gradient(#E3E1DA_1.4px,transparent_1.4px)] [background-size:24px_24px]">
      <div className="absolute left-[9%] top-[12%] origin-top-left scale-[0.9] sm:scale-[1.08] lg:scale-[1.18]">
        <LessonBlocks activeIndex={null} />
      </div>
      <StageMarker />
    </div>
  );
}

export function LoopPreview() {
  return (
    <LoopCanvas className="bg-[var(--vh-ground)]">
      <div className="absolute inset-x-[14%] bottom-[22%] top-[8%]"><RobotFigure tone="light" jaw="closed" /></div>
      <div className="absolute inset-x-[8%] bottom-[9%] grid grid-cols-4 gap-1.5" aria-hidden>
        {LESSON_ONE.map((step) => <span key={step.id} className="h-2 rounded-full" style={{ backgroundColor: step.color }} />)}
      </div>
    </LoopCanvas>
  );
}

export function LoopEvaluate() {
  return (
    <LoopCanvas className="flex flex-col justify-center p-[clamp(20px,7%,56px)]">
      <p className="vh-display text-[clamp(22px,2.2vw,34px)] leading-[1.05] tracking-[-0.03em]">{LESSON_ONE_RULES.length} of {LESSON_ONE_RULES.length} rules passed</p>
      <ul className="mt-6 grid gap-2.5">
        {LESSON_ONE_RULES.map((rule) => (
          <li key={rule} className="flex items-center gap-3 rounded-[14px] bg-[var(--vh-ground)] px-5 py-4 text-[clamp(15px,1.25vw,18px)]">
            <CheckCircle2Icon className="h-5 w-5 shrink-0 text-[var(--vh-teal)]" aria-hidden />{rule}
          </li>
        ))}
      </ul>
    </LoopCanvas>
  );
}

export function LoopReflect() {
  return (
    <LoopCanvas className="flex flex-col justify-center p-[clamp(20px,8%,56px)]">
      <p className="vh-display max-w-[18ch] text-[clamp(24px,2.4vw,38px)] leading-[1.05] tracking-[-0.03em]">What did you learn from this submission?</p>
      <p className="mt-4 max-w-[38ch] text-[clamp(14px,1.1vw,16px)] leading-[1.55] text-[var(--vh-muted)]">Students answer in their own words after reading their teacher&rsquo;s feedback.</p>
    </LoopCanvas>
  );
}

export function renderHomeFallback(id: HomeFallbackId): ReactNode {
  switch (id) {
    case 'robot-dark': return <RobotFigure tone="dark" annotations />;
    case 'robot-light': return <RobotFigure tone="light" />;
    case 'loop-learn': return <LoopLearn />;
    case 'loop-program': return <LoopProgram />;
    case 'loop-preview': return <LoopPreview />;
    case 'loop-evaluate': return <LoopEvaluate />;
    case 'loop-reflect': return <LoopReflect />;
    case 'lab-bay': return <LabBay jaw="open" tone="dark" annotations />;
    case 'lesson-blocks': return <BlocklyGround />;
    case 'lesson-preview': return <LabBay jaw="open" tone="light" />;
    case 'ui-lesson': return <UiLesson />;
    case 'ui-program': return <UiProgram />;
    case 'ui-preview': return <UiPreview />;
    case 'ui-evaluate': return <UiEvaluate />;
    case 'ui-reflect': return <UiReflect />;
    case 'learning-stage': return <div className="absolute inset-0 bg-[var(--vh-ground)] p-[4%]"><LearningStage draw labelClassName="max-sm:hidden" /></div>;
    case 'ui-student': return <UiStudent />;
    case 'ui-teacher': return <UiTeacher />;
    case 'ui-school': return <UiSchool />;
    case 'ui-vr': return <UiVr />;
    case 'ui-demonstration': return <UiDemonstration />;
    case 'safety-lock': return <SafetyLock />;
    case 'so101-light': return <So101Light />;
    case 'stage-axonometric': return <StageAxonometric />;
    case 'role-student': return <RoleStudent />;
    case 'role-teacher': return <RoleTeacher />;
    case 'role-school': return <RoleSchool />;
    case 'mode-blockly': return <ModeBlockly />;
    case 'mode-vr': return <ModeVr />;
    case 'mode-demonstration': return <ModeDemonstration />;
    case 'safety-blocks': return <SafetyBlocks />;
    case 'mode-preview': return <ModePreview />;
    case 'safety-boundary': return <SafetyBoundary />;
  }
}
