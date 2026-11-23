import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CheckIcon, LockIcon, PauseIcon, PlayIcon, RotateCcwIcon, ScanEyeIcon } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { LESSON_ONE, LESSON_ONE_RULES } from '../../home/content/lessonOne';
import { BLOCKS, checkRules, describeStep, LESSON_ONE_PROGRAM } from '../../home-lab/lessonProgram';
import type { useLessonPlayer } from '../../home-lab/useLessonPlayer';
import { StageLoading } from '../StageLoading';
import { useV2Scene } from '../V2Scene';
import { ORBIT_KEYS, orbitFromDrag } from './orbitModel';

/**
 * The five stages of the lesson loop as designed panels (H7). Learn, Program, Evaluate and Reflect are
 * plain panels on the VISTA dark ground; Preview is a window onto the one shared 3D canvas, so the real
 * SO-101 plays lesson one in it. Everything shown is lesson one's own content (the seeded program, the
 * canonical steps, the seeded rules). Nothing here is a grade, a teacher's feedback or a robot command.
 */
const eyebrow = 'text-[clamp(12px,1.9cqw,14px)] font-semibold uppercase tracking-[0.08em] text-[var(--v2-teal)]';
const title = 'v2-display text-[clamp(22px,4.6cqw,40px)] font-medium leading-[1.05]';
const body = 'text-[clamp(14px,2.3cqw,17px)] leading-[1.45] text-[var(--v2-soft)]';
const panel = 'v2-panel absolute inset-0 flex flex-col gap-[clamp(10px,2.4cqh,22px)] overflow-hidden bg-[var(--v2-graphite-3)] p-[clamp(14px,3.2cqw,32px)]';

const RULE_EVIDENCE = [
  `step 1  ${describeStep(BLOCKS.select.step)}`,
  `steps 2 and 4  ${describeStep(BLOCKS.open.step)}, ${describeStep(BLOCKS.close.step)}`,
  'after step 4  jaw: closed',
];

/** 1. Learn: the mission briefing and the objectives. */
export function LearnPanel() {
  return (
    <div className={panel}>
      <p className={eyebrow}>Mission briefing</p>
      <h3 className={title}>Open &amp; Close Gripper</h3>
      <p className={cn(body, 'max-w-[52ch]')}>Make the SO-101’s left gripper open and then close, using four blocks. You will preview every step before you submit.</p>
      <div className="grid gap-[clamp(8px,1.6cqh,14px)] @container">
        <p className="text-[clamp(13px,2cqw,15px)] font-semibold text-[var(--v2-muted)]">By the end you can</p>
        <ol className="grid gap-[clamp(6px,1.4cqh,12px)]">
          {['Select the arm before you move its gripper', 'Open the gripper, then close it', 'End with the gripper closed'].map((objective, i) => (
            <li key={objective} className="grid grid-cols-[2ch_1fr] items-baseline gap-3 border-t border-[var(--v2-line)] pt-[clamp(6px,1.4cqh,12px)]">
              <span className="v2-num text-[clamp(13px,2cqw,15px)] text-[var(--v2-teal)]">{i + 1}</span>
              <span className="text-[clamp(14px,2.4cqw,18px)] leading-[1.35]">{objective}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-auto text-[clamp(12px,1.9cqw,14px)] text-[var(--v2-muted)]">{LESSON_ONE_PROGRAM.length} blocks · {LESSON_ONE_RULES.length} rules · preview only</p>
    </div>
  );
}

/** 2. Program: the block program as Blockly presents it, and the step each block compiles to. */
export function ProgramPanel() {
  return (
    <div className={panel}>
      <p className={eyebrow}>Practice · block programming</p>
      <div className="v2-split grid min-h-0 flex-1 content-start gap-[clamp(10px,2.4cqw,24px)]">
        <div role="img" aria-label="Lesson one as blocks: use left arm, then open gripper, wait 1 second and close gripper" className="grid content-start gap-[3px] rounded-[6px] bg-[var(--v2-void)] p-[clamp(10px,2.2cqw,20px)]">
          {LESSON_ONE.map((s, i) => (
            <span key={s.id} style={{ backgroundColor: s.color, marginLeft: s.inner ? 'clamp(10px,2.4cqw,22px)' : 0 }} className="rounded-[4px] px-3 py-[clamp(6px,1.5cqh,11px)] text-[clamp(13px,2.2cqw,16px)] font-semibold text-white">
              {BLOCKS[LESSON_ONE_PROGRAM[i]].label}
            </span>
          ))}
        </div>
        <ol aria-label="The step each block compiles to" className="grid content-start gap-[clamp(4px,1cqh,8px)]">
          {LESSON_ONE_PROGRAM.map((kind, i) => (
            <li key={kind + i} className="grid grid-cols-[2ch_1fr] items-center gap-2 border-b border-[var(--v2-line)] py-[clamp(5px,1.2cqh,10px)]">
              <span className="v2-num text-[clamp(12px,1.9cqw,14px)] text-[var(--v2-muted)]">{i + 1}</span>
              <code className="v2-mono truncate text-[clamp(12px,1.9cqw,14px)] text-[var(--v2-soft)]">{describeStep(BLOCKS[kind].step)}</code>
            </li>
          ))}
        </ol>
      </div>
      <p className={cn(body, 'mt-auto max-w-[56ch]')}>Each block compiles to one canonical step. Work saves to the assignment as you build.</p>
    </div>
  );
}

type Player = ReturnType<typeof useLessonPlayer>;

/** 3. Preview: the window onto the real SO-101, with the transport, timeline and view controls. */
export function PreviewPanel({ player }: { player: Player }) {
  const { scene, ready, mode, status } = useV2Scene();
  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null);
  const live = mode === '3d';

  const orbit = (azimuth: number, elevation: number, instant = false) => scene.current?.setUserOrbit(azimuth, elevation, instant);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = scene.current; if (!s || e.pointerType === 'touch') return;
    drag.current = { x: e.clientX, y: e.clientY, az: s.userOrbit.azimuth, el: s.userOrbit.elevation };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const next = orbitFromDrag(d, e.clientX - d.x, e.clientY - d.y);
    orbit(next.azimuth, next.elevation);
  };
  const onUp = () => { drag.current = null; };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = scene.current; if (!s) return;
    if (e.key === 'Home') { e.preventDefault(); s.resetUserOrbit(); return; }
    const k = ORBIT_KEYS[e.key]; if (!k) return;
    e.preventDefault();
    const o = s.userOrbit; orbit(o.azimuth + k[0], o.elevation + k[1]);
  };
  // Touch: one finger scrolls the page; the view buttons and keys orbit instead.
  const nudge = (da: number) => { const o = scene.current?.userOrbit; if (o) orbit(o.azimuth + da, o.elevation); };

  const { index, playing, state, block, last } = player;
  const btn = 'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-[4px] border border-[var(--v2-line-strong)] bg-[rgb(8_9_10/0.85)] px-3 text-[14px] font-semibold transition-colors duration-150 hover:border-[var(--v2-teal)]';
  return (
    <div className="v2-panel pointer-events-none absolute inset-0">
      {/* The window: transparent, so the shared canvas shows through it. */}
      <div data-stage-window className="absolute inset-0">
        <StageLoading />
      </div>
      {live && ready && (
        <div role="group" tabIndex={0} aria-label="3D view of the SO-101. Drag or use the arrow keys to orbit, Home to reset the view." data-testid="journey-orbit"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
          className="pointer-events-auto absolute inset-x-0 top-0 bottom-[clamp(96px,22cqh,132px)] cursor-grab touch-pan-y rounded-[3px] active:cursor-grabbing focus-visible:outline-offset-[-3px]" />
      )}
      <p className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-[4px] bg-[rgb(8_9_10/0.85)] px-2 py-1 text-[clamp(12px,1.9cqw,13px)] text-[var(--v2-soft)]" data-testid="sim-only">
        <LockIcon className="h-3.5 w-3.5" aria-hidden />Simulation only<span className="v2-narrow-sr"> · no robot commands</span>
      </p>
      {live && (
        <div className="pointer-events-auto absolute right-3 top-3 flex gap-2">
          <button type="button" className={cn(btn, 'px-2')} aria-label="Orbit left" onClick={() => nudge(-0.3)}>←</button>
          <button type="button" className={cn(btn, 'px-2')} aria-label="Orbit right" onClick={() => nudge(0.3)}>→</button>
          <button type="button" className={btn} onClick={() => scene.current?.resetUserOrbit()}><ScanEyeIcon className="h-4 w-4" aria-hidden /><span className="v2-narrow-sr">Reset view</span></button>
        </div>
      )}
      {mode === 'poster' && <p className="absolute inset-x-6 top-1/3 text-center text-[15px] text-[var(--v2-soft)]">The live 3D arm needs WebGL. The steps below still play, with the jaw state written out.</p>}
      {status === 'error' && live && <p className="sr-only">The 3D preview could not start.</p>}

      <div className="pointer-events-auto absolute inset-x-0 bottom-0 grid gap-2 bg-[var(--v2-void)] px-[clamp(12px,2.4cqw,24px)] pb-3 pt-3">
        <div className="flex items-center gap-3">
          {playing
            ? <button type="button" className={cn(btn, 'w-11 px-0')} onClick={player.pause} aria-label="Pause"><PauseIcon className="h-4 w-4" aria-hidden /></button>
            : <button type="button" className={cn(btn, 'w-11 border-transparent bg-[var(--v2-text)] px-0 text-[var(--v2-void)] hover:bg-[var(--v2-teal)]')} onClick={player.play} aria-label={index >= last ? 'Replay' : 'Play'}><PlayIcon className="h-4 w-4" aria-hidden /></button>}
          <button type="button" className={cn(btn, 'w-11 px-0')} onClick={player.reset} aria-label="Reset to the start"><RotateCcwIcon className="h-4 w-4" aria-hidden /></button>
          <ol aria-label="Preview timeline" className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
            {LESSON_ONE.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => player.go(i)} aria-current={i === index ? 'step' : undefined} aria-label={`Step ${i + 1}: ${BLOCKS[LESSON_ONE_PROGRAM[i]].label}`}
                  className="group grid h-11 w-full content-center gap-1.5 text-left">
                  <span aria-hidden className="h-[4px] w-full rounded-full transition-colors duration-300" style={{ backgroundColor: i <= index ? s.color : 'rgba(238,242,240,0.14)', outline: i === index ? '2px solid var(--v2-teal)' : 'none', outlineOffset: 2 }} />
                  <span className={cn('v2-hide-narrow truncate text-[12px] font-semibold', i === index ? 'text-[var(--v2-text)]' : 'text-[var(--v2-muted)]')}>{BLOCKS[LESSON_ONE_PROGRAM[i]].label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <p className="min-h-[2.8em] text-[clamp(13px,2cqw,15px)] leading-[1.4]" aria-live={playing ? 'off' : 'polite'} data-testid="journey-note">
          {block ? <code className="v2-mono mr-2 text-[var(--v2-teal)]">{describeStep(block.step)}</code> : <span className="mr-2 font-semibold text-[var(--v2-teal)]">Start</span>}
          <span className="text-[var(--v2-soft)]">{index < 0 && !playing ? 'Press play to watch lesson one run on the SO-101 model.' : state.note}</span>
          <span className="v2-num ml-2 text-[var(--v2-muted)]" data-testid="journey-jaw">jaw: {state.jaw}</span>
        </p>
      </div>
    </div>
  );
}

/** 4. Evaluate: the validation checklist, read from the preview trace. */
export function EvaluatePanel() {
  const rules = checkRules(LESSON_ONE_PROGRAM);
  return (
    <div className={panel}>
      <p className={eyebrow}>Validation checklist</p>
      <h3 className={title}>{rules.filter((r) => r.passed).length} of {rules.length} rules read as passed</h3>
      <ul className="grid gap-[clamp(6px,1.6cqh,14px)]">
        {rules.map((r, i) => (
          <li key={r.rule} className="grid grid-cols-[22px_1fr] gap-x-3 border-t border-[var(--v2-line)] pt-[clamp(6px,1.4cqh,12px)]">
            <span aria-hidden className="mt-0.5 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--v2-teal-dim)] text-[var(--v2-teal)]"><CheckIcon className="h-3.5 w-3.5" /></span>
            <span className="text-[clamp(14px,2.4cqw,18px)] leading-[1.3]">{r.rule}<span className="sr-only">{r.passed ? ', passed' : ', not passed'}</span></span>
            <code className="v2-mono col-start-2 text-[clamp(12px,1.9cqw,14px)] break-words leading-[1.4] text-[var(--v2-muted)]">{RULE_EVIDENCE[i]}</code>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-[clamp(12px,1.9cqw,14px)] leading-[1.4] text-[var(--v2-muted)]">Rule checks show what each rule found in the preview trace. They are not a grade; the real check runs on the VISTA server when you submit.</p>
    </div>
  );
}

/** 5. Reflect: outcomes and the reflection the learner writes after the teacher responds. */
export function ReflectPanel() {
  return (
    <div className={panel}>
      <p className={eyebrow}>Outcomes &amp; reflection</p>
      <h3 className={title}>Say what you learned</h3>
      <div className="v2-split grid gap-[clamp(8px,1.8cqh,16px)]">
        <section aria-labelledby="reflect-prompts" className="grid content-start gap-[clamp(6px,1.4cqh,12px)]">
          <h4 id="reflect-prompts" className="text-[clamp(13px,2cqw,15px)] font-semibold text-[var(--v2-muted)]">Reflection prompts</h4>
          <ul className="grid gap-[clamp(6px,1.4cqh,12px)]">
            {['What did each block make the arm do?', 'Which rule was easiest to satisfy, and why?', 'What would you change before a harder lesson?'].map((q) => (
              <li key={q} className="border-t border-[var(--v2-line)] pt-[clamp(6px,1.4cqh,12px)] text-[clamp(14px,2.3cqw,17px)] leading-[1.35]">{q}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="reflect-feedback" className="grid content-start gap-[clamp(6px,1.4cqh,12px)]">
          <h4 id="reflect-feedback" className="text-[clamp(13px,2cqw,15px)] font-semibold text-[var(--v2-muted)]">Your teacher’s feedback</h4>
          <p className="rounded-[6px] border border-dashed border-[var(--v2-line-strong)] p-[clamp(10px,2cqw,18px)] text-[clamp(13px,2.1cqw,16px)] leading-[1.45] text-[var(--v2-soft)]">Appears here after your teacher reviews the submission. Reflection opens once the assessment is done.</p>
        </section>
      </div>
      <p className="v2-num mt-auto text-[clamp(12px,1.9cqw,14px)] text-[var(--v2-muted)]">Lesson one: {LESSON_ONE_PROGRAM.length} blocks · {LESSON_ONE_PROGRAM.length} preview steps · {checkRules(LESSON_ONE_PROGRAM).filter((r) => r.passed).length} of {LESSON_ONE_RULES.length} rules read as passed</p>
    </div>
  );
}
