import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Assignment, Submission } from '../../types/learning';
import { demoPersonas } from '../../data/demoPersonas';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field, inputClasses } from '../ui/Field';
import { formatDate } from '../../utils/format';

interface SubmissionReviewPanelProps {
  submission: Submission;
  assignment: Assignment | undefined;
  onSave: (review: NonNullable<Submission['review']>) => void;
}

export function SubmissionReviewPanel({ submission, assignment, onSave }: SubmissionReviewPanelProps) {
  const max = assignment?.points ?? 10;
  const [met, setMet] = useState<string[]>(submission.review?.criteriaMet ?? []);
  const [score, setScore] = useState(String(submission.review?.score ?? ''));
  const [feedback, setFeedback] = useState(submission.review?.feedback ?? '');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setMet(submission.review?.criteriaMet ?? []);
    setScore(String(submission.review?.score ?? ''));
    setFeedback(submission.review?.feedback ?? '');
    setError(undefined);
  }, [submission]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(score);
    if (score === '' || !Number.isFinite(n) || n < 0 || n > max) {
      setError(`Enter a score from 0 to ${max}.`);
      return;
    }
    onSave({ score: n, feedback: feedback.trim(), criteriaMet: met, reviewedAt: new Date().toISOString(), reviewer: demoPersonas.teacher.name });
    toast.success('Review saved', { description: 'Stored in this browser’s demo data only.' });
  };

  const outcomeTone = submission.lastRunOutcome === 'completed' ? 'ok' : submission.lastRunOutcome === 'failed' ? 'danger' : 'neutral';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{submission.studentName}</h2>
          <Badge tone="outline">{submission.origin === 'seed' ? 'Demo record' : 'Local draft from this browser'}</Badge>
        </div>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {assignment?.title ?? 'Removed assignment'} · submitted {formatDate(submission.submittedAt, 'MMM d, h:mm a')}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
        { k: 'Program', v: submission.programName },
        { k: 'Commands', v: String(submission.commandCount) },
        { k: 'Problems', v: String(submission.problemCount) }].
        map((d) =>
        <div key={d.k} className="bg-surface px-3 py-2.5">
            <dt className="text-2xs text-ink-subtle">{d.k}</dt>
            <dd className="truncate text-sm font-medium text-ink">{d.v}</dd>
          </div>
        )}
        <div className="bg-surface px-3 py-2.5">
          <dt className="text-2xs text-ink-subtle">Last simulation</dt>
          <dd>
            <Badge tone={outcomeTone}>{submission.lastRunOutcome === 'not_run' ? 'Not run' : submission.lastRunOutcome}</Badge>
          </dd>
        </div>
      </dl>

      <div>
        <h3 className="text-xs font-semibold text-ink">Student note</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">{submission.note || 'No note.'}</p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4 border-t border-line pt-5">
        <fieldset>
          <legend className="text-[13px] font-medium text-ink">Criteria met</legend>
          {assignment ?
          <ul className="mt-2 space-y-2">
              {assignment.criteria.map((c) =>
            <li key={c.id}>
                  <label className="flex items-start gap-2.5 text-[14px] text-ink">
                    <input
                  type="checkbox"
                  className="mt-1 accent-[rgb(var(--accent))]"
                  checked={met.includes(c.id)}
                  onChange={(e) => setMet((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))} />
                
                    {c.text}
                  </label>
                </li>
            )}
            </ul> :

          <p className="mt-1 text-[13px] text-ink-muted">The assignment was deleted; criteria are unavailable.</p>
          }
        </fieldset>
        <Field label={`Score (out of ${max})`} error={error} className="max-w-[160px]">
          {(p) => <input {...p} type="number" min={0} max={max} className={inputClasses} value={score} onChange={(e) => setScore(e.target.value)} />}
        </Field>
        <Field label="Feedback" hint="Shown to the student on the assignment page (in this browser).">
          {(p) => <textarea {...p} rows={4} className={inputClasses} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}
        </Field>
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xs text-ink-subtle">{submission.review ? `Last reviewed ${formatDate(submission.review.reviewedAt, 'MMM d, h:mm a')}` : 'Not yet reviewed'}</p>
          <Button type="submit" variant="primary">
            {submission.review ? 'Update review' : 'Save review'}
          </Button>
        </div>
      </form>
    </div>);

}