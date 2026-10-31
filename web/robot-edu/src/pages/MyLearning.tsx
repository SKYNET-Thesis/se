import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { learnerApi, progressionApi, type CoursePathResponse } from '../lib/api';
import { studentLearningKeys } from '../queries/studentLearningQueries';

export function MyLearning() {
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const navigate = useNavigate();

  const assignmentsQuery = useQuery({
    queryKey: studentLearningKeys.list(session?.user.id, sessionRevision),
    queryFn: () => learnerApi.myLearning(token),
    enabled: Boolean(!authLoading && token),
    staleTime: 30_000,
  });

  const coursePathsQuery = useQuery({
    queryKey: studentLearningKeys.coursePaths(session?.user.id, sessionRevision),
    queryFn: () => progressionApi.coursePaths(token),
    enabled: Boolean(!authLoading && token),
    staleTime: 30_000,
  });

  const loading = authLoading || assignmentsQuery.isLoading;
  const error = assignmentsQuery.error;
  const hasCourses = Boolean(coursePathsQuery.data && coursePathsQuery.data.length > 0);
  const hasAssignments = Boolean(assignmentsQuery.data && assignmentsQuery.data.length > 0);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <PageHeader
        title="My Learning"
        description="Authoritative curriculum progression and assigned classroom learning."
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Restoring your learning…</p>}

      {error && (
        <div role="alert" className="mt-6 bg-danger-soft p-3 text-sm text-danger">
          <p>{error instanceof Error ? error.message : 'Unable to load learning.'}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              void assignmentsQuery.refetch();
              void coursePathsQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && !hasCourses && !hasAssignments && (
        <div className="mt-8">
          <EmptyState
            title="No assigned learning"
            description="Your teacher has not published learning for your classrooms yet."
          />
        </div>
      )}

      {!error && (
        <div className="mt-8 space-y-8">
          {hasCourses && (
            <section aria-labelledby="curriculum-heading" className="space-y-6">
              <div className="border-b border-line pb-2">
                <h2 id="curriculum-heading" className="text-xl font-bold tracking-tight text-ink">
                  Curriculum Courses
                </h2>
                <p className="text-sm text-ink-muted">
                  Server-authoritative progress along your robotics learning path.
                </p>
              </div>

              <div className="grid gap-6">
                {coursePathsQuery.data?.map((coursePath: CoursePathResponse) => {
                  const completedLessons = coursePath.lessons.filter((l) => l.status === 'completed').length;
                  const totalLessons = coursePath.lessons.length;
                  const currentLesson = coursePath.currentLessonId
                    ? coursePath.lessons.find((l) => l.id === coursePath.currentLessonId)
                    : null;
                  const isComplete = !coursePath.currentLessonId && completedLessons === totalLessons && totalLessons > 0;

                  return (
                    <article
                      key={coursePath.course.id}
                      className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                      aria-labelledby={`course-title-${coursePath.course.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
                            Course Track
                          </span>
                          <h3
                            id={`course-title-${coursePath.course.id}`}
                            className="mt-1 text-2xl font-bold text-ink"
                          >
                            {coursePath.course.title}
                          </h3>
                        </div>
                        <Badge tone={isComplete ? 'ok' : 'accent'}>
                          {isComplete ? '✓ Completed' : `${coursePath.progressPercent}%`}
                        </Badge>
                      </div>

                      <div className="mt-5 space-y-2">
                        <div className="flex items-center justify-between text-sm text-ink-muted">
                          <span>
                            {completedLessons} / {totalLessons} lessons completed
                          </span>
                          <span className="font-semibold text-ink">
                            {coursePath.progressPercent}%
                          </span>
                        </div>
                        <ProgressBar
                          value={coursePath.progressPercent}
                          label={`${coursePath.course.title} progress`}
                        />
                      </div>

                      <div className="mt-5 rounded-lg bg-sunken p-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          Current Lesson
                        </span>
                        {currentLesson ? (
                          <p className="mt-1 text-base font-semibold text-ink">
                            C1-L{currentLesson.ordinal} — {currentLesson.title}
                          </p>
                        ) : isComplete ? (
                          <p className="mt-1 text-base font-semibold text-ok">
                            ✓ Course completed! You have finished all lessons.
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-ink-muted">
                            All available lessons completed.
                          </p>
                        )}
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        {coursePath.currentLessonId ? (
                          <Button
                            variant="primary"
                            onClick={() =>
                              navigate(
                                `/courses/${coursePath.course.id}/lessons/${coursePath.currentLessonId}`
                              )
                            }
                          >
                            Continue Learning
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => navigate(`/courses/${coursePath.course.id}`)}
                          >
                            Review Course
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() => navigate(`/courses/${coursePath.course.id}`)}
                        >
                          View Course Path
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {hasAssignments && (
            <section aria-labelledby="assignments-heading" className="space-y-4">
              <div className="border-b border-line pb-2">
                <h2 id="assignments-heading" className="text-lg font-semibold text-ink">
                  Classroom Assignments
                </h2>
                <p className="text-sm text-ink-muted">
                  Specific missions published by your classroom teachers.
                </p>
              </div>

              <div className="space-y-3">
                {assignmentsQuery.data?.map((item) => (
                  <article
                    key={item.classroom_assignment_id}
                    className="flex flex-wrap items-center justify-between gap-4 bg-[#edf1ed] p-5 rounded-lg"
                  >
                    <div>
                      <p className="text-sm text-ink-muted">
                        {item.course_title} · {item.classroom_name}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-ink">{item.title}</h3>
                      <p className="mt-1 text-sm capitalize text-ink-muted">
                        {item.learning_status.replace('_', ' ')}
                      </p>
                    </div>
                    <Button onClick={() => navigate(`/my-learning/${item.classroom_assignment_id}`)}>
                      View assignment
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
