import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, ChevronDownIcon, ChevronLeftIcon, CircleDotIcon, Clock3Icon, FileQuestionIcon, GraduationCapIcon, LockIcon, SparklesIcon } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { catalogApi, progressionApi, type CoursePathLesson } from '../lib/api';
import { studentLearningKeys } from '../queries/studentLearningQueries';

export function CourseDetail() {
  const { courseId = '' } = useParams();
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();
  const token = session?.access_token ?? '';

  const pathQuery = useQuery({
    queryKey: studentLearningKeys.coursePath(courseId, session?.user.id, sessionRevision),
    queryFn: () => progressionApi.coursePath(courseId, token),
    enabled: Boolean(!authLoading && token && courseId),
    staleTime: 30_000,
  });

  const courseQuery = useQuery({
    queryKey: ['catalog', 'course', courseId, sessionRevision],
    queryFn: () => catalogApi.course(courseId, token).catch(() => null),
    enabled: Boolean(!authLoading && token && courseId),
    staleTime: 60_000,
  });

  const loading = authLoading || pathQuery.isLoading;
  const error = pathQuery.error;
  const path = pathQuery.data;
  const course = path?.course ?? courseQuery.data;
  const description = path?.course.description ?? courseQuery.data?.description;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1120px] px-4 py-10 text-sm text-ink-muted md:px-8">
        Loading course path…
      </div>
    );
  }

  if (error || !path || !course) {
    return (
      <EmptyState
        icon={<FileQuestionIcon />}
        title="Course path unavailable"
        description={
          error instanceof Error
            ? error.message
            : 'This course path may no longer be available to your account.'
        }
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void pathQuery.refetch()}>
              Try again
            </Button>
            <LinkButton to="/my-learning">My Learning</LinkButton>
          </div>
        }
      />
    );
  }

  const completedLessons = path.lessons.filter((l) => l.status === 'completed').length;
  const totalLessons = path.lessons.length;
  const isComplete = !path.currentLessonId && completedLessons === totalLessons && totalLessons > 0;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-10">
      <Link
        to="/my-learning"
        className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
      >
        <ChevronLeftIcon className="h-4 w-4" /> My Learning
      </Link>

      <header className="mt-5 grid gap-7 border-b border-line pb-9 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {course.label && <Badge tone="accent">{course.label}</Badge>}
            {course.level && <span className="rounded-full border border-line px-3 py-1 text-ink-muted">{course.level}</span>}
            {course.recommendedGrades && <span className="rounded-full border border-line px-3 py-1 text-ink-muted">{course.recommendedGrades}</span>}
          </div>
          <h1 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink text-balance">
            {course.title}
          </h1>
          {description && <p className="mt-5 max-w-[65ch] text-[16px] leading-7 text-ink-muted">{description}</p>}
        </div>

        <aside className="rounded-xl border border-line bg-surface p-5 shadow-hairline" aria-label="Course progress">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">Your progress</p>
              <p className="mt-2 text-sm text-ink-muted">{completedLessons} / {totalLessons} lessons completed</p>
            </div>
            <span className="font-mono text-3xl font-semibold tabular-nums text-ink">{path.progressPercent}%</span>
          </div>
          <div className="mt-4"><ProgressBar value={path.progressPercent} label="Course completion progress" /></div>
          <div className="mt-5">
          {path.currentLessonId ? (
            <LinkButton
              to={`/courses/${course.id}/lessons/${path.currentLessonId}`}
              variant="primary"
              icon={<ArrowRightIcon className="h-4 w-4" />}
            >
              Continue Learning
            </LinkButton>
          ) : isComplete ? (
            <span className="text-sm font-semibold text-ok">
              ✓ Course Completed
            </span>
          ) : null}
          </div>
        </aside>
      </header>

      <section className="grid gap-8 border-b border-line py-9 md:grid-cols-2" aria-label="Course overview">
        <div>
          <div className="flex items-center gap-2 text-accent-ink"><SparklesIcon className="h-4 w-4" /><h2 className="text-lg font-semibold text-ink">What you’ll learn</h2></div>
          {course.learningOutcome && <p className="mt-3 max-w-[62ch] text-[15px] leading-7 text-ink-muted">{course.learningOutcome}</p>}
        </div>
        <div>
          <div className="flex items-center gap-2"><GraduationCapIcon className="h-5 w-5 text-accent-ink" /><h2 className="text-lg font-semibold text-ink">Competencies &amp; skills</h2></div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {(course.competencies ?? []).map((competency) => <li key={competency.code} className="rounded-md bg-sunken px-3 py-2 text-sm font-medium text-ink">{competency.title}</li>)}
          </ul>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="lessons-heading">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">Course path</p>
          <h2 id="lessons-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink">Curriculum</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Explore all {totalLessons} lessons. Locked lessons can be previewed, but activities remain unavailable until prerequisites are complete.</p>
        </div>

        {path.lessons.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No lessons have been published yet.</p>
        ) : (
          <ol className="mt-6 space-y-3">
            {path.lessons.map((lesson: CoursePathLesson) => {
              return <LessonRow key={lesson.id} lesson={lesson} courseId={course.id} />;
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

function LessonRow({ lesson, courseId }: { lesson: CoursePathLesson; courseId: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLocked = lesson.status === 'locked';
  const isCurrent = lesson.status === 'current';
  const isCompleted = lesson.status === 'completed';
  const isInProgress = lesson.status === 'in_progress';
  const panelId = `lesson-preview-${lesson.id}`;

  return (
    <li data-testid="lesson-row" className={`overflow-hidden rounded-xl border bg-surface transition-colors ${isCurrent || isInProgress ? 'border-accent' : 'border-line'}`}>
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <span className={`grid h-10 min-w-10 shrink-0 place-items-center rounded-lg px-1.5 font-mono text-[11px] font-semibold ${isCompleted ? 'bg-ok-soft text-ok' : isCurrent || isInProgress ? 'bg-accent-soft text-accent-ink' : 'bg-sunken text-ink-muted'}`}>{lesson.code ?? `L${lesson.ordinal}`}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{lesson.title}</span><Badge tone={isCompleted ? 'ok' : isCurrent ? 'accent' : isInProgress ? 'warn' : 'neutral'}>{isCompleted ? '✓ Completed' : isCurrent ? '▶ Current' : isInProgress ? '• In Progress' : isLocked ? '🔒 Locked' : 'Available'}</Badge></span>
            <span className="mt-1 block line-clamp-1 text-sm text-ink-muted">{lesson.summary}</span>
            {isLocked && lesson.lockReason && <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><LockIcon className="h-3.5 w-3.5 shrink-0" />{lesson.lockReason.message}</span>}
          </span>
          <ChevronDownIcon aria-hidden="true" className={`h-5 w-5 shrink-0 text-ink-subtle transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <div className="hidden shrink-0 sm:block">
          {isLocked ? <Button variant="secondary" disabled aria-disabled="true">Locked</Button> : <LinkButton to={`/courses/${courseId}/lessons/${lesson.id}`} variant={isCurrent || isInProgress ? 'primary' : 'secondary'}>{isCompleted ? 'Review lesson' : isInProgress ? 'Continue lesson' : 'Start lesson'}</LinkButton>}
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t border-line bg-sunken/50 px-4 py-5 sm:px-[4.5rem]">
          <p className="max-w-[70ch] text-sm leading-6 text-ink-muted">{lesson.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-subtle">Learning steps</h3>
              <ul className="mt-2 space-y-2">{lesson.learningItems.map((item) => <li key={item} className="flex items-start gap-2 text-sm text-ink"><CircleDotIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />{item}</li>)}</ul>
            </div>
            {lesson.estimatedMinutes && <p className="flex items-center gap-2 text-sm text-ink-muted"><Clock3Icon className="h-4 w-4" />~{lesson.estimatedMinutes} min</p>}
          </div>
          {isLocked && lesson.lockReason && <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm text-ink-muted"><LockIcon className="mt-0.5 h-4 w-4 shrink-0" /><span>{lesson.lockReason.message}</span></div>}
          <div className="mt-4 sm:hidden">{isLocked ? <Button variant="secondary" disabled aria-disabled="true" className="w-full">Locked</Button> : <LinkButton to={`/courses/${courseId}/lessons/${lesson.id}`} variant={isCurrent || isInProgress ? 'primary' : 'secondary'} className="w-full">{isCompleted ? 'Review lesson' : isInProgress ? 'Continue lesson' : 'Start lesson'}</LinkButton>}</div>
        </div>
      )}
    </li>
  );
}

