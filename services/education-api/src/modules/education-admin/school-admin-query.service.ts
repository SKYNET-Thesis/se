import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning/learning-scope.service";
import { MemberCandidateQueryDto, SchoolPeopleQueryDto } from "./dto/school-admin-query.dto";

interface PageRow<T> { total: number; items: T[]; }

@Injectable()
export class SchoolAdminQueryService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  async overview(user: AuthenticatedUser, organizationId: string) {
    this.assertOrganizationPermission(user, organizationId, "education.members.read");
    this.assertOrganizationPermission(user, organizationId, "education.classroom.read");
    const rows = await this.prisma.$queryRaw<Array<{
      studentsCount: number; teachersCount: number; classroomsCount: number;
      robotResourcesCount: number; accountSetupPendingCount: number;
    }>>`
      SELECT
        (SELECT COUNT(*)::int FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.organization_id=${organizationId}::uuid AND m.status='active' AND r.code='student') AS "studentsCount",
        (SELECT COUNT(*)::int FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.organization_id=${organizationId}::uuid AND m.status='active' AND r.code='instructor') AS "teachersCount",
        (SELECT COUNT(*)::int FROM public.learning_classrooms c WHERE c.organization_id=${organizationId}::uuid) AS "classroomsCount",
        (SELECT COUNT(DISTINCT a.robot_id)::int FROM public.learning_classroom_robot_allocations a JOIN public.learning_classrooms c ON c.id=a.classroom_id WHERE c.organization_id=${organizationId}::uuid) AS "robotResourcesCount",
        (SELECT COUNT(*)::int FROM public.education_school_user_profiles p WHERE p.organization_id=${organizationId}::uuid AND p.account_state='account_setup_pending') AS "accountSetupPendingCount"`;
    return rows[0] ?? { studentsCount: 0, teachersCount: 0, classroomsCount: 0, robotResourcesCount: 0, accountSetupPendingCount: 0 };
  }

  async people(user: AuthenticatedUser, organizationId: string, query: SchoolPeopleQueryDto) {
    this.assertOrganizationPermission(user, organizationId, "education.members.read");
    const search = query.search?.trim() || null;
    const role = query.role ?? null;
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.prisma.$queryRaw<Array<PageRow<Record<string, unknown>>>>`
      WITH filtered AS (
        SELECT u.id, u.full_name AS "displayName", r.code AS role,
               p.student_code AS "studentCode", p.employee_code AS "employeeCode",
               p.grade_level AS "gradeLevel", u.email,
               CASE WHEN p.account_state='account_setup_pending' OR u.auth_user_id IS NULL THEN 'account_setup_pending'
                    WHEN u.email_verified_at IS NULL THEN 'invited' ELSE 'active' END AS "accountState"
        FROM public.memberships m
        JOIN public.users u ON u.id=m.user_id
        JOIN public.roles r ON r.id=m.role_id
        LEFT JOIN public.education_school_user_profiles p ON p.organization_id=m.organization_id AND p.user_id=u.id
        WHERE m.organization_id=${organizationId}::uuid AND m.status='active'
          AND (${role}::text IS NULL OR r.code=${role})
          AND (${search}::text IS NULL OR u.full_name ILIKE '%' || ${search} || '%'
            OR COALESCE(u.email,'') ILIKE '%' || ${search} || '%'
            OR COALESCE(p.student_code,'') ILIKE '%' || ${search} || '%'
            OR COALESCE(p.employee_code,'') ILIKE '%' || ${search} || '%')
      ), paged AS (
        SELECT * FROM filtered ORDER BY role, lower("displayName"), id LIMIT ${query.pageSize} OFFSET ${offset}
      )
      SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
             COALESCE(jsonb_agg(to_jsonb(paged) ORDER BY role, lower("displayName"), id), '[]'::jsonb) AS items
      FROM paged`;
    return { items: rows[0]?.items ?? [], page: query.page, pageSize: query.pageSize, total: rows[0]?.total ?? 0 };
  }

  async classrooms(user: AuthenticatedUser, organizationId: string) {
    this.assertOrganizationPermission(user, organizationId, "education.classroom.read");
    return this.prisma.$queryRaw`
      SELECT c.id,c.organization_id,c.offering_id,c.name,c.code,c.description,c.capacity,c.status,
             o.title AS offering_title,
             COUNT(cm.id) FILTER (WHERE cm.status='active' AND cm.classroom_role='student')::int AS student_count,
             COUNT(cm.id) FILTER (WHERE cm.status='active' AND cm.classroom_role IN ('teacher','teaching_assistant'))::int AS teaching_staff_count,
             (jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'serialNo',r.serial_no,'modelName',r.model_name)) FILTER (WHERE r.id IS NOT NULL))->0 AS allocated_robot
      FROM public.learning_classrooms c
      JOIN public.learning_course_offerings o ON o.id=c.offering_id
      LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id
      LEFT JOIN public.learning_classroom_robot_allocations a ON a.classroom_id=c.id
      LEFT JOIN public.robots r ON r.id=a.robot_id
      WHERE c.organization_id=${organizationId}::uuid
      GROUP BY c.id,o.title ORDER BY c.name`;
  }

  async classroomMembers(user: AuthenticatedUser, organizationId: string, classroomId: string) {
    this.assertOrganizationPermission(user, organizationId, "education.members.read");
    await this.assertClassroom(organizationId, classroomId);
    return this.prisma.$queryRaw`SELECT cm.id,cm.user_id,cm.classroom_role,cm.status,cm.joined_at,u.full_name,u.email,r.code AS membership_role FROM public.learning_classroom_members cm JOIN public.users u ON u.id=cm.user_id JOIN public.memberships m ON m.id=cm.membership_id JOIN public.roles r ON r.id=m.role_id WHERE cm.classroom_id=${classroomId}::uuid ORDER BY cm.classroom_role,u.full_name`;
  }

  async offerings(user: AuthenticatedUser, organizationId: string) {
    this.assertOrganizationPermission(user, organizationId, "education.classroom.read");
    return this.prisma.$queryRaw`SELECT o.id,o.code,COALESCE(o.title,c.title) AS title,o.status FROM public.learning_course_offerings o JOIN public.learning_courses c ON c.id=o.course_id WHERE o.organization_id=${organizationId}::uuid ORDER BY o.created_at DESC`;
  }

  async memberCandidates(user: AuthenticatedUser, organizationId: string, classroomId: string, query: MemberCandidateQueryDto) {
    this.assertOrganizationPermission(user, organizationId, "education.classroom.members.manage");
    await this.assertClassroom(organizationId, classroomId);
    const search = query.search?.trim() || null;
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.prisma.$queryRaw<Array<PageRow<Record<string, unknown>>>>`
      WITH filtered AS (
        SELECT u.id AS "userId",u.full_name AS "displayName",r.code AS "organizationRole",
               COALESCE(p.student_code,p.employee_code) AS "schoolCode",
               CASE WHEN p.account_state='account_setup_pending' OR u.auth_user_id IS NULL THEN 'account_setup_pending'
                    WHEN u.email_verified_at IS NULL THEN 'invited' ELSE 'active' END AS "accountState",
               false AS "alreadyMember"
        FROM public.memberships m
        JOIN public.users u ON u.id=m.user_id
        JOIN public.roles r ON r.id=m.role_id
        LEFT JOIN public.education_school_user_profiles p ON p.organization_id=m.organization_id AND p.user_id=u.id
        WHERE m.organization_id=${organizationId}::uuid AND m.status='active' AND r.code IN ('student','instructor')
          AND NOT EXISTS(SELECT 1 FROM public.learning_classroom_members cm WHERE cm.classroom_id=${classroomId}::uuid AND cm.user_id=u.id AND cm.status='active')
          AND (${search}::text IS NULL OR u.full_name ILIKE '%' || ${search} || '%'
            OR COALESCE(u.email,'') ILIKE '%' || ${search} || '%'
            OR COALESCE(p.student_code,'') ILIKE '%' || ${search} || '%'
            OR COALESCE(p.employee_code,'') ILIKE '%' || ${search} || '%')
      ), paged AS (
        SELECT * FROM filtered ORDER BY lower("displayName"),"userId" LIMIT ${query.pageSize} OFFSET ${offset}
      )
      SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
             COALESCE(jsonb_agg(to_jsonb(paged) ORDER BY lower("displayName"),"userId"), '[]'::jsonb) AS items
      FROM paged`;
    return { items: rows[0]?.items ?? [], page: query.page, pageSize: query.pageSize, total: rows[0]?.total ?? 0 };
  }

  private async assertClassroom(organizationId: string, classroomId: string) {
    const classroom = await this.prisma.learning_classrooms.findFirst({ where: { id: classroomId, organization_id: organizationId }, select: { id: true } });
    if (!classroom) throw new NotFoundException("Classroom was not found.");
  }

  private assertOrganizationPermission(user: AuthenticatedUser, organizationId: string, permission: string) {
    if (this.scope.isSystemAdministrator(user)) return;
    const membership = user.memberships.find(item => item.organizationId === organizationId && item.status === "active");
    if (!membership?.permissions.includes(permission)) throw new NotFoundException("Organization was not found.");
  }
}
