import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, LockIcon, PlayCircleIcon } from 'lucide-react';
import { Badge } from '../ui/Badge';
import {
  buildLessonActivitySections,
  activityTypeLabels,
} from './lessonActivities';
import type { LessonDetailResponse } from '../../lib/api';

export function LessonActivitySections({ lesson }: { lesson: LessonDetailResponse }) {
  const sections = buildLessonActivitySections(lesson);
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
        <span className="font-mono text-sm tabular-nums text-ink-subtle">
          {lesson.progressPercent}%
        </span>
      </div>

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
              className="flex w-full items-center justify-between gap-4 py-5 text-left font-semibold text-ink transition-colors duration-200 ease-out hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0">
                <div className="space-y-1 pb-4">
                  {section.items.map((activity) => {
                    const unavailable = activity.status === 'unavailable' || lesson.status === 'locked';
                    const content = (
                      <>
                        <span className="shrink-0 text-accent-ink">
                          {unavailable ? (
                            <LockIcon className="h-4 w-4 text-ink-subtle" />
                          ) : (
                            <PlayCircleIcon className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{activity.title}</span>
                          <span className="mt-0.5 block text-xs text-ink-muted">
                            {activityTypeLabels[activity.type]}
                            {activity.durationMinutes ? ` • ${activity.durationMinutes} min` : ''}
                          </span>
                        </span>
                        {unavailable && <Badge tone="neutral">Unavailable</Badge>}
                      </>
                    );

                    return unavailable ? (
                      <div
                        key={activity.id}
                        aria-disabled="true"
                        className="flex items-center gap-3 rounded-lg px-3 py-3 text-ink-muted cursor-default"
                      >
                        {content}
                      </div>
                    ) : (
                      <Link
                        key={activity.id}
                        to={`/courses/${lesson.course_id}/lessons/${lesson.id}/activities/${activity.id}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors duration-150 ease-out hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {content}
                      </Link>
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
