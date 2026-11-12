import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { CoursePathLesson, CoursePathLockReason, CoursePathResponse, ProgressionProjection } from "./dto/course-path.dto";
import { assertAttemptOpen, loadOwnAttempt } from "./attempt-lifecycle";
import { SaveQuizDraftDto } from "./dto/save-quiz-draft.dto";
import { SubmitKnowledgeCheckDto } from "./dto/submit-knowledge-check.dto";
import { LearningScopeService } from "./learning-scope.service";
import { gradeQuestionBankQuiz, IssuedQuestionRow, issueQuestionBankQuiz } from './question-bank-quiz.snapshot';

export interface QueryDb { $queryRaw<T = unknown>(query: TemplateStringsArray | unknown, ...values: unknown[]): Promise<T>; }
interface CourseRow { id: string; title: string; status: string; description: string | null; label: string | null; level: string | null; recommended_grades: string | null; learning_outcome: string | null; competencies: Array<{ code: string; title: string }> | null; }
interface PrerequisiteRow { lessonId: string; title: string; required: boolean; minimumScore: number | string | null; status: string | null; progressPercent: number | string | null; }
interface LessonRow { id: string; code?: string | null; ordinal: number; title: string; progress_status: string | null; progress_percent: number | string | null; completed_at: Date | null; prerequisites: PrerequisiteRow[] | null; summary?: string | null; learning_items?: string[] | null; estimated_minutes?: number | string | null; }
interface KnowledgeCheckRow { delivery_status?: string; close_at?: Date | null; attempt_id: string; assignment_id?: string; lesson_id: string; course_id: string; classroom_id: string; status: string; constraints: unknown; success_criteria: unknown; workspace_snapshot?: unknown; grading_snapshot?: unknown; result_snapshot?: unknown; }
interface SymbolicChainRow { evaluation_id: string; verdict: "passed" | "failed"; attempt_id: string; lesson_id: string; course_id: string; program_version_id: string; challenge_id: string; }

export interface SymbolicProjectionInput { evaluationId: string; attemptId: string; programVersionId: string; verdict: "passed" | "failed"; }
export interface KnowledgeCheckResult extends ProgressionProjection { passed: boolean; score: number; attemptId: string; }

export interface QualifiedProgramVersionHandoff {
  courseId: string;
  lessonId: string;
  qualifiedProgramVersionId: string;
  programVersionId: string;
  programId: string;
  submissionId?: string;
  versionNumber: number;
  challengeId: string;
  symbolicEvaluationId: string;
  evaluationId: string;
  schematicExperimentId: string;
  experimentId: string;
  verdict: "passed";
  attemptId: string;
  passedAt: Date;
  qualifiedAt: Date;
  robotProgram?: unknown;
  changeSummary?: string | null;
}

export interface QuizRow {
  lesson_id: string;
  lesson_title: string;
  lesson_ordinal: number;
  course_id: string;
  course_title: string;
  assignment_id: string;
  quiz_title: string;
  classroom_assignment_id: string | null;
  attempt_id: string | null;
  attempt_status: string | null;
  score: number | null;
  passed: boolean | null;
  pass_percent: number | null;
  status: 'not_started' | 'in_progress' | 'passed' | 'failed';
}

@Injectable()
export class ProgressionService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  async coursePath(user: AuthenticatedUser, courseId: string): Promise<CoursePathResponse> {
    return this.coursePathWithDb(this.prisma, user, courseId);
  }

  async myQuizzes(user: AuthenticatedUser): Promise<QuizRow[]> {
    return this.prisma.$queryRaw<QuizRow[]>`
      SELECT
        l.id AS lesson_id,
        l.title AS lesson_title,
        l.ordinal AS lesson_ordinal,
        co.id AS course_id,
        co.title AS course_title,
        a.id AS assignment_id,
        a.title AS quiz_title,
        ca.id AS classroom_assignment_id,
        latest.id AS attempt_id,
        latest.status AS attempt_status,
        latest.score::float AS score,
        (latest.result_snapshot->>'passed')::boolean AS passed,
        COALESCE((latest.result_snapshot->>'passPercent')::int, (ch.success_criteria->>'passPercent')::int, (a.constraints->>'passPercent')::int, 80) AS pass_percent,
        CASE
          WHEN latest.status = 'evaluated' AND ((latest.result_snapshot->>'passed')::boolean = true OR latest.score >= COALESCE((latest.result_snapshot->>'passPercent')::int, (ch.success_criteria->>'passPercent')::int, (a.constraints->>'passPercent')::int, 80)) THEN 'passed'
          WHEN latest.status = 'evaluated' THEN 'failed'
          WHEN latest.id IS NOT NULL THEN 'in_progress'
          ELSE 'not_started'
        END AS status
      FROM public.learning_lessons l
      JOIN public.learning_courses co ON co.id=l.course_id
      JOIN public.learning_assignments a ON a.lesson_id=l.id AND a.constraints->>'kind'='knowledge_check'
      LEFT JOIN public.learning_challenges ch ON ch.id=a.challenge_id
      JOIN public.learning_course_offerings o ON o.course_id=co.id AND o.status='active'
      JOIN public.learning_classrooms c ON c.offering_id=o.id AND c.status='active'
      JOIN public.learning_enrollments e ON e.course_id=co.id AND e.offering_id=o.id AND e.classroom_id=c.id
        AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id AND cm.user_id=${user.vistaUserId}::uuid AND cm.classroom_role='student' AND cm.status='active'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active' AND m.organization_id=c.organization_id
      LEFT JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id AND ca.classroom_id=c.id AND ca.status='published'
      LEFT JOIN LATERAL (
        SELECT att.id, att.status, att.score, att.result_snapshot, att.submitted_at
        FROM public.learning_assignment_attempts att
        WHERE att.classroom_assignment_id=ca.id AND att.learner_user_id=${user.vistaUserId}::uuid
        ORDER BY att.started_at DESC LIMIT 1
      ) latest ON true
      WHERE co.status='published'
      ORDER BY co.title, l.ordinal`;
  }

  async prepareQuestionBankQuiz(db: QueryDb, assignmentId: string, lessonId: string, organizationId: string | null, passPercent: number | undefined) {
    const legacy = await db.$queryRaw<Array<{ legacy: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM public.learning_lessons l JOIN public.learning_lessons first ON first.course_id=l.course_id AND first.ordinal=1
        WHERE l.id=${lessonId}::uuid AND first.content->'courseOverview'->>'label'='Course 1') AS legacy`;
    if (legacy[0]?.legacy) throw new ConflictException('Course 1 uses the existing quiz.');
    const rows = await db.$queryRaw<IssuedQuestionRow[]>`
      SELECT aq.question_version_id,aq.question_id,aq.ordinal,aq.points::float,
        v.status,v.type,v.stem,v.options,v.answer_key,v.explanation,q.organization_id,q.lesson_id,
        (SELECT COUNT(*)::int FROM public.learning_question_version_objectives m WHERE m.question_version_id=v.id) AS objective_count
      FROM public.learning_assignment_question_versions aq
      JOIN public.learning_question_versions v ON v.id=aq.question_version_id
      JOIN public.learning_questions q ON q.id=v.question_id AND q.id=aq.question_id
      WHERE aq.assignment_id=${assignmentId}::uuid ORDER BY aq.ordinal FOR SHARE OF v,aq`;
    return issueQuestionBankQuiz(rows, assignmentId, lessonId, organizationId, passPercent ?? NaN);
  }

  async submitKnowledgeCheck(user: AuthenticatedUser, attemptId: string, dto: SubmitKnowledgeCheckDto): Promise<KnowledgeCheckResult> {
    if (user.status !== "active") throw new NotFoundException("Knowledge check was not found.");
    return this.prisma.$transaction(async (tx) => {
      const attempts = await tx.$queryRaw<KnowledgeCheckRow[]>`
        SELECT a.id AS attempt_id,a.status,a.workspace_snapshot,g.grading_snapshot,a.result_snapshot,
          la.id AS assignment_id,la.lesson_id,l.course_id,ca.classroom_id,la.constraints,ch.success_criteria,ca.status AS delivery_status,ca.close_at
        FROM public.learning_assignment_attempts a
        LEFT JOIN public.learning_quiz_attempt_grading g ON g.attempt_id=a.id
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
          AND (ca.status='published' OR a.workspace_snapshot->>'kind'='question_bank_quiz')
        JOIN public.learning_assignments la ON la.id=ca.assignment_id
        JOIN public.learning_lessons l ON l.id=la.lesson_id
        JOIN public.learning_course_offerings o ON o.course_id=l.course_id AND o.status='active'
        JOIN public.learning_classrooms enrolled_classroom ON enrolled_classroom.id=ca.classroom_id
          AND enrolled_classroom.offering_id=o.id AND enrolled_classroom.status='active'
        JOIN public.learning_enrollments enrollment ON enrollment.course_id=l.course_id AND enrollment.offering_id=o.id
          AND enrollment.classroom_id=enrolled_classroom.id AND enrollment.learner_user_id=a.learner_user_id AND enrollment.status='active'
        LEFT JOIN public.learning_challenges ch ON ch.id=la.challenge_id AND ch.status='published'
        JOIN public.learning_classroom_members cm ON cm.classroom_id=ca.classroom_id
          AND cm.user_id=a.learner_user_id AND cm.classroom_role='student' AND cm.status='active'
        JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=a.learner_user_id AND m.status='active'
        JOIN public.learning_classrooms classroom ON classroom.id=ca.classroom_id AND classroom.organization_id=m.organization_id
        WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid
          AND a.status IN ('in_progress','submitted','evaluated')
          AND (a.workspace_snapshot->>'kind'='question_bank_quiz' OR ch.id IS NOT NULL)
        FOR UPDATE OF a`;
      const attempt = attempts[0];
      if (!attempt) throw new NotFoundException("Knowledge check was not found.");
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id);
      if ((attempt.workspace_snapshot as { kind?: string } | undefined)?.kind === 'question_bank_quiz') {
        // An already evaluated attempt keeps returning its stored result (idempotent) even after the window closed.
        if (attempt.status !== 'evaluated') this.assertQuizWindowOpen(attempt);
        if (attempt.status !== 'evaluated') await this.assertPrerequisites(tx, user.vistaUserId, attempt.lesson_id);
        return this.submitQuestionBankKnowledgeCheck(tx, user, attempt, dto);
      }
      if (attempt.status === 'evaluated') throw new NotFoundException('Knowledge check was not found.');
      this.assertQuizWindowOpen(attempt);
      await this.assertPrerequisites(tx, user.vistaUserId, attempt.lesson_id);
      const definition = parseKnowledgeCheck(attempt.constraints, attempt.success_criteria);
      const score = gradeKnowledgeCheck(definition, dto);
      const passed = score >= definition.passPercent;
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.learning_assignment_attempts
        SET status='evaluated',score=${score},submitted_at=COALESCE(submitted_at,now()),grading_released_at=COALESCE(grading_released_at,now()),grading_release_origin=COALESCE(grading_release_origin,'system_auto'),
          result_snapshot=${JSON.stringify({ kind: "knowledge_check_result", schemaVersion: 1, score, passPercent: definition.passPercent, passed })}::jsonb
        WHERE id=${attemptId}::uuid AND learner_user_id=${user.vistaUserId}::uuid
        RETURNING id`;
      if (!updated[0]) throw new ConflictException("Knowledge check could not be finalized.");
      if (!passed) {
        await this.markLessonInProgress(tx, user.vistaUserId, attempt.lesson_id);
        return { attemptId, passed, score, completedLessonId: null, newlyUnlockedLessonIds: [] };
      }
      const projection = await this.completeLesson(tx, user.vistaUserId, attempt.lesson_id);
      return { attemptId, passed, score, ...projection };
    });
  }

  /** A delivery that was closed/archived or whose close time passed accepts no new final answers. */
  private assertQuizWindowOpen(attempt: Pick<KnowledgeCheckRow, 'delivery_status' | 'close_at'>): void {
    if (attempt.delivery_status === 'closed' || attempt.delivery_status === 'archived' || (attempt.close_at && new Date(attempt.close_at) <= new Date())) {
      throw new ConflictException({ code: 'ASSIGNMENT_CLOSED', message: 'This assignment is closed for submissions.' });
    }
  }

  /**
   * Saves quiz answers without grading them. Only the caller's own open Question Bank quiz attempt, with an active
   * enrollment. The draft holds only the learner's own selections; answer keys never leave the grading snapshot.
   */
  async saveQuizDraft(user: AuthenticatedUser, attemptId: string, dto: SaveQuizDraftDto) {
    if (user.status !== 'active') throw new NotFoundException('Attempt was not found.');
    return this.prisma.$transaction(async (tx) => {
      const attempt = await loadOwnAttempt(tx, user.vistaUserId, attemptId, true);
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id, { requireActiveEnrollment: true });
      assertAttemptOpen(attempt);
      const snapshots = await tx.$queryRaw<Array<{ workspace_snapshot: unknown }>>`
        SELECT workspace_snapshot FROM public.learning_assignment_attempts WHERE id=${attemptId}::uuid`;
      const snapshot = snapshots[0]?.workspace_snapshot as { kind?: string; questions?: Array<{ questionVersionId: string; options: Array<{ id: string }> }> } | undefined;
      if (snapshot?.kind !== 'question_bank_quiz' || !Array.isArray(snapshot.questions)) {
        throw new ConflictException({ code: 'DRAFT_NOT_SUPPORTED', message: 'Drafts are only available for quiz attempts.' });
      }
      const questions = new Map(snapshot.questions.map((question) => [question.questionVersionId, new Set(question.options.map((option) => option.id))]));
      const seen = new Set<string>();
      const answers = dto.answers.map((answer) => {
        const options = questions.get(answer.questionId);
        if (!options || seen.has(answer.questionId)) throw new BadRequestException('Draft answers must reference distinct questions of this quiz.');
        seen.add(answer.questionId);
        const chosen = [...(answer.optionId ? [answer.optionId] : []), ...(answer.optionIds ?? [])];
        if (chosen.some((id) => !options.has(id))) throw new BadRequestException('Draft answers must reference options of the question.');
        return { questionId: answer.questionId, ...(answer.optionId ? { optionId: answer.optionId } : {}), ...(answer.optionIds ? { optionIds: answer.optionIds } : {}) };
      });
      const saved = await tx.$queryRaw<Array<{ draft_saved_at: Date }>>`
        UPDATE public.learning_assignment_attempts SET draft_response=${JSON.stringify({ answers })}::jsonb,draft_saved_at=now()
        WHERE id=${attemptId}::uuid AND status='in_progress' RETURNING draft_saved_at`;
      if (!saved[0]) throw new ConflictException({ code: 'ATTEMPT_NOT_IN_PROGRESS', message: 'This attempt is no longer open for changes.' });
      return { attemptId, answers, draftSavedAt: saved[0].draft_saved_at };
    });
  }

  private async submitQuestionBankKnowledgeCheck(tx: QueryDb, user: AuthenticatedUser, attempt: KnowledgeCheckRow, dto: SubmitKnowledgeCheckDto): Promise<KnowledgeCheckResult> {
    if (!attempt.assignment_id) throw new ConflictException('Quiz snapshot is missing assignment identity.');
    if (attempt.status === 'evaluated') {
      const result = attempt.result_snapshot as (KnowledgeCheckResult & { kind?: string; schemaVersion?: number }) | null;
      if (!result || result.kind !== 'question_bank_quiz_result' || result.schemaVersion !== 1 || typeof result.score !== 'number' || typeof result.passed !== 'boolean' || result.attemptId !== attempt.attempt_id) throw new ConflictException('Quiz result integrity check failed.');
      return result;
    }
    const graded = gradeQuestionBankQuiz(attempt.workspace_snapshot, attempt.grading_snapshot, attempt.assignment_id, attempt.lesson_id, dto);
    const saved = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE public.learning_assignment_attempts SET status='evaluated',score=${graded.score},submitted_at=COALESCE(submitted_at,now()),
        grading_released_at=COALESCE(grading_released_at,now()),grading_release_origin=COALESCE(grading_release_origin,'system_auto'),draft_response=NULL,
        result_snapshot=${JSON.stringify({ kind: 'question_bank_quiz_result', schemaVersion: 1, score: graded.score, passPercent: graded.passPercent, passed: graded.passed })}::jsonb
      WHERE id=${attempt.attempt_id}::uuid AND learner_user_id=${user.vistaUserId}::uuid AND status IN ('in_progress','submitted')
      RETURNING id`;
    if (!saved[0]) throw new ConflictException('Quiz could not be finalized.');
    const projection = graded.passed && await this.questionBankLessonReady(tx, user.vistaUserId, attempt.lesson_id, attempt.assignment_id)
      ? await this.completeLesson(tx, user.vistaUserId, attempt.lesson_id)
      : { completedLessonId: null, newlyUnlockedLessonIds: [] };
    if (!projection.completedLessonId) await this.markLessonInProgress(tx, user.vistaUserId, attempt.lesson_id);
    const result = { kind: 'question_bank_quiz_result', schemaVersion: 1, attemptId: attempt.attempt_id, ...graded, ...projection };
    await tx.$queryRaw`
      UPDATE public.learning_assignment_attempts SET result_snapshot=${JSON.stringify(result)}::jsonb
      WHERE id=${attempt.attempt_id}::uuid AND learner_user_id=${user.vistaUserId}::uuid RETURNING id`;
    return result;
  }

  private async questionBankLessonReady(db: QueryDb, learnerId: string, lessonId: string, assignmentId: string): Promise<boolean> {
    const activities = await db.$queryRaw<Array<{ id: string; type: string; assignment_id: string | null }>>`
      SELECT a.id,a.type,CASE WHEN a.content_ref->>'kind'='assignment' THEN a.content_ref->>'id' ELSE NULL END AS assignment_id
      FROM public.learning_activities a JOIN public.learning_sections s ON s.id=a.section_id AND s.status='published'
      WHERE s.lesson_id=${lessonId}::uuid AND a.status='published' AND a.required=true`;
    if (!activities.some((activity) => activity.type === 'knowledge_check' && activity.assignment_id === assignmentId)) return false;
    for (const activity of activities) {
      if (activity.type === 'reading' || activity.type === 'demonstration') {
        const progress = await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM public.learning_activity_progress WHERE learner_user_id=${learnerId}::uuid
            AND activity_definition_id=${activity.id}::uuid AND status='completed' LIMIT 1`;
        if (!progress.length) return false;
      } else if (activity.type === 'knowledge_check' && activity.assignment_id) {
        const passed = await db.$queryRaw<Array<{ id: string }>>`
          SELECT att.id FROM public.learning_assignment_attempts att
          JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          WHERE ca.assignment_id=${activity.assignment_id}::uuid AND att.learner_user_id=${learnerId}::uuid
            AND att.status='evaluated' AND att.result_snapshot->>'passed'='true' LIMIT 1`;
        if (!passed.length) return false;
      } else if (['guided_practice', 'simulation', 'challenge'].includes(activity.type) && activity.assignment_id) {
        const passed = await db.$queryRaw<Array<{ id: string }>>`
          SELECT se.id FROM public.learning_submissions sub
          JOIN public.learning_symbolic_evaluations se ON se.submission_id=sub.id
            AND se.program_version_id=sub.program_version_id AND se.requested_by_user_id=${learnerId}::uuid AND se.verdict='passed'
          JOIN public.learning_experiments e ON e.id=se.experiment_id AND e.learner_user_id=${learnerId}::uuid
            AND e.status='succeeded' AND e.execution_mode='schematic'
          JOIN public.learning_assignment_attempts att ON att.id::text=e.input_snapshot->>'attemptId'
            AND att.learner_user_id=${learnerId}::uuid AND att.status='evaluated'
            AND (sub.attempt_id=att.id OR (sub.attempt_id IS NULL AND att.program_id=sub.program_id))
          JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
            AND ca.assignment_id=sub.assignment_id AND ca.status='published'
          WHERE sub.assignment_id=${activity.assignment_id}::uuid AND sub.learner_user_id=${learnerId}::uuid
            AND sub.status='submitted' LIMIT 1`;
        if (!passed.length) return false;
      } else return false;
    }
    return true;
  }

  async projectSymbolicPass(db: QueryDb, user: AuthenticatedUser, input: SymbolicProjectionInput): Promise<ProgressionProjection> {
    if (input.verdict !== "passed") return { completedLessonId: null, newlyUnlockedLessonIds: [] };
    const rows = await db.$queryRaw<SymbolicChainRow[]>`
      SELECT se.id AS evaluation_id,se.verdict,a.id AS attempt_id,la.lesson_id,l.course_id,
        se.program_version_id,la.challenge_id
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments e ON e.id=se.experiment_id AND e.learner_user_id=se.requested_by_user_id
        AND e.status='succeeded' AND e.execution_mode='schematic'
      JOIN public.learning_submissions s ON s.id=se.submission_id AND s.learner_user_id=se.requested_by_user_id
        AND s.program_version_id=se.program_version_id AND s.status='submitted'
      JOIN public.learning_assignment_attempts a ON a.id::text=e.input_snapshot->>'attemptId'
        AND a.learner_user_id=se.requested_by_user_id AND (s.attempt_id=a.id OR (s.attempt_id IS NULL AND a.program_id=s.program_id))
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id AND ca.assignment_id=s.assignment_id
      JOIN public.learning_assignments la ON la.id=ca.assignment_id AND la.challenge_id=e.challenge_id
        AND la.constraints->>'kind'='symbolic_program'
      JOIN public.learning_lessons l ON l.id=la.lesson_id
      JOIN public.learning_program_versions pv ON pv.id=se.program_version_id AND pv.program_id=s.program_id
      WHERE se.id=${input.evaluationId}::uuid AND se.requested_by_user_id=${user.vistaUserId}::uuid
        AND se.verdict='passed' AND a.id=${input.attemptId}::uuid AND se.program_version_id=${input.programVersionId}::uuid`;
    const chain = rows[0];
    if (!chain || chain.evaluation_id !== input.evaluationId || chain.attempt_id !== input.attemptId || chain.program_version_id !== input.programVersionId) {
      throw new ConflictException("Symbolic PASS provenance could not be verified for progression.");
    }
    await this.assertPrerequisites(db, user.vistaUserId, chain.lesson_id);
    return this.completeLesson(db, user.vistaUserId, chain.lesson_id);
  }

  async resolveQualifiedL4ProgramVersion(user: AuthenticatedUser, courseId?: string): Promise<QualifiedProgramVersionHandoff | null> {
    const rows = await this.prisma.$queryRaw<Array<{
      program_version_id: string;
      evaluation_id: string;
      experiment_id: string;
      lesson_id: string;
      course_id: string;
      program_id: string;
      submission_id: string;
      challenge_id: string;
      verdict: string;
      version_number: number;
      attempt_id: string;
      passed_at: Date;
      robot_program: unknown;
      change_summary: string | null;
    }>>`
      SELECT
        se.program_version_id,
        se.id AS evaluation_id,
        e.id::text AS experiment_id,
        l.id::text AS lesson_id,
        l.course_id::text AS course_id,
        s.program_id::text AS program_id,
        s.id::text AS submission_id,
        la.challenge_id::text AS challenge_id,
        se.verdict,
        COALESCE(pv.version_number, 1) AS version_number,
        a.id::text AS attempt_id,
        se.created_at AS passed_at,
        pv.robot_program,
        pv.change_summary
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments e ON e.id=se.experiment_id AND e.learner_user_id=se.requested_by_user_id
        AND e.status='succeeded' AND e.execution_mode='schematic'
      JOIN public.learning_program_versions pv ON pv.id=se.program_version_id
      JOIN public.learning_submissions s ON s.id=se.submission_id AND s.learner_user_id=se.requested_by_user_id
        AND s.program_id=pv.program_id AND s.status='submitted'
      JOIN public.learning_assignment_attempts a ON a.id::text=e.input_snapshot->>'attemptId'
        AND a.learner_user_id=se.requested_by_user_id AND (s.attempt_id=a.id OR (s.attempt_id IS NULL AND a.program_id=s.program_id))
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id AND ca.assignment_id=s.assignment_id
      JOIN public.learning_assignments la ON la.id=ca.assignment_id AND la.challenge_id=e.challenge_id
      JOIN public.learning_lessons l ON l.id=la.lesson_id
      WHERE se.requested_by_user_id=${user.vistaUserId}::uuid
        AND se.verdict='passed'
        AND l.ordinal=4
        ${courseId ? Prisma.sql`AND l.course_id=${courseId}::uuid` : Prisma.empty}
      ORDER BY se.created_at DESC, pv.version_number DESC, se.id DESC
      LIMIT 1`;
    const match = rows[0];
    if (!match) return null;
    return {
      courseId: match.course_id,
      lessonId: match.lesson_id,
      qualifiedProgramVersionId: match.program_version_id,
      programVersionId: match.program_version_id,
      programId: match.program_id,
      submissionId: match.submission_id,
      versionNumber: Number(match.version_number ?? 1),
      challengeId: match.challenge_id,
      symbolicEvaluationId: match.evaluation_id,
      evaluationId: match.evaluation_id,
      schematicExperimentId: match.experiment_id,
      experimentId: match.experiment_id,
      verdict: "passed",
      attemptId: match.attempt_id,
      passedAt: match.passed_at,
      qualifiedAt: match.passed_at,
      robotProgram: match.robot_program,
      changeSummary: match.change_summary ?? null,
    };
  }

  private async coursePathWithDb(db: QueryDb, user: AuthenticatedUser, courseId: string): Promise<CoursePathResponse> {
    const courses = await db.$queryRaw<CourseRow[]>`
      SELECT c.id,c.title,c.status,c.description,
        overview.content->'courseOverview'->>'label' AS label,
        overview.content->'courseOverview'->>'level' AS level,
        overview.content->'courseOverview'->>'recommendedGrades' AS recommended_grades,
        overview.content->'courseOverview'->>'learningOutcome' AS learning_outcome,
        COALESCE((
          SELECT jsonb_agg(DISTINCT jsonb_build_object('code',competency.code,'title',competency.title))
          FROM public.learning_lessons course_lesson
          JOIN public.learning_objectives objective ON objective.lesson_id=course_lesson.id
          JOIN public.learning_objective_competencies objective_competency ON objective_competency.objective_id=objective.id
          JOIN public.learning_competencies competency ON competency.id=objective_competency.competency_id
          WHERE course_lesson.course_id=c.id
        ),'[]'::jsonb) AS competencies
      FROM public.learning_courses c
      LEFT JOIN LATERAL (
        SELECT first_lesson.content FROM public.learning_lessons first_lesson
        WHERE first_lesson.course_id=c.id ORDER BY first_lesson.ordinal LIMIT 1
      ) overview ON true
      WHERE c.id=${courseId}::uuid AND c.status='published' AND EXISTS (
        SELECT 1 FROM public.learning_enrollments e
        JOIN public.learning_course_offerings o ON e.offering_id=o.id AND o.course_id=c.id AND o.status='active'
        JOIN public.learning_classrooms classroom ON e.classroom_id=classroom.id AND classroom.offering_id=o.id AND classroom.status='active'
        JOIN public.learning_classroom_members cm ON cm.classroom_id=classroom.id AND cm.user_id=e.learner_user_id
          AND cm.classroom_role='student' AND cm.status='active'
        JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=e.learner_user_id
          AND m.organization_id=classroom.organization_id AND m.status='active'
        WHERE e.course_id=c.id AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      )`;
    const course = courses[0];
    if (!course) throw new NotFoundException("Course was not found.");
    const rows = await db.$queryRaw<LessonRow[]>`
      SELECT l.id,l.ordinal,l.title,
        (SELECT objective.code FROM public.learning_objectives objective WHERE objective.lesson_id=l.id ORDER BY objective.ordinal LIMIT 1) AS code,
        lp.status AS progress_status,lp.progress_percent,lp.completed_at,
        l.content->>'summary' AS summary,
        COALESCE(l.content->'learningObjectives','[]'::jsonb) AS learning_items,
        NULLIF(l.content->>'estimatedMinutes','')::int AS estimated_minutes,
        COALESCE(jsonb_agg(jsonb_build_object(
          'lessonId',pre.id,'title',pre.title,'required',pr.required,'minimumScore',pr.minimum_score,
          'status',pre_progress.status,'progressPercent',pre_score.score
        ) ORDER BY pre.ordinal) FILTER (WHERE pr.prerequisite_lesson_id IS NOT NULL),'[]'::jsonb) AS prerequisites
      FROM public.learning_lessons l
      LEFT JOIN public.learning_lesson_progress lp ON lp.lesson_id=l.id AND lp.learner_user_id=${user.vistaUserId}::uuid
      LEFT JOIN public.learning_lesson_prerequisites pr ON pr.lesson_id=l.id
      LEFT JOIN public.learning_lessons pre ON pre.id=pr.prerequisite_lesson_id
      LEFT JOIN public.learning_lesson_progress pre_progress ON pre_progress.lesson_id=pre.id AND pre_progress.learner_user_id=${user.vistaUserId}::uuid
      LEFT JOIN LATERAL (
        SELECT MAX(attempt.score) AS score FROM public.learning_assignment_attempts attempt
        JOIN public.learning_classroom_assignments classroom_assignment ON classroom_assignment.id=attempt.classroom_assignment_id
        JOIN public.learning_assignments assignment ON assignment.id=classroom_assignment.assignment_id
        WHERE attempt.learner_user_id=${user.vistaUserId}::uuid AND assignment.lesson_id=pre.id AND attempt.status='evaluated'
      ) pre_score ON true
      WHERE l.course_id=${courseId}::uuid
      GROUP BY l.id,l.ordinal,l.title,lp.status,lp.progress_percent,lp.completed_at
      ORDER BY l.ordinal`;
    const preliminary = rows.map((row) => this.mapLesson(row));
    const current = preliminary.find((lesson) => lesson.status === "available" || lesson.status === "in_progress") ?? null;
    const lessons = preliminary.map((lesson) => lesson.id === current?.id && lesson.status === "available" ? { ...lesson, status: "current" as const } : lesson);
    const completed = lessons.filter((lesson) => lesson.status === "completed").length;
    return {
      course: {
        id: course.id,
        title: course.title,
        status: course.status,
        description: course.description ?? null,
        label: course.label ?? null,
        level: course.level ?? null,
        competencies: course.competencies ?? [],
        recommendedGrades: course.recommended_grades ?? null,
        learningOutcome: course.learning_outcome ?? null,
      },
      progressPercent: lessons.length ? Math.round(completed / lessons.length * 100) : 0,
      currentLessonId: current?.id ?? null,
      lessons,
    };
  }

  private mapLesson(row: LessonRow): CoursePathLesson {
    const prerequisites = (row.prerequisites ?? []).map((item) => ({ ...item, minimumScore: item.minimumScore === null ? null : Number(item.minimumScore) }));
    const lockReason = firstLockReason(prerequisites);
    const completed = row.progress_status === "completed";
    return {
      id: row.id, code: row.code ?? null, ordinal: row.ordinal, title: row.title,
      status: completed ? "completed" : lockReason ? "locked" : row.progress_status === "in_progress" ? "in_progress" : "available",
      progressPercent: Number(row.progress_percent ?? 0),
      prerequisite: prerequisites.map(({ lessonId, title, required, minimumScore }) => ({ lessonId, title, required, minimumScore })),
      lockReason, completedAt: row.completed_at,
      summary: row.summary ?? null,
      learningItems: Array.isArray(row.learning_items) ? row.learning_items.filter((item): item is string => typeof item === "string") : [],
      estimatedMinutes: row.estimated_minutes === null || row.estimated_minutes === undefined ? null : Number(row.estimated_minutes),
    };
  }

  async assertPrerequisites(db: QueryDb, learnerId: string, lessonId: string): Promise<void> {
    const rows = await db.$queryRaw<Array<{ prerequisite_lesson_id: string; title: string; minimum_score: number | string | null; status: string | null; progress_percent: number | string | null }>>`
      SELECT pr.prerequisite_lesson_id,pre.title,pr.minimum_score,lp.status,score.score AS progress_percent
      FROM public.learning_lesson_prerequisites pr
      JOIN public.learning_lessons pre ON pre.id=pr.prerequisite_lesson_id
      LEFT JOIN public.learning_lesson_progress lp ON lp.lesson_id=pre.id AND lp.learner_user_id=${learnerId}::uuid
      LEFT JOIN LATERAL (
        SELECT MAX(attempt.score) AS score FROM public.learning_assignment_attempts attempt
        JOIN public.learning_classroom_assignments classroom_assignment ON classroom_assignment.id=attempt.classroom_assignment_id
        JOIN public.learning_assignments assignment ON assignment.id=classroom_assignment.assignment_id
        WHERE attempt.learner_user_id=${learnerId}::uuid AND assignment.lesson_id=pre.id AND attempt.status='evaluated'
      ) score ON true
      WHERE pr.lesson_id=${lessonId}::uuid AND pr.required=true
      ORDER BY pre.ordinal`;
    const blocked = rows.find((row) => row.status !== "completed" || (row.minimum_score !== null && Number(row.progress_percent ?? 0) < Number(row.minimum_score)));
    if (blocked) throw new ConflictException({ code: "PREREQUISITE_NOT_COMPLETED", prerequisiteLessonId: blocked.prerequisite_lesson_id, prerequisiteLessonTitle: blocked.title, message: `Complete ${blocked.title} before starting this lesson.` });
  }

  async completeLesson(db: QueryDb, learnerId: string, lessonId: string): Promise<ProgressionProjection> {
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${learnerId}:${lessonId}`},0)) IS NULL AS locked`;
    const completed = await db.$queryRaw<Array<{ id: string; already_completed?: boolean }>>`
      WITH existing AS (
        SELECT status FROM public.learning_lesson_progress
        WHERE learner_user_id=${learnerId}::uuid AND lesson_id=${lessonId}::uuid FOR UPDATE
      ), upserted AS (
        INSERT INTO public.learning_lesson_progress(learner_user_id,lesson_id,status,progress_percent,started_at,completed_at,updated_at)
        VALUES(${learnerId}::uuid,${lessonId}::uuid,'completed',100,now(),now(),now())
        ON CONFLICT (learner_user_id,lesson_id) DO UPDATE SET
          status='completed',progress_percent=100,started_at=COALESCE(learning_lesson_progress.started_at,now()),
          completed_at=COALESCE(learning_lesson_progress.completed_at,now()),updated_at=now()
        RETURNING id
      ) SELECT id,COALESCE((SELECT status='completed' FROM existing),false) AS already_completed FROM upserted`;
    if (!completed[0]) throw new ConflictException("Lesson progress could not be persisted.");
    if (completed[0].already_completed) return { completedLessonId: lessonId, newlyUnlockedLessonIds: [] };
    const unlocked = await db.$queryRaw<Array<{ id: string }>>`
      SELECT candidate.id FROM public.learning_lesson_prerequisites direct
      JOIN public.learning_lessons candidate ON candidate.id=direct.lesson_id
      WHERE direct.prerequisite_lesson_id=${lessonId}::uuid AND direct.required=true
        AND NOT EXISTS (
          SELECT 1 FROM public.learning_lesson_prerequisites required
          LEFT JOIN public.learning_lesson_progress progress ON progress.lesson_id=required.prerequisite_lesson_id AND progress.learner_user_id=${learnerId}::uuid
          WHERE required.lesson_id=candidate.id AND required.required=true
            AND (progress.status IS DISTINCT FROM 'completed' OR (required.minimum_score IS NOT NULL AND COALESCE((
              SELECT MAX(attempt.score) FROM public.learning_assignment_attempts attempt
              JOIN public.learning_classroom_assignments classroom_assignment ON classroom_assignment.id=attempt.classroom_assignment_id
              JOIN public.learning_assignments assignment ON assignment.id=classroom_assignment.assignment_id
              WHERE attempt.learner_user_id=${learnerId}::uuid AND assignment.lesson_id=required.prerequisite_lesson_id AND attempt.status='evaluated'
            ),-1)<required.minimum_score))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.learning_lesson_progress progress
          WHERE progress.lesson_id=candidate.id AND progress.learner_user_id=${learnerId}::uuid AND progress.status='completed'
        ) ORDER BY candidate.ordinal`;
    return { completedLessonId: lessonId, newlyUnlockedLessonIds: unlocked.map((lesson) => lesson.id) };
  }

  private async markLessonInProgress(db: QueryDb, learnerId: string, lessonId: string): Promise<void> {
    await db.$queryRaw`
      INSERT INTO public.learning_lesson_progress(learner_user_id,lesson_id,status,progress_percent,started_at,updated_at)
      VALUES(${learnerId}::uuid,${lessonId}::uuid,'in_progress',0,now(),now())
      ON CONFLICT (learner_user_id,lesson_id) DO UPDATE SET
        status=CASE WHEN learning_lesson_progress.status='completed' THEN 'completed' ELSE 'in_progress' END,
        started_at=COALESCE(learning_lesson_progress.started_at,now()),updated_at=now()`;
  }
}

function firstLockReason(prerequisites: Array<{ lessonId: string; title: string; required: boolean; minimumScore: number | null; status: string | null; progressPercent: number | string | null }>): CoursePathLockReason | null {
  for (const prerequisite of prerequisites) {
    if (!prerequisite.required) continue;
    if (prerequisite.status !== "completed") return { code: "PREREQUISITE_NOT_COMPLETED", prerequisiteLessonId: prerequisite.lessonId, prerequisiteLessonTitle: prerequisite.title, message: `Complete ${prerequisite.title} to unlock this lesson.` };
    if (prerequisite.minimumScore !== null && Number(prerequisite.progressPercent ?? 0) < prerequisite.minimumScore) return { code: "PREREQUISITE_MINIMUM_SCORE_NOT_MET", prerequisiteLessonId: prerequisite.lessonId, prerequisiteLessonTitle: prerequisite.title, message: `Reach ${prerequisite.minimumScore}% in ${prerequisite.title} to unlock this lesson.` };
  }
  return null;
}

interface KnowledgeCheckDefinition { passPercent: number; questionIds: string[]; options: Record<string, string[]>; answerKey: Record<string, string>; }
function parseKnowledgeCheck(constraintsValue: unknown, criteriaValue: unknown): KnowledgeCheckDefinition {
  const constraints = record(constraintsValue); const criteria = record(criteriaValue);
  if (constraints.kind !== "knowledge_check" || criteria.kind !== "knowledge_check") throw new BadRequestException("This attempt is not a knowledge check.");
  const questions = Array.isArray(constraints.questions) ? constraints.questions.map(record) : [];
  const answerKey = record(criteria.answerKey);
  const passPercent = Number(criteria.passPercent);
  if (!questions.length || !Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100) throw new BadRequestException("Knowledge check configuration is invalid.");
  const options: Record<string, string[]> = {}; const questionIds: string[] = [];
  for (const question of questions) {
    if (typeof question.id !== "string" || !Array.isArray(question.options) || !question.options.every((option) => typeof option === "string") || typeof answerKey[question.id] !== "string") throw new BadRequestException("Knowledge check configuration is invalid.");
    questionIds.push(question.id); options[question.id] = question.options as string[];
  }
  return { passPercent, questionIds, options, answerKey: answerKey as Record<string, string> };
}
function gradeKnowledgeCheck(definition: KnowledgeCheckDefinition, dto: SubmitKnowledgeCheckDto): number {
  const answers = new Map<string, string>();
  for (const answer of dto.answers) {
    if (answers.has(answer.questionId) || !definition.questionIds.includes(answer.questionId) || typeof answer.optionId !== 'string' || answer.optionIds !== undefined || !definition.options[answer.questionId].includes(answer.optionId)) throw new BadRequestException("Knowledge check answers are invalid.");
    answers.set(answer.questionId, answer.optionId);
  }
  if (answers.size !== definition.questionIds.length) throw new BadRequestException("Answer every knowledge-check question.");
  const correct = definition.questionIds.filter((id) => answers.get(id) === definition.answerKey[id]).length;
  return Math.round(correct / definition.questionIds.length * 100);
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Knowledge check configuration is invalid."); return value as Record<string, unknown>; }
