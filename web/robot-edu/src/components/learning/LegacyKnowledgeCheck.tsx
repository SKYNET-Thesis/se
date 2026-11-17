import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, CheckCircle2Icon, RotateCcwIcon, RotateCwIcon } from 'lucide-react';
import { ApiError, learnerApi, type LessonDetailResponse } from '../../lib/api';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { canRetryQuiz, legacyOptionLabel, lessonUnlockSentence, quizErrorMessage } from '../../queries/quizAttemptModel';
import { cn } from '../../utils/cn';
import { studentLearningKeys } from '../../queries/studentLearningQueries';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { LinkButton } from '../ui/LinkButton';
import { PassedEarlierNote, QuestionMap, QuestionPrompt, ResultSummary, StepNav, UnansweredNotice } from './assessment';
import { useFocusOnChange } from './useFocusOnChange';
import { LearningBreadcrumb } from './LearningBreadcrumb';

interface LegacyQuestion { id: string; prompt: string; options: string[] }
interface LegacyResult { passed: boolean; score: number; completedLessonId: string | null; newlyUnlockedLessonIds: string[] }

/** Instructions are shown as authored, minus sentences about internal machinery ("The server calculates the result."). */
const studentInstructions = (text?: string | null) => (text ?? '').split(/(?<=\.)\s+/).filter((sentence) => sentence.trim() && !/\bserver\b/i.test(sentence)).join(' ');

/**
 * Course 1 lesson knowledge check. Same presentation as the classroom quiz player (shared assessment components), with
 * its own contract: questions come from the lesson assignment, answers live on this page until submitted (this quiz has
 * no server draft), the server returns a whole-percent score and pass/fail only, and an attempt is graded once.
 */
export function LegacyKnowledgeCheck({ lesson, courseId, previouslyPassed, reviewHref }: { lesson: LessonDetailResponse; courseId: string; previouslyPassed: boolean; reviewHref?: string | null }) {
  const { session } = useSupabaseSession();
  const queryClient = useQueryClient();
  const constraints = lesson.assignment?.constraints as { questions?: LegacyQuestion[] } | undefined;
  const questions = constraints?.questions ?? [];
  const [stage, setStage] = useState<'intro' | 'answering' | 'result'>('intro');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [missing, setMissing] = useState<number[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<LegacyResult | null>(null);
  const [maybeGraded, setMaybeGraded] = useState(false);
  const lock = useRef(false);
  // The open attempt to submit to. Lesson detail's activeAttempt is only trusted once: after a submission it is graded.
  const attemptId = useRef<string | null>(lesson.activeAttempt?.status === 'in_progress' ? lesson.activeAttempt.id : null);
  const ambiguous = useRef(false);
  const headingRef = useFocusOnChange(index);
  // Start quiz / Try again replace the button that had focus: move focus to the first question instead of losing it.
  const previousStage = useRef(stage);
  useEffect(() => { if (stage === 'answering' && previousStage.current !== 'answering') headingRef.current?.focus(); previousStage.current = stage; }, [stage, headingRef]);
  const answeredCount = questions.filter((question) => answers[question.id]).length;

  // Answers are not saved anywhere until submission, so leaving mid-quiz asks first.
  useEffect(() => {
    if (stage !== 'answering' || answeredCount === 0) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stage, answeredCount]);

  const goTo = (next: number) => setIndex(Math.max(0, Math.min(questions.length - 1, next)));
  const start = () => { setAnswers({}); setIndex(0); setMissing(null); setError(null); setMaybeGraded(false); setResult(null); setStage('answering'); };

  const submit = async () => {
    if (!session || !lesson.assignment?.classroomAssignmentId || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      // startAttempt returns the learner's open attempt when there is one, so this never creates a duplicate.
      const id = attemptId.current ?? (await learnerApi.createAttempt(lesson.assignment.classroomAssignmentId, session.access_token)).id;
      attemptId.current = id;
      const graded = await learnerApi.submitKnowledgeCheck(id, { answers: questions.map((question) => ({ questionId: question.id, optionId: answers[question.id] })) }, session.access_token);
      attemptId.current = null; // graded: the next try needs a new attempt
      ambiguous.current = false;
      setResult({ passed: graded.passed, score: graded.score, completedLessonId: graded.completedLessonId, newlyUnlockedLessonIds: graded.newlyUnlockedLessonIds ?? [] });
      setStage('result');
    } catch (cause) {
      // A Course 1 attempt answers 404 once graded. After an unconfirmed submission that means it went through.
      const graded = cause instanceof ApiError && cause.status === 404 && ambiguous.current && attemptId.current !== null;
      if (graded) attemptId.current = null;
      setMaybeGraded(graded);
      if (!(cause instanceof ApiError)) ambiguous.current = true;
      setError(cause);
    } finally {
      lock.current = false; setBusy(false);
      // Lesson, course and activity progress change only after the server has graded the attempt.
      void queryClient.invalidateQueries({ queryKey: studentLearningKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['course-learning-shell'] });
    }
  };
  const requestSubmit = () => {
    if (busy) return;
    const unanswered = questions.map((question, position) => (answers[question.id] ? -1 : position)).filter((position) => position >= 0);
    if (unanswered.length) { setMissing(unanswered); return; }
    setConfirming(true);
  };

  if (!lesson.assignment || !questions.length) {
    return <main className="mx-auto w-full max-w-3xl px-1 py-6 md:px-6 md:py-8"><h1 className="text-2xl font-semibold text-ink">{lesson.assignment?.title ?? 'Knowledge check'}</h1><p className="mt-4 text-[15px] text-ink-muted">This quiz isn’t available for your class yet.</p></main>;
  }
  const title = lesson.assignment.title;
  const criteria = lesson.content?.completionCriteria;
  // Same orientation as every other activity page: where this quiz sits in the course.
  const crumbs = <LearningBreadcrumb items={[{ label: 'My learning', to: '/my-learning' }, { label: lesson.course_title || 'Course', to: `/courses/${courseId}` }, { label: lesson.title, to: `/courses/${courseId}/lessons/${lesson.id}` }, { label: title }]} />;

  if (stage === 'intro') {
    const instructions = studentInstructions(lesson.assignment.instructions);
    const lastScore = lesson.priorAttempt?.score;
    return <main className="mx-auto w-full max-w-3xl px-1 py-6 md:px-6 md:py-8">
      {crumbs}
      <p className="mt-5 text-sm font-semibold text-accent">Knowledge check</p>
      <h1 className="mt-1 text-balance text-2xl font-semibold leading-tight tracking-[-0.015em] text-ink md:text-[28px]">{title}</h1>
      {instructions && <p className="mt-3 max-w-[68ch] text-[15px] leading-7 text-ink-muted">{instructions}</p>}
      {/* Status first, then what the quiz asks of you, then the one action. */}
      <section aria-label="Your progress on this quiz" className="mt-6 rounded-xl border border-line bg-surface p-5 md:p-6">
        {previouslyPassed
          ? <p className="flex items-center gap-2 text-[17px] font-semibold text-ink"><CheckCircle2Icon className="h-5 w-5 shrink-0 text-ok" aria-hidden />Quiz status: Passed</p>
          : typeof lastScore === 'number' ? <p className="text-[17px] font-semibold text-ink">Last score: {Number(lastScore)}%</p> : null}
        <dl className={cn('grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-[auto_1fr]', (previouslyPassed || typeof lastScore === 'number') && 'mt-3')}>
          <dt className="text-ink-muted">Questions</dt><dd className="font-semibold tabular-nums text-ink">{questions.length}</dd>
          {criteria && <><dt className="text-ink-muted">To pass</dt><dd className="text-ink">{criteria}</dd></>}
        </dl>
        <Button variant="primary" className="mt-5 h-11 px-5" onClick={start} icon={typeof lastScore === 'number' || previouslyPassed ? <RotateCcwIcon className="h-4 w-4" aria-hidden /> : undefined}>
          {previouslyPassed ? 'Practice again' : typeof lastScore === 'number' ? 'Try again' : 'Start quiz'}
        </Button>
      </section>
    </main>;
  }

  if (stage === 'result' && result) {
    // Course 1 grading returns pass/fail and a whole-percent score only: no pass mark and no per-question results, so
    // neither a threshold marker nor a "correct answers" count is shown (a count is never inferred from the percentage).
    const keptPass = !result.passed && previouslyPassed;
    return <main className="mx-auto w-full max-w-3xl px-1 py-6 md:px-6 md:py-8">
      {crumbs}
      <p className="mt-5 text-sm font-semibold text-accent">Knowledge check</p>
      <h1 className="mt-1 text-balance text-2xl font-semibold leading-tight tracking-[-0.015em] text-ink md:text-[28px]">{title}</h1>
      <ResultSummary passed={result.passed} score={result.score} announce facts={[]}
        notes={<div className="mt-3 space-y-2 text-[15px] text-ink">
          {result.completedLessonId && <p>{lessonUnlockSentence(result.newlyUnlockedLessonIds.length)}</p>}
          {!result.passed && criteria && <p><span className="text-ink-muted">To pass: </span>{criteria}</p>}
          <p className="text-sm text-ink-muted">This quiz reports your score only, not which answers were right.</p>
        </div>}
        overall={keptPass ? <PassedEarlierNote /> : null}
        actions={result.passed || keptPass
          // The lesson is complete: keep going; practising again stays available.
          ? <><LinkButton to={`/courses/${courseId}`} variant="primary" className="h-11 px-5">Continue course <ArrowRightIcon className="h-4 w-4" aria-hidden /></LinkButton>
            {keptPass
              ? <Button variant="secondary" className="h-11" onClick={start} icon={<RotateCcwIcon className="h-4 w-4" aria-hidden />}>Practice again</Button>
              : <LinkButton to={`/courses/${courseId}/lessons/${lesson.id}`} variant="secondary" className="h-11">Back to lesson</LinkButton>}</>
          : <><Button variant="primary" className="h-11 px-5" onClick={start} icon={<RotateCcwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
            {reviewHref && <LinkButton to={reviewHref} variant="secondary" className="h-11">Review the lesson</LinkButton>}</>} />
    </main>;
  }

  const question = questions[index];
  const last = index === questions.length - 1;
  return <main className="mx-auto w-full max-w-3xl px-1 pb-0 pt-5 md:px-6 md:py-8">
    {crumbs}
    <header className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h1 className="text-balance text-base font-semibold text-ink md:text-lg">{title}</h1>
      <p className="text-[13px] text-ink-muted">Answers stay on this page until you submit</p>
    </header>
    <div className="mt-4"><QuestionMap count={questions.length} current={index} answered={(position) => Boolean(answers[questions[position].id])} missing={missing} onSelect={goTo} /></div>
    <QuestionPrompt id={question.id} index={index} total={questions.length} stem={question.prompt} hint="Choose one answer." multiple={false}
      options={question.options.map((option) => ({ id: option, text: legacyOptionLabel(option) }))} selected={answers[question.id] ? [answers[question.id]] : []} disabled={busy}
      onChoose={(optionId) => { if (busy) return; setMissing(null); setAnswers((current) => ({ ...current, [question.id]: optionId })); }} headingRef={headingRef} />
    {missing && <UnansweredNotice missing={missing} onSelect={goTo} />}
    {Boolean(error) && <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1">{maybeGraded
        ? 'Your earlier submission may already have been graded. Open the lesson again to see your latest score.'
        : quizErrorMessage(error, 'submit').replace(' Your quiz is graded only once, so submitting again is safe.', '')}</span>
      {maybeGraded
        ? <Link to={`/courses/${courseId}/lessons/${lesson.id}`} className="font-semibold text-accent underline underline-offset-4">Open the lesson</Link>
        : canRetryQuiz(error) && <Button size="sm" variant="secondary" onClick={() => void submit()} loading={busy} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}
    </div>}
    <StepNav first={index === 0} last={last} busy={busy} onPrevious={() => goTo(index - 1)} onNext={() => goTo(index + 1)} onSubmit={requestSubmit} />
    <ConfirmDialog open={confirming} tone="primary" title="Submit your answers?"
      description={`You’ve answered all ${questions.length} questions. Your quiz is graded as soon as you submit, and you can’t change these answers afterwards.`}
      confirmLabel="Submit answers" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void submit(); }} />
  </main>;
}
