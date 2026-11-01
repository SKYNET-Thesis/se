import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  InfoIcon,
  LockIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TargetIcon,
} from 'lucide-react';
import { CourseLearningShell } from '../components/learning/CourseLearningShell';
import {
  buildLessonActivities,
  activityTypeLabels,
} from '../components/learning/lessonActivities';
import { catalogApi, learnerApi, type LessonDetailResponse } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { Badge } from '../components/ui/Badge';

function PracticeQuiz({
  lesson,
  courseId,
}: {
  lesson: LessonDetailResponse;
  courseId: string;
}) {
  const { session } = useSupabaseSession();
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ passed: boolean; score: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questions =
    lesson.assignment?.constraints?.kind === 'knowledge_check'
      ? lesson.assignment.constraints.questions ?? []
      : [];
  const question = questions[index];

  const submit = async () => {
    if (!session || !lesson.assignment?.classroomAssignmentId) return;
    setSubmitting(true);
    setError(null);
    try {
      let attemptId = lesson.activeAttempt?.id;
      if (!attemptId) {
        attemptId = (
          await learnerApi.createAttempt(
            lesson.assignment.classroomAssignmentId,
            session.access_token,
          )
        ).id;
      }
      const graded = await learnerApi.submitKnowledgeCheck(
        attemptId,
        {
          answers: Object.entries(answers).map(([questionId, optionId]) => ({
            questionId,
            optionId,
          })),
        },
        session.access_token,
      );
      setResult({ passed: graded.passed, score: graded.score });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit this knowledge check.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!started) {
    return (
      <main className="mx-auto w-full max-w-4xl px-2 py-8 md:px-8">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <header className="bg-accent-soft px-7 py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">
              Practice Quiz
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              {lesson.assignment?.title ?? 'Knowledge Check'}
            </h1>
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Start assignment <ArrowRightIcon className="h-4 w-4" />
            </button>
          </header>
          <div className="grid gap-8 px-7 py-8 md:grid-cols-[1fr_260px]">
            <div>
              <p className="text-base leading-7 text-ink-muted">
                {lesson.assignment?.instructions ?? lesson.content?.summary}
              </p>
            </div>
            <aside className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-semibold text-ink">What to expect</h2>
              <dl className="mt-4 space-y-3 text-sm text-ink-muted">
                <div>
                  <dt className="font-medium text-ink">Questions</dt>
                  <dd>{questions.length || 'Provided by your instructor'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Passing requirement</dt>
                  <dd>Server-authoritative evaluation</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  if (result) {
    return (
      <main className="mx-auto w-full max-w-3xl px-2 py-12 md:px-8">
        <section
          aria-live="polite"
          className={`rounded-2xl border p-8 ${
            result.passed
              ? 'border-ok/30 bg-ok-soft/60'
              : 'border-danger/30 bg-danger-soft/60'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">
            Practice Quiz result
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
            {result.passed ? 'Knowledge Check Passed!' : 'Did not meet passing criteria'}
          </h1>
          <p className="mt-3 text-base text-ink-muted">
            Score: {result.score}% — verified by the server.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {result.passed ? (
              <Link
                to={`/courses/${courseId}`}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Continue learning <ArrowRightIcon className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setAnswers({});
                    setIndex(0);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <RotateCcwIcon className="h-4 w-4" /> Try again
                </button>
                <Link
                  to={`/courses/${courseId}/lessons/${lesson.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Review module overview
                </Link>
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (!question) {
    return <main className="p-8 text-ink-muted">Knowledge check content is unavailable.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-2 py-8 md:px-8">
      <section className="rounded-2xl border border-line bg-surface p-7 shadow-hairline">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">
          Practice Quiz
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink md:text-3xl">
          {lesson.assignment?.title}
        </h1>
        <p className="mt-4 text-xs font-medium text-ink-muted">
          Question {index + 1} of {questions.length}
        </p>
        <fieldset className="mt-5">
          <legend className="text-lg font-semibold text-ink leading-snug">
            {question.prompt}
          </legend>
          <div className="mt-5 space-y-3">
            {question.options.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm transition-colors duration-150 ease-out ${
                  answers[question.id] === option
                    ? 'border-accent bg-accent-soft font-medium text-accent-ink'
                    : 'border-line hover:bg-sunken text-ink'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === option}
                  onChange={() =>
                    setAnswers((value) => ({ ...value, [question.id]: option }))
                  }
                  className="h-4 w-4 text-accent"
                />
                <span className="capitalize">{option.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((value) => value - 1)}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold transition-colors duration-150 ease-out hover:bg-sunken disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {index === questions.length - 1 ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit assignment'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((value) => value + 1)}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover"
            >
              Next
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

export function ActivityReader() {
  const { courseId = '', lessonId = '', activityId = '' } = useParams();
  const navigate = useNavigate();
  const { session, sessionRevision } = useSupabaseSession();

  const query = useQuery({
    queryKey: studentLearningKeys.lessonDetail(lessonId, session?.user?.id, sessionRevision),
    queryFn: () => catalogApi.lessonDetail(lessonId, session?.access_token ?? ''),
    enabled: Boolean(session?.access_token && lessonId),
  });

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
        activityId={activity.id}
      >
        <PracticeQuiz lesson={lesson} courseId={courseId} />
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
        <Link
          to={`/courses/${courseId}/lessons/${lessonId}`}
          className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Module overview
        </Link>

        <header className="mt-8 border-b border-line pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">
            {lesson.course_title} · C1-L{lesson.ordinal}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            {activity.title}
          </h1>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="accent">{activityTypeLabels[activity.type]}</Badge>
            {activity.durationMinutes && (
              <span className="text-xs font-medium text-ink-muted">
                {activity.durationMinutes} min
              </span>
            )}
          </div>
        </header>

        <article className="mx-auto mt-8 max-w-3xl space-y-8 text-[16px] leading-7 text-ink">
          {activity.type === 'reading' && (
            <>
              <p className="text-lg leading-relaxed text-ink-muted">
                {activity.description}
              </p>

              <section className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight text-ink">
                  Learn the Concepts
                </h2>

                {lesson.ordinal === 2 ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">
                        Deterministic Sequencing
                      </h3>
                      <p className="mt-2 text-ink/90">
                        Robots execute instructions one step at a time in sequence. The home
                        command ensures the robot starts from an exact, known position.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-ink">
                        Target Positioning
                      </h3>
                      <p className="mt-2 text-ink/90">
                        Instead of manual joint angles, VISTA specifies target positions in the
                        robot&apos;s 3D workspace. The system determines the movement required to
                        reach the target.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-ink">
                        Pauses &amp; Motion Timing
                      </h3>
                      <p className="mt-2 text-ink/90">
                        Wait commands allow motion to stabilize between consecutive actions.
                      </p>
                    </div>
                  </div>
                ) : (
                  lesson.content?.conceptSections?.map((section) => (
                    <div key={section.title}>
                      <h3 className="text-lg font-semibold text-ink">{section.title}</h3>
                      <p className="mt-2 text-ink/90">{section.content}</p>
                    </div>
                  ))
                )}
              </section>

              {lesson.content?.safetyNotes?.length ? (
                <section className="rounded-xl border border-danger/30 bg-danger-soft/60 p-6">
                  <div className="flex items-center gap-2">
                    <ShieldAlertIcon className="h-5 w-5 text-danger" />
                    <h3 className="text-lg font-semibold text-danger">Safety Protocols</h3>
                  </div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink/90">
                    {lesson.content.safetyNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}

          {activity.type === 'demonstration' && (
            <>
              <p className="text-lg leading-relaxed text-ink-muted">
                {activity.description}
              </p>

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
                          This exact immutable ProgramVersion passed authoritative C1-L4 simulation evaluation and is resolved by backend provenance for C1-L5 Physical Robot Lab handoff.
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
                        No qualified ProgramVersion found. You must successfully pass the authoritative C1-L4 Pick &amp; Place challenge simulation to qualify a program version for physical lab execution.
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
              ) : (
                <section className="space-y-6">
                  <h2 className="text-2xl font-bold tracking-tight text-ink">
                    Robot Concept in Action
                  </h2>

                  <div className="space-y-4">
                    <p className="text-ink/90">
                      The robot computes the required arm pose to place the gripper at the commanded 3D
                      coordinates. Sequencing <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-sm">home → move to target → wait</code> creates
                      safe, reproducible movement.
                    </p>

                    <div className="space-y-3 pt-2">
                      <h3 className="text-lg font-semibold text-ink">How the Robot Interprets the Target</h3>
                      <p className="text-ink/90">
                        Instead of manual joint angles, target positions exist in 3D Cartesian workspace coordinates (X, Y, Z). The system solves inverse kinematics to position the end-effector accurately.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-ink">Deterministic Motion Sequencing</h3>
                      <p className="text-ink/90">
                        Executing <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-sm">home → move to target → wait</code> ensures predictable state: homing resets the baseline, target motion plans safe interpolation, and wait dampens vibrations.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-ink">Preview Simulation Verification</h3>
                      <p className="text-ink/90">
                        Before sending execution commands to physical hardware, preview simulation calculates and visualizes the complete trajectory to verify coordinate reachability and obstacle clearance.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-accent/20 bg-accent-soft/50 p-6">
                    <div className="flex items-center gap-2">
                      <InfoIcon className="h-5 w-5 text-accent-ink" />
                      <h3 className="text-base font-semibold text-accent-ink">
                        Simulation Preview
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink/90">
                      Observe the preview simulation to verify the robot trajectory before execution.
                    </p>
                  </div>
                </section>
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
                <section className="rounded-2xl border border-line bg-surface p-8 space-y-4 shadow-hairline">
                  <div className="flex items-center gap-2.5">
                    <ClockIcon className="h-6 w-6 text-ink-subtle" />
                    <h2 className="text-2xl font-bold text-ink">Physical Evidence Pending Execution</h2>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-muted">
                    Evidence review and reflection will be recorded and generated after an authorized physical robot experiment is executed in P0.9.
                  </p>
                  {lesson.qualification && (
                    <p className="text-xs text-ink-muted">
                      Preflight Program Version: <strong className="text-ink">Pick &amp; Place — Version {lesson.qualification.versionNumber}</strong> ({lesson.qualification.programVersionId})
                    </p>
                  )}
                </section>
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

          {activity.type === 'physical_lab' && (
            <section className="rounded-xl border border-line bg-surface p-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <LockIcon className="h-5 w-5 text-warn" />
                  <h2 className="text-xl font-bold text-ink">{activity.title}</h2>
                </div>
                <Badge tone="warn">Physical Lab (Gated)</Badge>
              </div>

              <p className="text-sm text-ink-muted">
                {activity.description}
              </p>

              {lesson.qualification ? (
                <div className="rounded-lg border border-accent/20 bg-accent-soft/40 p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon className="h-4 w-4 text-accent-ink" />
                    <span className="font-semibold text-accent-ink uppercase tracking-wider">Preflight Safety Check</span>
                  </div>
                  <p className="text-ink/90 leading-relaxed">
                    Qualified Target: <strong className="text-ink">Pick &amp; Place — Version {lesson.qualification.versionNumber}</strong> ({lesson.qualification.programVersionId})
                  </p>
                  <p className="text-ink-muted leading-relaxed">
                    Hardware execution is gated until preflight hardware authorization is enabled (P0.9). No fake robot execution or synthetic readiness will be performed.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-sunken p-4 text-xs text-ink-muted">
                  Simulation qualification is required before physical lab preflight. Return to C1-L4 to qualify your program.
                </div>
              )}
            </section>
          )}
        </article>

        <nav
          aria-label="Activity navigation"
          className="mt-14 flex items-center justify-between border-t border-line pt-6"
        >
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => go(-1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Previous
          </button>
          <button
            type="button"
            disabled={index < 0 || index >= activities.length - 1}
            onClick={() => go(1)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next item →
          </button>
        </nav>
      </main>
    </CourseLearningShell>
  );
}
