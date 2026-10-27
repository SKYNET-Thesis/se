import { useEffect, useRef, useState } from 'react';
import { CheckIcon, LockIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { homeAssets, isApproved } from '../home/media/homeAssets';
import { useReveal } from '../home/useReveal';
import { SAFETY_GATES } from './content';
import { LockNote } from './modes/overlays';
import { StageLoading } from './StageLoading';
import { V2Media } from './V2Media';
import { useV2Scene, type ScenePreset } from './V2Scene';

/** The arm at rest, key light down, a cool rim: the same preview, plainly not a robot in motion (H6.7 study A). */
const LOCKED: ScenePreset = { rig: { azimuth: 0.35, elevation: 0.16, distance: 3.3, targetY: 0.42, targetZ: 0.05, fov: 30, fit: 1.2 }, light: 0.36, glow: 0.22, restArm: true };

/**
 * S7 — the boundary as one sequence, played once when the chapter arrives: the same program leaves on
 * two routes; the preview route fills and its destination lights; the hardware route runs into a solid
 * boundary and stops there. The finished state is the resting state (and the reduced-motion state).
 * An illustration of the release's rule, not a control: nothing here talks to a robot.
 *
 * H6.9 CP3: the chapter opens on the real SO-101, at rest in a dimmed rim light, beside the statement, so
 * the page's one subject carries through from the learning modes to the boundary that holds it.
 */
export function SafetyChapter() {
  const reveal = useReveal<HTMLElement>(0.15);
  const field = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  const [started, setStarted] = useState(false);
  const photo = isApproved(homeAssets['home.safety.visual']);
  const { setScenePreset, mode } = useV2Scene();
  useEffect(() => { setScenePreset('x-safety', LOCKED); return () => setScenePreset('x-safety', null); }, [setScenePreset]);

  useEffect(() => {
    const node = field.current; if (!node) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setStarted(true); io.disconnect(); } }, { threshold: 0.45 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <section id="v2-safety" ref={reveal} data-scene="x-safety" aria-labelledby="v2-safety-title" className="v2-anchor v2-anchor-tight v2-reveal relative z-10">
      {/* Only the stage window is see-through onto the shared canvas; every other part is opaque. */}
      <div className="grid lg:grid-cols-12">
      <div className="bg-[var(--v2-void)] px-[var(--v2-margin)] pb-8 pt-[var(--v2-section)] lg:col-span-6 lg:flex lg:flex-col lg:justify-end lg:pb-[clamp(24px,5svh,56px)]">
        <h2 id="v2-safety-title" data-reveal className="v2-display max-w-[12ch] text-[length:var(--v2-statement)] font-semibold text-[var(--v2-teal)]">The robot stays locked</h2>
        <p data-reveal style={{ ['--d' as string]: 80 }} className="mt-6 max-w-[46ch] text-[length:var(--v2-lead)] leading-[1.55]">VISTA keeps what students see apart from what a robot does. In this release, no lesson sends a command to robot hardware.</p>
      </div>
      <div data-stage-window className="relative aspect-[4/3] overflow-hidden md:aspect-[16/9] lg:col-span-6 lg:aspect-auto lg:min-h-[clamp(360px,60svh,600px)]">
        <StageLoading />
        <LockNote className="absolute right-4 top-3" />
        {mode === 'poster' && <p className="absolute inset-x-4 bottom-4 text-[14px] text-[var(--v2-soft)]">The live 3D arm is not shown here.</p>}
      </div>
      </div>

      <div className="bg-[var(--v2-void)] pb-[var(--v2-section)] pt-[clamp(8px,2svh,24px)]">

      <div ref={field} key={run} role="img" aria-label="The same program reaches the 3D preview in every lesson. The route to the physical robot stops at a locked boundary: physical runs are locked in this release."
        className={cn('v2-routes mt-[clamp(32px,6svh,80px)] grid', started ? 'is-run' : 'is-idle')}>
        {/* Preview route */}
        <div aria-hidden className="grid grid-cols-[1fr_minmax(150px,30%)] items-stretch bg-[var(--v2-graphite-2)] md:grid-cols-[auto_1fr_minmax(220px,30%)]">
          <p className="col-span-2 px-[var(--v2-margin)] pt-6 text-[15px] font-semibold text-[var(--v2-soft)] md:col-span-1 md:self-center md:pt-0">Your program</p>
          <div className="relative min-h-16 px-[var(--v2-margin)] md:px-8">
            <span className="absolute inset-x-[var(--v2-margin)] top-1/2 h-[3px] -translate-y-1/2 bg-white/10 md:inset-x-8" />
            <span className="v2-route-fill absolute inset-x-[var(--v2-margin)] top-1/2 h-[3px] -translate-y-1/2 origin-left bg-[var(--v2-teal)] md:inset-x-8" />
          </div>
          <div className="v2-route-dest flex flex-col justify-center px-5 py-6 md:px-8 md:py-10">
            <p className="flex items-center gap-2 text-[clamp(18px,1.8vw,26px)] font-semibold"><CheckIcon className="h-5 w-5 shrink-0" aria-hidden />3D preview</p>
            <p className="mt-1 text-[14px]">In every lesson</p>
          </div>
        </div>
        {/* Hardware route */}
        <div aria-hidden className="grid grid-cols-[1fr_minmax(150px,30%)] items-stretch bg-[var(--v2-graphite)] md:grid-cols-[auto_1fr_minmax(220px,30%)]">
          <p className="col-span-2 px-[var(--v2-margin)] pt-6 text-[15px] font-semibold text-[var(--v2-soft)] md:col-span-1 md:self-center md:pt-0">Your program</p>
          <div className="relative min-h-16 px-[var(--v2-margin)] md:px-8">
            <span className="absolute left-[var(--v2-margin)] right-[45%] top-1/2 h-[3px] -translate-y-1/2 bg-white/10 md:left-8" />
            <span className="v2-route-stop absolute left-[var(--v2-margin)] right-[45%] top-1/2 h-[3px] -translate-y-1/2 origin-left bg-[var(--v2-soft)] md:left-8" />
            {/* The boundary: a solid wall the route cannot pass. */}
            <span className="v2-boundary absolute inset-y-0 right-[calc(45%-4px)] w-[8px] bg-[var(--v2-text)]" />
            <span className="v2-boundary-lock absolute right-[45%] top-1/2 grid h-11 w-11 -translate-y-1/2 translate-x-[calc(50%+4px)] place-items-center rounded-full bg-[var(--v2-text)] text-[var(--v2-void)]"><LockIcon className="h-5 w-5" /></span>
          </div>
          <div className="flex flex-col justify-center px-5 py-6 md:px-8 md:py-10">
            <p className="flex items-center gap-2 text-[clamp(18px,1.8vw,26px)] font-semibold text-[var(--v2-muted)]"><LockIcon className="h-5 w-5 shrink-0" aria-hidden />Physical robot</p>
            <p className="v2-boundary-note mt-1 text-[14px] text-[var(--v2-soft)]">Locked in this release</p>
          </div>
        </div>
      </div>
      <div className="mt-4 px-[var(--v2-margin)]">
        <button type="button" onClick={() => { setStarted(true); setRun((n) => n + 1); }} className="inline-flex h-11 items-center gap-2 text-[14px] font-semibold text-[var(--v2-soft)] transition-colors hover:text-[var(--v2-text)]">
          <RotateCcwIcon className="h-4 w-4" aria-hidden />Play the two routes again
        </button>
      </div>

      <div className="mt-[clamp(40px,7svh,88px)] grid gap-10 px-[var(--v2-margin)] lg:grid-cols-12">
        <dl className="grid gap-8 lg:col-span-6">
          <div data-reveal>
            <dt className="v2-display text-[clamp(24px,2vw,34px)] font-medium">Preview, in every lesson</dt>
            <dd className="mt-2 max-w-[48ch] text-[16px] leading-[1.55] text-[var(--v2-soft)]">Runs in the browser and on the VISTA server, and shows each step on the 3D model. Rule checks read this preview trace, not live sensor data.</dd>
          </div>
          <div data-reveal style={{ ['--d' as string]: 80 }}>
            <dt className="v2-display flex items-center gap-3 text-[clamp(24px,2vw,34px)] font-medium"><LockIcon className="h-6 w-6 text-[var(--v2-teal)]" aria-hidden />Physical run, locked</dt>
            <dd className="mt-2 max-w-[48ch] text-[16px] leading-[1.55] text-[var(--v2-soft)]">Not available in this release. There is no control on VISTA that starts the robot.</dd>
          </div>
        </dl>
        <div className="lg:col-span-5 lg:col-start-8">
          {photo && <V2Media id="home.safety.visual" className="mb-8" />}
          <details className="group rounded-[4px] bg-[var(--v2-graphite-2)]">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
              What a physical run would require
              <PlusIcon className="h-5 w-5 shrink-0 text-[var(--v2-teal)] transition-transform duration-200 group-open:rotate-45" aria-hidden />
            </summary>
            <div className="px-5 pb-6">
              <p className="max-w-[48ch] text-[15px] leading-[1.55] text-[var(--v2-soft)]">These are the conditions of the safety boundary, not controls in VISTA today. Every one would have to hold before a physical run could ever be allowed:</p>
              <ol className="mt-4 grid list-decimal gap-2 pl-5 marker:text-[var(--v2-teal)]">
                {SAFETY_GATES.map((g) => <li key={g} className="pl-1 text-[15px] leading-[1.5] text-[var(--v2-soft)]">{g}</li>)}
              </ol>
            </div>
          </details>
        </div>
      </div>
      </div>
    </section>
  );
}
