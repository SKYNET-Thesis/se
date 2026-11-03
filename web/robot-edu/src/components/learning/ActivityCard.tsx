import { Link } from 'react-router-dom';
import { ActivityCompletionIndicator } from './ActivityCompletionIndicator';
import type { ActivityCompletionState } from './activityCompletionState';
import { activityTypeLabels, type LessonActivity } from './lessonActivities';

export function ActivityCard({
  activity,
  href,
  completion = 'incomplete',
  active = false,
}: {
  activity: LessonActivity;
  href?: string;
  completion?: ActivityCompletionState;
  active?: boolean;
}) {
  const locked = completion === 'locked' || activity.status === 'unavailable';
  const state = locked ? 'locked' : completion;
  const content = (
    <>
      <ActivityCompletionIndicator state={state} activityTitle={activity.title} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-5 text-ink">{activity.title}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          {activityTypeLabels[activity.type]}
          {activity.durationMinutes ? ` • ${activity.durationMinutes} min` : ''}
        </span>
      </span>
    </>
  );
  const className = `flex items-start gap-3 rounded-lg px-3 py-2.5 text-left ${
    active ? 'bg-accent-soft text-accent-ink' : 'text-ink'
  }`;

  return locked || !href ? (
    <div aria-disabled={locked ? 'true' : undefined} className={className}>{content}</div>
  ) : (
    <Link
      to={href}
      aria-current={active ? 'page' : undefined}
      className={`${className} hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {content}
    </Link>
  );
}
