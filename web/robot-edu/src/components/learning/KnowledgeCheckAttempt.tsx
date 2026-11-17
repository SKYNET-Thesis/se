import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2Icon, CheckIcon, CloudOffIcon, Loader2Icon, RotateCwIcon, XCircleIcon } from 'lucide-react';
import { QuestionMap, QuestionPrompt, ResultSummary, StepNav, UnansweredNotice } from './assessment';
import { ApiError } from '../../lib/api';
import type { ApiDraftAnswer, KnowledgeCheckSubmissionResult } from '../../lib/api';
import { answersPayload, canRetryQuiz, formatQuizDate, isAnswered, isSupportedQuestion, lessonUnlockSentence, questionHint, quizErrorMessage, selectionFromDraft, type QuizQuestion, type Selection } from '../../queries/quizAttemptModel';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { LearningBreadcrumb, type LearningCrumb } from './LearningBreadcrumb';

export interface PublicQuizSnapshot {
  kind: 'question_bank_quiz';
  schemaVersion: 1;
  passPercent: number;
  questions: QuizQuestion[];
}

export interface QuizAttemptContext {
  crumbs?: LearningCrumb[];
  /** Where the quiz lives (lesson title), shown under the heading. */
  subtitle?: string;
  attemptNumber?: number;
  submittedAt?: string | null;
}

/** `retry` is false when saving again cannot help (the quiz closed, the attempt was already submitted). */
type DraftState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string; retry: boolean };
const draftError = (cause: unknown): DraftState => ({ kind: 'error', message: quizErrorMessage(cause, 'draft'), retry: !(cause instanceof ApiError) || cause.status >= 500 });

/**
 * A06 attempt player for a server-issued Question Bank quiz. One question at a time with a question map; answers are
 * kept in this component across navigation and re-renders, autosaved as an ungraded draft, and only submitted when the
 * student confirms. Grading, pass/fail and per-question feedback come from the server's answer.
 */
export function KnowledgeCheckAttempt({
  title, snapshot, result, onSubmit, initialDraft, draftSavedAt, readOnly, onSaveDraft, confirmSubmit, context, resultActions,
}: {
  title: string;
  snapshot: PublicQuizSnapshot;
  result?: KnowledgeCheckSubmissionResult | null;
  onSubmit: (answers: ApiDraftAnswer[]) => Promise<KnowledgeCheckSubmissionResult>;
  /** Answers saved earlier (restored on resume), saved WITHOUT grading; never contains answer keys. */
  initialDraft?: ApiDraftAnswer[];
  draftSavedAt?: string | null;
  readOnly?: boolean;
  onSaveDraft?: (answers: ApiDraftAnswer[]) => Promise<void>;
  confirmSubmit?: boolean;
  context?: QuizAttemptContext;
  /** Next steps under a result (retake, continue the course); decided by the page that knows the delivery. */
  resultActions?: (result: KnowledgeCheckSubmissionResult) => ReactNode;
}) {
  const questions = snapshot.questions;
  const [answers, setAnswers] = useState<Selection>(() => selectionFromDraft(initialDraft));
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<DraftState>({ kind: draftSavedAt ? 'saved' : 'idle' });
  const [confirming, setConfirming] = useState(false);
  const [missing, setMissing] = useState<number[] | null>(null);
  const [submitted, setSubmitted] = useState<KnowledgeCheckSubmissionResult | null>(result ?? null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(context?.submittedAt ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const touched = useRef(false);
  const draftTimer = useRef<number | null>(null);
  const submitLock = useRef(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const locked = Boolean(readOnly) || Boolean(submitted);
  const answeredCount = questions.filter((question) => isAnswered(answers, question)).length;

  // Draft saving is single-flight: at most one PUT is in the air, and the newest answers are always the next ones sent,
  // so an older save can never reach the server after a newer one and overwrite it.
  const pendingDraft = useRef<ApiDraftAnswer[] | null>(null);
  const draftInFlight = useRef(false);
  const draftsStopped = useRef(false);
  const flushDraft = () => {
    if (draftTimer.current !== null) { window.clearTimeout(draftTimer.current); draftTimer.current = null; }
    if (!onSaveDraft || draftsStopped.current || draftInFlight.current || !pendingDraft.current) return;
    const payload = pendingDraft.current;
    pendingDraft.current = null;
    draftInFlight.current = true;
    setDraft({ kind: 'saving' });
    onSaveDraft(payload).then(
      () => { if (!pendingDraft.current) setDraft({ kind: 'saved' }); },
      (cause: unknown) => setDraft(draftError(cause)),
    ).finally(() => { draftInFlight.current = false; if (pendingDraft.current) flushDraft(); });
  };
  const flushRef = useRef(flushDraft);
  flushRef.current = flushDraft;

  // Save an ungraded draft shortly after the student stops changing answers.
  useEffect(() => {
    if (!onSaveDraft || locked || !touched.current) return;
    pendingDraft.current = answersPayload(questions, answers);
    setDraft({ kind: 'saving' });
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => flushRef.current(), 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);
  // Leaving the page before the pause ends still saves the last change.
  useEffect(() => () => { if (draftTimer.current !== null) flushRef.current(); }, []);
  // Closing the tab while answers are still unsaved asks first (the browser shows its own wording).
  const unsaved = !locked && (draft.kind === 'saving' || draft.kind === 'error');
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  /** "Save now" after a failed autosave: queue the current answers and send them at once. */
  const saveNow = () => { if (!onSaveDraft || locked) return; pendingDraft.current = answersPayload(questions, answers); flushDraft(); };

  // Moving to another question puts focus on its text, so keyboard and screen-reader users land on the new question.
  useEffect(() => { if (moved.current) questionHeading.current?.focus(); moved.current = false; }, [index]);
  const goTo = (next: number) => { moved.current = true; setIndex(Math.max(0, Math.min(questions.length - 1, next))); };

  const choose = (question: QuizQuestion, optionId: string, checked: boolean) => {
    if (locked || busy) return; // answers are frozen while a submission is in flight
    touched.current = true;
    setMissing(null);
    setAnswers((current) => {
      const selected = current[question.questionVersionId] ?? [];
      const next = question.type === 'multiple_choice' ? (checked ? [...selected.filter((id) => id !== optionId), optionId] : selected.filter((id) => id !== optionId)) : [optionId];
      return { ...current, [question.questionVersionId]: next };
    });
  };

  const submit = async () => {
    if (submitLock.current || locked) return;
    submitLock.current = true;
    setBusy(true); setError(null);
    // The submit carries the complete answers itself, so no draft is sent alongside it. A draft already in the air is
    // harmless: the server serialises both on the attempt row, refuses a draft once the attempt is graded, and grades
    // exactly the answers in this request.
    if (draftTimer.current !== null) { window.clearTimeout(draftTimer.current); draftTimer.current = null; }
    pendingDraft.current = null;
    draftsStopped.current = true;
    const payload = answersPayload(questions, answers);
    try {
      const graded = await onSubmit(payload);
      setSubmitted(graded);
      setSubmittedAt(new Date().toISOString());
    } catch (cause) {
      setError(cause);
      // Not graded (or not confirmed): keep the answers on the server as a draft too.
      draftsStopped.current = false;
      if (onSaveDraft && touched.current) { pendingDraft.current = payload; flushDraft(); }
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  };
  const requestSubmit = () => {
    if (locked || busy) return;
    const unanswered = questions.map((question, position) => (isAnswered(answers, question) ? -1 : position)).filter((position) => position >= 0);
    if (unanswered.length) { setMissing(unanswered); return; } // the server grades only a complete set of answers
    if (confirmSubmit) setConfirming(true); else void submit();
  };

  const subtitle = [context?.subtitle, context?.attemptNumber ? `Attempt ${context.attemptNumber}` : null].filter(Boolean).join(' · ');

  if (submitted) {
    const known = touched.current || initialDraft?.length ? answers : null;
    return <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-9">
      {context?.crumbs && <LearningBreadcrumb items={context.crumbs} />}
      <header className={cn(context?.crumbs && 'mt-4')}>
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.015em] text-ink md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </header>
      <QuizResult result={submitted} submittedAt={submittedAt} announce={!result} actions={resultActions?.(submitted)} />
      {submitted.feedback?.length ? <QuestionReview result={submitted} questions={questions} answers={known} /> : null}
    </main>;
  }

  const question = questions[index];
  if (!question) return <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-9"><h1 className="text-2xl font-semibold text-ink">{title}</h1><p className="mt-6 text-sm text-ink-muted">This quiz has no questions. Ask your teacher.</p></main>;
  const selected = answers[question.questionVersionId] ?? [];
  const last = index === questions.length - 1;

  return <main className="mx-auto w-full max-w-3xl px-4 pb-0 pt-5 md:px-8 md:py-9">
    {context?.crumbs && <LearningBreadcrumb items={context.crumbs} />}
    {/* The quiz name is context; the question below is the focal point, so it is set smaller than the question. */}
    <header className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1', context?.crumbs && 'mt-3')}>
      <h1 className="text-balance text-base font-semibold text-ink md:text-lg">{title}{subtitle && <span className="font-normal text-ink-muted"> · {subtitle}</span>}</h1>
      {onSaveDraft && !locked && <SaveStatus state={draft} onRetry={saveNow} />}
    </header>
    {readOnly && <p className="mt-4 rounded-lg bg-sunken px-4 py-3 text-sm text-ink">This attempt is closed, so its answers can’t be changed.</p>}

    <div className="mt-4"><QuestionMap count={questions.length} current={index} answered={(position) => isAnswered(answers, questions[position])} missing={missing} onSelect={goTo} /></div>

    <QuestionPrompt id={question.questionVersionId} index={index} total={questions.length} stem={question.stem}
      hint={isSupportedQuestion(question) ? questionHint(question.type) : 'This question type isn’t supported here. Ask your teacher.'}
      multiple={question.type === 'multiple_choice'} options={question.options} selected={selected} disabled={locked || busy}
      onChoose={(optionId, checked) => choose(question, optionId, checked)} headingRef={questionHeading} layout={question.type === 'true_false' ? 'pair' : 'stack'} />

    {missing && <UnansweredNotice missing={missing} onSelect={goTo} />}
    {Boolean(error) && <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1">{quizErrorMessage(error, 'submit')}</span>
      {canRetryQuiz(error) && <Button size="sm" variant="secondary" onClick={() => void submit()} loading={busy} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}
    </div>}

    <StepNav first={index === 0} last={last} busy={busy} locked={locked} onPrevious={() => goTo(index - 1)} onNext={() => goTo(index + 1)} onSubmit={requestSubmit}
      footnote={!last && !locked && answeredCount === questions.length && <p className="mb-2 text-right text-[13px] text-ink-muted">All questions answered. <button type="button" onClick={requestSubmit} className="min-h-[32px] font-semibold text-accent underline underline-offset-4 hover:text-accent-hover">Submit now</button></p>} />

    <ConfirmDialog open={confirming} tone="primary" title="Submit your answers?"
      description={`You’ve answered all ${questions.length} question${questions.length === 1 ? '' : 's'}. Your quiz is graded as soon as you submit, and you can’t change your answers afterwards.`}
      confirmLabel="Submit answers" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void submit(); }} />
  </main>;
}

/** Saving state of the draft, worded for students. Errors keep the answers and, when it can help, offer Save now. */
function SaveStatus({ state, onRetry }: { state: DraftState; onRetry: () => void }) {
  return <div role="status" className={cn('inline-flex min-h-[32px] items-center gap-1.5 text-[13px]', state.kind === 'error' ? 'text-danger' : 'text-ink-muted')}>
    {state.kind === 'saving' && <><Loader2Icon className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />Saving…</>}
    {state.kind === 'saved' && <><CheckIcon className="h-3.5 w-3.5 text-ok" aria-hidden />All answers saved</>}
    {state.kind === 'idle' && 'Answers save as you go'}
    {state.kind === 'error' && <><CloudOffIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /><span>{state.message}</span>
      {state.retry && <button type="button" onClick={onRetry} className="ml-1 min-h-[32px] font-semibold text-accent underline underline-offset-4 hover:text-accent-hover">Save now</button>}</>}
  </div>;
}

function QuizResult({ result, submittedAt, announce, actions }: { result: KnowledgeCheckSubmissionResult; submittedAt: string | null; announce: boolean; actions?: ReactNode }) {
  const correctCount = result.feedback?.filter((item) => item.correct).length;
  return <ResultSummary passed={result.passed} score={result.score} passPercent={result.passPercent} announce={announce} actions={actions}
    facts={[
      typeof correctCount === 'number' && result.feedback ? `${correctCount} of ${result.feedback.length} questions correct` : null,
      typeof result.earnedPoints === 'number' && typeof result.possiblePoints === 'number' && result.possiblePoints !== result.feedback?.length ? `${result.earnedPoints} of ${result.possiblePoints} points` : null,
      submittedAt ? `Submitted ${formatQuizDate(submittedAt)}` : null,
    ]}
    notes={result.completedLessonId ? <p className="mt-3 text-[15px] text-ink">{lessonUnlockSentence(result.newlyUnlockedLessonIds.length)}</p> : null} />;
}
function QuestionReview({ result, questions, answers }: { result: KnowledgeCheckSubmissionResult; questions: QuizQuestion[]; answers: Selection | null }) {
  const byId = new Map((result.feedback ?? []).map((item) => [item.questionVersionId, item]));
  return <section aria-labelledby="quiz-review-heading" className="mt-10">
    <h2 id="quiz-review-heading" className="text-lg font-semibold text-ink">Review your answers</h2>
    <p className="mt-1 text-sm text-ink-muted">Each question shows whether your answer was right. Correct options aren’t shown for this quiz.</p>
    <ol className="mt-4 divide-y divide-line border-y border-line">{questions.map((question, position) => {
      const item = byId.get(question.questionVersionId);
      const chosen = answers?.[question.questionVersionId]?.map((id) => question.options.find((option) => option.id === id)?.text).filter(Boolean);
      return <li key={question.questionVersionId} className="py-4">
        <div className="flex items-start gap-3">
          {item ? (item.correct ? <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden /> : <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />) : <span className="h-5 w-5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="text-pretty break-words text-[15px] font-medium leading-6 text-ink"><span className="sr-only">{item ? (item.correct ? 'Correct. ' : 'Incorrect. ') : ''}</span><span className="tabular-nums text-ink-muted">{position + 1}.</span> {question.stem}</p>
            {chosen && chosen.length > 0 && <p className="mt-1.5 text-sm text-ink-muted">Your answer: <span className="text-ink">{chosen.join(', ')}</span></p>}
            {item && <p className={cn('mt-1.5 text-sm font-medium', item.correct ? 'text-ok' : 'text-danger')} aria-hidden>{item.correct ? 'Correct' : 'Incorrect'}</p>}
            {item?.explanation && <p className="mt-2 max-w-[68ch] whitespace-pre-wrap rounded-md bg-sunken px-3 py-2 text-sm leading-6 text-ink"><span className="font-semibold">Why: </span>{item.explanation}</p>}
          </div>
        </div>
      </li>;
    })}</ol>
  </section>;
}
