import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { learnerApi, progressionApi, type ApiMyLearning, type CoursePathResponse } from '../lib/api';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { cn } from '../utils/cn';

export type LearningTabKey = 'in-progress' | 'completed' | 'assignments';

export interface TabConfig {
  id: LearningTabKey;
  label: string;
}

export const LEARNING_TABS: TabConfig[] = [
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'assignments', label: 'Assignments' },
];

export function isCourseCompleted(coursePath: CoursePathResponse): boolean {
  const completedLessons = coursePath.lessons.filter((l) => l.status === 'completed').length;
  const totalLessons = coursePath.lessons.length;
  return (
    (!coursePath.currentLessonId && completedLessons === totalLessons && totalLessons > 0) ||
    coursePath.progressPercent === 100
  );
}

export function getAssignmentStatus(
  item: ApiMyLearning
): 'assigned' | 'in_progress' | 'submitted' | 'evaluated' {
  if (item.status) {
    if (item.status === 'evaluated') return 'evaluated';
    if (item.status === 'submitted') return 'submitted';
    if (item.status === 'in_progress') return 'in_progress';
    return 'assigned';
  }
  if (
    item.attempt_status === 'evaluated' ||
    item.learning_status === 'evaluated' ||
    item.teacher_feedback ||
    (item.score !== undefined && item.score !== null)
  ) {
    return 'evaluated';
  }
  if (item.attempt_status === 'submitted' || item.learning_status === 'completed') {
    return 'submitted';
  }
  if (item.attempt_status === 'in_progress' || item.learning_status === 'started' || item.attempt_id) {
    return 'in_progress';
  }
  return 'assigned';
}

export function getAssignmentStatusTone(
  status: 'assigned' | 'in_progress' | 'submitted' | 'evaluated'
): BadgeTone {
  switch (status) {
    case 'assigned':
      return 'neutral';
    case 'in_progress':
      return 'accent';
    case 'submitted':
      return 'warn';
    case 'evaluated':
      return 'ok';
  }
}

export function getAssignmentStatusLabel(
  status: 'assigned' | 'in_progress' | 'submitted' | 'evaluated'
): string {
  switch (status) {
    case 'assigned':
      return 'Assigned';
    case 'in_progress':
      return 'In Progress';
    case 'submitted':
      return 'Submitted';
    case 'evaluated':
      return 'Evaluated';
  }
}

export function getAssignmentCta(status: 'assigned' | 'in_progress' | 'submitted' | 'evaluated') {
  switch (status) {
    case 'assigned':
      return { label: 'Start Assignment', variant: 'primary' as const };
    case 'in_progress':
      return { label: 'Continue Assignment', variant: 'primary' as const };
    case 'submitted':
      return { label: 'View Submission', variant: 'secondary' as const };
    case 'evaluated':
      return { label: 'View Feedback', variant: 'secondary' as const };
  }
}

export function MyLearning() {
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<LearningTabKey>('in-progress');

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
  const courses = coursePathsQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];

  const inProgressCourses = courses.filter((cp) => !isCourseCompleted(cp));
  const completedCourses = courses.filter((cp) => isCourseCompleted(cp));

  const hasAnyLearning = courses.length > 0 || assignments.length > 0;

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (index + 1) % LEARNING_TABS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (index - 1 + LEARNING_TABS.length) % LEARNING_TABS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = LEARNING_TABS.length - 1;
    }

    if (targetIndex >= 0) {
      const nextTab = LEARNING_TABS[targetIndex];
      setActiveTab(nextTab.id);
      const tabElement = document.getElementById(`tab-${nextTab.id}`);
      tabElement?.focus();
    }
  };

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

      {!loading && !error && !hasAnyLearning && (
        <div className="mt-8">
          <EmptyState
            title="No assigned learning"
            description="Your teacher has not published learning for your classrooms yet."
          />
        </div>
      )}

      {!loading && !error && hasAnyLearning && (
        <div className="mt-8 space-y-6">
          <div className="border-b border-line">
            <nav
              role="tablist"
              aria-label="My Learning Sections"
              className="flex space-x-8 overflow-x-auto no-scrollbar"
            >
              {LEARNING_TABS.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    className={cn(
                      'relative pb-3 pt-1 text-sm font-medium border-b-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 whitespace-nowrap',
                      isActive
                        ? 'border-accent text-accent-ink font-semibold'
                        : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            {activeTab === 'in-progress' && (
              <div className="space-y-6">
                {inProgressCourses.length === 0 ? (
                  <EmptyState
                    title="No courses in progress"
                    description="You do not have any curriculum courses in progress right now."
                  />
                ) : (
                  <div className="grid gap-6">
                    {inProgressCourses.map((coursePath) => {
                      const completedLessons = coursePath.lessons.filter(
                        (l) => l.status === 'completed'
                      ).length;
                      const totalLessons = coursePath.lessons.length;
                      const currentLesson = coursePath.currentLessonId
                        ? coursePath.lessons.find((l) => l.id === coursePath.currentLessonId)
                        : null;

                      return (
                        <article
                          key={coursePath.course.id}
                          className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                          aria-labelledby={`course-title-${coursePath.course.id}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">
                                <span>Course Track</span>
                                {coursePath.course.level && (
                                  <>
                                    <span>·</span>
                                    <span>Level: {coursePath.course.level}</span>
                                  </>
                                )}
                                {coursePath.course.recommendedGrades && (
                                  <>
                                    <span>·</span>
                                    <span>Grades: {coursePath.course.recommendedGrades}</span>
                                  </>
                                )}
                              </div>
                              <h3
                                id={`course-title-${coursePath.course.id}`}
                                className="mt-1 text-2xl font-bold text-ink"
                              >
                                {coursePath.course.title}
                              </h3>
                            </div>
                            <Badge tone="accent">{coursePath.progressPercent}%</Badge>
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
                )}
              </div>
            )}

            {activeTab === 'completed' && (
              <div className="space-y-6">
                {completedCourses.length === 0 ? (
                  <EmptyState
                    title="No completed courses"
                    description="You have not completed any curriculum courses yet."
                  />
                ) : (
                  <div className="grid gap-6">
                    {completedCourses.map((coursePath) => {
                      const totalLessons = coursePath.lessons.length;
                      const completedDates = coursePath.lessons
                        .map((l) => l.completedAt)
                        .filter((d): d is string => Boolean(d));
                      const latestCompletedAt =
                        completedDates.length > 0
                          ? [...completedDates].sort(
                              (a, b) => new Date(b).getTime() - new Date(a).getTime()
                            )[0]
                          : null;

                      return (
                        <article
                          key={coursePath.course.id}
                          className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                          aria-labelledby={`completed-course-title-${coursePath.course.id}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <span className="text-xs font-semibold uppercase tracking-wider text-ok">
                                Completed Track
                              </span>
                              <h3
                                id={`completed-course-title-${coursePath.course.id}`}
                                className="mt-1 text-2xl font-bold text-ink"
                              >
                                {coursePath.course.title}
                              </h3>
                            </div>
                            <Badge tone="ok">✓ Completed</Badge>
                          </div>

                          <div className="mt-5 space-y-2">
                            <div className="flex items-center justify-between text-sm text-ink-muted">
                              <span>
                                {totalLessons} / {totalLessons} lessons completed
                              </span>
                              <span className="font-semibold text-ok">100%</span>
                            </div>
                            <ProgressBar
                              value={100}
                              label={`${coursePath.course.title} completed`}
                            />
                          </div>

                          {latestCompletedAt && (
                            <div className="mt-5 rounded-lg bg-sunken p-4">
                              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                                Completion Date
                              </span>
                              <p className="mt-1 text-sm font-semibold text-ink">
                                Completed on {new Date(latestCompletedAt).toLocaleDateString()}
                              </p>
                            </div>
                          )}

                          <div className="mt-6 flex flex-wrap items-center gap-3">
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
                )}
              </div>
            )}

            {activeTab === 'assignments' && (
              <div className="space-y-6">
                {assignments.length === 0 ? (
                  <EmptyState
                    title="No classroom assignments"
                    description="Your teacher has not published assignments for your classrooms yet."
                  />
                ) : (
                  <div className="grid gap-6">
                    {assignments.map((item) => {
                      const status = getAssignmentStatus(item);
                      const statusTone = getAssignmentStatusTone(status);
                      const statusLabel = getAssignmentStatusLabel(status);
                      const cta = getAssignmentCta(status);

                      return (
                        <article
                          key={item.classroom_assignment_id}
                          className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                          aria-labelledby={`assignment-title-${item.classroom_assignment_id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div>
                              <p className="text-sm text-ink-muted">
                                {item.course_title} · {item.classroom_name}
                              </p>
                              <h3
                                id={`assignment-title-${item.classroom_assignment_id}`}
                                className="mt-1 text-xl font-bold text-ink"
                              >
                                {item.title}
                              </h3>
                            </div>
                            <Badge tone={statusTone}>{statusLabel}</Badge>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm text-ink-muted border-t border-b border-line py-3">
                            <div>
                              <span className="text-xs uppercase tracking-wider text-ink-subtle block">
                                Lesson
                              </span>
                              <span className="font-medium text-ink">{item.lesson_title}</span>
                            </div>
                            {item.challenge_title && (
                              <div>
                                <span className="text-xs uppercase tracking-wider text-ink-subtle block">
                                  Challenge
                                </span>
                                <span className="font-medium text-ink">{item.challenge_title}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-xs uppercase tracking-wider text-ink-subtle block">
                                Due Date
                              </span>
                              <span className="font-medium text-ink">
                                {item.due_at
                                  ? new Date(item.due_at).toLocaleDateString()
                                  : 'No due date'}
                              </span>
                            </div>
                          </div>

                          {status === 'evaluated' &&
                            item.score !== undefined &&
                            item.score !== null && (
                              <div className="mt-4 flex items-center gap-2">
                                <span className="text-sm font-semibold text-ink">Score:</span>
                                <span className="text-base font-bold text-ok">{item.score}%</span>
                              </div>
                            )}

                          {item.teacher_feedback && (
                            <div className="mt-4 rounded-lg bg-sunken p-4">
                              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                                Teacher Feedback
                              </span>
                              <p className="mt-1 text-sm text-ink whitespace-pre-wrap">
                                {item.teacher_feedback}
                              </p>
                            </div>
                          )}

                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            <Button
                              variant={cta.variant}
                              onClick={() => {
                                if (status === 'in_progress' && item.attempt_id) {
                                  navigate(`/practice/${item.attempt_id}`);
                                } else {
                                  navigate(`/my-learning/${item.classroom_assignment_id}`);
                                }
                              }}
                            >
                              {cta.label}
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
