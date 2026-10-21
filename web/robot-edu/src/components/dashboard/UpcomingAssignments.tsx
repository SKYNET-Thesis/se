import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardListIcon } from 'lucide-react';
import { useLearning } from '../../contexts/LearningContext';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';
import { describeDue } from '../../utils/format';
import { assignmentStatusMeta } from '../../utils/assignmentStatus';
import { cn } from '../../utils/cn';

export function UpcomingAssignments() {
  const { assignments, getProgress, getCourse } = useLearning();
  const upcoming = assignments.
  filter((a) => a.published).
  filter((a) => {
    const s = getProgress(a.id).status;
    return s === 'not_started' || s === 'in_progress';
  }).
  sort((a, b) => a.dueDate.localeCompare(b.dueDate)).
  slice(0, 4);

  return (
    <section aria-labelledby="upcoming-heading">
      <SectionHeading
        id="upcoming-heading"
        title="Upcoming assignments"
        action={
        <Link to="/assignments" className="font-medium text-accent hover:text-accent-hover">
            View all
          </Link>
        } />
      
      {upcoming.length === 0 ?
      <EmptyState compact icon={<ClipboardListIcon />} title="You're all caught up" description="No open assignments right now." /> :

      <ul className="divide-y divide-line border-y border-line">
          {upcoming.map((a) => {
          const due = describeDue(a.dueDate);
          const status = assignmentStatusMeta[getProgress(a.id).status];
          return (
            <li key={a.id}>
                <Link to={`/assignments/${a.id}`} className="-mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-3 hover:bg-sunken/70">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">{getCourse(a.courseId)?.code}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn('text-xs font-medium', due.tone === 'danger' ? 'text-danger' : due.tone === 'warn' ? 'text-warn' : 'text-ink-muted')}>{due.label}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                </Link>
              </li>);

        })}
        </ul>
      }
    </section>);

}