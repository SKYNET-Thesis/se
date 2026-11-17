import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, ArrowRightIcon, FileQuestionIcon, LockIcon, RotateCwIcon } from 'lucide-react';
import { catalogApi, progressionApi, type CoursePathLesson } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { canRetry, isLockedLessonError, learningErrorMessage, lessonNeighbours, lessonStatusPresentation } from '../queries/studentLearningModel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';
import { CourseLearningShell } from '../components/learning/CourseLearningShell';
import { LessonActivitySections } from '../components/learning/LessonActivitySections';
import { LearningBreadcrumb } from '../components/learning/LearningBreadcrumb';

/**
 * Lesson player (A05). Content, status and locks come from the server: GET lessons/:id answers 409 with the lock reason
 * for a locked lesson and 404 when the lesson is not in the student's course path. Previous / Next only move between
 * lessons in the server's order; completion is recorded by the lesson's activities, never by navigation.
 */
export function LessonViewer() {
  const { courseId = '', lessonId = '' } = useParams<{ courseId: string; lessonId: string }>();
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const lessonQuery = useQuery({ queryKey: studentLearningKeys.lessonDetail(lessonId, session?.user?.id, sessionRevision), queryFn: () => catalogApi.lessonDetail(lessonId, token), enabled: Boolean(token && lessonId), retry: false });
  // Same key as CourseLearningShell, so the path is fetched once for the navigator and Previous / Next.
  const pathQuery = useQuery({ queryKey: ['course-learning-shell', courseId, session?.user.id], queryFn: () => progressionApi.coursePath(courseId, token), enabled: Boolean(token && courseId), staleTime: 30_000 });
  const lesson = lessonQuery.data;
  const position = lessonNeighbours(pathQuery.data?.lessons, lessonId);

  if (authLoading || (lessonQuery.isLoading && !lesson)) return <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-20 text-sm text-ink-muted" role="status">Loading lesson…</div>;
  if (lessonQuery.isError && isLockedLessonError(lessonQuery.error)) {
    return <LockedLesson courseId={courseId} lessonId={lessonId} message={lessonQuery.error instanceof Error ? lessonQuery.error.message : ''} pathLessons={pathQuery.data?.lessons} courseTitle={pathQuery.data?.course.title} />;
  }
  if (lessonQuery.isError || !lesson) {
    const error = lessonQuery.error;
    return <EmptyState icon={<FileQuestionIcon className="h-10 w-10 text-ink-subtle" />} title="Lesson unavailable" description={error ? learningErrorMessage(error, 'lesson') : 'This lesson couldn’t be loaded.'}
      action={<div className="flex flex-wrap justify-center gap-2">{error && canRetry(error) && <Button variant="secondary" onClick={() => void lessonQuery.refetch()} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}<LinkButton to={`/courses/${courseId}`}>Back to Course Path</LinkButton></div>} />;
  }
  const locked = lesson.status === 'locked';
  const status = lessonStatusPresentation[lesson.status] ?? lessonStatusPresentation.available;
  return (
    <CourseLearningShell courseId={courseId} lessonId={lessonId} lesson={lesson}>
      <main className="mx-auto w-full max-w-[860px] px-0 py-2 md:py-4">
        <LearningBreadcrumb items={[{ label: 'My learning', to: '/my-learning' }, { label: lesson.course_title || 'Course Path', to: `/courses/${courseId}` }, { label: lesson.title }]} />
        <header className="mt-6 border-b border-line pb-6">
          {position && <p className="text-sm font-medium tabular-nums text-ink-muted">Lesson {position.index + 1} of {position.total}</p>}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-ink">{lesson.title}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {lesson.content?.summary && <p className="mt-3 max-w-[68ch] text-lg leading-relaxed text-ink-muted">{lesson.content.summary}</p>}
          {lesson.content?.completionCriteria && !locked && <p className="mt-4 max-w-[68ch] text-sm text-ink-muted"><span className="font-medium text-ink">To complete this lesson:</span> {lesson.content.completionCriteria}</p>}
        </header>
        {locked
          ? <section className="mt-8 rounded-lg border border-line bg-surface p-6"><LockIcon className="h-5 w-5 text-ink-subtle" aria-hidden /><h2 className="mt-3 font-bold text-ink">This lesson is locked</h2><p className="mt-1 text-sm text-ink-muted">{lesson.lockReason?.message ?? 'Complete prerequisite lessons to unlock this lesson.'}</p></section>
          : <LessonActivitySections lesson={lesson} />}
        {position && <LessonPager courseId={courseId} previous={position.previous} next={position.next} />}
      </main>
    </CourseLearningShell>
  );
}

function LessonPager({ courseId, previous, next }: { courseId: string; previous: CoursePathLesson | null; next: CoursePathLesson | null }) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Lessons" className="mt-10 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
      {previous ? (
        <Link to={`/courses/${courseId}/lessons/${previous.id}`} className="group flex min-h-[64px] items-center gap-3 rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
          <ArrowLeftIcon className="h-4 w-4 shrink-0 text-ink-subtle group-hover:text-accent" aria-hidden />
          <span className="min-w-0"><span className="block text-xs text-ink-muted">Previous lesson</span><span className="block break-words font-semibold text-ink group-hover:text-accent">{previous.title}</span></span>
        </Link>
      ) : <span className="hidden sm:block" />}
      {next && (next.status === 'locked' ? (
        <div className="flex min-h-[64px] items-center justify-end gap-3 rounded-lg border border-dashed border-line-strong p-4 text-right">
          <span className="min-w-0"><span className="block text-xs text-ink-muted">Next lesson, locked</span><span className="block break-words font-semibold text-ink-muted">{next.title}</span>{next.lockReason?.message && <span className="mt-0.5 block text-xs text-ink-muted">{next.lockReason.message}</span>}</span>
          <LockIcon className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
        </div>
      ) : (
        <Link to={`/courses/${courseId}/lessons/${next.id}`} className="group flex min-h-[64px] items-center justify-end gap-3 rounded-lg border border-line bg-surface p-4 text-right hover:border-line-strong">
          <span className="min-w-0"><span className="block text-xs text-ink-muted">Next lesson</span><span className="block break-words font-semibold text-ink group-hover:text-accent">{next.title}</span></span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-subtle group-hover:text-accent" aria-hidden />
        </Link>
      ))}
    </nav>
  );
}

/** The server refused a locked lesson (409). Show why, and a direct way to the lesson that unlocks it. */
function LockedLesson({ courseId, lessonId, message, pathLessons, courseTitle }: { courseId: string; lessonId: string; message: string; pathLessons?: CoursePathLesson[]; courseTitle?: string }) {
  const lesson = pathLessons?.find((item) => item.id === lessonId);
  const unlockId = lesson?.lockReason?.prerequisiteLessonId;
  const unlock = unlockId ? pathLessons?.find((item) => item.id === unlockId) : null;
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-8">
      <LearningBreadcrumb items={[{ label: 'My learning', to: '/my-learning' }, { label: courseTitle ?? 'Course Path', to: `/courses/${courseId}` }, { label: lesson?.title ?? 'Locked lesson' }]} />
      <section className="mt-6 rounded-lg border border-line bg-surface p-6">
        <LockIcon className="h-5 w-5 text-ink-subtle" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold text-ink">{lesson ? lesson.title : 'This lesson is locked'}</h1>
        {lesson && <p className="mt-1 text-sm font-medium text-ink-muted">This lesson is locked</p>}
        <p className="mt-3 text-sm text-ink-muted">{lesson?.lockReason?.message ?? (message || 'Complete the earlier lessons to unlock it.')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {unlock && unlock.status !== 'locked' && <LinkButton to={`/courses/${courseId}/lessons/${unlock.id}`} variant="primary" icon={<ArrowRightIcon className="h-4 w-4" aria-hidden />}>Go to {unlock.title}</LinkButton>}
          <LinkButton to={`/courses/${courseId}`} variant="secondary">Back to Course Path</LinkButton>
        </div>
      </section>
    </main>
  );
}
