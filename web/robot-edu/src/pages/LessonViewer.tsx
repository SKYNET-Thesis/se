import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ClockIcon,
  CpuIcon,
  FileQuestionIcon,
  LockIcon,
  PlayCircleIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TargetIcon,
} from 'lucide-react';
import { catalogApi, learnerApi, type LessonDetailResponse, type KnowledgeCheckQuestion } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';

const DEFAULT_L1_QUESTIONS: KnowledgeCheckQuestion[] = [
  { id: 'q1', prompt: 'Which robot component connects links and allows rotational motion?', options: ['joint', 'linkage', 'chassis'] },
  { id: 'q2', prompt: 'What is the primary role of the camera in the workspace?', options: ['visual_inspection', 'power_supply', 'joint_braking'] },
  { id: 'q3', prompt: 'Before commanding the gripper to grasp, what workspace condition must be confirmed?', options: ['clear_workspace', 'blind_approach', 'maximum_speed'] },
  { id: 'q4', prompt: 'Which command returns all robot arm joints to a known safe configuration?', options: ['home', 'emergency_power', 'open_gripper'] },
  { id: 'q5', prompt: 'What is the required immediate safety response to unexpected motion in the workspace?', options: ['stop', 'continue', 'ignore'] },
];

export function LessonViewer() {
  const { courseId = '', lessonId = '' } = useParams<{ courseId: string; lessonId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Knowledge check state (for L1)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittingCheck, setSubmittingCheck] = useState(false);
  const [quizResult, setQuizResult] = useState<{ passed: boolean; score: number } | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);

  const lessonQuery = useQuery({
    queryKey: studentLearningKeys.lessonDetail(lessonId, session?.user?.id, sessionRevision),
    queryFn: async (): Promise<LessonDetailResponse> => {
      if (!session?.access_token) throw new Error('Authentication required.');
      return catalogApi.lessonDetail(lessonId, session.access_token);
    },
    enabled: Boolean(session?.access_token && lessonId),
  });

  const lesson = lessonQuery.data;
  const isLocked = lesson?.status === 'locked';
  const isCompleted = lesson?.status === 'completed';
  const isCurrent = lesson?.status === 'current';
  const isInProgress = lesson?.status === 'in_progress';
  const isL1 = lesson?.ordinal === 1;
  const isL5 = lesson?.ordinal === 5;

  const handleStartPractice = async () => {
    if (!session || !lesson || isLocked) return;
    setStarting(true);
    setStartError(null);

    try {
      // If L1, open the knowledge check section directly
      if (isL1) {
        setShowQuiz(true);
        setStarting(false);
        return;
      }

      // For L2-L5, navigate to practice
      if (lesson.activeAttempt?.id) {
        navigate(`/practice/${lesson.activeAttempt.id}`);
        return;
      }

      if (lesson.assignment?.classroomAssignmentId) {
        const attempt = await learnerApi.createAttempt(lesson.assignment.classroomAssignmentId, session.access_token);
        navigate(`/practice/${attempt.id}`);
        return;
      }

      // Fallback lookup through classrooms if direct assignment not attached
      const classrooms = await learnerApi.classrooms(session.access_token);
      const assignments = (
        await Promise.all(classrooms.items.map((classroom) => learnerApi.assignments(classroom.id, session.access_token)))
      ).flat();
      const assignment = assignments.find((item) => item.lesson_id === lesson.id && item.status === 'published');
      if (!assignment) throw new Error('This lesson does not have an available practice assignment yet.');

      const attempt = await learnerApi.createAttempt(assignment.id, session.access_token);
      navigate(`/practice/${attempt.id}`);
    } catch (requestError) {
      setStartError(requestError instanceof Error ? requestError.message : 'Could not start practice.');
    } finally {
      setStarting(false);
    }
  };

  const handleOptionSelect = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmitKnowledgeCheck = async () => {
    if (!session || !lesson || isLocked) return;
    setSubmittingCheck(true);
    setQuizError(null);

    try {
      let attemptId = lesson.activeAttempt?.id;
      if (!attemptId) {
        if (!lesson.assignment?.classroomAssignmentId) {
          throw new Error('No active assignment available for this knowledge check.');
        }
        const createdAttempt = await learnerApi.createAttempt(lesson.assignment.classroomAssignmentId, session.access_token);
        attemptId = createdAttempt.id;
      }

      const answerInputs = Object.entries(answers).map(([questionId, optionId]) => ({
        questionId,
        optionId,
      }));

      const result = await learnerApi.submitKnowledgeCheck(attemptId, { answers: answerInputs }, session.access_token);
      setQuizResult({ passed: result.passed, score: result.score });

      // Invalidate queries so lesson detail, course path, and my learning update authoritatively
      await queryClient.invalidateQueries({ queryKey: studentLearningKeys.all });
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Could not submit knowledge check.');
    } finally {
      setSubmittingCheck(false);
    }
  };

  if (authLoading || (lessonQuery.isLoading && !lesson)) {
    return (
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-20 text-sm text-ink-muted">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>Loading lesson…</span>
        </div>
      </div>
    );
  }

  if (lessonQuery.isError || !lesson) {
    return (
      <EmptyState
        icon={<FileQuestionIcon className="h-10 w-10 text-warn" />}
        title="Lesson unavailable"
        description={lessonQuery.error instanceof Error ? lessonQuery.error.message : 'This lesson could not be loaded.'}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void lessonQuery.refetch()}>
              Try again
            </Button>
            <LinkButton to={`/courses/${courseId}`}>Back to Course Path</LinkButton>
          </div>
        }
      />
    );
  }

  const questions =
    (lesson.assignment?.constraints?.questions && lesson.assignment.constraints.questions.length > 0)
      ? lesson.assignment.constraints.questions
      : DEFAULT_L1_QUESTIONS;

  const allQuestionsAnswered = questions.every((q) => Boolean(answers[q.id]));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-ink-muted">
        <Link to={`/courses/${courseId}`} className="inline-flex items-center gap-1 hover:text-ink">
          <ChevronLeftIcon className="h-4 w-4" />
          <span>{lesson.course_title || 'Course Path'}</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-ink">
          C1-L{lesson.ordinal} — {lesson.title}
        </span>
      </nav>

      {/* Main Grid: Educational Content (Left) + Action / Practice Sidebar (Right) */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left Column: Educational Content */}
        <div className="space-y-8">
          {/* Header Card */}
          <header className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Course 1 · Lesson {lesson.ordinal}
              </span>
              <div>
                {isCompleted && <Badge tone="ok">✓ Completed</Badge>}
                {isCurrent && <Badge tone="accent">▶ Current</Badge>}
                {isInProgress && <Badge tone="accent">• In Progress</Badge>}
                {isLocked && <Badge tone="neutral">🔒 Locked</Badge>}
              </div>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              C1-L{lesson.ordinal} — {lesson.title}
            </h1>

            {lesson.content?.summary && (
              <p className="mt-3 text-lg leading-relaxed text-ink-muted">
                {lesson.content.summary}
              </p>
            )}

            {/* Metadata Badges */}
            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-xs font-medium text-ink-muted">
              {lesson.content?.estimatedMinutes && (
                <div className="flex items-center gap-1.5">
                  <ClockIcon className="h-4 w-4 text-accent" />
                  <span>~{lesson.content.estimatedMinutes} minutes</span>
                </div>
              )}
              {lesson.objectives?.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <TargetIcon className="h-4 w-4 text-accent" />
                  <span>{lesson.objectives.length} Learning Objectives</span>
                </div>
              )}
              {lesson.progressPercent > 0 && (
                <div className="flex items-center gap-1.5">
                  <SparklesIcon className="h-4 w-4 text-ok" />
                  <span>{lesson.progressPercent}% progress</span>
                </div>
              )}
            </div>
          </header>

          {/* Locked Notice Banner */}
          {isLocked && (
            <section
              aria-labelledby="lock-notice-heading"
              className="rounded-xl border border-line bg-[#fbf9f4] p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <LockIcon className="mt-0.5 h-6 w-6 text-warn" />
                <div>
                  <h2 id="lock-notice-heading" className="text-base font-bold text-ink">
                    This lesson is locked
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {lesson.lockReason?.message ?? 'Complete prerequisite lessons to unlock this lesson.'}
                  </p>
                  <div className="mt-4">
                    <LinkButton to={`/courses/${courseId}`} variant="secondary">
                      Back to Course Path
                    </LinkButton>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Learning Objectives */}
          {lesson.objectives?.length > 0 && (
            <section aria-labelledby="objectives-heading" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2 text-ink">
                <TargetIcon className="h-5 w-5 text-accent" />
                <h2 id="objectives-heading" className="text-xl font-bold">
                  What You Will Learn
                </h2>
              </div>
              <ul className="mt-4 space-y-3">
                {lesson.objectives.map((obj) => (
                  <li key={obj.code} className="flex items-start gap-3 rounded-lg bg-sunken p-3">
                    <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <div>
                      <span className="font-semibold text-ink">{obj.code}</span>
                      <p className="text-sm text-ink-muted">{obj.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Concept Content Sections (LEARN) */}
          {lesson.content?.conceptSections?.length > 0 && (
            <section aria-labelledby="concepts-heading" className="space-y-4">
              <div className="flex items-center gap-2 text-ink">
                <BookOpenIcon className="h-5 w-5 text-accent" />
                <h2 id="concepts-heading" className="text-xl font-bold">
                  Learn the Concepts
                </h2>
              </div>

              <div className="space-y-4">
                {lesson.content.conceptSections.map((section, idx) => (
                  <article key={idx} className="rounded-xl border border-line bg-surface p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-ink">{section.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-ink-muted">{section.content}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Robot Concept Callout */}
          {lesson.content?.robotConcept && (
            <section
              aria-labelledby="robot-concept-heading"
              className="rounded-xl border border-line bg-[#f0f4f8] p-6 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <CpuIcon className="mt-1 h-6 w-6 text-accent" />
                <div>
                  <h2 id="robot-concept-heading" className="text-lg font-bold text-ink">
                    Robot Concept in Action
                  </h2>
                  <p className="mt-2 text-base leading-relaxed text-ink">
                    {lesson.content.robotConcept}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Safety Notes Callout */}
          {lesson.content?.safetyNotes?.length > 0 && (
            <section
              aria-labelledby="safety-heading"
              className="rounded-xl border border-line bg-[#fbf5f5] p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <ShieldAlertIcon className="mt-0.5 h-5 w-5 text-danger" />
                <div>
                  <h2 id="safety-heading" className="text-sm font-bold text-danger">
                    Safety Protocols
                  </h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-muted">
                    {lesson.content.safetyNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Task Preview Card (YOUR TASK) */}
          <section aria-labelledby="task-heading" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2 text-ink">
              <PlayCircleIcon className="h-5 w-5 text-accent" />
              <h2 id="task-heading" className="text-xl font-bold">
                Your Practice Mission
              </h2>
            </div>

            <p className="mt-3 text-base leading-relaxed text-ink-muted">
              {lesson.content?.taskPreview || lesson.assignment?.instructions || 'Complete the lesson tasks.'}
            </p>

            {lesson.assignment?.allowedBlocks && lesson.assignment.allowedBlocks.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Allowed Commands
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {lesson.assignment.allowedBlocks.map((block) => (
                    <span
                      key={block}
                      className="rounded bg-sunken px-2 py-1 font-mono text-xs text-ink"
                    >
                      {block}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Completion / Pass Criteria */}
          <section aria-labelledby="criteria-heading" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2 text-ink">
              <CheckCircle2Icon className="h-5 w-5 text-ok" />
              <h2 id="criteria-heading" className="text-xl font-bold">
                How This Lesson Is Completed
              </h2>
            </div>
            <p className="mt-3 text-base leading-relaxed text-ink">
              {lesson.content?.completionCriteria || 'Pass all evaluation checks for this lesson.'}
            </p>
          </section>

          {/* L5 Physical Lab Qualification & Readiness */}
          {isL5 && (
            <section aria-labelledby="qualification-heading" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2 text-ink">
                <CpuIcon className="h-5 w-5 text-accent" />
                <h2 id="qualification-heading" className="text-xl font-bold">
                  Physical Lab Qualification & Readiness
                </h2>
              </div>
              <p className="mt-2 text-sm text-ink-muted">
                Physical robot execution requires an authoritative pass from C1-L4 Pick &amp; Place simulation.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-sunken p-3.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
                    Simulation Prerequisite
                  </span>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {lesson.qualification ? (
                      <>
                        <CheckCircle2Icon className="h-4 w-4 text-ok" />
                        <span className="text-ok">Pick &amp; Place simulation passed</span>
                      </>
                    ) : (
                      <>
                        <AlertCircleIcon className="h-4 w-4 text-warn" />
                        <span>Incomplete (Pick &amp; Place simulation required)</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-sunken p-3.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
                    Qualified Program
                  </span>
                  <span className="mt-1 text-sm font-semibold text-ink block">
                    {lesson.qualification ? `Version ${lesson.qualification.versionNumber}` : 'None'}
                  </span>
                </div>

                <div className="rounded-lg border border-line bg-sunken p-3.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
                    Simulation Result
                  </span>
                  <span className="mt-1 text-sm font-semibold text-ink block">
                    {lesson.qualification ? 'Passed' : 'Awaiting simulation pass'}
                  </span>
                </div>

                <div className="rounded-lg border border-line bg-sunken p-3.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
                    Physical Execution
                  </span>
                  <span className="mt-1 text-sm font-semibold text-ink-muted block">
                    Not started
                  </span>
                </div>
              </div>

              {lesson.qualification && (
                <div className="mt-4 rounded-lg bg-accent-soft p-3 text-xs text-accent-ink">
                  Your immutable ProgramVersion {lesson.qualification.versionNumber} will qualify for physical robot execution. Physical execution will be unlocked in Course 1 Phase P0.9.
                </div>
              )}
            </section>
          )}

          {/* L1 Interactive Knowledge Check Quiz */}
          {isL1 && (showQuiz || isCurrent || isInProgress || isCompleted) && (
            <section
              id="knowledge-check-section"
              aria-labelledby="quiz-heading"
              className="rounded-xl border-2 border-accent-soft bg-surface p-6 shadow-md"
            >
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
                    Server-Graded Assessment
                  </span>
                  <h2 id="quiz-heading" className="mt-1 text-2xl font-bold text-ink">
                    Safety Knowledge Check
                  </h2>
                </div>
                <Badge tone={isCompleted ? 'ok' : 'accent'}>
                  {isCompleted ? '✓ Completed' : 'Passing Score: 80%'}
                </Badge>
              </div>

              {quizResult && (
                <div
                  role="alert"
                  className={`mt-6 rounded-xl p-5 ${
                    quizResult.passed
                      ? 'border border-ok/30 bg-ok-soft text-ok'
                      : 'border border-danger/30 bg-danger-soft text-danger'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {quizResult.passed ? (
                      <CheckCircle2Icon className="h-6 w-6 shrink-0" />
                    ) : (
                      <AlertCircleIcon className="h-6 w-6 shrink-0" />
                    )}
                    <div>
                      <h3 className="text-lg font-bold">
                        {quizResult.passed ? 'Knowledge Check Passed!' : 'Did not meet passing criteria'}
                      </h3>
                      <p className="mt-1 text-sm">
                        {quizResult.passed
                          ? `Your score: ${quizResult.score}%. Meet Your Robot is complete, and Move the Robot (L2) is now unlocked!`
                          : `Your score: ${quizResult.score}%. An 80% passing score is required. Review the safety rules above and try again.`}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        {quizResult.passed ? (
                          <Button
                            variant="primary"
                            onClick={() => navigate(`/courses/${courseId}`)}
                          >
                            Continue to Course Path <ArrowRightIcon className="ml-1 h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setQuizResult(null);
                              setAnswers({});
                            }}
                          >
                            <RotateCcwIcon className="mr-1 h-4 w-4" /> Try Again
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {quizError && (
                <div role="alert" className="mt-4 rounded-lg bg-danger-soft p-4 text-sm text-danger">
                  {quizError}
                </div>
              )}

              {/* Questions List */}
              <div className="mt-6 space-y-6">
                {questions.map((q, idx) => (
                  <fieldset
                    key={q.id}
                    className="rounded-lg border border-line bg-sunken p-4"
                  >
                    <legend className="text-sm font-semibold text-ink">
                      Question {idx + 1}: {q.prompt}
                    </legend>
                    <div className="mt-3 space-y-2">
                      {q.options.map((option) => {
                        const isSelected = answers[q.id] === option;
                        return (
                          <label
                            key={option}
                            className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                              isSelected
                                ? 'border-accent bg-accent-soft text-accent-ink font-medium'
                                : 'border-line bg-surface text-ink hover:bg-surface/80'
                            }`}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={option}
                              checked={isSelected}
                              disabled={isCompleted && !quizResult}
                              onChange={() => handleOptionSelect(q.id, option)}
                              className="h-4 w-4 text-accent"
                            />
                            <span className="capitalize">{option.replace(/_/g, ' ')}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>

              {!isCompleted && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                  <span className="text-xs text-ink-muted">
                    {Object.keys(answers).length} of {questions.length} questions answered
                  </span>
                  <Button
                    variant="primary"
                    disabled={!allQuestionsAnswered || submittingCheck || isLocked}
                    loading={submittingCheck}
                    onClick={() => void handleSubmitKnowledgeCheck()}
                  >
                    Submit Answers
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Sidebar: Practice & Progression Actions */}
        <aside className="space-y-6">
          <div className="sticky top-6 rounded-xl border border-line bg-surface p-6 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Next Step
            </span>

            <h2 className="mt-2 text-xl font-bold text-ink">
              {isLocked
                ? 'Lesson Locked'
                : isCompleted
                ? 'Lesson Completed'
                : isInProgress
                ? 'Continue Practice'
                : 'Start Practice'}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {isLocked
                ? (lesson.lockReason?.message ?? 'Complete prerequisite lessons before practicing.')
                : isCompleted
                ? 'You have already met the completion criteria for this lesson. You may review your practice anytime.'
                : isL1
                ? 'Answer the 5 safety questions below to complete this lesson and unlock Move the Robot.'
                : 'Enter the practice workspace to program your robot and verify pass criteria.'}
            </p>

            {startError && (
              <div role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-xs text-danger">
                {startError}
              </div>
            )}

            <div className="mt-6 space-y-3">
              {isLocked ? (
                <Button variant="secondary" className="w-full cursor-not-allowed opacity-60" disabled>
                  <LockIcon className="mr-2 h-4 w-4" /> Locked
                </Button>
              ) : isL1 ? (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    setShowQuiz(true);
                    const el = document.getElementById('knowledge-check-section');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {isCompleted ? 'Review Knowledge Check' : 'Take Knowledge Check'}
                </Button>
              ) : isL5 ? (
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={!lesson.qualification || isLocked}
                  loading={starting}
                  onClick={() => void handleStartPractice()}
                >
                  Continue to Physical Lab
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className="w-full"
                  loading={starting}
                  onClick={() => void handleStartPractice()}
                >
                  {isCompleted
                    ? 'Review Practice'
                    : isInProgress
                    ? 'Continue Practice'
                    : 'Start Practice'}
                </Button>
              )}

              <LinkButton to={`/courses/${courseId}`} variant="secondary" className="w-full justify-center">
                View Course Path
              </LinkButton>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
