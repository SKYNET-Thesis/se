import { useEffect, useId, useRef, useState } from 'react';
import { CheckIcon, LockIcon, PauseIcon, PlayIcon, PlusIcon, RotateCcwIcon, Undo2Icon, XIcon } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../utils/cn';
import { BLOCKS, checkRules, describeStep, LESSON_ONE_PROGRAM, type BlockKind } from '../home-lab/lessonProgram';
import { useLessonPlayer } from '../home-lab/useLessonPlayer';
import { StageLoading } from './StageLoading';
import { useV2Scene } from './V2Scene';
import { useReveal } from '../home/useReveal';

const PALETTE: BlockKind[] = ['select', 'open', 'wait', 'close'];
const MAX_BLOCKS = 8;
const control = 'inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[4px] border border-[var(--v2-line-strong)] px-3 text-[14px] font-semibold transition-colors duration-150 hover:bg-white/[0.06] disabled:opacity-35';

/** Compact toolbox: one "Add block" button that opens the four blocks in place (progressive disclosure). */
function AddBlockMenu({ onAdd, disabled }: { onAdd: (kind: BlockKind) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey); document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);
  return (
    <div className="relative">
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-1.5 rounded-[4px] bg-[var(--v2-graphite-3)] px-3 text-[13px] font-semibold transition-colors duration-150 hover:bg-white/[0.12] disabled:opacity-40">
        <PlusIcon className="h-3.5 w-3.5" aria-hidden />Add block
      </button>
      <div ref={menu} id={id} hidden={!open} role="group" aria-label="Toolbox: add a block" className={cn('v2-pop absolute bottom-[calc(100%+8px)] left-0 z-30 w-max gap-1 rounded-[6px] bg-[var(--v2-graphite-3)] p-1.5', open ? 'grid' : 'hidden')}>
        {PALETTE.map((kind) => (
          <button key={kind} type="button" onClick={() => { onAdd(kind); setOpen(false); button.current?.focus(); }} aria-label={`Add ${BLOCKS[kind].label}`}
            className="flex h-11 items-center gap-2.5 rounded-[4px] px-3 text-left text-[14px] font-semibold hover:bg-white/[0.07]">
            <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: BLOCKS[kind].color }} aria-hidden />{BLOCKS[kind].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * S2 — the signature lab. Concept A's reading (block → compiled step → the gripper, joined by a
 * signal line) with Concept B's hands-on editing (add and remove blocks, play or scrub the
 * execution, rules that react). The model is the tested lesson one program; the canonical steps are
 * the ones the app compiles. It drives a 3D preview only: the physical robot stays locked.
 */
export function LessonLabChapter() {
  const { scene, ready, active, mode, reduce, setLean } = useV2Scene();
  const reveal = useReveal<HTMLElement>(0.2);
  const compact = useMediaQuery('(max-width: 1023px)');
  const [program, setProgram] = useState<BlockKind[]>(LESSON_ONE_PROGRAM);
  const player = useLessonPlayer(program, scene, ready);
  const rules = checkRules(program);
  const signal = useRef<SVGPathElement>(null);
  const activeRow = useRef<HTMLElement | null>(null);
  const [pulse, setPulse] = useState(0);
  const showSignal = mode === '3d' && !compact && active === 'lesson' && player.index >= 0;

  useEffect(() => { setPulse((p) => p + 1); }, [player.index]);

  // The camera leans in while the program plays.
  useEffect(() => { setLean(player.playing && !reduce); }, [player.playing, reduce, setLean]);
  useEffect(() => () => setLean(false), [setLean]);

  // When a run reaches its last step, the rule checks read the finished trace: they pulse in order.
  const wasPlaying = useRef(false);
  const [checkRun, setCheckRun] = useState(0);
  useEffect(() => {
    if (player.index === player.last && player.last >= 0 && wasPlaying.current) setCheckRun((n) => n + 1);
    wasPlaying.current = player.playing;
  }, [player.index, player.last, player.playing]);

  // The signal runs from the active step to the gripper's projected position, every frame.
  useEffect(() => {
    const s = scene.current;
    if (!ready || !s || compact) return undefined;
    return s.onFrame(() => {
      const path = signal.current; const row = activeRow.current; const jaw = s.project('Jaw');
      if (!path || !row || !jaw) return;
      const r = row.getBoundingClientRect();
      const x1 = r.right + 8, y1 = r.top + r.height / 2;
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + 90} ${y1}, ${jaw.x - 140} ${jaw.y}, ${jaw.x} ${jaw.y}`);
    });
  }, [ready, compact, scene]);

  const add = (kind: BlockKind) => setProgram((p) => (p.length >= MAX_BLOCKS ? p : [...p, kind]));
  const remove = (index: number) => setProgram((p) => p.filter((_, i) => i !== index));
  const reset = () => { setProgram(LESSON_ONE_PROGRAM); player.reset(); };

  const toolbox = (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Toolbox: add a block">
      {PALETTE.map((kind) => (
        <button key={kind} type="button" onClick={() => add(kind)} disabled={program.length >= MAX_BLOCKS} aria-label={`Add ${BLOCKS[kind].label}`}
          className="inline-flex h-11 items-center gap-2 rounded-[4px] border border-[var(--v2-line-strong)] px-3 text-[14px] font-semibold transition-colors duration-150 hover:border-[var(--v2-teal)] disabled:opacity-40 max-lg:h-10 max-lg:px-2.5 max-lg:text-[13px]">
          <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: BLOCKS[kind].color }} aria-hidden /><PlusIcon className="h-3.5 w-3.5" aria-hidden />{BLOCKS[kind].label}
        </button>
      ))}
    </div>
  );

  const rows = (
    <ol aria-label="Your program: block, then the step it compiles to" className="grid gap-1">
      {program.length === 0 && <li className="py-3 text-[15px] text-[var(--v2-muted)]">Empty program. Add a block from the toolbox.</li>}
      {program.map((kind, i) => {
        const b = BLOCKS[kind]; const on = i === player.index;
        return (
          <li key={`${kind}-${i}`} ref={on ? (el) => { activeRow.current = el; } : undefined}
            className={cn('relative grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-3 rounded-[6px] pr-1 transition-colors duration-200', on ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]')}>
            <span aria-hidden className={cn('v2-row-edge absolute -left-3 inset-y-1.5 w-[3px] origin-center rounded-[1px] bg-[var(--v2-teal)]', on ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0')} />
            <button type="button" onClick={() => player.go(i)} aria-current={on ? 'step' : undefined} className="flex min-h-11 items-center gap-3 rounded-[6px] px-2 py-1 text-left">
              <span className={cn('inline-flex h-9 items-center rounded-[5px] px-3 text-[14px] font-semibold text-white transition-opacity duration-200', player.index >= 0 && i > player.index && 'opacity-50')} style={{ backgroundColor: b.color }}>{b.label}</span>
            </button>
            <code className={cn('v2-mono truncate text-[13px] transition-colors duration-200', on ? 'text-[var(--v2-teal)]' : 'text-[var(--v2-muted)]')}>{describeStep(b.step)}</code>
            <button type="button" onClick={() => remove(i)} aria-label={`Remove block ${i + 1}: ${b.label}`} className="inline-flex h-11 w-11 items-center justify-center rounded-[4px] text-[var(--v2-muted)] hover:bg-white/[0.06] hover:text-[var(--v2-text)]"><XIcon className="h-4 w-4" aria-hidden /></button>
          </li>
        );
      })}
    </ol>
  );

  const chips = (
    <ol aria-label="Your program" className="flex flex-wrap items-center gap-1.5">
      {program.length === 0 && <li className="text-[14px] text-[var(--v2-muted)]">Empty program. Add a block.</li>}
      {program.map((kind, i) => (
        <li key={`${kind}-${i}`}>
          <span className={cn('inline-flex h-10 items-center gap-1 rounded-[4px] pl-2.5 text-[13px] font-semibold text-white', i === player.index && 'ring-2 ring-[var(--v2-teal)] ring-offset-2 ring-offset-[var(--v2-graphite)]')} style={{ backgroundColor: BLOCKS[kind].color }}>
            <button type="button" onClick={() => player.go(i)} aria-current={i === player.index ? 'step' : undefined} className="h-10">{BLOCKS[kind].label}</button>
            <button type="button" onClick={() => remove(i)} aria-label={`Remove block ${i + 1}: ${BLOCKS[kind].label}`} className="inline-flex h-10 w-9 items-center justify-center"><XIcon className="h-3.5 w-3.5" aria-hidden /></button>
          </span>
        </li>
      ))}
      <li><AddBlockMenu onAdd={add} disabled={program.length >= MAX_BLOCKS} /></li>
    </ol>
  );

  const transport = (
    <div className="flex items-center gap-3">
      {player.playing
        ? <button type="button" className={cn(control, 'w-11 px-0')} onClick={player.pause} aria-label="Pause"><PauseIcon className="h-4 w-4" aria-hidden /></button>
        : <button type="button" className={cn(control, 'w-11 border-transparent bg-[var(--v2-text)] px-0 text-[var(--v2-void)] hover:bg-[var(--v2-teal)]')} onClick={player.play} disabled={!program.length} aria-label={player.index >= player.last ? 'Replay lesson' : 'Play lesson'}>{player.index >= player.last ? <RotateCcwIcon className="h-4 w-4" aria-hidden /> : <PlayIcon className="h-4 w-4" aria-hidden />}</button>}
      <label className="relative flex min-w-0 flex-1 flex-col">
        <span className="sr-only">Execution step</span>
        <span aria-hidden className="v2-progress pointer-events-none absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 origin-left rounded-full bg-[rgb(63_209_188/0.7)]" style={{ transform: `translateY(-50%) scaleX(${program.length ? (player.index + 1) / program.length : 0})` }} />
        <input type="range" className="v2-range w-full" min={-1} max={Math.max(player.last, -1)} step={1} value={player.index} onChange={(e) => player.go(Number(e.target.value))} disabled={!program.length}
          aria-valuetext={player.index < 0 ? 'Initial state' : `Step ${player.index + 1} of ${program.length}: ${player.block?.label}`} />
      </label>
      <span className="v2-num w-[6ch] shrink-0 text-right text-[13px] text-[var(--v2-muted)]">{player.index < 0 ? 'start' : `${player.index + 1} / ${program.length}`}</span>
      {compact && <button type="button" className={cn(control, 'w-11 px-0')} onClick={reset} aria-label="Reset to lesson one"><Undo2Icon className="h-4 w-4" aria-hidden /></button>}
    </div>
  );

  const note = (
    <div className="flex min-h-[48px] items-start gap-3" aria-live={player.playing ? 'off' : 'polite'}>
      {player.block?.kind === 'wait' && (
        <svg key={pulse} viewBox="0 0 36 36" className="v2-wait-ring mt-0.5 h-6 w-6 shrink-0" aria-hidden><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--v2-line-strong)" strokeWidth="3" /><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--v2-teal)" strokeWidth="3" pathLength={100} strokeDasharray="100" strokeDashoffset="0" /></svg>
      )}
      <p className="text-[16px] leading-[1.45]">
        {player.block
          ? <code className="v2-mono mr-3 text-[13px] text-[var(--v2-teal)]">{describeStep(player.block.step)}</code>
          : <span className="mr-3 text-[14px] font-semibold text-[var(--v2-teal)]">Start</span>}
        {player.index < 0 && !player.playing ? 'Press play, scrub the steps, or choose a block.' : player.state.note}
      </p>
    </div>
  );

  const checks = (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
      <ul aria-label="Lesson one rules" className="grid gap-1.5 max-lg:grid-cols-3 max-lg:gap-2">
        {rules.map((r) => (
          <li key={`${r.rule}-${checkRun}`} style={{ ['--d' as string]: rules.indexOf(r) * 140 }} className={cn('-mx-1 flex items-start gap-2 rounded-[4px] px-1 py-0.5 text-[14px] leading-[1.35] max-lg:text-[13px]', checkRun > 0 && 'v2-rule-check', r.passed ? 'text-[var(--v2-text)]' : 'text-[var(--v2-muted)]')}>
            {r.passed ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--v2-teal)]" aria-hidden /> : <XIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <span>{r.rule}<span className="sr-only">{r.passed ? ', passed' : ', not passed'}</span></span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--v2-muted)] max-lg:hidden">
        <button type="button" onClick={reset} className="inline-flex h-11 items-center font-semibold text-[var(--v2-text)] underline decoration-[var(--v2-line-strong)] underline-offset-4 hover:decoration-[var(--v2-teal)]">Reset to lesson one</button>
        <span className="inline-flex items-center gap-1.5"><LockIcon className="h-3.5 w-3.5" aria-hidden />Physical robot locked</span>
      </div>
    </div>
  );

  // Preview-state readout: the jaw and arm as the preview holds them (also the only robot feedback on the poster path).
  const readout = (
    <dl className={cn('v2-num grid grid-cols-2 gap-x-6 rounded-[4px] bg-[rgb(8_9_10/0.85)] px-3 py-2 text-[13px]', mode === 'poster' && 'text-[15px]')}>
      <div><dt className="text-[var(--v2-soft)]">jaw</dt><dd className="mt-0.5 text-[var(--v2-text)]">{player.state.jaw}</dd></div>
      <div><dt className="text-[var(--v2-soft)]">arm</dt><dd className="mt-0.5 text-[var(--v2-text)]">{player.state.armSelected ? 'left, selected' : 'none selected'}</dd></div>
    </dl>
  );

  const intro = (
    <div>
      <h2 id="v2-lesson-title" data-reveal className="v2-display text-[length:var(--v2-head)] font-medium">Code becomes motion</h2>
      <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.55] text-[var(--v2-soft)]">Each block compiles to one step, and the preview plays the steps in order. Add or remove blocks, then play or scrub the program and watch the gripper and the rules respond.</p>
    </div>
  );

  if (compact) {
    // The heading reads in normal flow; then the stage pins below the header with every control in a
    // dock under it, sized to fit, so nothing scrolls inside a box. Short screens drop the pin.
    return (
      <section id="v2-lesson" ref={reveal} data-scene="lesson" aria-labelledby="v2-lesson-title" className="v2-anchor v2-anchor-flush v2-reveal relative z-10">
        <div className="bg-[var(--v2-graphite)] px-[var(--v2-margin)] pb-8 pt-[calc(var(--v2-header)+40px)]">{intro}</div>
        <div data-pin className="sticky top-[var(--v2-header)] flex h-[calc(100svh-var(--v2-header))] flex-col [@media(max-height:620px)]:static [@media(max-height:620px)]:h-auto">
          <div data-stage-window className="relative min-h-[240px] flex-1">
            <StageLoading />
            <div className="absolute bottom-3 left-[var(--v2-margin)]">{readout}</div>
            <p className="absolute right-[var(--v2-margin)] top-3 inline-flex items-center gap-1.5 rounded-[4px] bg-[rgb(8_9_10/0.80)] px-2 py-1 text-[13px] text-[var(--v2-soft)]"><LockIcon className="h-3.5 w-3.5" aria-hidden />Physical robot locked</p>
            {mode === 'poster' && <p className="absolute inset-x-[var(--v2-margin)] top-1/2 -translate-y-1/2 text-center text-[15px] text-[var(--v2-soft)]">The 3D preview runs in the VISTA workspace. Here the preview state is shown as text.</p>}
          </div>
          <div className="grid gap-3 bg-[var(--v2-graphite)] px-[var(--v2-margin)] pb-5 pt-4">
            {chips}
            {transport}
            {note}
            {checks}
          </div>
        </div>
        <div aria-hidden className="h-[40svh] [@media(max-height:620px)]:hidden" />
      </section>
    );
  }

  return (
    <section id="v2-lesson" ref={reveal} data-scene="lesson" aria-labelledby="v2-lesson-title" className="v2-anchor v2-anchor-flush v2-reveal relative z-10 grid min-h-[100svh] grid-cols-[minmax(0,46%)_1fr]">
      <div className="flex flex-col justify-center gap-[clamp(10px,2svh,20px)] bg-[var(--v2-graphite)] pb-[clamp(16px,3svh,32px)] pl-[var(--v2-margin)] pr-8 pt-[calc(var(--v2-header)+clamp(16px,3svh,32px))]">
        {intro}
        {toolbox}
        {rows}
        {transport}
        {note}
        {checks}
      </div>
      <div data-stage-window="column" className="relative">
        <StageLoading />
        <div className="absolute bottom-6 left-8">{readout}</div>
        {mode === 'poster' && <p className="absolute inset-x-[var(--v2-margin)] top-1/2 -translate-y-1/2 text-center text-[15px] text-[var(--v2-soft)]">The 3D preview runs in the VISTA workspace. Here the preview state is shown as text.</p>}
        <p className="absolute bottom-6 right-[var(--v2-margin)] text-[13px] text-[var(--v2-muted)]">Illustrative 3D preview. Not a physics simulation.</p>
      </div>
      <svg aria-hidden className={cn('pointer-events-none fixed inset-0 z-20 h-full w-full transition-opacity duration-300', showSignal ? 'opacity-100' : 'invisible opacity-0')}>
        {showSignal && <path key={pulse} ref={signal} className="v2-signal-path" fill="none" stroke="var(--v2-teal)" strokeWidth="1.5" strokeOpacity="0.85" />}
      </svg>
    </section>
  );
}
