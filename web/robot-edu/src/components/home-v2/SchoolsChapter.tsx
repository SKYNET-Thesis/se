import { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { cn } from '../../utils/cn';
import { PrimaryCta } from '../home/HomeCta';
import { useReveal } from '../home/useReveal';
import { ACTOR_ACCENT, SCHOOL_FLOW } from './content';
import { Relationships } from './schools/Relationships';

/**
 * S8 — how a school is set up. The four steps scroll on the left on a rail drawn by scrolling; beside
 * them, the relationships they create light up in a field: who creates, assigns, enrols, finds, submits
 * and answers. No statistics, no contact form; the action is the existing sign-in route, and CSV import
 * stays templates and a local preview.
 */
export function SchoolsChapter() {
  const reveal = useReveal<HTMLElement>(0.15);
  const reduce = useReducedMotion() ?? false;
  const list = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: list, offset: ['start 70%', 'end 50%'] });
  const scale = useTransform(scrollYProgress, (v) => (reduce ? 1 : v));
  const [reached, setReached] = useState(reduce ? SCHOOL_FLOW.length : 0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => { if (!reduce) setReached(Math.min(SCHOOL_FLOW.length, Math.floor(v * SCHOOL_FLOW.length * 0.999) + (v > 0.02 ? 1 : 0))); });

  return (
    <section id="v2-schools" ref={reveal} aria-labelledby="v2-schools-title" className="v2-anchor v2-anchor-tight v2-reveal relative z-10 bg-[var(--v2-graphite)] px-[var(--v2-margin)] py-[var(--v2-section)]">
      <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <h2 id="v2-schools-title" data-reveal className="v2-display text-[length:var(--v2-head)] font-medium">Accounts come from your school</h2>
          <p data-reveal style={{ ['--d' as string]: 80 }} className="mt-6 max-w-[40ch] text-[17px] leading-[1.55] text-[var(--v2-soft)]">There is no public sign-up. Each school sets up its own people and classrooms, and everyone signs in with the account their school provides.</p>
          <div data-reveal style={{ ['--d' as string]: 160 }} className="mt-10">
            <PrimaryCta className="rounded-[4px] bg-[var(--v2-teal)] text-[var(--v2-void)] hover:bg-[var(--v2-text)]" />
            <p className="mt-4 max-w-[42ch] text-[14px] leading-[1.5] text-[var(--v2-muted)]">Importing people from a CSV file currently offers templates and a local preview only. It does not create accounts.</p>
          </div>

          <ol ref={list} aria-label="How a school is set up" className="relative mt-[clamp(40px,8svh,80px)]">
            <span aria-hidden className="absolute bottom-6 left-[11px] top-6 w-[2px] bg-white/10" />
            <motion.span aria-hidden className="absolute bottom-6 left-[11px] top-6 w-[2px] origin-top bg-[var(--v2-teal)]" style={{ scaleY: scale }} />
            {SCHOOL_FLOW.map((step, i) => {
              const on = i < reached;
              return (
                <li key={step.title} className="relative grid grid-cols-[24px_1fr] gap-6 pb-[clamp(32px,6svh,64px)] last:pb-0">
                  <span aria-hidden className={cn('relative z-10 mt-1.5 h-6 w-6 rounded-full transition-colors duration-500', on ? 'bg-[var(--v2-teal)]' : 'bg-[var(--v2-graphite-3)]')} />
                  {/* Steps not yet reached stay fully readable; only the heading's tone and the marker change. */}
                  <div>
                    <h3 className={cn('v2-display text-[clamp(24px,2vw,34px)] font-medium transition-colors duration-500', on ? 'text-[var(--v2-text)]' : 'text-[var(--v2-soft)]')}>{step.title}</h3>
                    {/* Who does the step belongs to its own heading, so it sits under it (not above the next one). */}
                    <p className="mt-2 inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: ACTOR_ACCENT[step.actor] }}>
                      <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: ACTOR_ACCENT[step.actor] }} />Done by: {step.actor}
                    </p>
                    <p className="mt-2 max-w-[44ch] text-[16px] leading-[1.55] text-[var(--v2-soft)]">{step.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          {/* Pinned beside the steps, and never taller than the screen below the header: the field narrows instead. */}
          <div className="bg-[var(--v2-graphite-2)] px-[clamp(20px,3vw,48px)] py-[clamp(24px,4svh,64px)] lg:sticky lg:top-[calc(var(--v2-header)+24px)]">
            <div className="mx-auto w-[min(100%,calc((100svh-var(--v2-header)-120px-2*clamp(24px,4svh,64px))*1.61))]">
              <Relationships reached={reached} current={reached - 1} />
              <p className="mt-[clamp(16px,3svh,28px)] max-w-[52ch] text-[14px] leading-[1.5] text-[var(--v2-soft)]">Each arrow reads from one side to the other: who acts, and on whom. Arrows turn teal as the steps beside them are reached.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
