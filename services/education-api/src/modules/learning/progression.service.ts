import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { CoursePathLesson, CoursePathLockReason, CoursePathResponse, ProgressionProjection } from "./dto/course-path.dto";
import { SubmitKnowledgeCheckDto } from "./dto/submit-knowledge-check.dto";
import { LearningScopeService } from "./learning-scope.service";

export interface QueryDb { $queryRaw<T = unknown>(query: TemplateStringsArray | unknown, ...values: unknown[]): Promise<T>; }
interface CourseRow { id: string; title: string; status: string; }
interface PrerequisiteRow { lessonId: string; title: string; required: boolean; minimumScore: number | string | null; status: string | null; progressPercent: number | string | null; }
interface LessonRow { id: string; ordinal: number; title: string; progress_status: string | null; progress_percent: number | string | null; completed_at: Date | null; prerequisites: PrerequisiteRow[] | null; }
interface KnowledgeCheckRow { attempt_id: string; lesson_id: string; course_id: string; classroom_id: string; status: string; constraints: unknown; success_criteria: unknown; }
interface SymbolicChainRow { evaluation_id: string; verdict: "passed" | "failed"; attempt_id: string; lesson_id: string; course_id: string; program_version_id: string; challenge_id: string; }

export interface SymbolicProjectionInput { evaluationId: string; attemptId: string; programVersionId: string; verdict: "passed" | "failed"; }
export interface KnowledgeCheckResult extends ProgressionProjection { passed: boolean; score: number; attemptId: string; }

@Injectable()
export class ProgressionService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  async coursePath(user: AuthenticatedUser, courseId: string): Promise<CoursePathResponse> {
    return this.coursePathWithDb(this.prisma, user, courseId);
  }

  async submitKnowledgeCheck(user: AuthenticatedUser, attemptId: string, dto: SubmitKnowledgeCheckDto): Promise<KnowledgeCheckResult> {
    if (user.status !== "active") throw new NotFoundException("Knowledge check was not found.");
    return this.prisma.$transaction(async (tx) => {
      const attempts = await tx.$queryRaw<KnowledgeCheckRow[]>`
        SELECT a.id AS attempt_id,a.status,la.lesson_id,l.course_id,ca.classroom_id,la.constraints,ch.success_criteria
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id AND ca.status='published'
        JOIN public.learning_assignments la ON la.id=ca.assignment_id
        JOIN public.learning_lessons l ON l.id=la.lesson_id
        JOIN public.learning_challenges ch ON ch.id=la.challenge_id AND ch.status='published'
        JOIN public.learning_classroom_members cm ON cm.classroom_id=ca.classroom_id
          AND cm.user_id=a.learner_user_id AND cm.classroom_role='student' AND cm.status='active'
        JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=a.learner_user_id AND m.status='active'
        JOIN public.learning_classrooms classroom ON classroom.id=ca.classroom_id AND classroom.organization_id=m.organization_id
        WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid
          AND a.status IN ('in_progress','submitted')
        FOR UPDATE OF a`;
      const attempt = attempts[0];
      if (!attempt) throw new NotFoundException("Knowledge check was not found.");
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id);
      await this.assertPrerequisites(tx, user.vistaUserId, attempt.lesson_id);
      const definition = parseKnowledgeCheck(attempt.constraints, attempt.success_criteria);
      const score = gradeKnowledgeCheck(definition, dto);
      const passed = score >= definition.passPercent;
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.learning_assignment_attempts
        SET status='evaluated',score=${score},submitted_at=COALESCE(submitted_at,now()),
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
        AND a.learner_user_id=se.requested_by_user_id AND a.program_id=s.program_id
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

  private async coursePathWithDb(db: QueryDb, user: AuthenticatedUser, courseId: string): Promise<CoursePathResponse> {
    const courses = await db.$queryRaw<CourseRow[]>`
      SELECT c.id,c.title,c.status FROM public.learning_courses c
      WHERE c.id=${courseId}::uuid AND c.status='published' AND (
        EXISTS (SELECT 1 FROM public.learning_enrollments e WHERE e.course_id=c.id AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active')
        OR EXISTS (
          SELECT 1 FROM public.learning_course_offerings o
          JOIN public.learning_classrooms classroom ON classroom.offering_id=o.id AND classroom.status='active'
          JOIN public.learning_classroom_members cm ON cm.classroom_id=classroom.id AND cm.user_id=${user.vistaUserId}::uuid AND cm.classroom_role='student' AND cm.status='active'
          JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=${user.vistaUserId}::uuid AND m.organization_id=classroom.organization_id AND m.status='active'
          WHERE o.course_id=c.id AND o.status='active'
        )
      )`;
    const course = courses[0];
    if (!course) throw new NotFoundException("Course was not found.");
    const rows = await db.$queryRaw<LessonRow[]>`
      SELECT l.id,l.ordinal,l.title,lp.status AS progress_status,lp.progress_percent,lp.completed_at,
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
    return { course, progressPercent: lessons.length ? Math.round(completed / lessons.length * 100) : 0, currentLessonId: current?.id ?? null, lessons };
  }

  private mapLesson(row: LessonRow): CoursePathLesson {
    const prerequisites = (row.prerequisites ?? []).map((item) => ({ ...item, minimumScore: item.minimumScore === null ? null : Number(item.minimumScore) }));
    const lockReason = firstLockReason(prerequisites);
    const completed = row.progress_status === "completed";
    return {
      id: row.id, ordinal: row.ordinal, title: row.title,
      status: completed ? "completed" : lockReason ? "locked" : row.progress_status === "in_progress" ? "in_progress" : "available",
      progressPercent: Number(row.progress_percent ?? 0),
      prerequisite: prerequisites.map(({ lessonId, title, required, minimumScore }) => ({ lessonId, title, required, minimumScore })),
      lockReason, completedAt: row.completed_at,
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

  private async completeLesson(db: QueryDb, learnerId: string, lessonId: string): Promise<ProgressionProjection> {
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${learnerId}:${lessonId}`},0))`;
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
    if (answers.has(answer.questionId) || !definition.questionIds.includes(answer.questionId) || !definition.options[answer.questionId].includes(answer.optionId)) throw new BadRequestException("Knowledge check answers are invalid.");
    answers.set(answer.questionId, answer.optionId);
  }
  if (answers.size !== definition.questionIds.length) throw new BadRequestException("Answer every knowledge-check question.");
  const correct = definition.questionIds.filter((id) => answers.get(id) === definition.answerKey[id]).length;
  return Math.round(correct / definition.questionIds.length * 100);
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Knowledge check configuration is invalid."); return value as Record<string, unknown>; }
