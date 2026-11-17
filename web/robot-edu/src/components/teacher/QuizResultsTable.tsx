import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '../../lib/api';
import { Badge } from '../ui/Badge';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100) / 100}%`);

/** Instructor review of auto-graded quiz attempts: weighted score, points earned and pass/fail against the pass threshold. */
export function QuizResultsTable({ classroomId, token }: { classroomId: string; token: string }) {
  const results = useQuery({ queryKey: ['teacher-quiz-results', classroomId], queryFn: () => instructorApi.quizResults(classroomId, token), enabled: Boolean(classroomId && token) });
  return <section aria-label="Quiz results" className="mt-10">
    <h2 className="text-xl font-semibold text-ink">Quiz results</h2>
    <p className="mt-1 text-sm text-ink-muted">Automatically graded quiz attempts. Scores are weighted by each question's points.</p>
    {results.isLoading && <p className="mt-3 text-sm text-ink-muted">Loading quiz results…</p>}
    {results.error && <p role="alert" className="mt-3 text-sm text-danger">Quiz results could not be loaded.</p>}
    {results.data && !results.data.length && <p className="mt-3 text-sm text-ink-muted">No quiz attempts have been completed yet.</p>}
    {!!results.data?.length && <div className="relative mt-4 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm">
      <thead className="text-xs text-ink-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Student</th><th scope="col" className="py-2 pr-3 font-medium">Quiz</th><th scope="col" className="py-2 pr-3 font-medium">Attempt</th><th scope="col" className="py-2 pr-3 font-medium">Points</th><th scope="col" className="py-2 pr-3 font-medium">Score</th><th scope="col" className="py-2 font-medium">Result</th></tr></thead>
      <tbody className="divide-y divide-line">{results.data.map((r) => <tr key={r.attemptId}>
        <td className="py-2 pr-3 font-medium text-ink">{r.fullName ?? 'Student'}</td><td className="py-2 pr-3">{r.quizTitle}</td><td className="py-2 pr-3">#{r.attemptNumber}</td>
        <td className="py-2 pr-3">{r.earnedPoints ?? '—'} / {r.possiblePoints ?? '—'}</td><td className="py-2 pr-3">{pct(r.score)}{r.passPercent !== null && <span className="text-ink-muted"> (pass {r.passPercent}%)</span>}</td>
        <td className="py-2"><Badge tone={r.passed ? 'ok' : 'warn'}>{r.passed ? 'Passed' : 'Not passed'}</Badge></td></tr>)}</tbody></table></div>}
  </section>;
}
