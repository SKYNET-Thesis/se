import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning/learning-scope.service";
import { CreateClassroomDto } from "./dto/create-classroom.dto";
import { UpsertClassroomMemberDto } from "./dto/upsert-classroom-member.dto";

@Injectable()
export class EducationAdminService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

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
             m.id AS membership_id, m.status AS membership_status, r.code AS role_code
      FROM public.memberships m
      JOIN public.users u ON u.id = m.user_id
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.organization_id = ${organizationId}::uuid
      ORDER BY r.code, u.full_name`;
  }

  async classrooms(user: AuthenticatedUser, organizationId: string) {
    await this.assertOrganizationPermission(user, organizationId, "education.classroom.read");
    return this.prisma.$queryRaw`
      SELECT c.id, c.organization_id, c.offering_id, c.name, c.code, c.description, c.capacity, c.status,
             o.code AS offering_code, o.title AS offering_title,
             COUNT(cm.id) FILTER (WHERE cm.status = 'active' AND cm.classroom_role = 'student')::int AS student_count,
             COUNT(cm.id) FILTER (WHERE cm.status = 'active' AND cm.classroom_role IN ('teacher', 'teaching_assistant'))::int AS teaching_staff_count
      FROM public.learning_classrooms c
      JOIN public.learning_course_offerings o ON o.id = c.offering_id
      LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id = c.id
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
    if ((dto.classroomRole === "student" && membership.roles.code !== "student") ||
        (dto.classroomRole !== "student" && membership.roles.code !== "instructor")) {
      throw new ConflictException("The classroom role must match the organization membership role.");
    }
    return this.prisma.learning_classroom_members.upsert({
      where: { classroom_id_user_id: { classroom_id: classroom.id, user_id: dto.userId } },
      update: { membership_id: membership.id, classroom_role: dto.classroomRole, status: dto.status ?? "active", left_at: dto.status === "inactive" ? new Date() : null },
      create: { classroom_id: classroom.id, user_id: dto.userId, membership_id: membership.id, classroom_role: dto.classroomRole, status: dto.status ?? "active", joined_at: new Date() },
    });
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
