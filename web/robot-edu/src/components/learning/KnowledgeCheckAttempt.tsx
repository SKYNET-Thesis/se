import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ApiDraftAnswer, KnowledgeCheckSubmissionResult } from '../../lib/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { QuestionMap } from './QuestionMap';

export interface PublicQuizSnapshot {
  kind: 'question_bank_quiz';
  schemaVersion: 1;
  passPercent: number;
  questions: Array<{ questionVersionId: string; stem: string; type: string; options: Array<{ id: string; text: string }>; points?: number }>;
}

const pointsLabel = (points: number) => `${points} ${points === 1 ? 'point' : 'points'}`;
const toSelection = (draft?: ApiDraftAnswer[]): Record<string, string[]> =>
  Object.fromEntries((draft ?? []).map((answer) => [answer.questionId, answer.optionIds ?? (answer.optionId ? [answer.optionId] : [])]));

export function KnowledgeCheckAttempt({
  title, snapshot, result, analytics, onSubmit, initialDraft, draftSavedAt, readOnly, onSaveDraft, confirmSubmit, backTo,
}: {
  title: string;
  snapshot: PublicQuizSnapshot;
  result?: KnowledgeCheckSubmissionResult | null;
  /** Rendered inside the result section once the attempt is graded (e.g. the performance dashboard). */
  analytics?: ReactNode;
  onSubmit: (answers: Array<{ questionId: string; optionId?: string; optionIds?: string[] }>) => Promise<KnowledgeCheckSubmissionResult>;
  /** Previously saved learner selections; this never contains grading keys. */
  initialDraft?: ApiDraftAnswer[];
  draftSavedAt?: string | null;
  readOnly?: boolean;
  onSaveDraft?: (answers: ApiDraftAnswer[]) => Promise<void>;
  confirmSubmit?: boolean;
  /** Where to continue after a result (the quiz page lists attempts, remaining attempts and retake). */
  backTo?: { to: string; label: string };
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => toSelection(initialDraft));
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>(draftSavedAt ? 'saved' : 'idle');
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(result ?? null);
  const [busy, setBusy] = useState(false);
  const [navigationPending, setNavigationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answersRef = useRef(answers);
  const touched = useRef(false);
  const answerVersion = useRef(0);
  const persistedVersion = useRef(draftSavedAt ? 0 : -1);
  const queuedVersion = useRef(draftSavedAt ? 0 : -1);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const currentSave = useRef<{ version: number; promise: Promise<void> } | null>(null);
  const timer = useRef<number | null>(null);
  const submitPromise = useRef<Promise<void> | null>(null);
  const submitting = useRef(false);
  const savingNavigation = useRef(false);
  const mounted = useRef(true);

  const canSubmit = snapshot.questions.length > 0 && snapshot.questions.every((question) => (answers[question.questionVersionId]?.length ?? 0) > 0);
  const toPayload = useCallback((selection: Record<string, string[]>): ApiDraftAnswer[] =>
    snapshot.questions.filter((question) => (selection[question.questionVersionId]?.length ?? 0) > 0).map((question) => question.type === 'multiple_choice'
      ? { questionId: question.questionVersionId, optionIds: selection[question.questionVersionId] }
      : { questionId: question.questionVersionId, optionId: selection[question.questionVersionId][0] }), [snapshot.questions]);

  const queueDraftSave = useCallback((version: number, payload: ApiDraftAnswer[]) => {
    if (!onSaveDraft) return Promise.resolve();
    if (version <= persistedVersion.current) return Promise.resolve();
    if (currentSave.current?.version === version) return currentSave.current.promise;

    queuedVersion.current = version;
    const request = saveQueue.current.catch(() => undefined).then(() => onSaveDraft(payload));
    const tracked = request.then(() => {
      persistedVersion.current = Math.max(persistedVersion.current, version);
      if (mounted.current && answerVersion.current === version) setDraftState('saved');
    }, (cause: unknown) => {
      if (queuedVersion.current === version) queuedVersion.current = persistedVersion.current;
      if (mounted.current && answerVersion.current === version) setDraftState('error');
      throw cause;
    });
    saveQueue.current = tracked.then(() => undefined, () => undefined);
    currentSave.current = { version, promise: tracked };
    void tracked.then(() => {
      if (currentSave.current?.promise === tracked) currentSave.current = null;
    }, () => {
      if (currentSave.current?.promise === tracked) currentSave.current = null;
    });
    return tracked;
  }, [onSaveDraft]);

  const flushDraft = useCallback(async () => {
    if (!onSaveDraft || readOnly || submitted || !touched.current) return;
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    const version = answerVersion.current;
    if (version <= persistedVersion.current) return;
    await queueDraftSave(version, toPayload(answersRef.current));
    if (persistedVersion.current < version) throw new Error('The latest answers have not been saved yet.');
  }, [onSaveDraft, queueDraftSave, readOnly, submitted, toPayload]);

  useEffect(() => {
    if (!onSaveDraft || readOnly || submitted || !touched.current) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    const version = answerVersion.current;
    setDraftState('saving');
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void queueDraftSave(version, toPayload(answersRef.current)).catch(() => undefined);
    }, 800);
    return () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  }, [answers, onSaveDraft, queueDraftSave, readOnly, submitted, toPayload]);

  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (onSaveDraft && !readOnly && !submitted && touched.current && answerVersion.current > persistedVersion.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const captureInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!onSaveDraft || readOnly || submitted || !touched.current || answerVersion.current <= persistedVersion.current) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (submitting.current || savingNavigation.current) return;
      savingNavigation.current = true;
      setNavigationPending(true);
      void flushDraft().then(() => {
        // Replay the click after persistence so React Router can handle it normally.
        anchor.click();
      }).catch(() => {
        if (mounted.current) setError('Your latest answer could not be saved. You are still on this quiz; retry the save before leaving.');
      }).finally(() => {
        savingNavigation.current = false;
        if (mounted.current) setNavigationPending(false);
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', captureInternalNavigation, true);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', captureInternalNavigation, true);
    };
  }, [flushDraft, onSaveDraft, readOnly, submitted]);

  const submit = () => {
    if (submitPromise.current) return submitPromise.current;
    if (!canSubmit || submitted || readOnly) return Promise.resolve();
    submitting.current = true;
    setBusy(true);
    setError(null);
    const request = (async () => {
      try {
        await flushDraft();
        const submissionAnswers = snapshot.questions.map((question) => question.type === 'multiple_choice'
          ? { questionId: question.questionVersionId, optionIds: answersRef.current[question.questionVersionId] }
          : { questionId: question.questionVersionId, optionId: answersRef.current[question.questionVersionId][0] });
        setSubmitted(await onSubmit(submissionAnswers));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not submit this quiz. Your answers are still available to retry.');
      } finally {
        submitting.current = false;
        submitPromise.current = null;
        if (mounted.current) setBusy(false);
      }
    })();
    submitPromise.current = request;
    return request;
  };

  const retryDraft = () => { void flushDraft().catch(() => undefined); };

  return <main className="mx-auto max-w-3xl px-5 py-10">
    <p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Classroom knowledge check</p>
    <h1 className="mt-2 text-3xl font-semibold text-ink">{title}</h1>
    <p className="mt-2 text-sm text-ink-muted">Answer each question. Your responses are graded by the server.</p>
    {snapshot.questions.every((question) => typeof question.points === 'number') && <p className="mt-1 text-sm text-ink-muted" data-testid="quiz-total-points">Total: {pointsLabel(snapshot.questions.reduce((sum, question) => sum + (question.points ?? 0), 0))} · Pass at {snapshot.passPercent}%</p>}
    {snapshot.questions.length > 1 && <QuestionMap questions={snapshot.questions.map((question) => ({ id: question.questionVersionId }))} answered={(id) => (answers[id]?.length ?? 0) > 0} disabled={navigationPending}
      onSelect={(index) => { const target = document.getElementById(`question-${snapshot.questions[index].questionVersionId}`); target?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); target?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }); }} />}
    <div className="mt-8 space-y-6">{snapshot.questions.map((question, index) => <fieldset id={`question-${question.questionVersionId}`} key={question.questionVersionId} disabled={Boolean(submitted) || Boolean(readOnly) || busy || navigationPending} className="rounded-xl border border-line p-5">
      <legend className="px-2 font-medium">Question {index + 1}{typeof question.points === 'number' && <span className="ml-2 text-sm font-normal text-ink-muted" data-testid="question-points">· {pointsLabel(question.points)}</span>}</legend>
      <p className="mb-4">{question.stem}</p>
      <div className="space-y-2">{question.options.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-line p-3 hover:bg-sunken focus-within:ring-2 focus-within:ring-accent">
        <input type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={question.questionVersionId} value={option.id} checked={(answers[question.questionVersionId] ?? []).includes(option.id)} onChange={(event) => {
          touched.current = true;
          answerVersion.current += 1;
          setAnswers((current) => {
            const selected = current[question.questionVersionId] ?? [];
            const next = question.type === 'multiple_choice' ? event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id) : [option.id];
            const updated = { ...current, [question.questionVersionId]: next };
            answersRef.current = updated;
            return updated;
          });
        }} />
        <span>{option.text}</span>
      </label>)}</div>
    </fieldset>)}</div>
    {error && <p role="alert" className="mt-4 rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {submitted && <section aria-label="Quiz result" className="mt-6 rounded-xl border border-line bg-sunken/40 p-5">
      <h2 className="font-semibold">{submitted.passed ? 'Passed' : 'Not passed yet'}</h2><p className="mt-1">Score: {submitted.score}% · Required: {snapshot.passPercent}%</p>
      {typeof submitted.earnedPoints === 'number' && typeof submitted.possiblePoints === 'number' && <p className="mt-1 text-sm" data-testid="quiz-earned-points">{submitted.earnedPoints} of {pointsLabel(submitted.possiblePoints)} earned</p>}
      {submitted.feedback && <ul className="mt-3 space-y-1 text-sm" aria-label="Points per question">{submitted.feedback.map((item, index) => <li key={item.questionVersionId} data-testid="question-result">Question {index + 1}: {item.correct ? 'correct' : 'not correct'} · {item.earnedPoints} / {item.possiblePoints}{item.explanation ? <span className="block text-ink-muted">{item.explanation}</span> : null}</li>)}</ul>}
      {analytics}
    </section>}
    {(submitted || readOnly) && backTo && <p className="mt-4 text-sm"><Link to={backTo.to} className="font-medium text-accent-ink underline">{backTo.label}</Link></p>}
    <div className="mt-6 flex flex-wrap items-center gap-4">
      <button type="button" className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-white disabled:opacity-50" onClick={() => (confirmSubmit ? setConfirming(true) : void submit())} disabled={!canSubmit || busy || navigationPending || Boolean(submitted) || Boolean(readOnly)}>{busy ? 'Submitting…' : submitted ? 'Submitted' : 'Submit quiz'}</button>
      {onSaveDraft && !submitted && !readOnly && <div aria-live="polite" className="flex items-center gap-2 text-xs text-ink-subtle">
        <span>{draftState === 'saving' ? navigationPending ? 'Saving answers before leaving…' : 'Saving draft…' : draftState === 'saved' ? 'Draft saved' : draftState === 'error' ? 'Draft could not be saved. Your answers are still on this page.' : 'Your answers are saved as a draft while you work.'}</span>
        {draftState === 'error' && <button type="button" className="font-medium text-accent-ink underline" disabled={busy || navigationPending} onClick={retryDraft}>Retry save</button>}
      </div>}
    </div>
    <ConfirmDialog open={confirming} tone="primary" title="Submit this quiz?" description="Your answers are graded when you submit and cannot be changed afterwards." confirmLabel="Submit quiz" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void submit(); }} />
  </main>;
}
