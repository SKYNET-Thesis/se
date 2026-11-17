import { Link } from 'react-router-dom';
import { ArrowRightIcon, ShieldCheckIcon } from 'lucide-react';
import type { ReadingPlan } from './lessonTeaching';
import { displayText } from './lessonTeaching';

/**
 * Course 1 teaching content, set like an edited chapter: a readable measure (~68ch), one body size, clear heading levels,
 * real lists, and safety guidance presented as part of the lesson rather than as an error banner. Only authored lesson
 * content is shown; nothing is invented to fill space.
 */

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Reading activity: summary, what you'll learn, the concept sections for this reading, and the safety checklist. */
export function ReadingChapter({ plan, title, fallback }: { plan: ReadingPlan; title: string; fallback?: string }) {
  const single = plan.sections.length === 1 && sameTitle(plan.sections[0].title, title);
  return <div className="space-y-9 text-[17px] leading-[1.7] text-ink">
    {plan.lead && <p className="max-w-[68ch] text-pretty text-[19px] leading-[1.6] text-ink-muted">{displayText(plan.lead)}</p>}
    {plan.objectives.length > 0 && <section aria-labelledby="learn-heading" className="max-w-[68ch]">
      <h2 id="learn-heading" className="text-[15px] font-semibold text-ink">In this lesson you’ll learn to</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-accent">{plan.objectives.map((item) => <li key={item}>{displayText(item)}</li>)}</ul>
    </section>}
    {plan.sections.length === 0 && fallback && <p className="max-w-[68ch]">{displayText(fallback)}</p>}
    {plan.sections.map((section, position) => (single || (position === 0 && sameTitle(section.title, title))
      // A section named like the page needs no second heading: its text simply opens the reading.
      ? <p key={section.title} className="max-w-[68ch] text-pretty">{displayText(section.content)}</p>
      : <section key={section.title} className="max-w-[68ch]">
        <h2 className="text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink">{section.title}</h2>
        <p className="mt-2.5 text-pretty">{displayText(section.content)}</p>
      </section>))}
    {plan.safety.length > 0 && <SafetyChecklist notes={plan.safety} />}
  </div>;
}

/**
 * Safety guidance as an authored checklist: a calm heading, a restrained shield icon and a numbered list. Error colours
 * are kept for real errors and hazards; this is instruction the student should follow every time.
 */
export function SafetyChecklist({ notes }: { notes: string[] }) {
  return <section aria-labelledby="safety-heading" className="max-w-[68ch] rounded-xl border border-line bg-surface p-5 md:p-6">
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgb(var(--nav-active-bg))] text-accent"><ShieldCheckIcon className="h-[18px] w-[18px]" aria-hidden /></span>
      <h2 id="safety-heading" className="text-lg font-semibold text-ink">Before operating the robot</h2>
    </div>
    <ol className="mt-4 space-y-3">{notes.map((note, position) => <li key={note} className="flex gap-3 text-[16px] leading-[1.6] text-ink">
      <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong text-[13px] font-semibold tabular-nums text-ink-muted">{position + 1}</span>
      <span className="min-w-0">{displayText(note)}</span>
    </li>)}</ol>
  </section>;
}

/**
 * Demonstration activity for Course 1 lessons. The course has no demonstration media (its lesson `media` is empty), so this
 * is presented honestly as a written walkthrough: the idea the robot demonstrates, then what the student will do with it.
 */
export function DemonstrationWalkthrough({ concept, task, nextHref, nextTitle }: { concept: string; task?: string | null; nextHref?: string | null; nextTitle?: string | null }) {
  return <div className="space-y-9 text-[17px] leading-[1.7] text-ink">
    <section aria-labelledby="concept-heading" className="max-w-[68ch]">
      <h2 id="concept-heading" className="text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink">How the robot does it</h2>
      <p className="mt-2.5 text-pretty">{displayText(concept)}</p>
    </section>
    {task && <section aria-labelledby="task-heading" className="max-w-[68ch] border-t border-line pt-7">
      <h2 id="task-heading" className="text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink">Where you’ll use this</h2>
      <p className="mt-2.5 text-pretty">{displayText(task)}</p>
      {nextHref && nextTitle && <Link to={nextHref} className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-accent hover:text-accent-hover">Go to {nextTitle} <ArrowRightIcon className="h-4 w-4" aria-hidden /></Link>}
    </section>}
  </div>;
}
