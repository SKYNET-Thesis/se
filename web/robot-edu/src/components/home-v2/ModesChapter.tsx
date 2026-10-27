import { useEffect, useMemo, useReducer, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { CircleIcon, PlayIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../utils/cn';
import { homeAssets, isApproved } from '../home/media/homeAssets';
import { useReveal } from '../home/useReveal';
import { JAW } from '../home-lab/jaw';
import { BLOCKS, describeStep, LESSON_ONE_PROGRAM, simulate } from '../home-lab/lessonProgram';
import { COVERED_ELSEWHERE, LEARNING_EXPERIENCES, type Availability, type InteractionKind, type LearningExperience } from './modes/experiences';
import { followerPose, initialModesState, isDrag, modesReducer, nextTab, padKey, padTarget, sampleAt, SAMPLE_EPISODE, SAMPLE_MS, type ModesAction, type ModesState } from './modes/model';
import { FollowerGauges } from './modes/FollowerGauges';
import { EpisodeLanes, LockNote, ProgramTrace, StageNote } from './modes/overlays';
import { StageLoading } from './StageLoading';
import { V2Media } from './V2Media';
import { useV2Scene } from './V2Scene';

const STATES = simulate(LESSON_ONE_PROGRAM);
const LAST = LESSON_ONE_PROGRAM.length - 1;

function AvailabilityMark({ availability, where }: { availability: Availability; where: string }) {
  return (
    <p className="mt-4 inline-flex items-start gap-2 text-[14px] font-semibold">
      <span aria-hidden className={cn('mt-[0.3em] h-2.5 w-2.5 shrink-0 rounded-[2px]', availability === 'practice' ? 'bg-[var(--v2-teal)]' : 'border-2 border-[#aeb9c7]')} />{where}
    </p>
  );
}

/**
 * The hand pad. A press that stays within the drag threshold is a tap: the hand moves there on release.
 * Past the threshold the hand follows the pointer. A press the browser turns into a page scroll is
 * cancelled and moves nothing. `touch-action: none` applies inside the pad only.
 */
function HandPad({ state, dispatch }: { state: ModesState; dispatch: (a: ModesAction) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const to = (e: ReactPointerEvent) => { const r = pad.current?.getBoundingClientRect(); if (r) dispatch({ type: 'move', hand: padTarget(e.clientX, e.clientY, r) }); };
  const onKey = (e: KeyboardEvent) => {
    const next = padKey(e.key, state.hand, state.grip);
    if (!next) return;
    e.preventDefault();
    if (next.hand !== state.hand) dispatch({ type: 'move', hand: next.hand });
    if (next.grip !== state.grip) dispatch({ type: 'grip', grip: next.grip });
  };
  const replaying = state.status === 'replaying';
  return (
    <div ref={pad} role="application" tabIndex={0} aria-describedby="v2-modes-pad-help v2-modes-pad-readout"
      aria-label="Hand pad" aria-disabled={replaying || undefined} onKeyDown={onKey}
      onPointerDown={(e) => { if (replaying) return; press.current = { x: e.clientX, y: e.clientY, dragging: false }; pad.current?.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const p = press.current; if (!p) return; if (!p.dragging && isDrag(e.clientX - p.x, e.clientY - p.y)) p.dragging = true; if (p.dragging) to(e); }}
      onPointerUp={(e) => { const p = press.current; press.current = null; if (p && !p.dragging) to(e); }}
      onPointerCancel={() => { press.current = null; }}
      className={cn('relative aspect-square w-[min(100%,clamp(200px,28svh,300px))] shrink-0 touch-none select-none rounded-[10px] bg-[rgb(8_9_10/0.70)]', replaying && 'opacity-60')}>
      <span aria-hidden className="absolute inset-[12%] rounded-[6px] bg-white/[0.03]" />
      <span aria-hidden className="pointer-events-none absolute h-0 w-0" style={{ left: `${50 + state.hand.x * 50}%`, top: `${50 + state.hand.y * 50}%` }}>
        <span className={cn('absolute -left-8 -top-8 grid h-16 w-16 place-items-center rounded-full transition-transform duration-150', state.grip ? 'scale-90 bg-[var(--v2-teal)]' : 'bg-[var(--v2-text)]')}>
          <span className="h-3 w-3 rounded-full bg-[var(--v2-void)]" />
        </span>
      </span>
      <span id="v2-modes-pad-help" className="pointer-events-none absolute bottom-3 left-4 right-4 text-[13px] text-[var(--v2-muted)]">Drag or tap. Keys: arrows move, Space grips, Home centres.</span>
      <span id="v2-modes-pad-readout" className="sr-only" aria-live="polite">Hand {Math.round((state.hand.x + 1) * 50)}% across, {Math.round((1 - state.hand.y) * 50)}% up, grip {state.grip ? 'closed' : 'open'}.</span>
    </div>
  );
}

const secondary = 'inline-flex h-11 items-center gap-2 rounded-[4px] bg-[var(--v2-graphite-3)] px-4 text-[14px] font-semibold transition-[background-color,transform] duration-150 hover:bg-white/[0.12] active:scale-[0.98] disabled:opacity-40';

/**
 * Phone framing per kind (H6.9 CP3, measured from the arm's projected bounds): a centred arm, kept clear of
 * that kind's overlay (the gauges strip sits low, the timeline docks at the foot). `fit` multiplies the preset's.
 */
const PHONE_FRAME: Record<InteractionKind, { fit: number; ay: number }> = {
  program: { fit: 1.35, ay: 0.44 },
  follower: { fit: 1.4, ay: 0.36 },
  episode: { fit: 1.15, ay: 0.5 },
};

/** Each interaction kind: its control (in the field) and its overlay (on the stage). */
const KINDS: Record<InteractionKind, {
  control: (s: ModesState, d: (a: ModesAction) => void) => ReactNode;
  stage: (s: ModesState, illustrative: boolean) => ReactNode;
}> = {
  program: {
    control: (s, d) => (
      <div className="grid gap-4">
        <div role="group" aria-label="Preview a step of lesson one" className="grid grid-cols-2 gap-2">
          {LESSON_ONE_PROGRAM.map((kind, i) => (
            <button key={kind + i} type="button" aria-pressed={s.step === i} onClick={() => d({ type: 'step', step: i })}
              className={cn('flex min-h-[52px] items-center rounded-[8px] px-4 text-left text-[16px] font-semibold text-white transition-[transform,opacity] duration-150 active:scale-[0.98]', s.step === i ? 'ring-2 ring-[var(--v2-teal)] ring-offset-2 ring-offset-[var(--v2-graphite-2)]' : 'opacity-80 hover:opacity-100')}
              style={{ backgroundColor: BLOCKS[kind].color }}>{BLOCKS[kind].label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => d({ type: 'play', last: LAST })} className="inline-flex h-12 items-center gap-2 rounded-[4px] bg-[var(--v2-text)] px-5 text-[15px] font-semibold text-[var(--v2-void)] transition-[background-color,transform] duration-150 hover:bg-[var(--v2-teal)] active:scale-[0.98]">
            {s.step >= LAST && !s.playing ? <RotateCcwIcon className="h-4 w-4" aria-hidden /> : <PlayIcon className="h-4 w-4" aria-hidden />}{s.step >= LAST && !s.playing ? 'Play again' : 'Play all four'}
          </button>
          <p className="text-[14px] text-[var(--v2-soft)]" aria-live="polite">{s.step < 0 ? 'Start: gripper open, no arm selected.' : STATES[s.step].note}</p>
        </div>
      </div>
    ),
    // What is learned here is sequencing: the code column stands beside the arm. On phones, where the
    // blocks sit right under the stage, only the step now playing is shown, so the arm stays in view.
    stage: (s) => (
      <>
        <div className="absolute bottom-4 left-4 top-14 hidden w-[min(400px,44%)] flex-col justify-end gap-2 sm:flex">
          <p className="text-[13px] font-semibold text-[var(--v2-soft)]">Lesson one, compiled</p>
          <ProgramTrace index={s.step} />
        </div>
        <StageNote className="absolute bottom-3 left-3 sm:hidden">
          {s.step < 0 ? 'Choose a block below to preview its step.' : <code className="v2-mono text-[13px] text-[var(--v2-teal)]">{describeStep(BLOCKS[LESSON_ONE_PROGRAM[s.step]].step)}</code>}
        </StageNote>
      </>
    ),
  },
  follower: {
    control: (s, d) => (
      <div className="flex flex-wrap items-end gap-4">
        <HandPad state={s} dispatch={d} />
        <button type="button" onClick={() => d({ type: 'grip' })} aria-pressed={s.grip} className={secondary}>{s.grip ? 'Open the grip' : 'Close the grip'}</button>
      </div>
    ),
    stage: (s) => (
      <>
        <StageNote className="absolute left-4 top-3 max-sm:top-12">Simulated follower, offline</StageNote>
        {/* What is learned here is the mapping from a hand to the joints: gauges across each joint's limit. */}
        <FollowerGauges hand={s.hand} className="absolute bottom-4 left-4 max-sm:bottom-3 max-sm:left-3 max-sm:right-3" />
      </>
    ),
  },
  episode: {
    control: (s, d) => (
      <div className="flex flex-wrap items-end gap-4">
        <HandPad state={s} dispatch={d} />
        <div className="flex flex-wrap items-start gap-2 xl:max-w-[200px] xl:flex-col">
          <button type="button" onClick={() => d({ type: s.status === 'recording' ? 'stop' : 'record' })} aria-pressed={s.status === 'recording'} disabled={s.status === 'replaying'}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#e0b25a] px-5 text-[14px] font-semibold text-[var(--v2-void)] transition-[background-color,transform] duration-150 hover:bg-[var(--v2-text)] active:scale-[0.98] disabled:opacity-40">
            {s.status === 'recording' ? <SquareIcon className="h-4 w-4" aria-hidden /> : <CircleIcon className="h-4 w-4 fill-current" aria-hidden />}{s.status === 'recording' ? 'Stop recording' : 'Record an episode'}
          </button>
          <button type="button" onClick={() => d({ type: 'replay' })} disabled={s.status !== 'idle' || s.samples.length < 2} className={secondary}><PlayIcon className="h-4 w-4" aria-hidden />Replay</button>
          <button type="button" onClick={() => d({ type: 'grip' })} aria-pressed={s.grip} disabled={s.status === 'replaying'} className={secondary}>{s.grip ? 'Open the grip' : 'Close the grip'}</button>
        </div>
      </div>
    ),
    // What is learned here is an episode over time: a timeline docked along the foot of the stage.
    stage: (s, illustrative) => <EpisodeLanes samples={s.samples} cursor={s.status === 'replaying' ? s.cursor : 0} recording={s.status === 'recording'} illustrative={illustrative} className="absolute inset-x-0 bottom-0 rounded-none px-[var(--v2-margin)] lg:px-5" />,
  },
};

/**
 * S6 — ways to learn with the SO-101 (H6.6: the approved Interactive Learning Lab). Choose an
 * experience; its control sits beside the shared 3D stage and the arm answers at once. Each experience
 * brings its own camera and light preset (eased by the scene director), and its name and words arrive
 * in reading order, as in the cinematic concept. Nothing loops and nothing is pinned; the scene renders
 * only while something moves. Everything here is an illustration on this page; each experience says
 * where it really runs, and every stage shows the physical robot locked.
 */
export function ModesChapter() {
  const reveal = useReveal<HTMLElement>(0.12);
  const { scene, ready, mode, setModesPreset } = useV2Scene();
  const [state, dispatch] = useReducer(modesReducer, SAMPLE_EPISODE, initialModesState);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const exp: LearningExperience = LEARNING_EXPERIENCES[state.index];
  const kind = KINDS[exp.kind];
  const illustrative = state.samples === SAMPLE_EPISODE;

  // The director stages each experience with its own preset; hand it back when the chapter unmounts.
  // Phones: the stage is a narrow 4:3 with nothing beside the arm, so it is centred and framed a little
  // wider, whole in the window (H6.9; the arm was cut at the right edge).
  const phone = useMediaQuery('(max-width: 639px)');
  const preset = useMemo(() => (phone ? { ...exp.preset, rig: { ...exp.preset.rig, ax: 0.5, ...PHONE_FRAME[exp.kind], fit: exp.preset.rig.fit * PHONE_FRAME[exp.kind].fit } } : exp.preset), [exp.preset, exp.kind, phone]);
  useEffect(() => { setModesPreset(preset); }, [preset, setModesPreset]);
  useEffect(() => () => setModesPreset(null), [setModesPreset]);

  const onTabKey = (e: KeyboardEvent) => {
    const n = nextTab(e.key, state.index, LEARNING_EXPERIENCES.length);
    if (n === null) return;
    e.preventDefault(); dispatch({ type: 'select', index: n }); tabs.current[n]?.focus();
  };

  // Program and preview: playback advances one step a second.
  useEffect(() => {
    if (!state.playing) return undefined;
    const t = window.setTimeout(() => dispatch({ type: 'advance', last: LAST }), state.step < 0 ? 300 : 1000);
    return () => window.clearTimeout(t);
  }, [state.playing, state.step]);

  // Recording: sample the hand every 100 ms. Replay: move the cursor on animation frames.
  useEffect(() => {
    if (state.status !== 'recording') return undefined;
    const t0 = performance.now();
    const id = window.setInterval(() => dispatch({ type: 'sample', t: performance.now() - t0 }), SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [state.status]);
  useEffect(() => {
    if (state.status !== 'replaying') return undefined;
    const t0 = performance.now(); let raf = 0;
    const step = () => { dispatch({ type: 'cursor', t: performance.now() - t0 }); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state.status]);

  // The arm: lesson one's jaw for Program and preview; the follower for the others.
  const replayed = state.status === 'replaying' ? sampleAt(state.samples, state.cursor) : null;
  const hand = replayed ?? state.hand; const grip = replayed ? replayed.grip : state.grip;
  useEffect(() => {
    const s = scene.current; if (!ready || !s) return;
    if (exp.kind === 'program') {
      const jaw = state.step >= 0 ? STATES[state.step].jaw : 'open';
      s.setPose({ Jaw: jaw === 'open' ? JAW.open : JAW.closed });
      s.setGlow(state.step >= 0 && LESSON_ONE_PROGRAM[state.step] === 'select' ? 1 : 0);
    } else s.setPose(followerPose(hand, grip));
  }, [ready, scene, exp.kind, state.step, hand.x, hand.y, grip, hand]);

  const approved = exp.assets.filter((id) => isApproved(homeAssets[id]));

  return (
    <section id="v2-modes" ref={reveal} data-scene="modes" aria-labelledby="v2-modes-title" className="v2-anchor v2-anchor-tight v2-reveal relative z-10">
      {/* Only the stage window is see-through onto the shared canvas; every other part is opaque. */}
      {/* A short band, so heading, index, stage and controls share one screen on a laptop. */}
      <div className="grid gap-6 bg-[var(--v2-graphite)] px-[var(--v2-margin)] pb-6 pt-[var(--v2-section)] lg:grid-cols-12 lg:items-end lg:gap-10 lg:pb-[clamp(20px,3.5svh,40px)]">
        <div className="lg:col-span-5">
          <h2 id="v2-modes-title" data-reveal className="v2-display max-w-[14ch] text-[length:var(--v2-head)] font-medium">Ways to learn with the SO-101</h2>
          <p data-reveal style={{ ['--d' as string]: 80 }} className="mt-4 max-w-[46ch] text-[16px] leading-[1.55] text-[var(--v2-soft)]">Try each experience on the arm below. They run on this page as illustrations; each one says where it runs in VISTA.</p>
        </div>
        {/* The experience index: three names on the anchor line; the chosen one is lit and marked, not boxed. */}
        <div role="tablist" aria-label="Learning experiences" onKeyDown={onTabKey} data-reveal style={{ ['--d' as string]: 160 }} className="grid grid-cols-3 gap-x-4 gap-y-2 lg:col-span-7 lg:gap-x-8">
          {LEARNING_EXPERIENCES.map((e, i) => (
            <button key={e.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`v2-modes-tab-${e.id}`} aria-selected={i === state.index} aria-controls="v2-modes-panel" tabIndex={i === state.index ? 0 : -1}
              onClick={() => dispatch({ type: 'select', index: i })}
              className={cn('group flex min-h-11 flex-col justify-end gap-1.5 pb-1 text-left transition-colors duration-200', i === state.index ? 'text-[var(--v2-text)]' : 'text-[var(--v2-muted)] hover:text-[var(--v2-soft)]')}>
              <span aria-hidden className={cn('mb-2 h-[3px] rounded-full transition-[width,background-color] duration-500 ease-[var(--v2-ease)]', i === state.index ? 'w-10 bg-[var(--v2-teal)]' : 'w-4 bg-white/20 group-hover:w-6')} />
              <span className="text-[clamp(15px,1.3vw,20px)] font-semibold leading-tight">{e.name}</span>
              <span className="text-[13px] text-[var(--v2-muted)]">{e.availability === 'practice' ? 'In Practice' : 'Its own session'}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="v2-modes-panel" role="tabpanel" aria-labelledby={`v2-modes-tab-${exp.id}`} className="grid lg:grid-cols-12">
        {/* The stage window: 4:3 on narrow screens. On wide ones the row is sized to what is left of the screen
            under the band (never taller), and grows only if the controls need more (reflow, never clipped). */}
        <div data-stage-window className="relative aspect-[4/3] overflow-hidden md:aspect-[16/10] lg:col-span-7 lg:aspect-auto lg:min-h-[clamp(380px,calc(100svh-var(--v2-header)-250px),720px)]">
          <StageLoading />
          {LEARNING_EXPERIENCES.map((e) => (
            <div key={e.id} aria-hidden={e.id !== exp.id} className={cn('v2-modes-layer absolute inset-0', e.id === exp.id && 'is-on')}>
              {KINDS[e.kind].stage(state, illustrative)}
            </div>
          ))}
          <LockNote className="absolute right-4 top-3" />
          {mode === 'poster' && <p className="absolute inset-x-4 top-1/3 text-center text-[15px] text-[var(--v2-soft)]">The live 3D arm is not shown here; the controls and traces still respond.</p>}
        </div>
        {/* The console: one surface for all three experiences; the experience's name, its control, then where it runs. */}
        <div className="flex flex-col gap-[clamp(16px,2.6svh,28px)] bg-[var(--v2-graphite-2)] px-[var(--v2-margin)] py-[clamp(20px,3.4svh,36px)] lg:col-span-5 lg:px-[clamp(24px,2.6vw,44px)]">
          <div key={exp.id} className="v2-modes-in">
            <h3 className="v2-display text-[clamp(24px,2vw,34px)] font-medium">{exp.name}</h3>
            <p className="mt-2 max-w-[40ch] text-[17px] leading-[1.45]">{exp.outcome}</p>
          </div>
          {kind.control(state, dispatch)}
          <div key={`${exp.id}-about`} className="v2-modes-in">
            <AvailabilityMark availability={exp.availability} where={exp.where} />
            <p className="mt-1.5 max-w-[48ch] text-[14px] leading-[1.5] text-[var(--v2-soft)]">{exp.illustration}</p>
            <p className="mt-1.5 max-w-[48ch] text-[14px] leading-[1.5] text-[var(--v2-muted)]">{exp.limits}</p>
          </div>
          {/* Owner-approved media of the real experience appear here once the manifest marks them approved. */}
          {approved.length > 0 && <V2Media id={approved[0]} caption="In VISTA" />}
        </div>
      </div>
      <p className="bg-[var(--v2-graphite)] px-[var(--v2-margin)] pb-[var(--v2-section)] pt-6 text-[14px] lg:pb-[clamp(40px,8svh,96px)] text-[var(--v2-muted)]">{COVERED_ELSEWHERE[0].name}: <a href={COVERED_ELSEWHERE[0].href} className="underline underline-offset-4 hover:text-[var(--v2-text)]">{COVERED_ELSEWHERE[0].text}</a></p>
    </section>
  );
}
