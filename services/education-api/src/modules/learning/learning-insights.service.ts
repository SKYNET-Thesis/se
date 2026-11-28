import { summarizeRubric } from "./rubric-score";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "./learning-scope.service";

/** Read models composed from authoritative learning records; no derived grades. */
@Injectable()
export class LearningInsightsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  async organization(user: AuthenticatedUser, organizationId: string) {
    await this.assertOrganization(user, organizationId);
    return this.one(this.prisma.$queryRaw`SELECT id,name,type,segment,status,contract_start,contract_end,created_at,updated_at FROM public.organizations WHERE id=${organizationId}::uuid`, "Organization was not found.");
  }
  async organizationClassrooms(user: AuthenticatedUser, organizationId: string) {
    await this.assertOrganization(user, organizationId);
    return this.prisma.$queryRaw`SELECT id,organization_id,offering_id,name,code,description,capacity,status,created_at,updated_at FROM public.learning_classrooms WHERE organization_id=${organizationId}::uuid ORDER BY created_at DESC`;
  }
  async classroomMembers(user: AuthenticatedUser, classroomId: string, role?: "student" | "teacher" | "teaching_assistant") {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT cm.id,cm.classroom_id,cm.user_id,cm.membership_id,cm.classroom_role,cm.status,cm.joined_at,cm.left_at,u.full_name,u.email FROM public.learning_classroom_members cm JOIN public.users u ON u.id=cm.user_id WHERE cm.classroom_id=${classroomId}::uuid AND (${role ?? null}::text IS NULL OR cm.classroom_role=${role ?? null}) ORDER BY cm.classroom_role,u.full_name`;
  }
  async classroomSummary(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.one(this.prisma.$queryRaw`SELECT cl.id,cl.name,cl.code,cl.status,COUNT(cm.id) FILTER (WHERE cm.status='active')::int AS active_member_count,COUNT(cm.id) FILTER (WHERE cm.status='active' AND cm.classroom_role='student')::int AS active_student_count,COUNT(ca.id)::int AS assignment_count FROM public.learning_classrooms cl LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id LEFT JOIN public.learning_classroom_assignments ca ON ca.classroom_id=cl.id WHERE cl.id=${classroomId}::uuid GROUP BY cl.id`, "Classroom was not found.");
  }
  async assignment(user: AuthenticatedUser, assignmentId: string) {
    const rows = await this.prisma.$queryRaw<{classroom_id:string; status:string}[]>`SELECT ca.classroom_id,ca.status FROM public.learning_classroom_assignments ca WHERE ca.assignment_id=${assignmentId}::uuid`;
    if (!rows[0]) throw new NotFoundException("Assignment was not found.");
    await this.scope.assertClassroomAccess(user, rows[0].classroom_id);
    if (rows[0].status !== "published" && !await this.scope.canManageClassroom(user, rows[0].classroom_id)) throw new NotFoundException("Assignment was not found.");
    return this.one(this.prisma.$queryRaw`SELECT a.id,a.lesson_id,a.challenge_id,a.title,a.instructions,a.allowed_blocks,a.constraints,a.due_at,a.created_at,ca.id AS classroom_assignment_id,ca.classroom_id,ca.status AS classroom_assignment_status,ca.available_from,ca.close_at,ca.max_attempts FROM public.learning_assignments a JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id WHERE a.id=${assignmentId}::uuid`, "Assignment was not found.");
  }
  async rubric(user: AuthenticatedUser, assignmentId: string) {
    await this.assignment(user, assignmentId);
    return this.prisma.$queryRaw`SELECT id,assignment_id,title,description,max_points,ordinal FROM public.learning_rubric_criteria WHERE assignment_id=${assignmentId}::uuid ORDER BY ordinal`;
  }
  async challengeAssignments(user: AuthenticatedUser, challengeId: string) {
    const rows = await this.prisma.$queryRaw`SELECT DISTINCT a.id,a.lesson_id,a.challenge_id,a.title,a.instructions,a.allowed_blocks,a.constraints,a.due_at,ca.id AS classroom_assignment_id,ca.classroom_id,ca.status FROM public.learning_assignments a JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id JOIN public.learning_classroom_members cm ON cm.classroom_id=ca.classroom_id AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active' JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active' JOIN public.learning_classrooms cl ON cl.id=ca.classroom_id AND cl.organization_id=m.organization_id WHERE a.challenge_id=${challengeId}::uuid AND (ca.status='published' OR cm.classroom_role IN ('teacher','teaching_assistant')) ORDER BY a.created_at DESC`;
    return rows;
  }
  async myDashboard(user: AuthenticatedUser) {
    return this.one(this.prisma.$queryRaw`SELECT (SELECT COUNT(*)::int FROM public.learning_classroom_members cm JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active' JOIN public.learning_classrooms c ON c.id=cm.classroom_id AND c.organization_id=m.organization_id WHERE cm.user_id=${user.vistaUserId}::uuid AND cm.status='active') AS classroom_count,(SELECT COUNT(*)::int FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid) AS attempt_count,(SELECT COUNT(*)::int FROM public.learning_submissions WHERE status<>'draft' AND learner_user_id=${user.vistaUserId}::uuid) AS submission_count,(SELECT COUNT(*)::int FROM public.learning_experiments WHERE learner_user_id=${user.vistaUserId}::uuid) AS experiment_count`, "Dashboard was not found.");
  }
  async myLearningSummary(user: AuthenticatedUser) {
    return this.one(this.prisma.$queryRaw`SELECT (SELECT COUNT(*)::int FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid AND status='in_progress') AS in_progress_attempts,(SELECT COUNT(*)::int FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid AND submitted_at IS NOT NULL) AS submitted_attempts,(SELECT COUNT(*)::int FROM public.learning_feedback f JOIN public.learning_submissions s ON s.id=f.submission_id WHERE s.status<>'draft' AND s.learner_user_id=${user.vistaUserId}::uuid) AS feedback_count,(SELECT COUNT(*)::int FROM public.learning_reflections WHERE learner_user_id=${user.vistaUserId}::uuid) AS reflection_count`, "Learning summary was not found.");
  }
  async myRecentActivity(user: AuthenticatedUser) {
    return this.prisma.$queryRaw`SELECT * FROM ((SELECT 'attempt'::text AS type,id,started_at AS occurred_at,status FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid) UNION ALL (SELECT 'submission'::text,id,submitted_at AS occurred_at,status FROM public.learning_submissions WHERE status<>'draft' AND learner_user_id=${user.vistaUserId}::uuid) UNION ALL (SELECT 'experiment'::text,id,created_at AS occurred_at,status FROM public.learning_experiments WHERE learner_user_id=${user.vistaUserId}::uuid)) activity WHERE occurred_at IS NOT NULL ORDER BY occurred_at DESC LIMIT 25`;
  }
  async classroomDashboard(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.one(this.prisma.$queryRaw`SELECT cl.id,cl.name,COUNT(DISTINCT cm.id) FILTER (WHERE cm.status='active' AND cm.classroom_role='student')::int AS student_count,COUNT(DISTINCT ca.id)::int AS assignment_count,COUNT(DISTINCT a.id)::int AS attempt_count,COUNT(DISTINCT s.id)::int AS submission_count FROM public.learning_classrooms cl LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id LEFT JOIN public.learning_classroom_assignments ca ON ca.classroom_id=cl.id LEFT JOIN public.learning_assignment_attempts a ON a.classroom_assignment_id=ca.id LEFT JOIN public.learning_submissions s ON (s.attempt_id=a.id OR (s.attempt_id IS NULL AND s.program_id=a.program_id AND s.learner_user_id=a.learner_user_id)) WHERE cl.id=${classroomId}::uuid GROUP BY cl.id`, "Classroom was not found.");
  }
  async classroomProgress(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT a.status,COUNT(*)::int AS attempt_count FROM public.learning_assignment_attempts a JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE ca.classroom_id=${classroomId}::uuid GROUP BY a.status ORDER BY a.status`;
  }
  /**
   * Per-student progress for the instructor: course progress computed with the same rule as the student's course path
   * (completed lessons / lessons, rounded), plus attempt evidence. Only active enrollments of this classroom.
   */
  async learnerProgress(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    const rows = await this.prisma.$queryRaw<Array<{ learnerUserId: string; fullName: string | null; email: string | null; lessonCount: number; lessonsCompleted: number; attemptsSubmitted: number; bestScore: number | null; lastActivityAt: Date | null }>>`
      SELECT u.id AS "learnerUserId",u.full_name AS "fullName",u.email,
        (SELECT COUNT(*)::int FROM public.learning_lessons l WHERE l.course_id=e.course_id) AS "lessonCount",
        (SELECT COUNT(*)::int FROM public.learning_lesson_progress lp JOIN public.learning_lessons l ON l.id=lp.lesson_id
          WHERE l.course_id=e.course_id AND lp.learner_user_id=e.learner_user_id AND lp.status='completed') AS "lessonsCompleted",
        (SELECT COUNT(*)::int FROM public.learning_assignment_attempts att JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          WHERE ca.classroom_id=e.classroom_id AND att.learner_user_id=e.learner_user_id AND att.status IN ('submitted','evaluated')) AS "attemptsSubmitted",
        (SELECT MAX(att.score)::float FROM public.learning_assignment_attempts att JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          WHERE ca.classroom_id=e.classroom_id AND att.learner_user_id=e.learner_user_id AND att.status='evaluated') AS "bestScore",
        (SELECT MAX(COALESCE(att.submitted_at,att.started_at)) FROM public.learning_assignment_attempts att JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          WHERE ca.classroom_id=e.classroom_id AND att.learner_user_id=e.learner_user_id) AS "lastActivityAt"
      FROM public.learning_enrollments e JOIN public.users u ON u.id=e.learner_user_id
      WHERE e.classroom_id=${classroomId}::uuid AND e.status='active' ORDER BY u.full_name NULLS LAST,u.id`;
    return rows.map((r) => ({ ...r, progressPercent: r.lessonCount ? Math.round(r.lessonsCompleted / r.lessonCount * 100) : 0 }));
  }
  /**
   * Per-lesson progress of ONE learner of this classroom (drill-down of `learnerProgress`). The learner must hold an
   * active enrollment in this classroom, so an instructor can never read a learner of another school or classroom.
   */
  async learnerLessonProgress(user: AuthenticatedUser, classroomId: string, learnerUserId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    const enrolled = await this.prisma.$queryRaw<{ course_id: string; full_name: string | null }[]>`
      SELECT e.course_id,u.full_name FROM public.learning_enrollments e JOIN public.users u ON u.id=e.learner_user_id
      WHERE e.classroom_id=${classroomId}::uuid AND e.learner_user_id=${learnerUserId}::uuid AND e.status='active'`;
    if (!enrolled[0]) throw new NotFoundException("Learner was not found in this classroom.");
    const lessons = await this.prisma.$queryRaw<Array<{ lessonId: string; ordinal: number; title: string; status: string; completedAt: Date | null; bestQuizScore: number | null; attempts: number }>>`
      SELECT l.id AS "lessonId",l.ordinal,l.title,COALESCE(lp.status,'not_started') AS status,lp.completed_at AS "completedAt",
        (SELECT MAX(att.score)::float FROM public.learning_assignment_attempts att JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          JOIN public.learning_assignments a ON a.id=ca.assignment_id
          WHERE ca.classroom_id=${classroomId}::uuid AND a.lesson_id=l.id AND att.learner_user_id=${learnerUserId}::uuid AND att.status='evaluated') AS "bestQuizScore",
        (SELECT COUNT(*)::int FROM public.learning_assignment_attempts att JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          JOIN public.learning_assignments a ON a.id=ca.assignment_id
          WHERE ca.classroom_id=${classroomId}::uuid AND a.lesson_id=l.id AND att.learner_user_id=${learnerUserId}::uuid) AS attempts
      FROM public.learning_lessons l LEFT JOIN public.learning_lesson_progress lp ON lp.lesson_id=l.id AND lp.learner_user_id=${learnerUserId}::uuid
      WHERE l.course_id=${enrolled[0].course_id}::uuid ORDER BY l.ordinal`;
    return { learnerUserId, fullName: enrolled[0].full_name, lessons };
  }

  /**
   * Gradebook (read-only): the latest submitted attempt of every learner for every assignment of this classroom. Quizzes show their stored auto-graded
   * percentage; rubric assignments show the canonical summary (`rubric-score.ts`: ungraded criteria count in the maximum). Nothing is written and
   * `attempt.score` is never derived from a rubric, so the two result kinds are never mixed or double counted.
   */
  async gradebook(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    const attempts = await this.prisma.$queryRaw<Array<{ attemptId: string; learnerUserId: string; fullName: string | null; assignmentId: string; title: string; kind: string | null; status: string; score: number | null; passed: boolean | null; releasedAt: Date | null; releaseOrigin: string | null; submittedAt: Date | null }>>`
      SELECT DISTINCT ON (att.learner_user_id,ca.id)
        att.id AS "attemptId",att.learner_user_id AS "learnerUserId",u.full_name AS "fullName",a.id AS "assignmentId",a.title,a.constraints->>'kind' AS kind,
        att.status,att.score::float AS score,(att.result_snapshot->>'passed')::boolean AS passed,att.grading_released_at AS "releasedAt",att.grading_release_origin AS "releaseOrigin",att.submitted_at AS "submittedAt"
      FROM public.learning_assignment_attempts att
      JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
      JOIN public.learning_assignments a ON a.id=ca.assignment_id
      JOIN public.learning_enrollments e ON e.classroom_id=ca.classroom_id AND e.learner_user_id=att.learner_user_id AND e.status='active'
      JOIN public.users u ON u.id=att.learner_user_id
      WHERE ca.classroom_id=${classroomId}::uuid AND att.status IN ('submitted','evaluated')
      ORDER BY att.learner_user_id,ca.id,att.attempt_number DESC`;
    const rubricIds = attempts.filter((row) => row.kind !== "knowledge_check").map((row) => row.attemptId);
    const criteria = rubricIds.length === 0 ? [] : await this.prisma.$queryRaw<Array<{ attemptId: string; maxPoints: string | number; awardedPoints: string | number | null }>>`
      SELECT att.id AS "attemptId",c.max_points AS "maxPoints",sc.awarded_points AS "awardedPoints"
      FROM public.learning_assignment_attempts att
      JOIN public.learning_submissions s ON s.attempt_id=att.id
      JOIN public.learning_rubric_criteria c ON c.assignment_id=s.assignment_id
      LEFT JOIN public.learning_assessments ass ON ass.submission_id=s.id
      LEFT JOIN public.learning_assessment_scores sc ON sc.assessment_id=ass.id AND sc.criterion_id=c.id
      WHERE att.id=ANY(${rubricIds}::uuid[]) ORDER BY att.id,c.ordinal`;
    const byAttempt = new Map<string, Array<{ maxPoints: string | number; awardedPoints: string | number | null }>>();
    for (const row of criteria) byAttempt.set(row.attemptId, [...(byAttempt.get(row.attemptId) ?? []), { maxPoints: row.maxPoints, awardedPoints: row.awardedPoints }]);
    return attempts.map((row) => {
      const released = row.releasedAt !== null;
      if (row.kind === "knowledge_check") {
        return { ...row, resultKind: "quiz" as const, released, percentage: row.score, passed: row.passed, rubric: null, graded: row.status === "evaluated" };
      }
      const list = byAttempt.get(row.attemptId) ?? [];
      const rubric = list.length > 0 ? summarizeRubric(list) : null;
      const graded = rubric ? (rubric.complete ? "complete" : rubric.gradedCriteria > 0 ? "partial" : "none") : "no_rubric";
      return { ...row, resultKind: rubric ? ("rubric" as const) : ("other" as const), released, percentage: rubric && rubric.gradedCriteria > 0 ? rubric.percentage : null, passed: null, rubric, graded };
    });
  }

  /** Every finished quiz attempt of this classroom with its weighted result (instructor review of quiz results). */
  async quizResults(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`
      SELECT att.id AS "attemptId",u.id AS "learnerUserId",u.full_name AS "fullName",a.title AS "quizTitle",att.attempt_number AS "attemptNumber",
        att.score::float AS score,(att.result_snapshot->>'passed')::boolean AS passed,(att.result_snapshot->>'passPercent')::int AS "passPercent",
        (att.result_snapshot->>'earnedPoints')::float AS "earnedPoints",(att.result_snapshot->>'possiblePoints')::float AS "possiblePoints",att.submitted_at AS "submittedAt"
      FROM public.learning_assignment_attempts att
      JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
      JOIN public.learning_assignments a ON a.id=ca.assignment_id AND a.constraints->>'kind'='knowledge_check'
      JOIN public.learning_enrollments e ON e.classroom_id=ca.classroom_id AND e.learner_user_id=att.learner_user_id AND e.status='active'
      JOIN public.users u ON u.id=att.learner_user_id
      WHERE ca.classroom_id=${classroomId}::uuid AND att.status='evaluated'
      ORDER BY att.submitted_at DESC NULLS LAST LIMIT 500`;
  }
  async classroomSubmissionSummary(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT s.status,COUNT(*)::int AS submission_count FROM public.learning_submissions s JOIN public.learning_assignment_attempts a ON (a.id=s.attempt_id OR (s.attempt_id IS NULL AND a.program_id=s.program_id AND a.learner_user_id=s.learner_user_id)) JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE ca.classroom_id=${classroomId}::uuid AND s.status<>'draft' GROUP BY s.status ORDER BY s.status`;
  }
  async classroomActivity(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT s.id,s.learner_user_id,s.status,s.submitted_at,u.full_name FROM public.learning_submissions s JOIN public.learning_assignment_attempts a ON (a.id=s.attempt_id OR (s.attempt_id IS NULL AND a.program_id=s.program_id AND a.learner_user_id=s.learner_user_id)) JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id JOIN public.users u ON u.id=s.learner_user_id WHERE ca.classroom_id=${classroomId}::uuid AND s.status<>'draft' ORDER BY s.submitted_at DESC NULLS LAST LIMIT 25`;
  }
  async attemptWorkspace(user: AuthenticatedUser, attemptId: string) {
    const rows = await this.prisma.$queryRaw<{classroom_id:string}[]>`SELECT ca.classroom_id FROM public.learning_assignment_attempts a JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid`;
    if (!rows[0]) throw new NotFoundException("Attempt was not found.");
    await this.scope.assertStudentClassroomAccess(user, rows[0].classroom_id);
    return this.one(this.prisma.$queryRaw`SELECT a.id,a.attempt_number,a.status,a.workspace_snapshot,a.program_snapshot,a.result_snapshot,a.started_at,a.submitted_at,ca.id AS classroom_assignment_id,la.title AS assignment_title,lp.id AS program_id,lp.workspace_json,lp.robot_program FROM public.learning_assignment_attempts a JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id JOIN public.learning_assignments la ON la.id=ca.assignment_id LEFT JOIN public.learning_programs lp ON lp.id=a.program_id WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid`, "Attempt was not found.");
  }
  private async assertOrganization(user: AuthenticatedUser, organizationId: string) { if (this.scope.isSystemAdministrator(user)) return; if (!user.memberships.some(m => m.organizationId === organizationId && m.status === "active")) throw new NotFoundException("Organization was not found."); }
  private async one(value: Promise<unknown>, message: string): Promise<any> { const rows = await value as any[]; if (!rows[0]) throw new NotFoundException(message); return rows[0]; }
}
