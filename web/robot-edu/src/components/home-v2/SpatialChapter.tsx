import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../utils/cn';
import type { StageAxis, StagePoint } from '../home-lab/robotScene';
import { useReveal } from '../home/useReveal';
import { StageLoading } from './StageLoading';
import { TARGET_A, useV2Scene, type SpaceView } from './V2Scene';

const AXES: Array<{ axis: StageAxis; value: number; text: string }> = [
  { axis: 'x', value: TARGET_A.x, text: 'right of the origin' },
  { axis: 'y', value: TARGET_A.y, text: 'into the stage' },
  { axis: 'z', value: TARGET_A.z, text: 'above the stage' },
];

/** Points labelled on the stage (learning frame, mm). */
const LABELS: Array<{ id: string; at: StagePoint; text: string; strong?: boolean }> = [
  { id: 'target', at: TARGET_A, text: 'Target A', strong: true },
  { id: 'origin', at: { x: 0, y: 0, z: 0 }, text: '0, 0, 0' },
  { id: 'x', at: { x: 660, y: 0, z: 0 }, text: 'x' },
  { id: 'y', at: { x: 0, y: 450, z: 0 }, text: 'y' },
  { id: 'z', at: { x: 0, y: 0, z: 220 }, text: 'z' },
];

const segment = 'inline-flex h-11 items-center rounded-[3px] px-4 text-[14px] font-semibold transition-colors duration-200';

/**
 * S4 — the 600 × 400 mm learning stage, live. The camera moves from a product view of the arm on its
 * stage to the overhead technical view (Concept B), where the learning frame's axes, Target A and the
 * guides that measure it appear. Coordinates are the seeded Reach a Target values (learning_preview_v1).
 */
export function SpatialChapter() {
  const { scene, ready, active, mode, reduce, spaceView, setSpaceView, spaceFocus, setSpaceFocus } = useV2Scene();
  const compact = useMediaQuery('(max-width: 1023px)');
  const reveal = useReveal<HTMLElement>(0.2);
  const chosen = useRef(false);
  const labels = useRef<Array<HTMLSpanElement | null>>([]);
  const windowRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const technical = spaceView === 'technical';
  const live = mode === '3d' && active === 'space';

  // On first arrival the camera rises from the product view to the technical view, once.
  useEffect(() => {
    if (active !== 'space' || chosen.current) return undefined;
    if (reduce) { setSpaceView('technical'); chosen.current = true; return undefined; }
    const t = window.setTimeout(() => { if (!chosen.current) { setSpaceView('technical'); chosen.current = true; } }, 1100);
    return () => window.clearTimeout(t);
  }, [active, reduce, setSpaceView]);

  useEffect(() => { setShown(live && technical); }, [live, technical]);

  useEffect(() => {
    const s = scene.current;
    if (!ready || !s) return undefined;
    return s.onFrame(() => {
      // Labels live inside the 3D window (clipped by it); the canvas is fixed, so offset by the window.
      const box = windowRef.current?.getBoundingClientRect(); if (!box) return;
      LABELS.forEach((l, i) => {
        const el = labels.current[i]; if (!el) return;
        const p = s.projectStage(l.at);
        el.style.transform = `translate3d(${p.x - box.left}px, ${p.y - box.top}px, 0)`;
      });
    });
  }, [ready, scene]);

  const pick = (view: SpaceView) => { chosen.current = true; setSpaceView(view); };

  const stageLabels = (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500', shown ? 'opacity-100 delay-700' : 'opacity-0')}>
      {LABELS.map((l, i) => (
        <span key={l.id} ref={(el) => { labels.current[i] = el; }} className="absolute left-0 top-0">
          <span className={cn('absolute left-3 -top-3 whitespace-nowrap', l.strong ? 'rounded-[3px] bg-[var(--v2-void)] px-2 py-1 text-[15px] font-semibold leading-none text-[var(--v2-text)]' : 'v2-num rounded-[3px] bg-[rgb(8_9_10/0.75)] px-1 text-[13px] text-[var(--v2-text)]')}>{l.text}</span>
        </span>
      ))}
    </div>
  );

  const intro = (
    <div>
      <h2 id="v2-space-title" data-reveal className="v2-display text-[length:var(--v2-head)] font-medium">Find Target A in 3D</h2>
      <p className="mt-4 max-w-[42ch] text-[16px] leading-[1.55] text-[var(--v2-soft)]">In Reach a Target, students place the arm’s preview at Target A. Seen from above the 600 × 400 mm stage, three numbers become one point you can find.</p>
    </div>
  );

  const controls = (
    <>
      <div role="group" aria-label="Camera view" className="inline-flex w-fit gap-1 rounded-[4px] border border-[var(--v2-line-strong)] p-1">
        {(['product', 'technical'] as const).map((view) => (
          <button key={view} type="button" aria-pressed={spaceView === view} onClick={() => pick(view)} className={cn(segment, spaceView === view ? 'bg-[var(--v2-text)] text-[var(--v2-void)]' : 'text-[var(--v2-soft)] hover:text-[var(--v2-text)]')}>
            {view === 'product' ? 'Product view' : 'Technical view'}
          </button>
        ))}
      </div>
      <div>
        <p className="text-[15px] font-semibold">Target A, in millimetres</p>
        <ul className="mt-2 grid gap-1 max-lg:grid-cols-3" aria-label="Target A coordinates">
          {AXES.map((a) => (
            <li key={a.axis}>
              <button type="button" aria-pressed={spaceFocus === a.axis} onClick={() => { pick('technical'); setSpaceFocus(spaceFocus === a.axis ? null : a.axis); }}
                className={cn('flex min-h-11 w-full items-baseline gap-4 rounded-[6px] px-3 py-2 text-left transition-colors duration-200 max-lg:flex-col max-lg:gap-0', spaceFocus === a.axis ? 'bg-[var(--v2-teal-dim)]' : 'hover:bg-white/[0.05]')}>
                <span className="v2-display w-[1.2ch] text-[26px] font-semibold leading-none">{a.axis}</span>
                <span className="v2-display w-[4ch] text-[26px] font-semibold leading-none tabular-nums lg:text-right">{a.value}</span>
                <span className="text-[15px] text-[var(--v2-soft)] max-lg:text-[13px]">{a.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="max-w-[44ch] text-[13px] leading-[1.5] text-[var(--v2-muted)]">The origin is the stage’s front-left corner in the lesson-only learning frame. The arm’s place on the stage is illustrative. A preview, not robot reachability.</p>
    </>
  );

  return (
    <section id="v2-space" ref={reveal} data-scene="space" aria-labelledby="v2-space-title" className={cn('v2-anchor v2-anchor-flush v2-reveal relative z-10', !compact && 'grid min-h-[100svh] grid-cols-[minmax(0,40%)_1fr]')}>
      {compact ? (
        // As in S2: heading in flow, then the stage pinned below the header over a fitted dock.
        <>
          <div className="bg-[var(--v2-graphite)] px-[var(--v2-margin)] pb-8 pt-[calc(var(--v2-header)+40px)]">{intro}</div>
          <div data-pin className="sticky top-[var(--v2-header)] flex h-[calc(100svh-var(--v2-header))] flex-col [@media(max-height:620px)]:static [@media(max-height:620px)]:h-auto">
            <div ref={windowRef} data-stage-window className="relative min-h-[240px] flex-1 overflow-hidden">
              <StageLoading />
              {stageLabels}
              {mode === 'poster' && <p className="absolute inset-x-[var(--v2-margin)] bottom-4 text-[14px] text-[var(--v2-soft)]">The live 3D stage runs in development builds only.</p>}
            </div>
            <div className="flex flex-col gap-4 bg-[var(--v2-graphite)] px-[var(--v2-margin)] pb-5 pt-4">{controls}</div>
          </div>
          <div aria-hidden className="h-[40svh] [@media(max-height:620px)]:hidden" />
        </>
      ) : (
        <>
          <div className="flex flex-col justify-center gap-[clamp(14px,2.6svh,24px)] bg-[var(--v2-graphite)] pb-[clamp(16px,3svh,32px)] pl-[var(--v2-margin)] pr-8 pt-[calc(var(--v2-header)+clamp(16px,3svh,32px))]">{intro}{controls}</div>
          <div ref={windowRef} data-stage-window="column" className="relative overflow-hidden">
            <StageLoading />
            {stageLabels}
            {mode === 'poster' && <p className="absolute inset-x-[var(--v2-margin)] top-1/2 -translate-y-1/2 text-center text-[15px] text-[var(--v2-soft)]">The live 3D stage runs in development builds only.</p>}
            <p className="absolute bottom-6 right-[var(--v2-margin)] text-[13px] text-[var(--v2-muted)]">Illustrative 3D preview of the learning frame.</p>
          </div>
        </>
      )}
    </section>
  );
}
