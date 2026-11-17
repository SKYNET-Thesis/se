import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, CheckIcon, RotateCwIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { LinkButton } from '../components/ui/LinkButton';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { learnerApi, progressionApi, type ApiStudentQuiz, type CoursePathResponse } from '../lib/api';
import { formatQuizDate } from '../queries/quizAttemptModel';
import { canRetry, learningErrorMessage } from '../queries/studentLearningModel';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { cn } from '../utils/cn';

export type MyLearningTabKey = 'in-progress' | 'completed' | 'quizzes';

export interface TabConfig {
  id: MyLearningTabKey;
  label: string;
}

export const MY_LEARNING_TABS: TabConfig[] = [
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'quizzes', label: 'Quizzes' },
];

export function isCourseCompleted(coursePath: CoursePathResponse): boolean {
  const completedLessons = coursePath.lessons.filter((l) => l.status === 'completed').length;
  const totalLessons = coursePath.lessons.length;
  return (
    (!coursePath.currentLessonId && completedLessons === totalLessons && totalLessons > 0) ||
    coursePath.progressPercent === 100
  );
}

export function getQuizStatusBadge(
  status: ApiStudentQuiz['status']
): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'passed':
      return { tone: 'ok', label: 'Passed' };
    case 'failed':
      return { tone: 'warn', label: 'Not passed' };
    case 'in_progress':
      return { tone: 'accent', label: 'In progress' };
    case 'not_started':
    default:
      return { tone: 'neutral', label: 'Not started' };
  }
}

export function getQuizCta(
  status: ApiStudentQuiz['status']
): { label: string; variant: 'primary' | 'secondary' } {
  switch (status) {
    case 'passed':
    case 'failed':
      // Whether a retake is allowed depends on the delivery; the quiz page decides and offers Try again.
      return { label: 'View result', variant: 'secondary' };
    case 'in_progress':
      return { label: 'Continue quiz', variant: 'primary' };
    case 'not_started':
    default:
      return { label: 'Start quiz', variant: 'primary' };
  }
}

const isTab = (value: string | null): value is MyLearningTabKey => MY_LEARNING_TABS.some((tab) => tab.id === value);
/** A06: every classroom quiz opens on its quiz page; without a published delivery for the class there is nothing to open. */
const quizHref = (quiz: ApiStudentQuiz) => (quiz.classroom_assignment_id ? `/my-learning/${quiz.classroom_assignment_id}` : null);

/**
 * Student My Learning (A05): the courses the student is actually enrolled in, with server-computed progress and the
 * server's current lesson. The tab lives in the URL so reloads and links keep it.
 */
export function MyLearning() {
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const [params, setParams] = useSearchParams();
  const activeTab: MyLearningTabKey = isTab(params.get('tab')) ? (params.get('tab') as MyLearningTabKey) : 'in-progress';
  const setActiveTab = (tab: MyLearningTabKey) => setParams(tab === 'in-progress' ? {} : { tab }, { replace: true });

  const coursePathsQuery = useQuery({
    queryKey: studentLearningKeys.coursePaths(session?.user.id, sessionRevision),
    queryFn: () => progressionApi.coursePaths(token),
    enabled: Boolean(!authLoading && token),
    staleTime: 30_000,
  });

  const quizzesQuery = useQuery({
    queryKey: studentLearningKeys.quizzes(session?.user.id, sessionRevision),
    queryFn: () => progressionApi.quizzes(token),
    enabled: Boolean(!authLoading && token),
    staleTime: 30_000,
  });

  // GET /me/quizzes has no open/close dates. GET /me/learning (shared with Assignments) lists only deliveries that are
  // open right now, with their due date, so the Quizzes tab can tell an open quiz from one that is not open yet or closed.
  const openDeliveriesQuery = useQuery({
    queryKey: studentLearningKeys.list(session?.user.id, sessionRevision),
    queryFn: () => learnerApi.myLearning(token),
    enabled: Boolean(!authLoading && token) && activeTab === 'quizzes',
    staleTime: 30_000,
  });
  const openDeliveries = openDeliveriesQuery.data ? new Map(openDeliveriesQuery.data.map((item) => [item.classroom_assignment_id, item.due_at ?? null])) : null;

  const loading = authLoading || coursePathsQuery.isLoading;
  const courses = coursePathsQuery.data ?? [];
  // GET /me/quizzes lists every knowledge-check assignment of the student's lessons, including ones never delivered to
  // their class (curriculum quizzes not yet assigned, and older per-classroom copies made for other classes). Only a
  // published delivery to the student's own class is something they can take, so only those are listed, once each.
  const quizzes = (quizzesQuery.data ?? []).filter((quiz, index, all) => quiz.classroom_assignment_id
    && all.findIndex((other) => other.classroom_assignment_id === quiz.classroom_assignment_id) === index);
  const inProgressCourses = courses.filter((cp) => !isCourseCompleted(cp));
  const completedCourses = courses.filter((cp) => isCourseCompleted(cp));
  const hasAnyLearning = courses.length > 0 || quizzes.length > 0;

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') targetIndex = (index + 1) % MY_LEARNING_TABS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') targetIndex = (index - 1 + MY_LEARNING_TABS.length) % MY_LEARNING_TABS.length;
    else if (e.key === 'Home') targetIndex = 0;
    else if (e.key === 'End') targetIndex = MY_LEARNING_TABS.length - 1;
    if (targetIndex >= 0) {
      e.preventDefault();
      const nextTab = MY_LEARNING_TABS[targetIndex];
      setActiveTab(nextTab.id);
      document.getElementById(`tab-${nextTab.id}`)?.focus();
    }
  };

  return (
    <main className="mx-auto w-full max-w-[980px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="My learning" description="Pick up where you left off." />

      {loading && (
        <ul aria-label="Loading your courses" className="mt-6 space-y-3">{[0, 1].map((item) => <li key={item} className="rounded-lg border border-line bg-surface p-5"><div className="h-5 w-1/3 rounded bg-sunken motion-safe:animate-pulse" /><div className="mt-4 h-2 w-full rounded bg-sunken motion-safe:animate-pulse" /></li>)}</ul>
      )}

      {coursePathsQuery.isError && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          <span>{learningErrorMessage(coursePathsQuery.error, 'courses')}</span>
          {canRetry(coursePathsQuery.error) && <Button size="sm" variant="secondary" onClick={() => void coursePathsQuery.refetch()} loading={coursePathsQuery.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}
        </div>
      )}

      {!loading && !coursePathsQuery.isError && !hasAnyLearning && !quizzesQuery.isError && (
        <div className="mt-8 max-w-[60ch]">
          <h2 className="text-base font-semibold text-ink">No assigned learning</h2>
          <p className="mt-1 text-sm text-ink-muted">You aren’t enrolled in a course yet. When your teacher adds you to a class, its course appears here.</p>
          <Link to="/courses" className="mt-3 inline-flex h-9 items-center text-sm font-semibold text-accent underline underline-offset-4">Browse courses</Link>
        </div>
      )}

      {!loading && !coursePathsQuery.isError && (hasAnyLearning || quizzesQuery.isError) && (
        <div className="mt-6">
          {/* The baseline is an inset shadow, not a border the tabs overlap with a negative margin: with overflow-x:auto the
              browser also scrolls vertically, so a 1px overlap drew a native scrollbar. It still scrolls sideways when the
              tabs genuinely do not fit. */}
          <div role="tablist" aria-label="My learning sections" className="flex gap-6 overflow-x-auto shadow-[inset_0_-1px_0_rgb(var(--line))]">
            {MY_LEARNING_TABS.map((tab, index) => {
              const isActive = activeTab === tab.id;
              const count = tab.id === 'in-progress' ? inProgressCourses.length : tab.id === 'completed' ? completedCourses.length : quizzes.length;
              return (
                <button key={tab.id} id={`tab-${tab.id}`} role="tab" type="button" aria-selected={isActive} aria-controls={`panel-${tab.id}`} tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)} onKeyDown={(e) => handleTabKeyDown(e, index)}
                  className={cn('inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 text-sm font-medium transition-colors duration-150',
                    isActive ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>
                  {tab.label}<span className="tabular-nums text-xs text-ink-subtle">{count}</span>
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="pt-5 focus-visible:outline-none">
            {activeTab === 'in-progress' && (inProgressCourses.length === 0
              ? <p className="text-sm text-ink-muted">Nothing in progress. {completedCourses.length ? 'You’ve finished every course you’re enrolled in.' : 'Courses you’re enrolled in appear here.'}</p>
              : <ul className="space-y-3">{inProgressCourses.map((coursePath) => <CourseInProgress key={coursePath.course.id} coursePath={coursePath} />)}</ul>)}

            {activeTab === 'completed' && (completedCourses.length === 0
              ? <p className="text-sm text-ink-muted">No completed courses yet. Courses move here when you finish every lesson.</p>
              : <ul className="space-y-3">{completedCourses.map((coursePath) => <CourseCompleted key={coursePath.course.id} coursePath={coursePath} />)}</ul>)}

            {activeTab === 'quizzes' && (quizzesQuery.isError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
                <span>{learningErrorMessage(quizzesQuery.error, 'quizzes')}</span>
                {canRetry(quizzesQuery.error) && <Button size="sm" variant="secondary" onClick={() => void quizzesQuery.refetch()} loading={quizzesQuery.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}
              </div>
            ) : quizzes.length === 0
              ? <p className="text-sm text-ink-muted">No quizzes have been assigned to your class yet.</p>
              : <ul className="divide-y divide-line rounded-lg border border-line bg-surface">{quizzes.map((quiz) => <QuizRow key={quiz.assignment_id || `${quiz.course_id}-${quiz.lesson_id}`} quiz={quiz} openDeliveries={openDeliveries} />)}</ul>)}
          </div>
        </div>
      )}
    </main>
  );
}

function CourseMeta({ coursePath }: { coursePath: CoursePathResponse }) {
  const { level, recommendedGrades } = coursePath.course;
  if (!level && !recommendedGrades) return null;
  return <p className="mt-1 flex flex-wrap gap-x-4 text-[13px] text-ink-muted">{level && <span>Level: {level}</span>}{recommendedGrades && <span>Grades: {recommendedGrades}</span>}</p>;
}

function CourseInProgress({ coursePath }: { coursePath: CoursePathResponse }) {
  const { course } = coursePath;
  const completed = coursePath.lessons.filter((l) => l.status === 'completed').length;
  const total = coursePath.lessons.length;
  const current = coursePath.currentLessonId ? coursePath.lessons.find((l) => l.id === coursePath.currentLessonId) : null;
  return (
    <li aria-labelledby={`course-title-${course.id}`} className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`course-title-${course.id}`} className="break-words text-lg font-semibold text-ink">
            <Link to={`/courses/${course.id}`} className="hover:text-accent hover:underline hover:underline-offset-4">{course.title}</Link>
          </h2>
          <CourseMeta coursePath={coursePath} />
          <div className="mt-4 max-w-md">
            <div className="flex items-baseline justify-between gap-3 text-[13px] tabular-nums text-ink-muted">
              <span>{completed} / {total} lessons completed</span>
              <span className="font-semibold text-ink">{coursePath.progressPercent}%</span>
            </div>
            <div className="mt-1.5"><ProgressBar value={coursePath.progressPercent} label={`${course.title} progress`} /></div>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          {current ? (
            <>
              <LinkButton to={`/courses/${course.id}/lessons/${current.id}`} variant="primary" icon={<ArrowRightIcon className="h-4 w-4" aria-hidden />} aria-label={`Continue Learning: ${current.title}`}>Continue Learning</LinkButton>
              <p className="max-w-[16rem] break-words text-[13px] text-ink-muted sm:text-right">Next: <span className="font-medium text-ink">{current.title}</span></p>
              <Link to={`/courses/${course.id}`} className="inline-flex min-h-[32px] items-center text-[13px] font-medium text-accent underline underline-offset-4">View Course Path</Link>
            </>
          ) : (
            <>
              <LinkButton to={`/courses/${course.id}`} variant="secondary">View Course Path</LinkButton>
              <p className="max-w-[16rem] text-[13px] text-ink-muted sm:text-right">All available lessons completed.</p>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function CourseCompleted({ coursePath }: { coursePath: CoursePathResponse }) {
  const { course } = coursePath;
  const total = coursePath.lessons.length;
  const latest = coursePath.lessons.map((l) => l.completedAt).filter((d): d is string => Boolean(d)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return (
    <li aria-labelledby={`completed-course-title-${course.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`completed-course-title-${course.id}`} className="break-words text-lg font-semibold text-ink">{course.title}</h2>
          <Badge tone="ok"><CheckIcon className="h-3.5 w-3.5" aria-hidden />Completed</Badge>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-4 text-[13px] tabular-nums text-ink-muted">
          <span>{total} / {total} lessons completed</span>
          <span className="sr-only">100%</span>
          {latest && <span>Finished {new Date(latest).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>}
        </p>
      </div>
      <LinkButton to={`/courses/${course.id}`} variant="secondary">View Course Path</LinkButton>
    </li>
  );
}

function QuizRow({ quiz, openDeliveries }: { quiz: ApiStudentQuiz; openDeliveries: Map<string, string | null> | null }) {
  const href = quizHref(quiz);
  // Known only when GET /me/learning loaded; until then an unstarted quiz offers a neutral "Open quiz".
  const open = openDeliveries && quiz.classroom_assignment_id ? openDeliveries.has(quiz.classroom_assignment_id) : null;
  const due = open && quiz.classroom_assignment_id ? openDeliveries?.get(quiz.classroom_assignment_id) : null;
  const notOpen = open === false && quiz.status !== 'passed' && quiz.status !== 'failed';
  const badge = notOpen ? { tone: 'neutral' as BadgeTone, label: 'Not open now' } : getQuizStatusBadge(quiz.status);
  const cta = notOpen ? { label: 'View quiz', variant: 'secondary' as const } : quiz.status === 'not_started' && open === null ? { label: 'Open quiz', variant: 'primary' as const } : getQuizCta(quiz.status);
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1 basis-64">
        <h2 className="break-words text-[15px] font-semibold text-ink">{quiz.quiz_title}</h2>
        <p className="mt-0.5 text-pretty text-[13px] text-ink-muted">{quiz.course_title}<span className="mx-1.5" aria-label=", ">›</span>{quiz.lesson_title}</p>
        {due && quiz.status !== 'passed' && quiz.status !== 'failed' && <p className="mt-1 text-[13px] text-ink-muted">Due {formatQuizDate(due)}</p>}
        {quiz.score !== null && quiz.score !== undefined && (
          <p className="mt-1 text-[13px] tabular-nums text-ink-muted">Score <span className="font-semibold text-ink">{quiz.score}%</span>{quiz.pass_percent ? <span className="ml-3">Pass mark {quiz.pass_percent}%</span> : null}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {href ? <LinkButton to={href} variant={cta.variant} className="h-10" aria-label={`${cta.label}: ${quiz.quiz_title}`}>{cta.label}</LinkButton> : <span className="text-[13px] text-ink-muted">Not open for your class</span>}
      </div>
    </li>
  );
}
