import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CpuIcon,
  FileQuestionIcon,
  HistoryIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from 'lucide-react';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import {
  learnerApi,
  progressionApi,
  type ApiSymbolicEvaluation,
  type CoursePathResponse,
} from '../lib/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';

export function SimulationResult() {
  const { attemptId = '', evaluationId = '' } = useParams<{ attemptId: string; evaluationId: string }>();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useSupabaseSession();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Load immutable evaluation evidence from server
  const evalQuery = useQuery({
    queryKey: ['symbolic-evaluation', evaluationId, session?.user?.id],
    queryFn: async (): Promise<ApiSymbolicEvaluation> => {
      if (!session?.access_token || !evaluationId) throw new Error('Authentication required.');
      return learnerApi.symbolicEvaluation(evaluationId, session.access_token);
    },
    enabled: Boolean(session?.access_token && evaluationId),
  });

  const evaluation = evalQuery.data;

  // Load lesson details
  const courseId = evaluation?.lesson?.courseId;

  // Load course path to discover next lesson for Continue Learning
  const coursePathQuery = useQuery({
    queryKey: ['course-path', courseId, session?.user?.id],
    queryFn: async (): Promise<CoursePathResponse | null> => {
      if (!session?.access_token || !courseId) return null;
      return progressionApi.coursePath(courseId, session.access_token).catch(() => null);
    },
    enabled: Boolean(session?.access_token && courseId),
  });

  // Load history of evaluations for this attempt
  const historyQuery = useQuery({
    queryKey: ['attempt-evaluations', attemptId, session?.user?.id],
    queryFn: async () => {
      if (!session?.access_token) return [];
      return learnerApi.symbolicEvaluations(session.access_token, attemptId).catch(() => []);
    },
    enabled: Boolean(session?.access_token && attemptId),
  });

  const passed = evaluation?.verdict === 'passed';
  const currentOrdinal = evaluation?.lesson?.ordinal ?? (evaluation?.ruleResults.some((r) => r.type === 'object_in_target_zone') ? 4 : evaluation?.ruleResults.some((r) => r.type === 'object_grasped') ? 3 : 2);
  const isL4 = currentOrdinal === 4;
  const isL3 = currentOrdinal === 3;
  const isL2 = currentOrdinal === 2;

  // Determine next lesson for continue button
  const nextLesson = useMemo(() => {
    if (!coursePathQuery.data?.lessons) return null;
    return coursePathQuery.data.lessons.find((l) => l.ordinal === currentOrdinal + 1) ?? null;
  }, [coursePathQuery.data, currentOrdinal]);

  if (authLoading || (evalQuery.isLoading && !evaluation)) {
    return (
      <div className="mx-auto flex w-full max-w-4xl items-center justify-center px-4 py-20 text-sm text-ink-muted">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>Loading simulation evidence…</span>
        </div>
      </div>
    );
  }

  if (evalQuery.isError || !evaluation) {
    return (
      <EmptyState
        icon={<FileQuestionIcon className="h-10 w-10 text-warn" />}
        title="Simulation result unavailable"
        description={evalQuery.error instanceof Error ? evalQuery.error.message : 'The requested simulation result could not be found or you do not have permission to view it.'}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void evalQuery.refetch()}>
              Try again
            </Button>
            <LinkButton to={`/practice/${attemptId}`}>Return to Practice</LinkButton>
          </div>
        }
      />
    );
  }

  const failedRule = evaluation.ruleResults.find((r) => !r.passed);
  const primaryMessage = evaluation.feedback?.message || evaluation.feedback?.summary || failedRule?.message || (passed ? 'Simulation completed successfully.' : 'Simulation needs changes.');
  const formattedDate = new Date(evaluation.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-ink-muted">
        <Link to="/courses" className="hover:text-ink">Courses</Link>
        <ChevronRightIcon className="h-3 w-3" />
        {courseId && (
          <>
            <Link to={`/courses/${courseId}`} className="hover:text-ink">
              {evaluation.lesson?.courseTitle || 'Course'}
            </Link>
            <ChevronRightIcon className="h-3 w-3" />
          </>
        )}
        <span className="font-medium text-ink">
          C1-L{currentOrdinal} {evaluation.lesson?.title ?? 'Practice'} Result
        </span>
      </nav>

      {/* Main Result Card */}
      <section
        aria-labelledby="result-heading"
        className={`overflow-hidden rounded-2xl border-2 p-6 shadow-sm md:p-8 ${
          passed
            ? 'border-ok/30 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_100%)]'
            : 'border-danger/25 bg-[linear-gradient(135deg,#fef2f2_0%,#ffffff_100%)]'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
              passed ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'
            }`}>
              {passed ? <CheckCircle2Icon className="h-7 w-7" /> : <XCircleIcon className="h-7 w-7" />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={passed ? 'ok' : 'danger'}>
                  {passed ? 'Simulation Passed' : 'Needs Changes'}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {formattedDate}
                </span>
              </div>
              <h1 id="result-heading" className="mt-2 text-2xl font-bold tracking-tight text-ink md:text-3xl">
                {passed ? 'Simulation Passed' : 'Simulation Needs Changes'}
              </h1>
              <p className="mt-1 text-base font-medium text-ink-muted">
                {primaryMessage}
              </p>
              {passed && isL4 && (
                <p className="mt-1 text-xs font-semibold text-accent-ink">
                  Course 1 simulation challenge complete. Next lesson unlocked: Physical Robot Lab.
                </p>
              )}
            </div>
          </div>

          {/* Program Version Provenance Badge */}
          <div className="rounded-xl border border-line bg-surface/90 px-4 py-2.5 shadow-sm text-right">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted block">
              Evaluated Program
            </span>
            <span className="text-base font-bold text-ink">
              Version {evaluation.versionNumber ?? evaluation.evidence?.versionNumber ?? 1}
            </span>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line/60 pt-6">
          {passed ? (
            <>
              {nextLesson ? (
                <Button
                  variant="primary"
                  onClick={() => navigate(`/courses/${courseId}/lessons/${nextLesson.id}`)}
                >
                  Continue Learning: {nextLesson.title} <ArrowRightIcon className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <LinkButton to={courseId ? `/courses/${courseId}` : '/courses'} variant="primary">
                  Continue to Course Path <ArrowRightIcon className="ml-1.5 h-4 w-4" />
                </LinkButton>
              )}
              <LinkButton to={`/practice/${attemptId}`} variant="secondary">
                Return to Practice Workspace
              </LinkButton>
              {courseId && (
                <LinkButton to={`/courses/${courseId}`} variant="secondary">
                  View Course Path
                </LinkButton>
              )}
            </>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => navigate(`/practice/${attemptId}`)}
              >
                <RotateCcwIcon className="mr-1.5 h-4 w-4" /> Try Again in Practice
              </Button>
              {courseId && (
                <LinkButton to={`/courses/${courseId}`} variant="secondary">
                  View Course Path
                </LinkButton>
              )}
            </>
          )}
        </div>
      </section>

      {/* Task Checks / Rule Breakdown */}
      <section aria-labelledby="checks-heading" className="mt-8 rounded-xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-accent" />
            <h2 id="checks-heading" className="text-lg font-bold text-ink">
              Task Checks & Educational Evidence
            </h2>
          </div>
          <span className="text-xs text-ink-muted">
            {evaluation.metrics?.passedRuleCount ?? 0} of {evaluation.metrics?.ruleCount ?? evaluation.ruleResults.length} checks passed
          </span>
        </div>

        <ul className="mt-4 divide-y divide-line/60">
          {evaluation.ruleResults.map((rule) => (
            <li key={rule.ordinal} className="flex items-start gap-3 py-3.5">
              <span className={`mt-0.5 shrink-0 ${rule.passed ? 'text-ok' : 'text-danger'}`}>
                {rule.passed ? <CheckCircle2Icon className="h-5 w-5" /> : <TriangleAlertIcon className="h-5 w-5" />}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {rule.message || ruleLabel(rule.type)}
                  </span>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                    rule.passed ? 'text-ok' : 'text-danger'
                  }`}>
                    {rule.passed ? 'Passed' : 'Needs Revision'}
                  </span>
                </div>
                {rule.reason && (
                  <p className="mt-1 text-xs text-ink-muted">
                    {rule.reason}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Lesson-Specific Evidence Breakdown */}
        <div className="mt-6 rounded-lg border border-line bg-sunken p-4 text-xs text-ink-muted">
          <span className="font-semibold uppercase tracking-wider text-ink block mb-1">
            Authoritative Simulator Evidence Summary
          </span>
          {isL2 && (
            <p>
              The deterministic simulator evaluated your commanded target coordinates. Both tool position and joint constraints were authoritatively verified against the Target A task specification.
            </p>
          )}
          {isL3 && (
            <p>
              The deterministic simulator evaluated object approach, grasp establishment, minimum carry lift height (z ≥ 70 mm), and release sequencing from your immutable ProgramVersion.
            </p>
          )}
          {isL4 && (
            <p>
              The deterministic simulator verified complete pick, lift, transport, and containment within the configured target zone bounds ([60..180], [280..370]).
            </p>
          )}
        </div>
      </section>

      {/* Historical Attempts for this Practice Session */}
      {historyQuery.data && historyQuery.data.length > 1 && (
        <section aria-labelledby="history-heading" className="mt-8 rounded-xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-line pb-4">
            <HistoryIcon className="h-5 w-5 text-accent" />
            <h2 id="history-heading" className="text-lg font-bold text-ink">
              Simulation Attempt History
            </h2>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Each simulation evaluates an immutable ProgramVersion. Prior evidence remains permanently preserved.
          </p>

          <div className="mt-4 space-y-2">
            {historyQuery.data.map((item, idx) => {
              const isSelected = item.id === evaluation.id;
              const itemPassed = item.verdict === 'passed';
              return (
                <Link
                  key={item.id}
                  to={`/practice/${attemptId}/result/${item.id}`}
                  className={`flex items-center justify-between rounded-lg border p-3 text-xs transition-colors ${
                    isSelected
                      ? 'border-accent bg-accent-soft text-accent-ink font-semibold'
                      : 'border-line bg-surface text-ink hover:bg-sunken'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {itemPassed ? (
                      <CheckCircle2Icon className="h-4 w-4 text-ok" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-danger" />
                    )}
                    <span>
                      Version {item.versionNumber ?? (historyQuery.data.length - idx)}
                    </span>
                    <span className="text-ink-muted">
                      ({itemPassed ? 'Passed' : 'Needs Changes'})
                    </span>
                  </div>
                  <span className="text-ink-muted">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Technical Evidence Accordion */}
      <section className="mt-8">
        <button
          type="button"
          onClick={() => setShowTechnicalDetails((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-5 py-3.5 text-xs font-semibold text-ink hover:bg-sunken"
        >
          <span className="flex items-center gap-2">
            <CpuIcon className="h-4 w-4 text-accent" />
            Evidence Provenance & Technical Audit
          </span>
          <ChevronDownIcon className={`h-4 w-4 text-ink-muted transition-transform ${showTechnicalDetails ? 'rotate-180' : ''}`} />
        </button>

        {showTechnicalDetails && (
          <div className="mt-2 rounded-xl border border-line bg-sunken p-4 text-xs font-mono space-y-2 text-ink">
            <div>
              <span className="text-ink-muted block text-[10px] font-sans uppercase">Evaluation ID</span>
              <span>{evaluation.id}</span>
            </div>
            <div>
              <span className="text-ink-muted block text-[10px] font-sans uppercase">Experiment ID</span>
              <span>{evaluation.experimentId}</span>
            </div>
            <div>
              <span className="text-ink-muted block text-[10px] font-sans uppercase">ProgramVersion ID</span>
              <span>{evaluation.programVersionId}</span>
            </div>
            <div>
              <span className="text-ink-muted block text-[10px] font-sans uppercase">Evaluator Version</span>
              <span>{evaluation.evaluatorVersion}</span>
            </div>
            <div>
              <span className="text-ink-muted block text-[10px] font-sans uppercase">Rule Set Hash</span>
              <span>{evaluation.ruleSetHash}</span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function ruleLabel(type: string): string {
  switch (type) {
    case 'preview_target_match':
      return 'Target reached';
    case 'ordered_actions':
      return 'Command sequencing';
    case 'object_grasped':
      return 'Object grasped';
    case 'object_lifted':
      return 'Object lifted';
    case 'object_released':
      return 'Object released';
    case 'object_in_target_zone':
      return 'Object placed inside target zone';
    case 'final_gripper_state':
      return 'Gripper finishing state';
    default:
      return type.replace(/_/g, ' ');
  }
}
