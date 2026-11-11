import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { useHomeCta } from '../home/HomeCta';
import type { JointName } from '../home-lab/robotScene';
import { useV2Scene } from './V2Scene';

/** Joint names exactly as in so101_new_calib.urdf. */
const CALLOUTS: Array<{ joint: JointName; label: string }> = [
  { joint: 'Rotation', label: 'Rotation' },
  { joint: 'Pitch', label: 'Pitch' },
  { joint: 'Elbow', label: 'Elbow' },
  { joint: 'Wrist_Pitch', label: 'Wrist pitch' },
  { joint: 'Jaw', label: 'Jaw' },
];

/**
 * S1 (Concept A): the lit SO-101 is the subject; the headline sits low on the left like a film title.
 * Joint callouts are the URDF's real joint names, projected from the model on every frame.
 */
export function HeroChapter() {
  const { scene, ready, active, mobile, mode } = useV2Scene();
  const cta = useHomeCta();
  const callouts = useRef<Array<HTMLDivElement | null>>([]);
  const layer = useRef<HTMLDivElement>(null);
  const showCallouts = mode === '3d' && !mobile && active === 'hero';

  useEffect(() => {
    const s = scene.current;
    if (!ready || !s || mobile) return undefined;
    return s.onFrame(() => {
      // The canvas is fixed to the viewport; the labels live inside the hero, so offset by its position.
      const box = layer.current?.getBoundingClientRect(); if (!box) return;
      CALLOUTS.forEach((c, i) => {
        const el = callouts.current[i]; const p = s.project(c.joint);
        if (el && p) el.style.transform = `translate3d(${p.x - box.left}px, ${p.y - box.top}px, 0)`;
      });
    });
  }, [ready, mobile, scene]);

  return (
    <section data-scene="hero" aria-labelledby="v2-title" className="relative z-10 h-[100svh] min-h-[600px]">
      {/* The arm's place: above the copy on phones and portrait tablets, to its right on wide screens. */}
      <div data-stage-window="bleed" aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[56%] [--stage-ay:0.56] lg:inset-y-0 lg:left-[34%] lg:right-0 lg:h-auto lg:[--stage-ax:0.56] lg:[--stage-ay:0.52]" />
      <div ref={layer} aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500', showCallouts && ready ? 'opacity-100' : 'opacity-0')}>
        {CALLOUTS.map((c, i) => (
          <div key={c.joint} ref={(el) => { callouts.current[i] = el; }} className="absolute left-0 top-0">
            <span className="absolute -left-[3px] -top-[3px] h-[6px] w-[6px] rounded-full bg-[var(--v2-teal)]" />
            {/* A leader line pointing at the joint, not a divider. */}
            <span className="absolute left-[3px] top-0 h-px w-14 bg-[var(--v2-line-strong)]" /> {/* taste-skill-ignore */}
            <code className="v2-mono absolute left-[64px] top-[-9px] whitespace-nowrap text-[13px] text-[var(--v2-soft)]">{c.label}</code>
          </div>
        ))}
      </div>

            <div className="v2-enter v2-hero-copy absolute inset-x-0 bottom-0 px-[var(--v2-margin)] pb-[clamp(28px,7svh,88px)]">
        <h1 id="v2-title" className="v2-display max-w-[12ch] text-[clamp(46px,min(7.2vw,12.5svh),132px)] font-medium">
          <span className="v2-line"><span style={{ ['--d' as string]: 200 }}>Learn robotics</span></span>{' '}
          <span className="v2-line"><span style={{ ['--d' as string]: 320 }}>with the SO-101</span></span>
        </h1>
        <div className="mt-7 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <p className="v2-rise max-w-[44ch] text-[17px] leading-[1.55] text-[var(--v2-soft)]" style={{ ['--d' as string]: 620 }}>
            VISTA is a robotics classroom built around the SO-ARM101 arm. Students program it, watch every step in a 3D preview, and see how a robot moves before any hardware does. The physical robot stays locked in this release.
          </p>
          <div className="v2-rise flex flex-wrap items-center gap-x-6 gap-y-3" style={{ ['--d' as string]: 760 }}>
            <Link to={cta.to} className="inline-flex h-12 items-center rounded-[4px] bg-[var(--v2-teal)] px-6 text-[15px] font-semibold text-[var(--v2-void)] transition-[background-color,transform] duration-150 hover:bg-[var(--v2-text)] active:scale-[0.98]">{cta.label}</Link>
            <a href="#v2-lesson" className="inline-flex h-12 items-center text-[15px] font-semibold underline decoration-[var(--v2-line-strong)] decoration-2 underline-offset-[7px] transition-colors hover:decoration-[var(--v2-teal)]">Try lesson one</a>
          </div>
        </div>
      </div>
    </section>
  );
}
