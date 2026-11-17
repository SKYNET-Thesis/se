import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CheckCircle2Icon, CheckIcon, CircleAlertIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';

/**
 * Presentation shared by both quiz engines (Course 1 lesson knowledge checks and A06 classroom quizzes). Only layout and
 * interaction live here; each engine keeps its own API calls, attempt model and grading contract.
 */

export interface AssessmentOption { id: string; text: string }

/** Numbered map of the questions: current filled, answered tinted with a check, unanswered dashed. */
export function QuestionMap({ count, current, answered, missing, onSelect }: { count: number; current: number; answered: (index: number) => boolean; missing?: number[] | null; onSelect: (index: number) => void }) {
  const answeredCount = Array.from({ length: count }, (_, index) => answered(index)).filter(Boolean).length;
  return <nav aria-label="Questions" className="border-t border-line pt-4">
    <p className="text-sm tabular-nums text-ink-muted"><span className="font-semibold text-ink">Question {current + 1} of {count}</span> · {answeredCount === count ? 'all answered' : `${answeredCount} answered`}</p>
    <ol className="mt-2.5 flex flex-wrap gap-2">{Array.from({ length: count }, (_, position) => {
      const done = answered(position);
      const active = position === current;
      return <li key={position}><button type="button" onClick={() => onSelect(position)} aria-current={active ? 'step' : undefined}
        aria-label={`Question ${position + 1}, ${done ? 'answered' : 'not answered'}`}
        className={cn('relative grid h-10 w-10 place-items-center rounded-md border text-sm font-semibold tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          active ? 'border-accent bg-accent text-white' : done ? 'border-accent/40 bg-[rgb(var(--nav-active-bg))] text-accent hover:border-accent' : 'border-dashed border-line-strong bg-surface text-ink-muted hover:bg-sunken',
          missing?.includes(position) && !active && 'border-danger text-danger')}>
        {position + 1}{done && !active && <CheckIcon aria-hidden className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-accent p-0.5 text-white" />}
      </button></li>;
    })}</ol>
  </nav>;
}

/**
 * One question: the stem is the largest text on the screen, the hint says how many answers to pick, and each answer is a
 * full-width label around a native radio or checkbox (one hit target, keyboard and screen-reader semantics for free).
 */
export function QuestionPrompt({ id, index, total, stem, hint, multiple, options, selected, disabled, onChoose, headingRef, layout = 'stack' }: {
  id: string; index: number; total: number; stem: string; hint: string; multiple: boolean; options: AssessmentOption[]; selected: string[];
  disabled?: boolean; onChoose: (optionId: string, checked: boolean) => void; headingRef?: RefObject<HTMLHeadingElement>; layout?: 'stack' | 'pair';
}) {
  return <fieldset disabled={disabled} aria-describedby={`hint-${id}`} className="mt-7 md:mt-8">
    <legend className="sr-only">Question {index + 1} of {total}</legend>
    <h2 ref={headingRef} tabIndex={-1} className="max-w-[60ch] text-pretty whitespace-pre-wrap break-words text-[21px] font-semibold leading-[1.35] tracking-[-0.01em] text-ink outline-none focus-visible:outline-none md:text-2xl">{stem}</h2>
    <p id={`hint-${id}`} className="mt-2 text-sm text-ink-muted">{hint}</p>
    <div className={cn('mt-5 gap-2.5', layout === 'pair' ? 'grid sm:grid-cols-2' : 'space-y-2.5')}>{options.map((option) => {
      const checked = selected.includes(option.id);
      return <label key={option.id} className={cn('flex min-h-[52px] cursor-pointer items-start gap-3 rounded-lg border bg-surface px-4 py-3.5 text-base leading-6 transition-colors duration-150 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-1 [touch-action:manipulation]',
        checked ? 'border-accent bg-[rgb(var(--nav-active-bg))] text-ink shadow-[inset_0_0_0_1px_rgb(var(--accent))]' : 'border-line text-ink hover:border-line-strong hover:bg-sunken', disabled && 'cursor-default')}>
        <input type={multiple ? 'checkbox' : 'radio'} name={id} value={option.id} checked={checked}
          onChange={(event) => onChoose(option.id, event.target.checked)} className="mt-1 h-[18px] w-[18px] shrink-0 accent-[rgb(var(--accent))]" />
        <span className={cn('min-w-0 break-words', checked && 'font-medium')}>{option.text}</span>
      </label>;
    })}</div>
  </fieldset>;
}

/** Unanswered questions, with a link to each. Shown instead of sending an incomplete quiz the server would refuse. */
export function UnansweredNotice({ missing, onSelect }: { missing: number[]; onSelect: (index: number) => void }) {
  return <div role="alert" className="mt-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-ink">
    <p className="flex items-center gap-2 font-medium"><CircleAlertIcon className="h-4 w-4 text-danger" aria-hidden />{missing.length === 1 ? 'One question still needs an answer.' : `${missing.length} questions still need an answer.`}</p>
    <p className="mt-2 flex flex-wrap gap-2">{missing.map((position) => <button key={position} type="button" onClick={() => onSelect(position)} className="min-h-[32px] rounded-md px-2 font-semibold text-accent underline underline-offset-4 hover:text-accent-hover">Go to question {position + 1}</button>)}</p>
  </div>;
}

/** Previous / Next / Submit, pinned to the bottom of the screen on phones so finishing never means hunting for a button. */
export function StepNav({ first, last, busy, locked, onPrevious, onNext, onSubmit, footnote }: { first: boolean; last: boolean; busy?: boolean; locked?: boolean; onPrevious: () => void; onNext: () => void; onSubmit: () => void; footnote?: ReactNode }) {
  return <>
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-canvas/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm md:static md:mx-0 md:mt-8 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      {footnote}
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" className="h-11" disabled={first} onClick={onPrevious} icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden />}>Previous</Button>
        {last
          ? <Button variant="primary" className="h-11 px-5" loading={busy} disabled={locked} onClick={onSubmit}>{busy ? 'Submitting…' : 'Submit quiz'}</Button>
          : <Button variant="primary" className="h-11 px-5" onClick={onNext}>Next <ArrowRightIcon className="h-4 w-4" aria-hidden /></Button>}
      </div>
    </div>
    <p aria-live="polite" className="sr-only">{busy ? 'Submitting your answers…' : ''}</p>
  </>;
}

/**
 * Overall standing when an earlier attempt passed: the server keeps the quiz (and its lesson) passed once any attempt
 * passes, so a lower score on a later attempt does not undo it.
 */
export function PassedEarlierNote({ attempt }: { attempt?: number | null }) {
  return <p className="flex items-start gap-2"><CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
    <span><span className="font-semibold">Quiz status: Passed</span>{attempt ? ` on attempt ${attempt}` : ' on an earlier attempt'}. A passing attempt is kept, so the lesson stays complete. This attempt doesn’t change that.</span></p>;
}

/**
 * The verdict panel: what happened, the score against the pass mark (when the server states one), supporting facts and
 * one clear next step. Focus moves to the verdict right after a submission so it is heard first.
 */
export function ResultSummary({ passed, score, passPercent, facts, notes, overall, actions, announce }: {
  passed: boolean; score: number; passPercent?: number | null; facts: Array<string | null | false | undefined>; notes?: ReactNode;
  /** The student's standing on the quiz as a whole (e.g. passed on an earlier attempt), kept apart from this attempt. */
  overall?: ReactNode;
  actions?: ReactNode; announce: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (announce) heading.current?.focus(); }, [announce]);
  const shown = Math.max(0, Math.min(100, score));
  const mark = typeof passPercent === 'number' ? Math.max(0, Math.min(100, passPercent)) : null;
  return <section aria-labelledby="quiz-result-heading" className="mt-6 rounded-xl border border-line bg-surface p-5 md:p-7">
    <div role="status" className="flex items-start gap-3">
      {passed ? <CheckCircle2Icon className="mt-1 h-6 w-6 shrink-0 text-ok" aria-hidden /> : <CircleAlertIcon className="mt-1 h-6 w-6 shrink-0 text-warn" aria-hidden />}
      <div className="min-w-0 flex-1">
        {/* "This attempt" is part of the heading so the verdict is never mistaken for the student's overall quiz status. */}
        <h2 id="quiz-result-heading" ref={heading} tabIndex={-1} className="text-[22px] font-semibold leading-tight text-ink outline-none focus-visible:outline-none"><span className="mb-0.5 block text-sm font-medium text-ink-muted">This attempt</span>{passed ? 'You passed' : 'Not passed yet'}</h2>
        <p className="mt-1.5 text-[15px] tabular-nums text-ink"><span className="text-[28px] font-semibold leading-none tracking-[-0.02em]">{score}%</span>{mark !== null && <span className="ml-2 text-ink-muted">You needed {mark}% to pass.</span>}</p>
        {/* Score against the pass mark; the sentence above carries the same information for screen readers. */}
        <div aria-hidden className="relative mt-3 h-2 max-w-md rounded-full bg-sunken">
          <div className={cn('h-2 rounded-full', passed ? 'bg-ok' : 'bg-warn')} style={{ width: `${shown}%` }} />
          {mark !== null && <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `calc(${mark}% - 1px)` }} />}
        </div>
        {facts.some(Boolean) && <p className="mt-3 text-sm tabular-nums text-ink-muted">{facts.filter(Boolean).join(' · ')}</p>}
        {notes}
        {overall && <div className="mt-4 border-t border-line pt-4 text-[15px] text-ink">{overall}</div>}
        {actions && <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  </section>;
}
