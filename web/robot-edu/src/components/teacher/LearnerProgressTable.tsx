import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '../../lib/api';

/** Instructor monitoring: each enrolled learner's course progress (same rule as the learner's own course path) and attempt evidence. */
export function LearnerProgressTable({ classroomId, token }: { classroomId: string; token: string }) {
  const progress = useQuery({ queryKey: ['teacher-learner-progress', classroomId], queryFn: () => instructorApi.learnerProgress(classroomId, token), enabled: Boolean(classroomId && token) });
  return <section aria-label="Learner progress" className="mt-10">
    <h2 className="text-xl font-semibold text-ink">Learner progress</h2>
    <p className="mt-1 text-sm text-ink-muted">Lessons completed, quiz and assignment attempts, and best auto-graded score per enrolled student.</p>
    {progress.isLoading && <p className="mt-3 text-sm text-ink-muted">Loading learner progress…</p>}
    {progress.error && <p role="alert" className="mt-3 text-sm text-danger">Learner progress could not be loaded.</p>}
    {progress.data && !progress.data.length && <p className="mt-3 text-sm text-ink-muted">No enrolled students yet.</p>}
    {!!progress.data?.length && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm">
      <thead className="text-xs text-ink-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Student</th><th scope="col" className="py-2 pr-3 font-medium">Course progress</th><th scope="col" className="py-2 pr-3 font-medium">Lessons</th><th scope="col" className="py-2 pr-3 font-medium">Attempts submitted</th><th scope="col" className="py-2 pr-3 font-medium">Best score</th><th scope="col" className="py-2 font-medium">Last activity</th></tr></thead>
      <tbody className="divide-y divide-line">{progress.data.map((p) => <tr key={p.learnerUserId}>
        <td className="py-2 pr-3 font-medium text-ink">{p.fullName ?? 'Student'}</td>
        <td className="py-2 pr-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded bg-sunken" role="progressbar" aria-valuenow={p.progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.fullName ?? 'Student'} course progress`}><div className="h-full bg-[#176255]" style={{ width: `${p.progressPercent}%` }} /></div><span>{p.progressPercent}%</span></div></td>
        <td className="py-2 pr-3">{p.lessonsCompleted} / {p.lessonCount}</td>
        <td className="py-2 pr-3">{p.attemptsSubmitted}</td>
        <td className="py-2 pr-3">{p.bestScore === null ? '—' : `${Math.round(p.bestScore * 100) / 100}%`}</td>
        <td className="py-2 text-ink-muted">{p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleDateString() : '—'}</td>
      </tr>)}</tbody></table></div>}
  </section>;
}
