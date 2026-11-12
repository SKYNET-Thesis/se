import { useQuery } from '@tanstack/react-query';
import { learnerApi } from '../../lib/api';
import { gradeSummary } from './submissionState';

export const gradingKeys = { attempt: (attemptId: string) => ['student-learning', 'attempt-grading', attemptId] as const };

/** The student's view of ONE attempt's instructor grading. Before release the server sends nothing but `released:false`. */
export function GradingFeedbackPanel({ attemptId, token, submitted }: { attemptId: string; token: string; submitted: boolean }) {
  const grading = useQuery({ queryKey: gradingKeys.attempt(attemptId), queryFn: () => learnerApi.attemptGrading(attemptId, token), enabled: Boolean(token && attemptId && submitted) });
  if (!submitted) return null;
  if (grading.isLoading) return <p className="mt-6 text-sm text-ink-muted">Loading grade…</p>;
  if (grading.error || !grading.data) return <p role="alert" className="mt-6 text-sm text-danger">The grade could not be loaded.</p>;
  const data = grading.data;
  if (!data.released) return <section aria-label="Grade and feedback" className="mt-6 rounded-md border border-line bg-sunken/40 p-4"><p className="font-medium text-ink">Awaiting review</p><p className="mt-1 text-sm text-ink-muted">Your instructor has not released a grade or feedback for this attempt yet.</p></section>;
  const total = data.assessment ? gradeSummary(data.assessment.scores) : null;
  return <section aria-label="Grade and feedback" className="mt-6 rounded-md border border-accent/40 p-5">
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="text-lg font-semibold text-accent-ink">Grade received</h3><p className="text-xs text-ink-subtle">Released {new Date(data.releasedAt).toLocaleString()}</p></div>
      {total && total.max > 0 && <p className="rounded-full bg-sunken px-4 py-2 text-lg font-semibold text-ink" aria-label={`Score ${total.awarded} out of ${total.max}`}>{total.awarded}<span className="text-sm text-ink-muted">/{total.max}</span></p>}
    </div>
    {data.assessment?.overallFeedback && <p className="mt-4 whitespace-pre-wrap text-sm text-ink">{data.assessment.overallFeedback}</p>}
    {data.assessment && data.assessment.scores.length > 0 && <table className="mt-4 w-full text-left text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-subtle"><th className="py-1 font-medium">Criterion</th><th className="py-1 text-right font-medium">Points</th></tr></thead>
      <tbody className="divide-y divide-line">{data.assessment.scores.map((s) => <tr key={s.criterionId}><td className="py-2"><span className="font-medium text-ink">{s.title}</span>{s.comment && <span className="block text-xs text-ink-muted">{s.comment}</span>}</td><td className="py-2 text-right tabular-nums">{Number(s.awardedPoints)} / {Number(s.maxPoints)}</td></tr>)}</tbody></table>}
    {data.feedback.length > 0 && <div className="mt-4"><h4 className="text-sm font-semibold text-ink">Feedback</h4><ul className="mt-2 space-y-2">{data.feedback.map((f) => <li key={f.id} className="rounded-md bg-sunken p-3 text-sm text-ink">{f.content}</li>)}</ul></div>}
    {!data.assessment && data.feedback.length === 0 && <p className="mt-4 text-sm text-ink-muted">Released without written feedback.</p>}
  </section>;
}
