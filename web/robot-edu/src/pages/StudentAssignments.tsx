import { prefetchPracticeWorkspace } from '../lib/routePrefetch';
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { learnerApi, type ApiMyLearning } from '../lib/api';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { cn } from '../utils/cn';

export type AssignmentsTabKey = 'in-progress' | 'completed';

export interface TabConfig {
  id: AssignmentsTabKey;
  label: string;
}

export const ASSIGNMENTS_TABS: TabConfig[] = [
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

/** `9 / 10` using the real maximum; an older API without `score_max` keeps the percentage reading. */
export function formatScore(score: number, max?: number | null): string {
  const shown = Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${shown} / ${typeof max === 'number' && max > 0 ? max : 100}`;
}

export function isAssignmentCompleted(item: ApiMyLearning): boolean {
  return item.status === 'evaluated';
}

export function getAssignmentStatusBadge(
  status: ApiMyLearning['status']
): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'evaluated':
      return { tone: 'ok', label: 'Evaluated' };
    case 'submitted':
      return { tone: 'warn', label: 'Awaiting Evaluation' };
    case 'in_progress':
      return { tone: 'accent', label: 'In Progress' };
    case 'assigned':
    default:
      return { tone: 'neutral', label: 'Assigned' };
  }
}

export function StudentAssignments() {
  useEffect(() => prefetchPracticeWorkspace(), []);
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AssignmentsTabKey>('in-progress');

  const assignmentsQuery = useQuery({
    queryKey: studentLearningKeys.list(session?.user.id, sessionRevision),
    queryFn: () => learnerApi.myLearning(token),
    enabled: Boolean(!authLoading && token),
    staleTime: 30_000,
  });

  const loading = authLoading || assignmentsQuery.isLoading;
  const error = assignmentsQuery.error;
  const assignments = assignmentsQuery.data ?? [];

  const inProgressAssignments = assignments.filter((a) => !isAssignmentCompleted(a));
  const completedAssignments = assignments.filter((a) => isAssignmentCompleted(a));

  const hasAnyAssignments = assignments.length > 0;

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (index + 1) % ASSIGNMENTS_TABS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (index - 1 + ASSIGNMENTS_TABS.length) % ASSIGNMENTS_TABS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = ASSIGNMENTS_TABS.length - 1;
    }

    if (targetIndex >= 0) {
      const nextTab = ASSIGNMENTS_TABS[targetIndex];
      setActiveTab(nextTab.id);
      const tabElement = document.getElementById(`tab-${nextTab.id}`);
      tabElement?.focus();
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <PageHeader
        title="Assignments"
        description="Classroom assignments and teacher-assigned robotics challenges."
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading assignments…</p>}

      {error && (
        <div role="alert" className="mt-6 bg-danger-soft p-3 text-sm text-danger">
          <p>{error instanceof Error ? error.message : 'Unable to load assignments.'}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void assignmentsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && !hasAnyAssignments && (
        <div className="mt-8">
          <EmptyState
            title="No assignments"
            description="You do not have any classroom assignments assigned yet."
          />
        </div>
      )}

      {!loading && !error && hasAnyAssignments && (
        <div className="mt-8 space-y-6">
          <div className="border-b border-line">
            <nav
              role="tablist"
              aria-label="Assignments Sections"
              className="flex space-x-8 overflow-x-auto no-scrollbar"
            >
              {ASSIGNMENTS_TABS.map((tab, index) => {
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
                {inProgressAssignments.length === 0 ? (
                  <EmptyState
                    title="No assignments in progress"
                    description="You do not have any assignments requiring action right now."
                  />
                ) : (
                  <div className="grid gap-6">
                    {inProgressAssignments.map((item) => {
                      const badge = getAssignmentStatusBadge(item.status);

                      return (
                        <article
                          key={item.classroom_assignment_id}
                          className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                          aria-labelledby={`assignment-title-${item.classroom_assignment_id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="space-y-1">
                              <h3
                                id={`assignment-title-${item.classroom_assignment_id}`}
                                className="text-2xl font-bold text-ink"
                              >
                                {item.title}
                              </h3>
                              <p className="text-sm font-medium text-ink-muted">
                                {item.course_title}
                              </p>
                              <p className="text-sm text-ink-subtle">
                                {item.lesson_title}
                                {item.challenge_title && <span> · {item.challenge_title}</span>}
                              </p>
                              <p className="text-xs font-semibold text-accent-ink uppercase tracking-wider">
                                {item.classroom_name}
                              </p>
                            </div>
                            <div className="flex flex-col items-start sm:items-end gap-2">
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                              {item.due_at && (
                                <span className="text-xs text-ink-muted">
                                  Due {new Date(item.due_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </span>
                              )}
                            </div>
                          </div>

                          {item.instructions && (
                            <p className="mt-4 text-sm text-ink-muted line-clamp-2">
                              {item.instructions}
                            </p>
                          )}

                          {item.status === 'submitted' && (
                            <div className="mt-4 rounded-lg bg-sunken p-3 text-xs text-ink-muted">
                              <span className="font-semibold text-ink">Submitted</span> · Awaiting teacher evaluation
                            </div>
                          )}

                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            {item.status === 'assigned' && (
                              <Button
                                variant="primary"
                                onClick={() =>
                                  navigate(`/my-learning/${item.classroom_assignment_id}`)
                                }
                              >
                                Start Assignment
                              </Button>
                            )}
                            {item.status === 'in_progress' && (
                              <>
                                <Button
                                  variant="primary"
                                  onClick={() =>
                                    item.attempt_id
                                      ? navigate(`/practice/${item.attempt_id}`)
                                      : navigate(`/my-learning/${item.classroom_assignment_id}`)
                                  }
                                >
                                  Continue Assignment
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    navigate(`/my-learning/${item.classroom_assignment_id}`)
                                  }
                                >
                                  View Assignment
                                </Button>
                              </>
                            )}
                            {item.status === 'submitted' && (
                              <>
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    navigate(`/my-learning/${item.classroom_assignment_id}`)
                                  }
                                >
                                  View Submission
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    navigate(`/my-learning/${item.classroom_assignment_id}`)
                                  }
                                >
                                  View Assignment
                                </Button>
                              </>
                            )}
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
                {completedAssignments.length === 0 ? (
                  <EmptyState
                    title="No completed assignments"
                    description="You do not have any completed or evaluated assignments yet."
                  />
                ) : (
                  <div className="grid gap-6">
                    {completedAssignments.map((item) => {
                      const badge = getAssignmentStatusBadge(item.status);

                      return (
                        <article
                          key={item.classroom_assignment_id}
                          className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                          aria-labelledby={`assignment-title-${item.classroom_assignment_id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="space-y-1">
                              <h3
                                id={`assignment-title-${item.classroom_assignment_id}`}
                                className="text-2xl font-bold text-ink"
                              >
                                {item.title}
                              </h3>
                              <p className="text-sm font-medium text-ink-muted">
                                {item.course_title}
                              </p>
                              <p className="text-sm text-ink-subtle">
                                {item.lesson_title}
                                {item.challenge_title && <span> · {item.challenge_title}</span>}
                              </p>
                              <p className="text-xs font-semibold text-accent-ink uppercase tracking-wider">
                                {item.classroom_name}
                              </p>
                            </div>
                            <div className="flex flex-col items-start sm:items-end gap-2">
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                              {item.due_at && (
                                <span className="text-xs text-ink-muted">
                                  Due {new Date(item.due_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-5 space-y-3 border-t border-line pt-4">
                            {item.score !== null && item.score !== undefined && (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-ink-muted">Score:</span>
                                <span className="font-bold text-ok">{formatScore(item.score, item.score_max)}</span>
                              </div>
                            )}

                            {item.teacher_feedback && (
                              <div className="rounded-lg bg-sunken p-4">
                                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                                  Teacher Feedback
                                </span>
                                <p className="mt-1 text-sm text-ink">{item.teacher_feedback}</p>
                              </div>
                            )}
                          </div>

                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                navigate(`/my-learning/${item.classroom_assignment_id}`)
                              }
                            >
                              View Assignment
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                navigate(`/my-learning/${item.classroom_assignment_id}`)
                              }
                            >
                              View Submission
                            </Button>
                            {item.teacher_feedback && (
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  navigate(`/my-learning/${item.classroom_assignment_id}`)
                                }
                              >
                                View Feedback
                              </Button>
                            )}
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
