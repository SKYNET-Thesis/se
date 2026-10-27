import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../utils/cn';
import { DeferredMedia } from './DeferredMedia';
import { useReveal } from '../home/useReveal';
import { JOURNEY } from './content';
import { LoopThread } from './journey/LoopThread';
import { localProgress, scrollTargetFor, stepAt, trackProgress } from './journey/loopModel';

const STEPS = JOURNEY.length;
/** Each step's own entrance into the one frame (see v2.css: v2-loop-screen). */
const STEP_IDS = ['learn', 'program', 'preview', 'evaluate', 'reflect'];
/** Screens other than the current one: never focusable or interactive, even while one stays visible
 * beneath an arriving screen (React 18 sets `inert` only as an attribute string). */
const INERT = { inert: '' } as Record<string, string>;

/**
 * S3 — one lesson, five steps (H6.8). While the stage is pinned the reader's scroll moves the loop on:
 * Learn, Program, Preview, Evaluate, Reflect, and back again going up. One plate holds one screen and a
 * dark band (H6.9): each step enters the frame with its own transformation, and the band carries lesson
 * one through every step (what it asks, its compiled steps, the preview, the rule checks, the submission). Choosing a step scrolls the
 * page to it, so scroll and choice always agree. Native scroll only: no hijacking, no snapping, and on
 * screens too short to pin, the chapter reads in normal flow with the steps chosen by hand.
 */
export function JourneyChapter() {
  const reveal = useReveal<HTMLElement>(0.12);
  const wide = useMediaQuery('(min-width: 1024px)');
  const tallWide = useMediaQuery('(min-height: 540px)');
  const tallNarrow = useMediaQuery('(min-height: 600px)');
  const desktop = wide && tallWide;
  const pinned = desktop || (!wide && tallNarrow);
  const reduce = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [local, setLocal] = useState(1);
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = useRef(0);
  const lock = useRef<{ y: number; until: number } | null>(null);

  const header = () => parseFloat(getComputedStyle(track.current ?? document.body).getPropertyValue('--v2-header')) || 68;

  // While pinned, the scroll position alone sets the step. A chosen step holds until the page arrives
  // at it (or the reader takes over the scroll), so the steps passed on the way do not flash by.
  useEffect(() => {
    if (!pinned) { setLocal(1); return undefined; }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const t = track.current; const s = stage.current; if (!t || !s) return;
      const r = t.getBoundingClientRect();
      const p = trackProgress(r.top, r.height, s.offsetHeight, header());
      t.style.setProperty('--loop-p', p.toFixed(4));
      const held = lock.current;
      if (held && Math.abs(scrollY - held.y) > 2 && performance.now() < held.until) return;
      lock.current = null;
      const next = stepAt(p, current.current, STEPS);
      if (next !== current.current) { current.current = next; setIndex(next); }
      setLocal(Math.round(localProgress(p, next, STEPS) * 20) / 20);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const release = () => { lock.current = null; };
    measure();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    addEventListener('wheel', release, { passive: true });
    addEventListener('touchstart', release, { passive: true });
    addEventListener('keydown', release, true);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll);
      removeEventListener('wheel', release); removeEventListener('touchstart', release); removeEventListener('keydown', release, true);
    };
  }, [pinned]);

  const select = (i: number, focus = false) => {
    const next = (i + STEPS) % STEPS;
    if (focus) tabs.current[next]?.focus({ preventScroll: true });
    current.current = next; setIndex(next); setLocal(pinned ? 0.5 : 1);
    const t = track.current; const s = stage.current;
    if (!pinned || !t || !s) return;
    const r = t.getBoundingClientRect();
    const y = scrollTargetFor(next, STEPS, r.top + scrollY, r.height, s.offsetHeight, header());
    lock.current = { y, until: performance.now() + 1800 };
    scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  };
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); select(index + step, true); }
    if (e.key === 'Home') { e.preventDefault(); select(0, true); }
    if (e.key === 'End') { e.preventDefault(); select(STEPS - 1, true); }
  };
  const stageStep = JOURNEY[index];
  const compact = !desktop;

  const title = <h2 id="v2-journey-title" data-reveal className="v2-display text-[length:var(--v2-head)] font-medium">One lesson, five steps</h2>;
  const intro = (
    <p data-reveal style={{ ['--d' as string]: 80 }} className="mt-4 max-w-[40ch] text-[16px] leading-[1.55] text-[var(--v2-soft)]">
      Every VISTA lesson runs the same loop, from reading the mission to reflecting on the teacher’s feedback. {pinned ? 'Scroll through it, or choose a step.' : 'Choose a step to bring its screen forward.'}
    </p>
  );
  const text = <p className={cn('max-w-[36ch] leading-[1.45]', compact ? 'min-h-[4.35em] text-[16px]' : 'mt-6 min-h-[2.9em] text-[length:var(--v2-lead)]')} aria-live="polite">{stageStep.text}</p>;

  const list = (
    <div role="tablist" aria-label="Learning loop steps" aria-orientation={compact ? 'horizontal' : 'vertical'} onKeyDown={onKey}
      className={cn(compact ? 'grid grid-cols-5 gap-1.5' : 'relative grid gap-[clamp(2px,0.6svh,8px)] pl-6')}>
      {!compact && (
        <span aria-hidden className="absolute bottom-2 left-0 top-2 w-[2px] bg-white/10">
          <span className="v2-loop-rail absolute inset-0 bg-[var(--v2-teal)]" />
        </span>
      )}
      {JOURNEY.map((s, i) => (
        <button key={s.name} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`v2-journey-tab-${i}`} aria-selected={i === index} aria-controls="v2-journey-panel" tabIndex={i === index ? 0 : -1} onClick={() => select(i)}
          className={cn('transition-colors duration-300',
            compact ? 'flex min-h-11 flex-col justify-end gap-2 text-left text-[13px] font-semibold' : 'v2-display flex min-h-11 items-center text-left text-[length:var(--v2-index)] font-medium leading-[1.05]',
            i === index ? 'text-[var(--v2-text)]' : 'text-[var(--v2-muted)] hover:text-[var(--v2-soft)]')}>
          {compact && (
            <span aria-hidden className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/10">
              <span className="absolute inset-0 origin-left bg-[var(--v2-teal)] transition-transform duration-300" style={{ transform: `scaleX(${i < index ? 1 : i === index ? Math.max(0.12, local) : 0})` }} />
            </span>
          )}
          {s.name}
        </button>
      ))}
    </div>
  );

  // One frame for all five screens. The arriving screen enters with its step's own transformation over
  // the one it replaces, which stays beneath until the entrance has finished (CSS; instant with reduced motion).
  const screens = (
    <div id="v2-journey-panel" role="tabpanel" aria-labelledby={`v2-journey-tab-${index}`} className="absolute inset-0 overflow-hidden rounded-[3px] bg-[var(--v2-graphite-3)]">
      {JOURNEY.map((s, i) => (
        <div key={s.name} aria-hidden={i !== index} {...(i !== index ? INERT : {})} data-step={STEP_IDS[i]} className={cn('v2-stack-card v2-loop-screen absolute inset-0', i === index && 'is-on')}>
          <DeferredMedia id={s.asset} minWidth={560} />
        </div>
      ))}
      {/* Evaluate: one pass of the rule checker over the screen as it arrives. */}
      {index === 3 && <span key="scan" aria-hidden className="v2-loop-scan pointer-events-none absolute inset-0 z-10"><span className="absolute inset-x-0 top-0 h-[2px] bg-[var(--v2-teal)]" /></span>}
    </div>
  );

  if (desktop) {
    return (
      <section id="v2-journey" ref={reveal} aria-labelledby="v2-journey-title" className="v2-anchor v2-reveal relative z-10 bg-[var(--v2-graphite)]">
        <div ref={track} className="relative [overflow-anchor:none]">
          <div ref={stage} className="sticky top-[var(--v2-header)] grid h-[calc(100svh-var(--v2-header))] grid-cols-[minmax(300px,30%)_minmax(0,1fr)] gap-x-[clamp(32px,4vw,80px)] px-[var(--v2-margin)] py-[clamp(20px,5svh,64px)]">
            <div className="flex min-h-0 flex-col justify-between gap-6">
              <div>{title}{intro}</div>
              <div>{list}{text}</div>
            </div>
            {/* The frame sizes to the stage, never past it: as wide as the column allows, as tall as the screen does. */}
            {/* One plate: the screen, and the thread as a band beneath it (beside it on a wide, short stage). It sizes to
                the stage both ways, never past it. See v2.css. */}
            <div className="v2-loop-box relative min-h-0">
              <div data-shutter style={{ ['--d' as string]: 200 }} className="v2-loop-plate">
                <div className="v2-loop-screen-box relative">{screens}</div>
                <LoopThread step={index} local={local} className="v2-loop-band v2-loop-thread" />
              </div>
            </div>
          </div>
          <div aria-hidden style={{ height: `calc(${STEPS} * var(--v2-loop-step))` }} />
        </div>
      </section>
    );
  }

  // Phones, tablets and short screens: the heading reads in flow, then a compact stage pins below the
  // header (frame, thread, words) sized to fit the screen. Too short to pin: normal flow.
  return (
    <section id="v2-journey" ref={reveal} aria-labelledby="v2-journey-title" className="v2-anchor v2-anchor-tight v2-reveal relative z-10 bg-[var(--v2-graphite)]">
      <div className="px-[var(--v2-margin)] pb-6 pt-[var(--v2-section)]">{title}{intro}</div>
      {/* The compact stage keeps one height through all five steps (the thread and words have room reserved), and
          scroll anchoring is off here: a stage that changed height would nudge the scroll and flip the step back. */}
      <div ref={track} className="relative [overflow-anchor:none]">
        <div ref={stage} className={cn('grid gap-3 bg-[var(--v2-graphite)] px-[var(--v2-margin)] pb-6 pt-3', pinned && 'sticky top-[var(--v2-header)]')}>
          {list}
          <div data-shutter style={{ ['--d' as string]: 160 }} className="mt-2 grid w-[min(100%,calc((100svh-var(--v2-header)-360px)*1.6+24px))] min-w-[min(100%,280px)] gap-3 rounded-[6px] bg-[var(--v2-graphite-2)] p-3">
            <div className="relative aspect-[16/10] w-full">{screens}</div>
            <LoopThread step={index} local={local} className="v2-loop-thread min-h-[9.25rem]" />
          </div>
          {text}
        </div>
        {pinned && <div aria-hidden style={{ height: `calc(${STEPS} * var(--v2-loop-step))` }} />}
      </div>
      {!pinned && <div aria-hidden className="h-[var(--v2-section)]" />}
    </section>
  );
}
