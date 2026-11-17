import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  LockIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TargetIcon,
} from 'lucide-react';
import { LearningBreadcrumb } from '../components/learning/LearningBreadcrumb';
import { CourseLearningShell } from '../components/learning/CourseLearningShell';
import {
  buildLessonActivities,
  activityTypeLabels,
} from '../components/learning/lessonActivities';
import { catalogApi, learnerApi, learningMediaApi, progressionApi, type LessonDetailResponse } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { isLessonKnowledgeCheck } from '../queries/quizAttemptModel';
import { learningErrorMessage } from '../queries/studentLearningModel';
import { Badge } from '../components/ui/Badge';
import { ActivityContentPreview } from '../components/authoring/ActivityEditorPanel';
import { createRobotExecutionClient, type PhysicalExecution } from '../lib/robotExecution';
import { useActivityProgress } from '../components/learning/useActivityProgress';
import { DemonstrationWalkthrough, ReadingChapter } from '../components/learning/InstructionalContent';
import { LegacyKnowledgeCheck } from '../components/learning/LegacyKnowledgeCheck';
import { readingPlan } from '../components/learning/lessonTeaching';

function RobotReadinessPanel({
  lesson,
  courseId,
}: {
  lesson: LessonDetailResponse;
  courseId: string;
}) {
  const { session } = useSupabaseSession();
  const attemptId = lesson.qualification?.attemptId ?? lesson.activeAttempt?.id ?? '';
  const client = useMemo(createRobotExecutionClient, []);

  const { data: status, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['physical-readiness', attemptId, session?.access_token],
    queryFn: () => client.getRobotStatus(session?.access_token ?? '', attemptId),
    enabled: Boolean(session?.access_token && attemptId),
  });

  const readiness = status?.readiness;
  const gates = [
    {
      id: 'allocation',
      title: 'Classroom Robot Allocation',
      description: status?.robotName
        ? `${status.robotName} (${status.robotModel ?? 'SO-101'}${status.robotSerial ? ` · ${status.robotSerial}` : ''})`
        : 'Classroom robot assigned',
      passed: Boolean(readiness?.allocated),
    },
    {
      id: 'entitlement',
      title: 'Organization Robot Entitlement',
      description: 'Active subscription/entitlement for robot hardware',
      passed: Boolean(readiness?.entitled),
    },
    {
      id: 'runtime',
      title: 'Robot Execution Runtime',
      description: 'Private orchestrator service online',
      passed: Boolean(readiness?.runtimeOnline),
    },
    {
      id: 'checkik',
      title: 'Low-Level Safety Controller (CHECKIK)',
      description: 'Hardware edge safety interface connected',
      passed: Boolean(readiness?.checkikReachable),
    },
    {
      id: 'motion',
      title: 'Motion Safety Authorization',
      description: 'Hardware safety profile permits blockly motion',
      passed: Boolean(readiness?.motionEnabled),
    },
    {
      id: 'estop',
      title: 'Emergency Stop Status',
      description: 'Local E-stop hardware switch disengaged',
      passed: Boolean(readiness && !readiness.latchedMotionLock),
    },
    {
      id: 'qualification',
      title: 'Pick & Place Simulation Qualification',
      description: lesson.qualification
        ? `Qualified Version ${lesson.qualification.versionNumber} verified`
        : 'Authoritative symbolic PASS required',
      passed: Boolean(readiness?.symbolicPassed ?? lesson.qualification),
    },
  ];

  const allPassed = Boolean(status?.eligible && gates.every((g) => g.passed));

  if (!lesson.qualification) {
    return (
      <section className="rounded-xl border border-line bg-surface p-7 space-y-4">
        <div className="flex items-center gap-2">
          <LockIcon className="h-5 w-5 text-warn" />
          <h2 className="text-xl font-bold text-ink">Robot Readiness / Safety Check</h2>
        </div>
        <div className="rounded-lg border border-line bg-sunken p-4 text-xs text-ink-muted">
          Simulation qualification is required before physical lab preflight. Return to Pick & Place to qualify your program.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-7 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-accent-ink" />
          <h2 className="text-xl font-bold text-ink">Robot Readiness / Safety Check</h2>
        </div>
        <Badge tone={allPassed ? 'ok' : 'warn'}>
          {allPassed ? 'Preflight Verified' : 'Physical Lab (Gated)'}
        </Badge>
      </div>

      <div className="rounded-lg border border-accent/20 bg-accent-soft/40 p-4 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-4 w-4 text-accent-ink" />
          <span className="font-semibold text-accent-ink uppercase tracking-wider">Preflight Safety Check</span>
        </div>
        <p className="text-ink/90 leading-relaxed">
          Qualified Target: <strong className="text-ink">Pick &amp; Place — Version {lesson.qualification.versionNumber}</strong> ({lesson.qualification.programVersionId})
        </p>
        <p className="text-ink-muted leading-relaxed">
          {allPassed
            ? 'Hardware safety controller and runtime are ready for student authorization.'
            : 'Hardware execution is gated until preflight hardware authorization is enabled (P0.9). No fake robot execution or synthetic readiness will be performed.'}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">Authoritative Server Gates</h3>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken disabled:opacity-40"
          >
            <RotateCcwIcon className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-sunken" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {gates.map((gate) => (
              <div
                key={gate.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-xs ${
                  gate.passed ? 'border-ok/30 bg-ok-soft/20' : 'border-danger/30 bg-danger-soft/20'
                }`}
              >
                <div className="flex items-start gap-2">
                  {gate.passed ? (
                    <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  ) : (
                    <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  )}
                  <div>
                    <span className="font-semibold text-ink block">{gate.title}</span>
                    <span className="text-[11px] text-ink-muted">{gate.description}</span>
                  </div>
                </div>
                <Badge tone={gate.passed ? 'ok' : 'danger'}>
                  {gate.passed ? 'OK' : 'OFFLINE'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {allPassed ? (
        <div className="rounded-xl border border-ok/30 bg-ok-soft/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="h-5 w-5 text-ok" />
            <h3 className="text-sm font-bold text-ink">All Preflight Gates Satisfied</h3>
          </div>
          <p className="text-xs text-ink/90 leading-relaxed">
            The robot runtime and hardware safety controller are ready. Proceed to the Physical Experiment to complete the safety confirmation.
          </p>
          <div className="pt-1">
            <Link
              to={`/courses/${courseId}/lessons/${lesson.id}/activities/${lesson.id}-physical`}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover"
            >
              Proceed to Physical Experiment <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-sunken p-4 text-xs space-y-1">
          <span className="font-semibold text-ink block">Server Status Details</span>
          <p className="text-ink-muted">
            {status?.message ?? 'Robot runtime status is currently unavailable.'}
          </p>
        </div>
      )}
    </section>
  );
}

function PhysicalExperimentPanel({
  lesson,
  courseId,
}: {
  lesson: LessonDetailResponse;
  courseId: string;
}) {
  const { session } = useSupabaseSession();
  const attemptId = lesson.qualification?.attemptId ?? lesson.activeAttempt?.id ?? '';
  const client = useMemo(createRobotExecutionClient, []);
  const queryClient = useQueryClient();

  const [perimeterClear, setPerimeterClear] = useState(false);
  const [armHomed, setArmHomed] = useState(false);
  const [motionConfirmed, setMotionConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execution, setExecution] = useState<PhysicalExecution | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allConfirmed = perimeterClear && armHomed && motionConfirmed;

  useEffect(() => {
    if (!session?.access_token || !attemptId) return;
    let active = true;
    client.restoreExecution({ accessToken: session.access_token, attemptId })
      .then((existing) => {
        if (active && existing) {
          setExecution(existing);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [client, session?.access_token, attemptId]);

  useEffect(() => {
    if (!session?.access_token || !execution?.id) return;
    const isTerminal = ['succeeded', 'failed', 'stopped', 'cancelled'].includes(execution.state);
    if (isTerminal) return;

    const timer = window.setInterval(async () => {
      try {
        const snap = await client.getExecution({
          accessToken: session.access_token,
          executionId: execution.id,
        });
        setExecution(snap);
        if (snap.state === 'succeeded') {
          void queryClient.invalidateQueries();
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to query execution status.');
      }
    }, 800);

    return () => window.clearInterval(timer);
  }, [client, execution?.id, execution?.state, session?.access_token, queryClient]);

  const handleStart = async () => {
    if (!session?.access_token || !attemptId || !allConfirmed) return;
    setExecuting(true);
    setError(null);
    try {
      const run = await client.executeProgram({
        accessToken: session.access_token,
        attemptId,
        safetyConfirmed: true,
      });
      setExecution(run);
      if (run.state === 'succeeded') {
        void queryClient.invalidateQueries();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execution failed to start.');
    } finally {
      setExecuting(false);
    }
  };

  const handleStop = async () => {
    if (!session?.access_token || !execution?.id) return;
    try {
      const stopped = await client.stopExecution({
        accessToken: session.access_token,
        executionId: execution.id,
      });
      setExecution(stopped);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to stop execution.');
    }
  };

  const isRunning = execution && ['pending', 'queued', 'running'].includes(execution.state);

  return (
    <section className="space-y-6">
      {lesson.qualification && (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-2">
          <div className="flex items-center gap-2">
            <TargetIcon className="h-5 w-5 text-accent-ink" />
            <h3 className="text-sm font-bold text-ink">Authoritative Target Program</h3>
          </div>
          <p className="text-sm text-ink-muted">
            Executing qualified program: <strong className="text-ink">Pick &amp; Place — Version {lesson.qualification.versionNumber}</strong>
          </p>
          <p className="font-mono text-xs text-ink-subtle break-all">
            ProgramVersion ID: {lesson.qualification.programVersionId}
          </p>
        </div>
      )}

      {(!execution || execution.state === 'failed' || execution.state === 'stopped') && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <ShieldAlertIcon className="h-5 w-5 text-accent-ink" />
            <h3 className="text-base font-bold text-ink">Explicit Safety Confirmation Checklist</h3>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Physical motion requires explicit learner action. Opening this page or refreshing will never start motion. Confirm all 3 safety prerequisites below to enable execution.
          </p>

          <fieldset className="space-y-3">
            <label className="flex items-start gap-3 rounded-lg border border-line p-3.5 hover:bg-sunken cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={perimeterClear}
                onChange={(e) => setPerimeterClear(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line text-accent"
              />
              <span className="text-sm text-ink">Workspace perimeter is clear of obstacles, tools, and personnel.</span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-line p-3.5 hover:bg-sunken cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={armHomed}
                onChange={(e) => setArmHomed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line text-accent"
              />
              <span className="text-sm text-ink">SO-101 physical robot arm is powered and in safe homed starting envelope.</span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-line p-3.5 hover:bg-sunken cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={motionConfirmed}
                onChange={(e) => setMotionConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line text-accent"
              />
              <span className="text-sm text-ink">I explicitly confirm and authorize physical motion execution on the robot.</span>
            </label>
          </fieldset>

          {error && (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft/40 p-4 text-xs font-medium text-danger">
              {error}
            </div>
          )}

          <div className="pt-2">
            <button
              id="confirm-and-execute-btn"
              type="button"
              disabled={!allConfirmed || executing}
              onClick={() => void handleStart()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {executing ? 'Authorizing execution…' : 'Confirm & Execute on Robot'} <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {execution && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-accent-ink" />
              <h3 className="text-base font-bold text-ink">Physical Robot Run Status</h3>
            </div>
            <Badge tone={execution.state === 'succeeded' ? 'ok' : isRunning ? 'accent' : 'danger'}>
              {execution.state.toUpperCase()}
            </Badge>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">{execution.label}</p>
            {execution.message && (
              <p className="text-xs text-ink-muted">{execution.message}</p>
            )}
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs pt-2">
              <div className="rounded-lg bg-sunken p-2.5">
                <dt className="text-ink-muted">Run ID</dt>
                <dd className="font-mono text-ink mt-0.5 break-all">{execution.id}</dd>
              </div>
              <div className="rounded-lg bg-sunken p-2.5">
                <dt className="text-ink-muted">Robot Target</dt>
                <dd className="font-mono text-ink mt-0.5">{execution.robot?.name ?? 'SO-101'} ({execution.robot?.serial ?? 'Demo'})</dd>
              </div>
            </dl>
          </div>

          {isRunning && (
            <div className="pt-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <div className="h-2 w-2 rounded-full bg-accent animate-ping" />
                Robot executing physical trajectory…
              </div>
              <button
                type="button"
                onClick={() => void handleStop()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger-soft/50 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger-soft"
              >
                Emergency Stop
              </button>
            </div>
          )}

          {execution.state === 'succeeded' && (
            <div className="rounded-xl border border-ok/30 bg-ok-soft/50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2Icon className="h-5 w-5 text-ok" />
                <h4 className="text-sm font-bold text-ink">Physical Run Succeeded &amp; Evidence Persisted!</h4>
              </div>
              <p className="text-xs text-ink/90 leading-relaxed">
                The SO-101 robot completed the physical trajectory. Durable evidence has been recorded in Education API.
              </p>
              <div className="pt-1">
                <Link
                  to={`/courses/${courseId}/lessons/${lesson.id}/activities/${lesson.id}-evidence`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-white hover:bg-accent-hover"
                >
                  View Physical Evidence <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}

          {(execution.state === 'failed' || execution.state === 'stopped') && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setExecution(null);
                  setMotionConfirmed(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-sunken"
              >
                <RotateCcwIcon className="h-3.5 w-3.5" />
                Reset &amp; Retry Checklist
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PhysicalEvidencePanel({
  lesson,
  courseId,
}: {
  lesson: LessonDetailResponse;
  courseId: string;
}) {
  const isCompleted = lesson.status === 'completed' || lesson.progressPercent === 100;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface p-7 shadow-hairline space-y-6">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            {isCompleted ? (
              <CheckCircle2Icon className="h-6 w-6 text-ok" />
            ) : (
              <ClockIcon className="h-6 w-6 text-ink-subtle" />
            )}
            <h2 className="text-2xl font-bold text-ink">
              {isCompleted ? 'Authoritative Physical Evidence Verified' : 'Physical Evidence Pending Execution'}
            </h2>
          </div>
          <Badge tone={isCompleted ? 'ok' : 'neutral'}>
            {isCompleted ? 'Lesson Completed (100%)' : 'In Progress'}
          </Badge>
        </div>

        {isCompleted ? (
          <>
            <p className="text-sm leading-relaxed text-ink/90">
              The SO-101 physical robot completed execution of your qualified ProgramVersion. Persisted evidence proves authoritative execution and progression.
            </p>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-lg border border-line bg-surface/80 p-3">
                <dt className="font-semibold text-ink-muted uppercase tracking-wider">Execution Mode</dt>
                <dd className="mt-1 font-mono font-medium text-ink">real_robot (Physical Hardware)</dd>
              </div>
              <div className="rounded-lg border border-line bg-surface/80 p-3">
                <dt className="font-semibold text-ink-muted uppercase tracking-wider">Target Hardware</dt>
                <dd className="mt-1 font-mono font-medium text-ink">SO-101 Manipulator (Calibrated)</dd>
              </div>
              <div className="rounded-lg border border-line bg-surface/80 p-3">
                <dt className="font-semibold text-ink-muted uppercase tracking-wider">Qualified Program Version</dt>
                <dd className="mt-1 font-mono font-medium text-ink break-all">
                  {lesson.qualification?.programVersionId ?? 'Verified'}
                </dd>
              </div>
              <div className="rounded-lg border border-line bg-surface/80 p-3">
                <dt className="font-semibold text-ink-muted uppercase tracking-wider">Course 1 Completion</dt>
                <dd className="mt-1 font-mono font-medium text-ok">100% — All 5 Modules Completed</dd>
              </div>
            </dl>

            <div className="rounded-xl border border-ok/30 bg-ok-soft/50 p-5 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ok">
                ✓ Verified Physical Experiment Succeeded
              </p>
              <p className="text-xs text-ink/90 leading-relaxed">
                By satisfying all preflight safety gates, confirming physical readiness, and executing the verified program on hardware, you have successfully completed Course 1: Robotics Fundamentals.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to={`/courses/${courseId}`}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                Return to Course Path <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-muted">
              Physical experiment evidence is generated after an authorized robot run completes with <code className="rounded bg-sunken px-1 font-mono text-xs">status = succeeded</code>.
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Evidence review and reflection will be recorded and generated after an authorized physical robot experiment is executed in P0.9.
            </p>
            {lesson.qualification && (
              <p className="text-xs text-ink-muted">
                Preflight Program Version: <strong className="text-ink">Pick &amp; Place — Version {lesson.qualification.versionNumber}</strong> ({lesson.qualification.programVersionId})
              </p>
            )}
            <div className="pt-2">
              <Link
                to={`/courses/${courseId}/lessons/${lesson.id}/activities/${lesson.id}-physical`}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                Go to Physical Experiment <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function PhysicalReflectionPanel({
  lesson,
  courseId,
}: {
  lesson: LessonDetailResponse;
  courseId: string;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-7 shadow-hairline space-y-6">
      <div className="flex items-center gap-2.5 border-b border-line pb-4">
        <TargetIcon className="h-6 w-6 text-accent-ink" />
        <h2 className="text-2xl font-bold text-ink">{lesson.title} — Reflection</h2>
      </div>
      <p className="text-sm text-ink-muted leading-relaxed">
        Consider the real-world engineering realities of transitioning from simulated code to physical manipulation.
      </p>

      <div className="space-y-4 text-sm text-ink/90">
        <div className="rounded-lg border border-line bg-sunken p-4 space-y-1">
          <h3 className="font-semibold text-ink">1. Simulation vs. Real Hardware Dynamics</h3>
          <p className="text-xs text-ink-muted leading-relaxed">
            In simulation, mass is idealized and target positions are reached with mathematical precision. In physical reality, motor backlash, cable elasticity, and inertia cause minor deviations. How did motion pauses dampen arm vibration?
          </p>
        </div>

        <div className="rounded-lg border border-line bg-sunken p-4 space-y-1">
          <h3 className="font-semibold text-ink">2. Defense-in-Depth Hardware Safety</h3>
          <p className="text-xs text-ink-muted leading-relaxed">
            Why does local edge safety (CHECKIK / E-stop) remain authoritative even if a cloud API approves a run? Why must cloud authorization never bypass local emergency stop?
          </p>
        </div>

        <div className="rounded-lg border border-line bg-sunken p-4 space-y-1">
          <h3 className="font-semibold text-ink">3. Provenance &amp; Qualification Integrity</h3>
          <p className="text-xs text-ink-muted leading-relaxed">
            Why is physical robot motion restricted exclusively to exact immutable ProgramVersions that achieved an authoritative symbolic PASS, rather than live mutable draft workspaces?
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Link
          to={`/courses/${courseId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Finish Module <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

/** The assignment a database-section quiz activity links through content_ref; null for lessons without database sections. */
function quizAssignmentRef(lesson: LessonDetailResponse, activityId: string): string | null {
  for (const section of lesson.databaseSections ?? []) {
    const ref = section.activities.find((item) => item.id === activityId)?.content_ref;
    if (ref?.kind === 'assignment') return ref.id;
  }
  return null;
}

/** The lesson's quiz activity for a classroom quiz: what it is, where the student stands, and one link to the quiz page. */
function QuizHandoff({ lesson, assignmentRefId }: { lesson: LessonDetailResponse; assignmentRefId?: string | null }) {
  const { session, sessionRevision } = useSupabaseSession();
  // Lesson detail carries ONE assignment per lesson. When this activity links a different quiz (a lesson with two
  // quizzes), its delivery for the student's class is looked up in GET /me/quizzes by the activity's assignment id.
  const ownAssignment = lesson.assignment && (!assignmentRefId || lesson.assignment.id === assignmentRefId) ? lesson.assignment : null;
  const quizzes = useQuery({
    queryKey: studentLearningKeys.quizzes(session?.user.id, sessionRevision),
    queryFn: () => progressionApi.quizzes(session?.access_token ?? ''),
    enabled: Boolean(session?.access_token) && !ownAssignment && Boolean(assignmentRefId),
    staleTime: 30_000,
  });
  const listed = !ownAssignment && assignmentRefId ? quizzes.data?.find((quiz) => quiz.assignment_id === assignmentRefId && quiz.classroom_assignment_id) : undefined;
  const assignment = ownAssignment ?? (listed ? { title: listed.quiz_title, instructions: null as string | null, classroomAssignmentId: listed.classroom_assignment_id as string } : null);
  const active = ownAssignment ? lesson.activeAttempt : listed?.status === 'in_progress' ? { id: listed.attempt_id } : null;
  const prior = ownAssignment ? lesson.priorAttempt : listed && listed.score !== null ? { score: listed.score } : null;
  if (!ownAssignment && assignmentRefId && quizzes.isLoading) return <main aria-busy="true" className="mx-auto w-full max-w-3xl px-2 py-8 text-sm text-ink-muted md:px-8">Loading quiz…</main>;
  return (
    <main className="mx-auto w-full max-w-3xl px-2 py-8 md:px-8">
      <header className="border-b border-line pb-5">
        <p className="text-sm font-medium text-ink-muted">Quiz</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink md:text-4xl">{assignment?.title ?? 'Knowledge check'}</h1>
      </header>
      {quizzes.isError && !assignment && <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{learningErrorMessage(quizzes.error, 'quizzes')}</p>}
      {assignment ? (
        <>
          {assignment.instructions && <p className="mt-6 max-w-[68ch] whitespace-pre-wrap text-[16px] leading-7 text-ink">{assignment.instructions}</p>}
          <p className="mt-6 text-[15px] text-ink-muted">
            {active
              ? 'You have an attempt in progress. Your answers were saved.'
              : prior && prior.score !== null
                ? `Your latest score is ${Number(prior.score)}%.`
                : 'The quiz opens on its own page, where you can see when it closes and how many attempts you have.'}
          </p>
          <Link
            to={`/my-learning/${assignment.classroomAssignmentId}`}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {active ? 'Continue quiz' : prior ? 'Open quiz' : 'Go to quiz'} <ArrowRightIcon className="h-4 w-4" aria-hidden />
          </Link>
        </>
      ) : quizzes.isError ? null : (
        <p className="mt-6 text-[15px] text-ink-muted">This quiz isn’t open for your class yet. Your teacher will open it when it’s time.</p>
      )}
    </main>
  );
}

function StudentActivityContent({ activityId, content, token }: { activityId: string; content: Record<string, unknown>; token: string }) {
  const ids = new Set<string>();
  if (typeof content.videoMediaId === 'string' && content.videoMediaId) ids.add(content.videoMediaId);
  if (Array.isArray(content.mediaIds)) content.mediaIds.forEach((id) => { if (typeof id === 'string') ids.add(id); });
  if (Array.isArray(content.blocks)) content.blocks.forEach((block) => { if (block && typeof block === 'object' && typeof (block as Record<string, unknown>).mediaId === 'string') ids.add((block as Record<string, string>).mediaId); });
  const mediaIds = [...ids];
  const queries = useQueries({ queries: mediaIds.map((mediaId) => ({ queryKey: ['activity-media-url', activityId, mediaId], queryFn: () => learningMediaApi.activityUrl(activityId, mediaId, token), enabled: Boolean(activityId && mediaId && token), staleTime: 30_000 })) });
  const mediaUrls = Object.fromEntries(mediaIds.flatMap((id, index) => queries[index]?.data?.url ? [[id, { url: queries[index].data!.url, filename: queries[index].data!.filename }]] : []));
  if (queries.some((query) => query.isError)) return <p className="text-sm text-danger" role="alert">Learning media could not be loaded for this activity.</p>;
  return <ActivityContentPreview content={content} mediaUrls={mediaUrls} />;
}

export function ActivityReader() {
  const { courseId = '', lessonId = '', activityId = '' } = useParams();
  const navigate = useNavigate();
  const { session, sessionRevision } = useSupabaseSession();
  const queryClient = useQueryClient();
  const progressQuery = useActivityProgress(courseId);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: studentLearningKeys.lessonDetail(lessonId, session?.user?.id, sessionRevision),
    queryFn: () => catalogApi.lessonDetail(lessonId, session?.access_token ?? ''),
    enabled: Boolean(session?.access_token && lessonId),
  });

  if (query.isError && !query.data) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-ink-muted" role="alert">
        Activity could not be loaded.
        <button type="button" className="ml-2 font-semibold text-accent-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => void query.refetch()}>Retry</button>
      </div>
    );
  }

  if (query.isLoading || query.data?.id !== lessonId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16" aria-live="polite">
        <p className="sr-only">Loading activity</p>
        <div className="h-8 w-2/3 animate-pulse rounded bg-sunken motion-reduce:animate-none" />
        <div className="mt-6 h-32 animate-pulse rounded bg-sunken motion-reduce:animate-none" />
      </div>
    );
  }

  if (!query.data) {
    return <div className="p-10 text-sm text-ink-muted">Activity unavailable.</div>;
  }

  const lesson = query.data;

  if (lesson.status === 'locked') {
    return (
      <CourseLearningShell courseId={courseId} lessonId={lessonId} lesson={lesson}>
        <div className="rounded-xl border border-line bg-surface p-8">
          <LockIcon className="h-6 w-6 text-warn" />
          <h1 className="mt-3 text-2xl font-bold">Lesson locked</h1>
          <p className="mt-2 text-ink-muted">
            {lesson.lockReason?.message ?? 'Complete prerequisite lessons to unlock this lesson.'}
          </p>
        </div>
      </CourseLearningShell>
    );
  }

  const activities = buildLessonActivities(lesson);
  const index = activities.findIndex((item) => item.id === activityId);
  const activity = activities[index] ?? activities[0];
  const completed = progressQuery.data?.activities?.some(
    (item) => item.activityId === activity.id && item.status === 'completed',
  ) ?? false;

  const markCompleted = async () => {
    if (!session || !progressQuery.data?.activities || savingCompletion || completed) return;
    setSavingCompletion(true);
    setCompletionError(null);
    setCompletionNotice(null);
    try {
      const row = await progressionApi.completeActivity(activity.id, session.access_token);
      if (row.activityId !== activity.id || row.status !== 'completed' || !row.completedAt) {
        throw new Error('The server did not confirm this activity completion.');
      }
      const key = studentLearningKeys.activityProgress(courseId, session.user.id, sessionRevision);
      queryClient.setQueryData(key, (previous: { courseId: string; activities: typeof row[] } | undefined) => {
        if (!previous) return previous;
        return {
          ...previous,
          activities: [...previous.activities.filter((item) => item.activityId !== row.activityId), row],
        };
      });
      setCompletionNotice('Activity completed.');
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (cause) {
      setCompletionError(cause instanceof Error ? cause.message : 'Could not save activity completion.');
    } finally {
      setSavingCompletion(false);
    }
  };

  const go = (offset: number) => {
    const next = activities[index + offset];
    if (next) {
      navigate(`/courses/${courseId}/lessons/${lessonId}/activities/${next.id}`);
    }
  };

  const openPracticeWorkspace = async () => {
    if (!session) return;
    if (lesson.activeAttempt?.id) {
      navigate(`/practice/${lesson.activeAttempt.id}`);
      return;
    }
    if (lesson.assignment?.classroomAssignmentId) {
      try {
        const attempt = await learnerApi.createAttempt(
          lesson.assignment.classroomAssignmentId,
          session.access_token,
        );
        navigate(`/practice/${attempt.id}`);
      } catch {
        // Fallback
        navigate(`/courses/${courseId}/lessons/${lessonId}`);
      }
    }
  };

  if (activity.type === 'knowledge_check') {
    return (
      <CourseLearningShell
        courseId={courseId}
        lessonId={lessonId}
        lesson={lesson}
        focused
        mode="quiz"
        activityId={activity.id}
      >
        {(() => {
          const assignmentRefId = quizAssignmentRef(lesson, activity.id);
          // Course 1 knowledge checks carry their questions in the lesson assignment; classroom quizzes are taken on their quiz page.
          if (!isLessonKnowledgeCheck(lesson.assignment?.constraints) || (assignmentRefId && lesson.assignment?.id !== assignmentRefId)) return <QuizHandoff lesson={lesson} assignmentRefId={assignmentRefId} />;
          const firstReading = activities.find((item) => item.type === 'reading');
          return <LegacyKnowledgeCheck lesson={lesson} courseId={courseId} previouslyPassed={completed}
            reviewHref={firstReading ? `/courses/${courseId}/lessons/${lessonId}/activities/${firstReading.id}` : null} />;
        })()}
      </CourseLearningShell>
    );
  }

  return (
    <CourseLearningShell
      courseId={courseId}
      lessonId={lessonId}
      lesson={lesson}
      focused
      activityId={activity.id}
    >
      <main className="min-h-[70vh] px-1 py-4 md:px-6 md:py-8">
        <LearningBreadcrumb items={[{ label: 'My learning', to: '/my-learning' }, { label: lesson.course_title || 'Course Path', to: `/courses/${courseId}` }, { label: lesson.title, to: `/courses/${courseId}/lessons/${lessonId}` }, { label: activity.title }]} />

        <header className="mx-auto mt-6 max-w-3xl border-b border-line pb-6">
          <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-ink-muted">
            <span className="font-semibold text-accent">{activityTypeLabels[activity.type]}{activity.type === 'demonstration' && lesson.ordinal !== 5 && activity.content?.version !== 1 ? ' · written walkthrough' : ''}</span>
            <span aria-hidden>·</span><span>Activity {index + 1} of {activities.length}</span>
            {activity.durationMinutes ? <><span aria-hidden>·</span><span>{activity.durationMinutes} min</span></> : null}
          </p>
          <h1 className="mt-2 text-balance text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink md:text-[36px]">
            {activity.title}
          </h1>
        </header>

        <article className="mx-auto mt-8 max-w-3xl space-y-8 text-[16px] leading-7 text-ink [&_li]:max-w-[68ch] [&_p]:max-w-[68ch]">
          {activity.type === 'reading' && (
            activity.content?.version === 1 && Array.isArray(activity.content.blocks) ?
              <StudentActivityContent activityId={activity.id} content={activity.content} token={session?.access_token ?? ''} />
              // Course 1 content: this reading's own concept section(s) from the lesson, never another lesson's text.
              : <ReadingChapter plan={readingPlan(lesson.content, activities, activity.id)} title={activity.title} fallback={activity.description} />
          )}

          {activity.type === 'video' && <StudentActivityContent activityId={activity.id} content={activity.content ?? {}} token={session?.access_token ?? ''} />}

          {activity.type === 'demonstration' && (
            <>
              {activity.content?.version === 1 && typeof activity.content.instructions === 'string' && <ActivityContentPreview content={activity.content} />}
              {lesson.ordinal === 5 && <p className="text-lg leading-relaxed text-ink-muted">
                {activity.description}
              </p>}

              {lesson.ordinal === 5 ? (
                <section className="space-y-6">
                  {lesson.qualification ? (
                    <div className="rounded-2xl border-2 border-ok/30 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_100%)] p-7 space-y-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2Icon className="h-6 w-6 text-ok" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-ok">
                            Qualified Program
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone="ok">Simulation: PASS</Badge>
                          <Badge tone="accent">Ready for physical preflight</Badge>
                        </div>
                      </div>

                      <div>
                        <h2 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
                          Pick &amp; Place — Version {lesson.qualification.versionNumber}
                        </h2>
                        <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                          This exact immutable ProgramVersion passed authoritative Pick & Place simulation evaluation and is resolved by backend provenance for Physical Robot Lab handoff.
                        </p>
                      </div>

                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                        <div className="rounded-lg border border-line bg-surface/80 p-3">
                          <dt className="font-semibold text-ink-muted uppercase tracking-wider">Program Version ID</dt>
                          <dd className="mt-1 font-mono font-medium text-ink break-all">
                            {lesson.qualification.programVersionId}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-line bg-surface/80 p-3">
                          <dt className="font-semibold text-ink-muted uppercase tracking-wider">Symbolic Evaluation</dt>
                          <dd className="mt-1 font-mono font-medium text-ok">
                            {lesson.qualification.verdict ?? 'passed'} ({lesson.qualification.evaluationId})
                          </dd>
                        </div>
                        <div className="rounded-lg border border-line bg-surface/80 p-3">
                          <dt className="font-semibold text-ink-muted uppercase tracking-wider">Schematic Experiment</dt>
                          <dd className="mt-1 font-mono font-medium text-ink break-all">
                            {lesson.qualification.experimentId}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-line bg-surface/80 p-3">
                          <dt className="font-semibold text-ink-muted uppercase tracking-wider">Qualified At</dt>
                          <dd className="mt-1 font-mono font-medium text-ink">
                            {new Date(lesson.qualification.passedAt).toLocaleString()}
                          </dd>
                        </div>
                      </dl>

                      {lesson.qualification.changeSummary && (
                        <div className="rounded-lg bg-surface/80 border border-line p-3 text-xs">
                          <span className="font-semibold text-ink-muted uppercase tracking-wider block">Change Summary</span>
                          <span className="mt-0.5 text-ink font-medium">{lesson.qualification.changeSummary}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-line bg-surface p-7 space-y-4 shadow-hairline">
                      <div className="flex items-center gap-2.5">
                        <ClockIcon className="h-6 w-6 text-ink-subtle" />
                        <h2 className="text-2xl font-bold text-ink">Awaiting Qualification</h2>
                      </div>
                      <p className="text-sm text-ink-muted leading-relaxed">
                        No qualified ProgramVersion found. You must successfully pass the authoritative Pick &amp; Place challenge simulation to qualify a program version for physical lab execution.
                      </p>
                      <div className="pt-2">
                        <Link
                          to={`/courses/${courseId}`}
                          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover"
                        >
                          Return to Course Path <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  )}
                </section>
              ) : activity.content?.version === 1 ? null : (
                // Course 1 has no demonstration media, so this is a written walkthrough of THIS lesson's robot concept
                // (it used to show the same fixed Lesson 2 text and a text-only "Simulation Preview" box in every lesson).
                <DemonstrationWalkthrough
                  concept={lesson.content?.robotConcept || activity.description}
                  task={lesson.content?.taskPreview}
                  nextHref={activities[index + 1] && activities[index + 1].type !== 'demonstration' ? `/courses/${courseId}/lessons/${lessonId}/activities/${activities[index + 1].id}` : null}
                  nextTitle={activities[index + 1]?.title}
                />
              )}
            </>
          )}

          {activity.type === 'guided_practice' && (
            <>
              <p className="text-lg leading-relaxed text-ink-muted">
                {activity.description}
              </p>

              <section className="rounded-2xl border border-line bg-surface p-7 shadow-hairline space-y-6">
                <div>
                  <div className="flex items-center gap-2">
                    <TargetIcon className="h-5 w-5 text-accent-ink" />
                    <h2 className="text-2xl font-bold text-ink">Your Practice Mission</h2>
                  </div>
                  <p className="mt-3 text-ink/90">
                    Program the left arm to:
                  </p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink/90">
                    <li><strong className="text-ink">home</strong> the arm to calibrated position.</li>
                    <li><strong className="text-ink">move to Target A</strong> using 3D workspace coordinates.</li>
                    <li><strong className="text-ink">wait</strong> for motion stabilization.</li>
                  </ol>
                </div>

                {lesson.assignment?.allowedBlocks?.length ? (
                  <div className="rounded-lg bg-sunken p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                      Allowed Canonical Commands
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold text-ink">
                      {lesson.assignment.allowedBlocks.join(' · ')}
                    </p>
                  </div>
                ) : null}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => void openPracticeWorkspace()}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Open practice workspace <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </section>
            </>
          )}

          {(activity.type === 'simulation' || activity.type === 'challenge') && (
            <>
              <p className="text-lg leading-relaxed text-ink-muted">
                {activity.description}
              </p>

              <section className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight text-ink">
                  Authoritative 3D Simulation
                </h2>
                <p className="text-ink/90">
                  Run the simulation to verify that your robot sequence reaches Target A with correct timing and trajectory.
                </p>

                <div className="rounded-xl border border-line bg-surface p-6 space-y-4 shadow-hairline">
                  <h3 className="text-base font-semibold text-ink">Simulation Target Details</h3>
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
                    <div className="rounded-lg bg-sunken p-3">
                      <dt className="text-xs text-ink-muted">Target Position</dt>
                      <dd className="mt-1 font-mono font-semibold text-ink">X: 240, Y: 220, Z: 120</dd>
                    </div>
                    <div className="rounded-lg bg-sunken p-3">
                      <dt className="text-xs text-ink-muted">Active Arm</dt>
                      <dd className="mt-1 font-mono font-semibold text-ink">Left Arm</dd>
                    </div>
                    <div className="rounded-lg bg-sunken p-3">
                      <dt className="text-xs text-ink-muted">Required Sequence</dt>
                      <dd className="mt-1 font-mono font-semibold text-ink">home → move → wait</dd>
                    </div>
                  </dl>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => void openPracticeWorkspace()}
                      className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Open simulation in workspace <ArrowRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {(activity.type === 'result' || activity.type === 'reflection') && (
            <>
              <p className="text-lg leading-relaxed text-ink-muted">
                {activity.description}
              </p>

              {lesson.ordinal === 5 ? (
                activity.type === 'reflection' ? (
                  <PhysicalReflectionPanel lesson={lesson} courseId={courseId} />
                ) : (
                  <PhysicalEvidencePanel lesson={lesson} courseId={courseId} />
                )
              ) : lesson.status === 'completed' || lesson.qualification ? (
                <section className="rounded-2xl border border-ok/30 bg-ok-soft/60 p-8 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2Icon className="h-6 w-6 text-ok" />
                    <h2 className="text-2xl font-bold text-ink">Simulation Evaluation Passed</h2>
                  </div>
                  <p className="text-sm leading-relaxed text-ink/90">
                    Complete the target-position simulation successfully using the required action sequence.
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ok">
                    ✓ Verified by server
                  </p>
                  <div className="flex flex-wrap gap-3 pt-3">
                    <Link
                      to={`/courses/${courseId}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Continue learning <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void openPracticeWorkspace()}
                      className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Review workspace
                    </button>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border border-line bg-surface p-8 space-y-4 shadow-hairline">
                  <div className="flex items-center gap-2.5">
                    <ClockIcon className="h-6 w-6 text-ink-subtle" />
                    <h2 className="text-2xl font-bold text-ink">Awaiting Simulation Completion</h2>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-muted">
                    Complete the target-position simulation successfully using the required action sequence.
                  </p>
                  <p className="text-xs text-ink-muted">
                    Build and evaluate your robot sequence in the practice workspace to see your official simulation result.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => void openPracticeWorkspace()}
                      className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Open practice workspace <ArrowRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                </section>
              )}
            </>
          )}

          {(activity.type === 'reading' || activity.type === 'demonstration') && (
            // A line, not a card: completion is a quiet status at the end of the reading.
            <section aria-label="Your progress" className="flex max-w-[68ch] flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[17px]" aria-busy={savingCompletion}>
              {completed ? (
                <p className="inline-flex items-center gap-2 text-[15px] font-semibold text-ok"><CheckCircle2Icon className="h-5 w-5" aria-hidden /> Activity completed</p>
              ) : (
                <>
                  <p className="text-[15px] text-ink-muted">Finished? Mark this {activity.type === 'demonstration' ? 'demonstration' : 'reading'} complete to track your progress.</p>
                  <button
                    type="button"
                    disabled={savingCompletion || !session || !progressQuery.data?.activities}
                    onClick={() => void markCompleted()}
                    className="min-h-11 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    {savingCompletion ? 'Saving…' : 'Mark as complete'}
                  </button>
                </>
              )}
              {completionError && <p role="alert" className="basis-full text-sm text-danger">{completionError}</p>}
              {completionNotice && <p role="status" className="sr-only">{completionNotice}</p>}
            </section>
          )}

          {activity.type === 'physical_lab' && (
            activity.content?.version === 1 && typeof activity.content.instructions === 'string' ?
              <ActivityContentPreview content={activity.content} /> : <>
              {activity.id.includes('readiness') ? (
                <RobotReadinessPanel lesson={lesson} courseId={courseId} />
              ) : (
                <PhysicalExperimentPanel lesson={lesson} courseId={courseId} />
              )}
            </>
          )}
        </article>

        <nav
          aria-label="Activity navigation"
          className="mt-10 flex items-center justify-between border-t border-line pt-6"
        >
          <button
            type="button"
            disabled={index <= 0}
            aria-label={activities[index - 1] ? `Previous activity: ${activities[index - 1].title}` : 'Previous activity'}
            onClick={() => go(-1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden /> Previous
          </button>
          <button
            type="button"
            disabled={index < 0 || index >= activities.length - 1}
            aria-label={activities[index + 1] ? `Next activity: ${activities[index + 1].title}` : 'Next activity'}
            onClick={() => go(1)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next item <ArrowRightIcon className="h-4 w-4" aria-hidden />
          </button>
        </nav>
      </main>
    </CourseLearningShell>
  );
}
