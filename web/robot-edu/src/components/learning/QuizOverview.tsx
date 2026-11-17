import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CalendarClockIcon, CheckCircle2Icon, CircleAlertIcon, LockIcon, RotateCcwIcon } from 'lucide-react';
import { catalogApi, learnerApi, type ApiAttemptHistoryItem, type ApiClassroomAssignment } from '../../lib/api';
import { attemptsSentence, formatQuizDate, isLessonKnowledgeCheck, passMarkOf, quizAction, quizErrorMessage, quizWindow, windowSentence } from '../../queries/quizAttemptModel';
import { studentLearningKeys } from '../../queries/studentLearningQueries';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { LinkButton } from '../ui/LinkButton';
import { LearningBreadcrumb } from './LearningBreadcrumb';

/**
 * A06: the one place a student opens a classroom quiz from (My learning › Quizzes, Assignments, and the lesson's quiz
 * activity all link here). It says when the quiz can be taken, how many attempts are used, offers exactly one primary
 * action and lists earlier attempts with their server-graded results.
 */
export function QuizOverview({ assignment, attempts, historyFailed, token, userId }: { assignment: ApiClassroomAssignment; attempts: ApiAttemptHistoryItem[]; historyFailed: boolean; token: string; userId?: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const lock = useRef(false);
  // Course and lesson names only decorate the page; a locked or unavailable lesson simply leaves them out.
  const lesson = useQuery({ queryKey: studentLearningKeys.lessonDetail(assignment.lesson_id, userId), queryFn: () => catalogApi.lessonDetail(assignment.lesson_id, token), enabled: Boolean(token && assignment.lesson_id), retry: false, staleTime: 30_000 });
  const start = useMutation({
    mutationFn: () => learnerApi.createAttempt(assignment.id, token),
    onSuccess: (attempt) => { void client.invalidateQueries({ queryKey: studentLearningKeys.all }); navigate(`/practice/${attempt.id}`); },
    onSettled: () => { lock.current = false; },
  });

  const lessonQuiz = isLessonKnowledgeCheck(assignment.constraints);
  const win = quizWindow(assignment);
  const action = historyFailed ? null : quizAction({ window: win, attempts, maxAttempts: assignment.max_attempts, lessonQuiz });
  const sentence = windowSentence(assignment);
  const passMark = passMarkOf(assignment.constraints);
  // Where the student stands, from the server's graded attempts: passed (best passing score), best score so far, or
  // still being graded. This replaces a separate "latest result" box that repeated the attempt list.
  const graded = attempts.filter((attempt) => attempt.status === 'evaluated' && attempt.score !== null);
  const best = graded.reduce<number | null>((top, attempt) => Math.max(top ?? 0, Number(attempt.score)), null);
  const passedAttempt = graded.filter((attempt) => attempt.passed).sort((a, b) => Number(b.score) - Number(a.score))[0];
  const grading = attempts.some((attempt) => attempt.status === 'submitted');
  const standing = passedAttempt ? { tone: 'ok' as const, text: `Quiz status: Passed with ${Number(passedAttempt.score)}%` }
    : best !== null ? { tone: 'warn' as const, text: `Your best score so far is ${best}%${passMark !== null ? `. You need ${passMark}% to pass.` : '.'}` }
      : grading ? { tone: 'neutral' as const, text: 'Your answers are being graded.' } : null;
  const courseId = lesson.data?.course_id;
  const lessonHref = courseId ? `/courses/${courseId}/lessons/${assignment.lesson_id}` : null;
  const proceed = () => {
    if (!action || lock.current || start.isPending) return;
    if (action.kind === 'continue') { navigate(`/practice/${action.attemptId}`); return; }
    if (action.kind !== 'start') return;
    lock.current = true;
    start.mutate();
  };

  return <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-9">
    <LearningBreadcrumb items={[
      { label: 'My learning', to: '/my-learning?tab=quizzes' },
      ...(lesson.data ? [{ label: lesson.data.course_title || 'Course', to: `/courses/${lesson.data.course_id}` }, { label: lesson.data.title, to: lessonHref ?? undefined }] : []),
      { label: assignment.title },
    ]} />

    <header className="mt-4">
      <h1 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.015em] text-ink md:text-[28px]">{assignment.title}</h1>
      {!lesson.data && assignment.lesson_title && <p className="mt-1.5 text-sm text-ink-muted">{assignment.lesson_title}</p>}
      {sentence && <p className={cn('mt-2.5 flex items-start gap-2 text-[15px]', win === 'open' ? 'text-ink' : 'text-ink-muted')}><CalendarClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />{sentence}</p>}
    </header>

    {assignment.instructions && <p className="mt-5 max-w-[68ch] text-pretty whitespace-pre-wrap text-[15px] leading-7 text-ink-muted">{assignment.instructions}</p>}

    {/* The one panel on this page: where the student stands and the single next action. */}
    <section aria-label="Your progress on this quiz" className="mt-7 rounded-xl border border-line bg-surface p-5 md:p-6">
      {standing && <p className="flex items-start gap-2 text-[17px] font-semibold text-ink">
        {standing.tone === 'ok' ? <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden /> : standing.tone === 'warn' ? <CircleAlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden /> : null}{standing.text}</p>}
      <dl className={cn('flex flex-wrap gap-x-8 gap-y-2 text-sm', standing && 'mt-3')}>
        {passMark !== null && <div className="flex gap-1.5"><dt className="text-ink-muted">Pass mark</dt><dd className="font-semibold tabular-nums text-ink">{passMark}%</dd></div>}
        {!lessonQuiz && <div className="flex gap-1.5"><dt className="text-ink-muted">Attempts</dt><dd className="font-semibold tabular-nums text-ink">{historyFailed ? 'Unavailable' : attemptsSentence(attempts.length, assignment.max_attempts)}</dd></div>}
      </dl>
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
      {action?.kind === 'start' && <Button variant="primary" className="h-11 px-5" loading={start.isPending} onClick={proceed} icon={action.retake ? <RotateCcwIcon className="h-4 w-4" aria-hidden /> : undefined}>{passedAttempt ? 'Practice again' : action.retake ? 'Try again' : 'Start quiz'}</Button>}
      {action?.kind === 'continue' && <Button variant="primary" className="h-11 px-5" onClick={proceed}>Continue quiz <ArrowRightIcon className="h-4 w-4" aria-hidden /></Button>}
      {action?.kind === 'lesson' && (lessonHref
        ? <LinkButton variant="primary" className="h-11 px-5" to={`/courses/${courseId}/lessons/${assignment.lesson_id}/activities/${assignment.lesson_id}-knowledge-check`}>Open in lesson <ArrowRightIcon className="h-4 w-4" aria-hidden /></LinkButton>
        : <p className="text-sm text-ink-muted">This quiz is taken inside its lesson.</p>)}
      {action?.kind === 'blocked' && <p className="flex basis-full items-center gap-2 text-[15px] text-ink-muted"><LockIcon className="h-4 w-4 shrink-0" aria-hidden />{action.reason}</p>}
      {/* Nothing to take here: the next useful step is the course itself. */}
      {action?.kind === 'blocked' && courseId && <LinkButton variant="secondary" className="h-11" to={`/courses/${courseId}`}>Back to course <ArrowRightIcon className="h-4 w-4" aria-hidden /></LinkButton>}
    </div>
    {start.error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{quizErrorMessage(start.error, 'start')}</p>}
    {historyFailed && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">Your attempts couldn’t be loaded, so this quiz can’t be started from here right now. Refresh the page to try again.</p>}
    </section>

    {attempts.length > 0 && <section aria-labelledby="attempts-heading" className="mt-9">
      <h2 id="attempts-heading" className="text-lg font-semibold text-ink">Attempts</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">{attempts.map((attempt) => {
        const open = attempt.status === 'in_progress';
        const label = open ? 'In progress' : attempt.status === 'abandoned' ? 'Not submitted' : attempt.status === 'submitted' ? 'Being graded' : attempt.passed ? 'Passed' : 'Not passed';
        return <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <div className="min-w-0">
            <p className="text-[15px] text-ink"><span className="font-medium">Attempt {attempt.attempt_number}</span><span className="text-ink-muted"> · {label}{attempt.status === 'evaluated' && attempt.score !== null ? ` · ${Number(attempt.score)}%` : ''}</span></p>
            <p className="mt-0.5 text-[13px] text-ink-muted">{attempt.submitted_at ? `Submitted ${formatQuizDate(attempt.submitted_at)}` : `Started ${formatQuizDate(attempt.started_at)}${attempt.has_draft ? ', answers saved' : ''}`}</p>
          </div>
          {(open ? action?.kind === 'continue' : attempt.status !== 'abandoned') && <Link to={`/practice/${attempt.id}`} aria-label={`${open ? 'Continue' : 'View result of'} attempt ${attempt.attempt_number}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-accent hover:text-accent-hover">{open ? 'Continue' : 'View result'}</Link>}
        </li>;
      })}</ul>
    </section>}
  </main>;
}
