import { useState } from 'react';
import { ChevronDownIcon, Clock3Icon, LockIcon } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { buildLessonActivities, type LessonActivity, type LessonActivityType } from './lessonActivities';
import type { LessonDetailResponse } from '../../lib/api';

const labels: Record<LessonActivityType, string> = { reading: 'Reading', video: 'Video', demonstration: 'Demonstration', guided_practice: 'Guided Practice', knowledge_check: 'Knowledge Check', simulation: '3D Simulation', challenge: '3D Challenge', physical_lab: 'Physical Lab', result: 'Result / Evidence', reflection: 'Reflection' };

export function LessonActivitySections({ lesson, onAction }: { lesson: LessonDetailResponse; onAction?: (activity: LessonActivity) => void }) {
  const activities = buildLessonActivities(lesson);
  const [expanded, setExpanded] = useState(activities.find((item) => item.action === 'practice' || item.action === 'knowledge_check' || item.type === 'physical_lab')?.id ?? activities[0]?.id ?? '');
  return <section aria-labelledby="activities-heading" className="mt-8">
    <div className="flex items-end justify-between gap-4 border-b border-line pb-4"><div><h2 id="activities-heading" className="text-2xl font-bold text-ink">Learning activities</h2><p className="mt-1 text-sm text-ink-muted">Work through the lesson activities in order. Progress is recorded by the server.</p></div><span className="font-mono text-sm tabular-nums text-ink-subtle">{lesson.progressPercent}%</span></div>
    <ol className="divide-y divide-line">{activities.map((activity, index) => { const isOpen = expanded === activity.id; const unavailable = activity.status === 'unavailable'; return <li key={activity.id} className="py-1">
      <button type="button" aria-expanded={isOpen} aria-controls={`activity-${activity.id}`} onClick={() => setExpanded(isOpen ? '' : activity.id)} className="flex w-full items-center gap-4 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken font-mono text-sm text-ink-muted">{index + 1}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold text-ink">{activity.title}</span>{unavailable && <Badge tone="neutral">Unavailable</Badge>}</span><span className="mt-1 block text-sm text-ink-muted">{labels[activity.type]}{activity.durationMinutes ? ` · ${activity.durationMinutes} min` : ''}</span></span>{unavailable ? <LockIcon className="h-4 w-4 text-ink-subtle" /> : activity.durationMinutes ? <Clock3Icon className="h-4 w-4 text-ink-subtle" /> : null}<ChevronDownIcon className={`h-5 w-5 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div id={`activity-${activity.id}`} className="mb-5 ml-13 max-w-3xl pl-4 text-sm text-ink-muted"><p className="leading-6">{activity.description}</p>{activity.action === 'practice' && lesson.status === 'locked' && <button type="button" disabled className="mt-4 inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-muted"><LockIcon className="mr-2 h-4 w-4" /> Locked</button>}{activity.actionable && activity.action && onAction && lesson.status !== 'locked' && <button type="button" className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => onAction(activity)}>{activity.action === 'practice' ? (lesson.activeAttempt || lesson.status === 'in_progress' ? 'Continue Practice' : lesson.ordinal === 5 ? 'Continue to Physical Lab' : 'Start Practice') : activity.action === 'knowledge_check' ? 'Take Knowledge Check' : 'Open activity'}</button>}{lesson.ordinal === 5 && lesson.qualification && activity.type === 'physical_lab' && <button type="button" className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={() => onAction?.({ ...activity, action: 'practice' })}>Continue to Physical Lab</button>}</div>}
    </li>; })}</ol>
  </section>;
}
