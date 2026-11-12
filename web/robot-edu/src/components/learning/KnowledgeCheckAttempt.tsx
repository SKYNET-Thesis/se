import { useEffect, useRef, useState } from 'react';
import type { ApiDraftAnswer, KnowledgeCheckSubmissionResult } from '../../lib/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export interface PublicQuizSnapshot {
  kind: 'question_bank_quiz';
  schemaVersion: 1;
  passPercent: number;
  questions: Array<{ questionVersionId: string; stem: string; type: string; options: Array<{ id: string; text: string }> }>;
}

const toSelection = (draft?: ApiDraftAnswer[]): Record<string, string[]> =>
  Object.fromEntries((draft ?? []).map((answer) => [answer.questionId, answer.optionIds ?? (answer.optionId ? [answer.optionId] : [])]));

export function KnowledgeCheckAttempt({
  title, snapshot, result, onSubmit, initialDraft, draftSavedAt, readOnly, onSaveDraft, confirmSubmit,
}: {
  title: string;
  snapshot: PublicQuizSnapshot;
  result?: KnowledgeCheckSubmissionResult | null;
  onSubmit: (answers: Array<{ questionId: string; optionId?: string; optionIds?: string[] }>) => Promise<KnowledgeCheckSubmissionResult>;
  /** D03: answers saved earlier (restored on resume), saved WITHOUT grading; never contains answer keys. */
  initialDraft?: ApiDraftAnswer[];
  draftSavedAt?: string | null;
  readOnly?: boolean;
  onSaveDraft?: (answers: ApiDraftAnswer[]) => Promise<void>;
  confirmSubmit?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => toSelection(initialDraft));
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>(draftSavedAt ? 'saved' : 'idle');
  const [confirming, setConfirming] = useState(false);
  const touched = useRef(false);
  const draftTimer = useRef<number | null>(null);
  const [submitted, setSubmitted] = useState(result ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = snapshot.questions.length > 0 && snapshot.questions.every((q) => (answers[q.questionVersionId]?.length ?? 0) > 0);
  const toPayload = (): ApiDraftAnswer[] => snapshot.questions.filter((q) => (answers[q.questionVersionId]?.length ?? 0) > 0).map((q) => q.type === 'multiple_choice'
    ? { questionId: q.questionVersionId, optionIds: answers[q.questionVersionId] }
    : { questionId: q.questionVersionId, optionId: answers[q.questionVersionId][0] });
  // Save a draft (no grading) shortly after the learner stops changing answers.
  useEffect(() => {
    if (!onSaveDraft || readOnly || submitted || !touched.current) return;
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    setDraftState('saving');
    draftTimer.current = window.setTimeout(() => { onSaveDraft(toPayload()).then(() => setDraftState('saved'), () => setDraftState('error')); }, 800);
    return () => { if (draftTimer.current !== null) window.clearTimeout(draftTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);
  const submit = async () => {
    if (!canSubmit || busy || submitted || readOnly) return;
    setBusy(true); setError(null);
    try {
      const payload = snapshot.questions.map((q) => q.type === 'multiple_choice'
        ? { questionId: q.questionVersionId, optionIds: answers[q.questionVersionId] }
        : { questionId: q.questionVersionId, optionId: answers[q.questionVersionId][0] });
      setSubmitted(await onSubmit(payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit this quiz.');
    } finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-3xl px-5 py-10">
    <p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Classroom knowledge check</p>
    <h1 className="mt-2 text-3xl font-semibold text-ink">{title}</h1>
    <p className="mt-2 text-sm text-ink-muted">Answer each question. Your responses are graded by the server.</p>
    <div className="mt-8 space-y-6">{snapshot.questions.map((question, index) => <fieldset key={question.questionVersionId} disabled={Boolean(submitted) || Boolean(readOnly)} className="rounded-xl border border-line p-5">
      <legend className="px-2 font-medium">Question {index + 1}</legend>
      <p className="mb-4">{question.stem}</p>
      <div className="space-y-2">{question.options.map((option) => <label key={option.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 hover:bg-sunken">
        <input type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={question.questionVersionId} value={option.id} checked={(answers[question.questionVersionId] ?? []).includes(option.id)} onChange={(event) => { touched.current = true; setAnswers((current) => {
          const selected = current[question.questionVersionId] ?? [];
          const next = question.type === 'multiple_choice' ? event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id) : [option.id];
          return { ...current, [question.questionVersionId]: next };
        }); }} />
        <span>{option.text}</span>
      </label>)}</div>
    </fieldset>)}</div>
    {error && <p role="alert" className="mt-4 rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {submitted && <section aria-label="Quiz result" className="mt-6 rounded-xl border border-line bg-sunken/40 p-5">
      <h2 className="font-semibold">{submitted.passed ? 'Passed' : 'Not passed yet'}</h2><p className="mt-1">Score: {submitted.score}% · Required: {snapshot.passPercent}%</p>
    </section>}
    <div className="mt-6 flex flex-wrap items-center gap-4">
      <button type="button" className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-white disabled:opacity-50" onClick={() => (confirmSubmit ? setConfirming(true) : void submit())} disabled={!canSubmit || busy || Boolean(submitted) || Boolean(readOnly)}>{busy ? 'Submitting…' : submitted ? 'Submitted' : 'Submit quiz'}</button>
      {onSaveDraft && !submitted && !readOnly && <p aria-live="polite" className="text-xs text-ink-subtle">{draftState === 'saving' ? 'Saving draft…' : draftState === 'saved' ? 'Draft saved' : draftState === 'error' ? 'Draft could not be saved. Your answers are still on this page.' : 'Your answers are saved as a draft while you work.'}</p>}
    </div>
    <ConfirmDialog open={confirming} tone="primary" title="Submit this quiz?" description="Your answers are graded when you submit and cannot be changed afterwards." confirmLabel="Submit quiz" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void submit(); }} />
  </main>;
}
