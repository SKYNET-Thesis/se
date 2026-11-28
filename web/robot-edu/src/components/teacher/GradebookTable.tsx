import { useQuery } from '@tanstack/react-query';
import { instructorApi, type ApiGradebookRow } from '../../lib/api';
import { Badge } from '../ui/Badge';

function result(row: ApiGradebookRow) {
  if (row.resultKind === 'quiz') return row.percentage === null ? '—' : `${Math.round(row.percentage * 100) / 100}%`;
  if (row.resultKind === 'rubric' && row.rubric && row.rubric.gradedCriteria > 0) return `${row.rubric.awarded} / ${row.rubric.max} · ${row.rubric.percentage}% · ${row.rubric.scoreOutOf10}/10`;
  return '—';
}
function status(row: ApiGradebookRow): { label: string; tone: 'ok' | 'warn' | 'outline' | 'accent' } {
  if (row.resultKind === 'quiz') return { label: row.passed ? 'Passed' : 'Not passed', tone: row.passed ? 'ok' : 'warn' };
  if (row.resultKind === 'other') return { label: 'No rubric', tone: 'outline' };
  if (row.graded === 'none') return { label: 'Awaiting grading', tone: 'warn' };
  if (row.graded === 'partial') return { label: row.released ? 'Released (incomplete)' : 'Draft · partly graded', tone: 'warn' };
  return { label: row.released ? 'Released' : 'Graded · not released', tone: row.released ? 'ok' : 'accent' };
}

/** Instructor Gradebook: quizzes (auto-graded, stored percentage) and rubric assignments (canonical summary) side by side, never mixed or double counted. */
export function GradebookTable({ classroomId, token }: { classroomId: string; token: string }) {
  const grades = useQuery({ queryKey: ['teacher-gradebook', classroomId], queryFn: () => instructorApi.gradebook(classroomId, token), enabled: Boolean(classroomId && token) });
  return <section aria-label="Gradebook" className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-hairline sm:p-6">
    <h2 className="text-lg font-semibold text-ink">Gradebook</h2>
    <p className="mt-1 text-sm text-ink-muted">Latest submitted attempt per student and assignment. Quizzes are graded automatically; rubric assignments show the instructor&apos;s weighted result (a criterion not yet graded still counts in the maximum).</p>
    {grades.isLoading && <p role="status" className="mt-3 text-sm text-ink-muted">Loading gradebook…</p>}
    {grades.error && <p role="alert" className="mt-3 text-sm text-danger">The gradebook could not be loaded.</p>}
    {grades.data && !grades.data.length && <p className="mt-3 text-sm text-ink-muted">No submitted work yet.</p>}
    {!!grades.data?.length && <div className="relative mt-4 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm">
      <thead className="text-xs text-ink-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Student</th><th scope="col" className="py-2 pr-3 font-medium">Assignment</th><th scope="col" className="py-2 pr-3 font-medium">Type</th><th scope="col" className="py-2 pr-3 font-medium">Result</th><th scope="col" className="py-2 font-medium">Status</th></tr></thead>
      <tbody className="divide-y divide-line">{grades.data.map((row) => { const s = status(row); return <tr key={row.attemptId}>
        <td className="py-2 pr-3 font-medium text-ink">{row.fullName ?? 'Student'}</td>
        <td className="py-2 pr-3">{row.title}</td>
        <td className="py-2 pr-3 text-ink-muted">{row.resultKind === 'quiz' ? 'Quiz (auto)' : row.resultKind === 'rubric' ? 'Rubric' : 'Assignment'}</td>
        <td className="py-2 pr-3 tabular-nums" data-testid={`gradebook-result-${row.attemptId}`}>{result(row)}</td>
        <td className="py-2"><Badge tone={s.tone}>{s.label}</Badge></td>
      </tr>; })}</tbody></table></div>}
  </section>;
}
