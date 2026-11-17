import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

const statusLabel: Record<string, string> = { completed: 'Completed', in_progress: 'In progress', not_started: 'Not started', locked: 'Locked' };
const statusTone = (status: string) => (status === 'completed' ? 'ok' : status === 'in_progress' ? 'warn' : 'outline') as 'ok' | 'warn' | 'outline';

function LessonDrillDown({ classroomId, learnerUserId, token }: { classroomId: string; learnerUserId: string; token: string }) {
  const lessons = useQuery({ queryKey: ['teacher-learner-lessons', classroomId, learnerUserId], queryFn: () => instructorApi.learnerLessons(classroomId, learnerUserId, token) });
  if (lessons.isLoading) return <p role="status" className="py-2 text-sm text-ink-muted">Loading lessons…</p>;
  if (lessons.error || !lessons.data) return <p role="alert" className="py-2 text-sm text-danger">Lesson progress could not be loaded.</p>;
  return <ol aria-label={`Lessons of ${lessons.data.fullName ?? 'student'}`} className="divide-y divide-line rounded-md border border-line">
    {lessons.data.lessons.map((l) => <li key={l.lessonId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="font-medium text-ink">{l.ordinal}. {l.title}</span>
      <span className="flex items-center gap-3 text-ink-muted"><Badge tone={statusTone(l.status)}>{statusLabel[l.status] ?? l.status}</Badge><span>{l.attempts} attempt{l.attempts === 1 ? '' : 's'}</span><span>{l.bestQuizScore === null ? 'No quiz score' : `Best ${Math.round(l.bestQuizScore * 100) / 100}%`}</span></span>
    </li>)}
  </ol>;
}

/** Instructor monitoring: each enrolled learner's course progress (same rule as the learner's own course path), with a per-lesson drill-down. */
export function LearnerProgressTable({ classroomId, token }: { classroomId: string; token: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const progress = useQuery({ queryKey: ['teacher-learner-progress', classroomId], queryFn: () => instructorApi.learnerProgress(classroomId, token), enabled: Boolean(classroomId && token) });
  return <section aria-label="Learner progress" className="mt-10">
    <h2 className="text-xl font-semibold text-ink">Learner progress</h2>
    <p className="mt-1 text-sm text-ink-muted">Lessons completed, quiz and assignment attempts, and best auto-graded score per enrolled student. Open a student to see each lesson.</p>
    {progress.isLoading && <p className="mt-3 text-sm text-ink-muted">Loading learner progress…</p>}
    {progress.error && <p role="alert" className="mt-3 text-sm text-danger">Learner progress could not be loaded.</p>}
    {progress.data && !progress.data.length && <p className="mt-3 text-sm text-ink-muted">No enrolled students yet.</p>}
    {!!progress.data?.length && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-sm">
      <thead className="text-xs text-ink-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Student</th><th scope="col" className="py-2 pr-3 font-medium">Course progress</th><th scope="col" className="py-2 pr-3 font-medium">Lessons</th><th scope="col" className="py-2 pr-3 font-medium">Attempts submitted</th><th scope="col" className="py-2 pr-3 font-medium">Best score</th><th scope="col" className="py-2 pr-3 font-medium">Last activity</th><th scope="col" className="py-2 font-medium"><span className="sr-only">Details</span></th></tr></thead>
      <tbody className="divide-y divide-line">{progress.data.map((p) => <Fragment key={p.learnerUserId}>
        <tr>
          <td className="py-2 pr-3 font-medium text-ink">{p.fullName ?? 'Student'}</td>
          <td className="py-2 pr-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded bg-sunken" role="progressbar" aria-valuenow={p.progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.fullName ?? 'Student'} course progress`}><div className="h-full bg-[#176255]" style={{ width: `${p.progressPercent}%` }} /></div><span>{p.progressPercent}%</span></div></td>
          <td className="py-2 pr-3">{p.lessonsCompleted} / {p.lessonCount}</td>
          <td className="py-2 pr-3">{p.attemptsSubmitted}</td>
          <td className="py-2 pr-3">{p.bestScore === null ? '—' : `${Math.round(p.bestScore * 100) / 100}%`}</td>
          <td className="py-2 pr-3 text-ink-muted">{p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleDateString() : '—'}</td>
          <td className="py-2 text-right"><Button size="sm" variant="ghost" aria-expanded={open === p.learnerUserId} aria-label={`${open === p.learnerUserId ? 'Hide' : 'Show'} lessons for ${p.fullName ?? 'student'}`} onClick={() => setOpen(open === p.learnerUserId ? null : p.learnerUserId)}>{open === p.learnerUserId ? 'Hide lessons' : 'Lessons'}</Button></td>
        </tr>
        {open === p.learnerUserId && <tr><td colSpan={7} className="pb-3"><LessonDrillDown classroomId={classroomId} learnerUserId={p.learnerUserId} token={token} /></td></tr>}
      </Fragment>)}</tbody></table></div>}
  </section>;
}
