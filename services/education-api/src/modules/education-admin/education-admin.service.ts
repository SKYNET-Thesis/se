import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning/learning-scope.service";
import { CreateClassroomDto } from "./dto/create-classroom.dto";
import { AllocateClassroomRobotDto } from "./dto/allocate-classroom-robot.dto";
import { UpsertClassroomMemberDto } from "./dto/upsert-classroom-member.dto";
import { ImportSchoolUsersDto, ImportSchoolUserRowDto } from "./dto/import-school-users.dto";
import { SupabaseAdminService } from "./supabase-admin.service";
import { classifyImportError, ImportProvisioningError, type ImportErrorCode } from "./import-errors";
import { StudentProvisioningService } from "./student-provisioning.service";

@Injectable()
export class EducationAdminService {
  private readonly logger = new Logger(EducationAdminService.name);
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly supabaseAdmin: SupabaseAdminService, private readonly studentProvisioning: StudentProvisioningService) {}

  async organizations(user: AuthenticatedUser) {
    if (!this.scope.isSystemAdministrator(user)) throw new NotFoundException("Organizations were not found.");
    return this.prisma.organizations.findMany({
      select: { id: true, name: true, type: true, segment: true, status: true, created_at: true, updated_at: true },
      orderBy: { name: "asc" },
    });
  }

  async members(user: AuthenticatedUser, organizationId: string) {
    await this.assertOrganizationPermission(user, organizationId, "education.members.read");
    return this.prisma.$queryRaw`
      SELECT u.id, u.full_name, u.email, u.status, u.created_at,
             m.id AS membership_id, m.status AS membership_status, r.code AS role_code,
             p.employee_code, p.student_code, p.grade_level, p.guardian_email,
             CASE WHEN p.account_state='account_setup_pending' OR u.auth_user_id IS NULL THEN 'account_setup_pending'
                  WHEN u.email_verified_at IS NULL THEN 'invited' ELSE 'active' END AS account_state
      FROM public.memberships m
      JOIN public.users u ON u.id = m.user_id
      JOIN public.roles r ON r.id = m.role_id
      LEFT JOIN public.education_school_user_profiles p ON p.organization_id=m.organization_id AND p.user_id=u.id
      WHERE m.organization_id = ${organizationId}::uuid
      ORDER BY r.code, u.full_name`;
  }

  async classrooms(user: AuthenticatedUser, organizationId: string) {
    await this.assertOrganizationPermission(user, organizationId, "education.classroom.read");
    return this.prisma.$queryRaw`
      SELECT c.id, c.organization_id, c.offering_id, c.name, c.code, c.description, c.capacity, c.status,
             o.code AS offering_code, o.title AS offering_title,
             COUNT(cm.id) FILTER (WHERE cm.status = 'active' AND cm.classroom_role = 'student')::int AS student_count,
             COUNT(cm.id) FILTER (WHERE cm.status = 'active' AND cm.classroom_role IN ('teacher', 'teaching_assistant'))::int AS teaching_staff_count,
             (jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'serialNo',r.serial_no,'modelName',r.model_name)) FILTER (WHERE r.id IS NOT NULL))->0 AS allocated_robot
      FROM public.learning_classrooms c
      JOIN public.learning_course_offerings o ON o.id = c.offering_id
      LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id = c.id
      LEFT JOIN public.learning_classroom_robot_allocations ar ON ar.classroom_id = c.id
      LEFT JOIN public.robots r ON r.id = ar.robot_id
      WHERE c.organization_id = ${organizationId}::uuid
      GROUP BY c.id, o.code, o.title
      ORDER BY c.name`;
  }

  async offerings(user: AuthenticatedUser, organizationId: string) {
    await this.assertOrganizationPermission(user, organizationId, "education.classroom.read");
    return this.prisma.$queryRaw`SELECT o.id,o.code,COALESCE(o.title,c.title) AS title,o.status FROM public.learning_course_offerings o JOIN public.learning_courses c ON c.id=o.course_id WHERE o.organization_id=${organizationId}::uuid ORDER BY o.created_at DESC`;
  }

  async classroomMembers(user: AuthenticatedUser, organizationId: string, classroomId: string) {
    await this.assertOrganizationPermission(user, organizationId, "education.members.read");
    const classroom = await this.prisma.learning_classrooms.findFirst({ where: { id: classroomId, organization_id: organizationId }, select: { id: true } });
    if (!classroom) throw new NotFoundException("Classroom was not found.");
    return this.prisma.$queryRaw`SELECT cm.id,cm.user_id,cm.classroom_role,cm.status,cm.joined_at,u.full_name,u.email,r.code AS membership_role FROM public.learning_classroom_members cm JOIN public.users u ON u.id=cm.user_id JOIN public.memberships m ON m.id=cm.membership_id JOIN public.roles r ON r.id=m.role_id WHERE cm.classroom_id=${classroomId}::uuid ORDER BY cm.classroom_role,u.full_name`;
  }

  async createClassroom(user: AuthenticatedUser, organizationId: string, dto: CreateClassroomDto) {
    await this.assertOrganizationPermission(user, organizationId, "education.classroom.manage");
    const offering = await this.prisma.learning_course_offerings.findFirst({ where: { id: dto.offeringId, organization_id: organizationId }, select: { id: true } });
    if (!offering) throw new NotFoundException("Course offering was not found.");
    try {
      return await this.prisma.learning_classrooms.create({ data: {
        organization_id: organizationId, offering_id: offering.id, name: dto.name.trim(), code: dto.code.trim(),
        description: dto.description?.trim(), capacity: dto.capacity, created_by: user.vistaUserId,
      } });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) throw new ConflictException("A classroom with this code already exists in the organization.");
      throw error;
    }
  }

  async upsertClassroomMember(user: AuthenticatedUser, organizationId: string, classroomId: string, dto: UpsertClassroomMemberDto) {
    await this.assertOrganizationPermission(user, organizationId, "education.classroom.members.manage");
    const classroom = await this.prisma.learning_classrooms.findFirst({ where: { id: classroomId, organization_id: organizationId }, select: { id: true } });
    if (!classroom) throw new NotFoundException("Classroom was not found.");
    const membership = await this.prisma.memberships.findFirst({ where: { user_id: dto.userId, organization_id: organizationId }, select: { id: true, status: true, roles: { select: { code: true } } } });
    if (!membership || membership.status !== "active") throw new NotFoundException("An active organization membership was not found.");
    const classroomRole = membership.roles.code === "student" ? "student" : membership.roles.code === "instructor" ? "teacher" : null;
    if (!classroomRole) throw new ConflictException("This organization role is not eligible for classroom membership.");
    return this.prisma.learning_classroom_members.upsert({
      where: { classroom_id_user_id: { classroom_id: classroom.id, user_id: dto.userId } },
      update: { membership_id: membership.id, classroom_role: classroomRole, status: "active", left_at: null },
      create: { classroom_id: classroom.id, user_id: dto.userId, membership_id: membership.id, classroom_role: classroomRole, status: "active", joined_at: new Date() },
    });
  }

  async importUsers(user: AuthenticatedUser, organizationId: string, dto: ImportSchoolUsersDto) {
    await this.assertOrganizationPermission(user, organizationId, "education.members.provision");
    const seenEmails = new Set<string>(); const seenCodes = new Set<string>();
    const prepared = dto.rows.map((row, index) => ({
      row,
      index,
      code: (dto.kind === "teachers" ? row.employeeCode : row.studentCode)?.trim().toLowerCase() ?? "",
      errors: this.validateImportRow(dto.kind, row, seenEmails, seenCodes),
    }));
    const requestedCodes = [...new Set(prepared.filter(item => item.errors.length === 0 && item.code).map(item => item.code))];
    const existingRows = requestedCodes.length === 0 ? [] : dto.kind === "teachers"
      ? await this.prisma.$queryRaw<Array<{ code: string }>>`SELECT lower(employee_code) AS code FROM public.education_school_user_profiles WHERE organization_id=${organizationId}::uuid AND employee_code IS NOT NULL AND lower(employee_code)=ANY(${requestedCodes}::text[])`
      : await this.prisma.$queryRaw<Array<{ code: string }>>`SELECT lower(student_code) AS code FROM public.education_school_user_profiles WHERE organization_id=${organizationId}::uuid AND student_code IS NOT NULL AND lower(student_code)=ANY(${requestedCodes}::text[])`;
    const existingCodes = new Set(existingRows.map(item => item.code));
    const results = [] as Array<{ row: number; status: "created" | "unchanged" | "failed"; code?: ImportErrorCode; message?: string; name?: string; schoolCode?: string }>;
    for (const { index, row, code, errors } of prepared) {
      if (errors.length) { results.push({ row: index + 2, status: "failed", code: "VALIDATION_ERROR", message: errors.join(" "), name: `${row.firstName} ${row.lastName}`.trim(), schoolCode: dto.kind === "teachers" ? row.employeeCode : row.studentCode }); continue; }
      if (existingCodes.has(code)) { results.push({ row: index + 2, status: "unchanged", name: `${row.firstName} ${row.lastName}`.trim(), schoolCode: dto.kind === "teachers" ? row.employeeCode : row.studentCode }); continue; }
      try { results.push({ row: index + 2, ...(await this.provisionImportRow(organizationId, dto.kind, row)) }); }
      catch (error) { const safe = classifyImportError(error); const identifier = dto.kind === "teachers" ? row.employeeCode : row.studentCode; this.logger.error({ event: "school_user_import_failed", kind: dto.kind, row: index + 2, organizationId, identifier, code: safe.code, error: error instanceof ImportProvisioningError ? error.internalDetail : error instanceof Error ? error.message : String(error) }); results.push({ row: index + 2, status: "failed", ...safe, name: `${row.firstName} ${row.lastName}`.trim(), schoolCode: identifier }); }
    }
    return { processed: results.length, created: results.filter(item => item.status === "created").length, unchanged: results.filter(item => item.status === "unchanged").length, failed: results.filter(item => item.status === "failed").length, results };
  }

  private validateImportRow(kind: "teachers" | "students", row: ImportSchoolUserRowDto, emails: Set<string>, codes: Set<string>) {
    const errors: string[] = []; const email = row.email?.trim().toLowerCase(); const code = (kind === "teachers" ? row.employeeCode : row.studentCode)?.trim().toLowerCase();
    if (!row.firstName?.trim()) errors.push("First name is required."); if (!row.lastName?.trim()) errors.push("Last name is required.");
    if (kind === "teachers" && !email) errors.push("Teacher email is required."); if (kind === "teachers" && !row.employeeCode?.trim()) errors.push("Employee code is required.");
    if (kind === "students" && !row.studentCode?.trim()) errors.push("Student code is required."); if (kind === "students" && !row.gradeLevel?.trim()) errors.push("Grade level is required.");
    if (email && emails.has(email)) errors.push("Duplicate email in upload."); if (code && codes.has(code)) errors.push(`Duplicate ${kind === "teachers" ? "employee" : "student"} code in upload.`); if (email) emails.add(email); if (code) codes.add(code); return errors;
  }

  private async provisionImportRow(organizationId: string, kind: "teachers" | "students", row: ImportSchoolUserRowDto) {
    if (kind === "students") {
      await this.studentProvisioning.provision(organizationId, row);
      return { status: "created" as const };
    }
    const email = row.email?.trim().toLowerCase() || null; const code = (kind === "teachers" ? row.employeeCode : row.studentCode)!.trim(); const fullName = `${row.firstName.trim()} ${row.lastName.trim()}`;
    let authUserId: string | null = null;
    if (email) authUserId = (await this.supabaseAdmin.invite(email, fullName)).id;
    const roleCode = "instructor"; const accountState = "invited";
    await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`INSERT INTO public.users(auth_user_id,email,full_name,status,signup_method) VALUES(${authUserId}::uuid,${email},${fullName},'invited','admin_created') ON CONFLICT (auth_user_id) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`;
      const userId = rows[0]?.id; if (!userId) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Domain user insert returned no row.");
      await tx.$executeRaw`INSERT INTO public.memberships(user_id,organization_id,role_id,status) SELECT ${userId}::uuid,${organizationId}::uuid,r.id,'active' FROM public.roles r WHERE r.code=${roleCode} ON CONFLICT(user_id,organization_id) DO UPDATE SET role_id=EXCLUDED.role_id,status='active'`;
      await tx.$executeRaw`INSERT INTO public.education_school_user_profiles(organization_id,user_id,person_type,employee_code,student_code,grade_level,guardian_email,account_state) VALUES(${organizationId}::uuid,${userId}::uuid,'teacher',${code},NULL,NULL,NULL,${accountState}) ON CONFLICT(organization_id,user_id) DO UPDATE SET employee_code=EXCLUDED.employee_code,account_state=EXCLUDED.account_state,updated_at=now()`;
    });
    return { status: "created" as const };
  }

  async eligibleRobots(user: AuthenticatedUser, classroomId: string) {
    const classroom = await this.classroomForAllocation(user, classroomId);
    return this.prisma.$queryRaw`SELECT DISTINCT r.id,r.name,r.serial_no AS "serialNo",r.model_name AS "modelName",r.status FROM public.robots r JOIN public.org_entitlements e ON e.robot_id=r.id WHERE e.organization_id=${classroom.organization_id}::uuid AND e.valid_from<=now() AND (e.valid_to IS NULL OR e.valid_to>now()) ORDER BY r.name`;
  }

  async allocateRobot(user: AuthenticatedUser, classroomId: string, dto: AllocateClassroomRobotDto) {
    const classroom = await this.classroomForAllocation(user, classroomId);
    const eligible = await this.prisma.$queryRaw<{ id: string }[]>`SELECT r.id FROM public.robots r JOIN public.org_entitlements e ON e.robot_id=r.id WHERE r.id=${dto.robotId}::uuid AND e.organization_id=${classroom.organization_id}::uuid AND e.valid_from<=now() AND (e.valid_to IS NULL OR e.valid_to>now()) LIMIT 1`;
    if (!eligible[0]) throw new NotFoundException("Robot was not eligible for this classroom.");
    return this.prisma.$transaction((tx) => tx.$queryRaw`INSERT INTO public.learning_classroom_robot_allocations(classroom_id,robot_id,created_by_user_id) VALUES(${classroomId}::uuid,${dto.robotId}::uuid,${user.vistaUserId}::uuid) ON CONFLICT (classroom_id) DO UPDATE SET robot_id=EXCLUDED.robot_id,created_by_user_id=EXCLUDED.created_by_user_id,created_at=now() RETURNING id,classroom_id,robot_id,created_by_user_id,created_at`);
  }

  private async classroomForAllocation(user: AuthenticatedUser, classroomId: string) {
    const classroom = await this.prisma.learning_classrooms.findFirst({ where: { id: classroomId }, select: { id: true, organization_id: true } });
    if (!classroom) throw new NotFoundException("Classroom was not found.");
    await this.assertOrganizationPermission(user, classroom.organization_id, "education.classroom.resource.allocate");
    return classroom;
  }

  private async assertOrganizationPermission(user: AuthenticatedUser, organizationId: string, permission: string) {
    if (this.scope.isSystemAdministrator(user)) return;
    const membership = user.memberships.find((item) => item.organizationId === organizationId && item.status === "active");
    if (!membership || !membership.permissions.includes(permission)) throw new NotFoundException("Organization was not found.");
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
  }
}
