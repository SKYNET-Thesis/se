import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon, ChevronDownIcon } from 'lucide-react';
import { activityTypeLabels, buildLessonActivitySections } from './lessonActivities';
import { ActivityCard } from './ActivityCard';
import { activityCompletionState } from './activityCompletionState';
import { useActivityProgress } from './useActivityProgress';
import type { LessonDetailResponse } from '../../lib/api';

/**
 * The lesson's activities in their authored order, led by the next one to do. "Next" is the first activity that is
 * available and not completed according to the server's activity progress; nothing is shown while that is unknown.
 */
export function LessonActivitySections({ lesson }: { lesson: LessonDetailResponse }) {
  const sections = buildLessonActivitySections(lesson);
  const activityProgressQuery = useActivityProgress(lesson.course_id);
  const completedActivityIds = activityProgressQuery.data?.activities
    .filter((item) => item.status === 'completed')
    .map((item) => item.activityId);
  const [expanded, setExpanded] = useState<string[]>(sections.map((section) => section.title));
  const toggle = (title: string) =>
    setExpanded((current) =>
      current.includes(title) ? current.filter((item) => item !== title) : [...current, title],
    );
  const locked = lesson.status === 'locked';
  const available = sections.flatMap((section) => section.items).filter((activity) => activity.status !== 'unavailable' && !locked);
  const done = completedActivityIds ? available.filter((activity) => completedActivityIds.includes(activity.id)).length : null;
  const next = completedActivityIds ? available.find((activity) => !completedActivityIds.includes(activity.id)) ?? null : undefined;
  const href = (id: string) => `/courses/${lesson.course_id}/lessons/${lesson.id}/activities/${id}`;

  return (
    <section aria-labelledby="activities-heading" className="mt-8">
      {next && (
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-medium text-ink-muted">{done ? 'Up next' : 'Start here'}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="break-words text-lg font-semibold text-ink">{next.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{activityTypeLabels[next.type]}{next.durationMinutes ? `, about ${next.durationMinutes} min` : ''}</p>
            </div>
            <Link to={href(next.id)} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">
              {done ? 'Continue' : 'Start'} <ArrowRightIcon className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}
      {next === null && available.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface p-4 text-sm font-medium text-ok"><CheckIcon className="h-4 w-4" aria-hidden />You’ve completed every activity in this lesson.</p>
      )}

      <div className="mt-8 flex items-end justify-between gap-4 border-b border-line pb-3">
        <h2 id="activities-heading" className="text-xl font-semibold text-ink">
          Learning activities
        </h2>
        {done !== null && available.length > 0 && <p className="text-sm tabular-nums text-ink-muted">{done} of {available.length} done</p>}
      </div>
      {!activityProgressQuery.canVerify && (
        <p role="status" className="mt-3 text-sm text-ink-muted">Sign in to verify activity progress.</p>
      )}
      {activityProgressQuery.canVerify && !activityProgressQuery.data && activityProgressQuery.isPending && (
        <p role="status" className="mt-3 text-sm text-ink-muted">Checking activity progress…</p>
      )}
      {activityProgressQuery.isError && (
        <p role="alert" className="mt-3 text-sm text-ink-muted">
          {activityProgressQuery.data ? 'Progress could not be updated.' : 'Activity progress could not be verified.'}
          <button type="button" className="ml-2 font-semibold text-accent-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => void activityProgressQuery.refetch()}>Retry</button>
        </p>
      )}

      {sections.map((section) => {
        const open = expanded.includes(section.title);
        const id = `section-${section.title.replace(/\W+/g, '-').toLowerCase()}`;
        return (
          <section key={section.title} className="border-b border-line">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => toggle(section.title)}
              className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-ink transition-colors duration-200 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{section.title}</span>
              <ChevronDownIcon
                aria-hidden
                className={`h-5 w-5 text-ink-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${
                  open ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              id={id}
              hidden={!open}
              style={!open ? { display: 'none' } : undefined}
              className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0">
                <div className="space-y-1 pb-4">
                  {section.items.map((activity) => {
                    const unavailable = activity.status === 'unavailable' || locked;
                    return (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        href={unavailable ? undefined : href(activity.id)}
                        completion={unavailable ? 'locked' : completedActivityIds ? activityCompletionState(activity.id, { completedActivityIds }) : 'checking'}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </section>
  );
}
