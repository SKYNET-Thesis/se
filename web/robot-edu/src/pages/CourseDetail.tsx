import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, ChevronLeftIcon, FileQuestionIcon, LockIcon } from 'lucide-react';
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
  const description = courseQuery.data?.description;

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
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-8 md:py-9">
      <Link
        to="/my-learning"
        className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
      >
        <ChevronLeftIcon className="h-4 w-4" /> My Learning
      </Link>

      <header className="mt-5 max-w-3xl border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
          {course.status}
        </p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-ink">
          {course.title}
        </h1>
        {description && (
          <p className="mt-3 text-[16px] leading-relaxed text-ink-muted">{description}</p>
        )}

        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-sm text-ink-muted">
            <span>
              {completedLessons} / {totalLessons} lessons completed
            </span>
            <span className="font-semibold text-ink">{path.progressPercent}%</span>
          </div>
          <ProgressBar
            value={path.progressPercent}
            label="Course completion progress"
          />
        </div>

        <div className="mt-6">
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
      </header>

      <section className="mt-8 max-w-3xl" aria-labelledby="lessons-heading">
        <h2 id="lessons-heading" className="text-lg font-semibold text-ink">
          Learning Path Lessons
        </h2>

        {path.lessons.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No lessons have been published yet.</p>
        ) : (
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {path.lessons.map((lesson: CoursePathLesson) => {
              const isLocked = lesson.status === 'locked';
              const isCurrent = lesson.status === 'current';
              const isCompleted = lesson.status === 'completed';
              const isInProgress = lesson.status === 'in_progress';

              return (
                <li
                  key={lesson.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between px-2 hover:bg-sunken rounded-lg transition-colors"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <span className="w-12 pt-0.5 text-sm font-semibold text-ink-subtle shrink-0">
                      C1-L{lesson.ordinal}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{lesson.title}</span>
                        <Badge
                          tone={
                            isCompleted
                              ? 'ok'
                              : isCurrent
                              ? 'accent'
                              : isInProgress
                              ? 'warn'
                              : 'neutral'
                          }
                        >
                          {isCompleted
                            ? '✓ Completed'
                            : isCurrent
                            ? '▶ Current'
                            : isInProgress
                            ? '• In Progress'
                            : isLocked
                            ? '🔒 Locked'
                            : 'Available'}
                        </Badge>
                      </div>

                      {isLocked && lesson.lockReason && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
                          <LockIcon className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                          <span>{lesson.lockReason.message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 pt-2 sm:pt-0">
                    {isLocked ? (
                      <Button
                        variant="secondary"
                        disabled
                        aria-disabled="true"
                        className="cursor-not-allowed opacity-50"
                      >
                        Locked
                      </Button>
                    ) : (
                      <LinkButton
                        to={`/courses/${course.id}/lessons/${lesson.id}`}
                        variant={isCurrent || isInProgress ? 'primary' : 'secondary'}
                      >
                        {isCompleted
                          ? 'Review lesson'
                          : isInProgress
                          ? 'Continue lesson'
                          : 'Start lesson'}
                      </LinkButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

