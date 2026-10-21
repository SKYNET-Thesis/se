import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardListIcon, SearchIcon } from 'lucide-react';
import type { AssignmentStatus } from '../types/learning';
import { useLearning } from '../contexts/LearningContext';
import { PageHeader } from '../components/ui/PageHeader';
import { DemoTag } from '../components/ui/DemoTag';
import { Tabs } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { assignmentStatusMeta } from '../utils/assignmentStatus';
import { describeDue } from '../utils/format';
import { cn } from '../utils/cn';

type Filter = 'todo' | 'submitted' | 'all';

const FILTER_STATUSES: Record<Filter, AssignmentStatus[]> = {
  todo: ['not_started', 'in_progress'],
  submitted: ['submitted_local', 'reviewed'],
  all: ['not_started', 'in_progress', 'submitted_local', 'reviewed']
};

export function Assignments() {
  const { assignments, getProgress, getCourse } = useLearning();
  const [filter, setFilter] = useState<Filter>('todo');
  const [query, setQuery] = useState('');

  const published = assignments.filter((a) => a.published);
  const counts = useMemo(
    () => ({
      todo: published.filter((a) => FILTER_STATUSES.todo.includes(getProgress(a.id).status)).length,
      submitted: published.filter((a) => FILTER_STATUSES.submitted.includes(getProgress(a.id).status)).length,
      all: published.length
    }),
    [published, getProgress]
  );

  const list = published.
  filter((a) => FILTER_STATUSES[filter].includes(getProgress(a.id).status)).
  filter((a) => !query.trim() || `${a.title} ${a.summary}`.toLowerCase().includes(query.trim().toLowerCase())).
  sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader eyebrow={<DemoTag label="Demo assignments" />} title="Assignments" description="Programming tasks you complete in the Studio and check in the simulator." />

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Tabs
          label="Assignment filter"
          value={filter}
          onChange={setFilter}
          items={[
          { id: 'todo', label: 'To do', count: counts.todo },
          { id: 'submitted', label: 'Submitted', count: counts.submitted },
          { id: 'all', label: 'All', count: counts.all }]
          }
          className="flex-1 md:mr-6" />
        
        <label className="flex h-9 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 md:w-64">
          <SearchIcon className="h-4 w-4 text-ink-subtle" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assignments" aria-label="Search assignments" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle" />
        </label>
      </div>

      <div role="tabpanel" id={`panel-${filter}`} aria-labelledby={`tab-${filter}`}>
        {list.length === 0 ?
        <EmptyState icon={<ClipboardListIcon />} title={filter === 'todo' && !query ? 'Nothing left to do' : 'No assignments here'} description={query ? 'Try a different search.' : undefined} /> :

        <ul className="divide-y divide-line">
            {list.map((a) => {
            const due = describeDue(a.dueDate);
            const status = assignmentStatusMeta[getProgress(a.id).status];
            const course = getCourse(a.courseId);
            return (
              <li key={a.id}>
                  <Link to={`/assignments/${a.id}`} className="-mx-3 grid gap-2 rounded-md px-3 py-4 hover:bg-sunken/70 md:grid-cols-[1fr_160px_140px_120px] md:items-center md:gap-6">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{a.title}</p>
                      <p className="mt-0.5 truncate text-sm text-ink-muted">{a.summary}</p>
                    </div>
                    <p className="text-[13px] text-ink-muted">{course?.code ?? '—'} · {a.points} pts</p>
                    <p className={cn('text-[13px] font-medium', due.tone === 'danger' ? 'text-danger' : due.tone === 'warn' ? 'text-warn' : 'text-ink-muted')}>{due.label}</p>
                    <div className="md:text-right">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  </Link>
                </li>);

          })}
          </ul>
        }
      </div>
    </div>);

}