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
    return this.one(this.prisma.$queryRaw`SELECT (SELECT COUNT(*)::int FROM public.learning_classroom_members cm JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active' JOIN public.learning_classrooms c ON c.id=cm.classroom_id AND c.organization_id=m.organization_id WHERE cm.user_id=${user.vistaUserId}::uuid AND cm.status='active') AS classroom_count,(SELECT COUNT(*)::int FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid) AS attempt_count,(SELECT COUNT(*)::int FROM public.learning_submissions WHERE learner_user_id=${user.vistaUserId}::uuid) AS submission_count,(SELECT COUNT(*)::int FROM public.learning_experiments WHERE learner_user_id=${user.vistaUserId}::uuid) AS experiment_count`, "Dashboard was not found.");
  }
  async myLearningSummary(user: AuthenticatedUser) {
    return this.one(this.prisma.$queryRaw`SELECT (SELECT COUNT(*)::int FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid AND status='in_progress') AS in_progress_attempts,(SELECT COUNT(*)::int FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid AND submitted_at IS NOT NULL) AS submitted_attempts,(SELECT COUNT(*)::int FROM public.learning_feedback f JOIN public.learning_submissions s ON s.id=f.submission_id WHERE s.learner_user_id=${user.vistaUserId}::uuid) AS feedback_count,(SELECT COUNT(*)::int FROM public.learning_reflections WHERE learner_user_id=${user.vistaUserId}::uuid) AS reflection_count`, "Learning summary was not found.");
  }
  async myRecentActivity(user: AuthenticatedUser) {
    return this.prisma.$queryRaw`SELECT * FROM ((SELECT 'attempt'::text AS type,id,started_at AS occurred_at,status FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid) UNION ALL (SELECT 'submission'::text,id,submitted_at AS occurred_at,status FROM public.learning_submissions WHERE learner_user_id=${user.vistaUserId}::uuid) UNION ALL (SELECT 'experiment'::text,id,created_at AS occurred_at,status FROM public.learning_experiments WHERE learner_user_id=${user.vistaUserId}::uuid)) activity WHERE occurred_at IS NOT NULL ORDER BY occurred_at DESC LIMIT 25`;
  }
  async classroomDashboard(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.one(this.prisma.$queryRaw`SELECT cl.id,cl.name,COUNT(DISTINCT cm.id) FILTER (WHERE cm.status='active' AND cm.classroom_role='student')::int AS student_count,COUNT(DISTINCT ca.id)::int AS assignment_count,COUNT(DISTINCT a.id)::int AS attempt_count,COUNT(DISTINCT s.id)::int AS submission_count FROM public.learning_classrooms cl LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id LEFT JOIN public.learning_classroom_assignments ca ON ca.classroom_id=cl.id LEFT JOIN public.learning_assignment_attempts a ON a.classroom_assignment_id=ca.id LEFT JOIN public.learning_submissions s ON s.program_id=a.program_id AND s.learner_user_id=a.learner_user_id WHERE cl.id=${classroomId}::uuid GROUP BY cl.id`, "Classroom was not found.");
  }
  async classroomProgress(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT a.status,COUNT(*)::int AS attempt_count FROM public.learning_assignment_attempts a JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE ca.classroom_id=${classroomId}::uuid GROUP BY a.status ORDER BY a.status`;
  }
  async classroomSubmissionSummary(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT s.status,COUNT(*)::int AS submission_count FROM public.learning_submissions s JOIN public.learning_assignment_attempts a ON a.program_id=s.program_id AND a.learner_user_id=s.learner_user_id JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE ca.classroom_id=${classroomId}::uuid GROUP BY s.status ORDER BY s.status`;
  }
  async classroomActivity(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT s.id,s.learner_user_id,s.status,s.submitted_at,u.full_name FROM public.learning_submissions s JOIN public.learning_assignment_attempts a ON a.program_id=s.program_id AND a.learner_user_id=s.learner_user_id JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id JOIN public.users u ON u.id=s.learner_user_id WHERE ca.classroom_id=${classroomId}::uuid ORDER BY s.submitted_at DESC NULLS LAST LIMIT 25`;
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
