import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { buildLessonActivitySections } from './lessonActivities';
import { ActivityCard } from './ActivityCard';
import { activityCompletionState } from './activityCompletionState';
import { useActivityProgress } from './useActivityProgress';
import type { LessonDetailResponse } from '../../lib/api';

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

  return (
    <section aria-labelledby="activities-heading" className="mt-8">
      <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 id="activities-heading" className="text-2xl font-bold text-ink">
            Learning activities
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Choose an activity to enter its focused learning workspace.
          </p>
        </div>
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
          <section key={section.title} className="border-b border-line py-2">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => toggle(section.title)}
              className="flex min-h-11 w-full items-center justify-between gap-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted transition-colors duration-200 ease-out hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{section.title}</span>
              <ChevronDownIcon
                className={`h-5 w-5 transition-transform duration-200 ease-out motion-reduce:transition-none ${
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
                <div className="space-y-2 pb-5 pl-2">
                  {section.items.map((activity) => {
                    const unavailable = activity.status === 'unavailable' || lesson.status === 'locked';
                    return (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        href={unavailable ? undefined : `/courses/${lesson.course_id}/lessons/${lesson.id}/activities/${activity.id}`}
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
