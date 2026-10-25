import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";

@Injectable()
export class LearningScopeService {
  constructor(private readonly prisma: PrismaService) {}

  isSystemAdministrator(user: AuthenticatedUser) { return user.systemPermissions.includes("org.manage"); }

  async classroomIds(user: AuthenticatedUser): Promise<string[]> {
    if (this.isSystemAdministrator(user)) return [];
    const rows = await this.prisma.$queryRaw<{ classroom_id: string }[]>`
      SELECT cm.classroom_id FROM public.learning_classroom_members cm
      JOIN public.memberships m ON m.id = cm.membership_id
      JOIN public.learning_classrooms c ON c.id = cm.classroom_id
      WHERE cm.user_id = ${user.vistaUserId}::uuid AND cm.status = 'active' AND m.status = 'active'
        AND m.organization_id = c.organization_id
    `;
    return rows.map((row) => row.classroom_id);
  }

  async assertClassroomAccess(user: AuthenticatedUser, classroomId: string): Promise<void> {
    if (this.isSystemAdministrator(user)) return;
    const ids = await this.classroomIds(user);
    if (!ids.includes(classroomId)) throw new NotFoundException("Classroom was not found.");
  }

  async assertTeacherClassroomAccess(user: AuthenticatedUser, classroomId: string): Promise<void> {
    return this.assertTeacherClassroomPermission(user, classroomId, ["learning.delivery.manage"]);
  }

  /**
   * A classroom teacher/TA may inspect unpublished delivery configuration.
   * A learner may only ever receive published work.  This is deliberately a
   * resource-scope check rather than a role-name check.
   */
  async canManageClassroom(user: AuthenticatedUser, classroomId: string): Promise<boolean> {
    if (this.isSystemAdministrator(user)) return true;
    const rows = await this.prisma.$queryRaw<{ classroom_id: string }[]>`
      SELECT cm.classroom_id
      FROM public.learning_classroom_members cm
      JOIN public.memberships m ON m.id=cm.membership_id
      JOIN public.learning_classrooms c ON c.id=cm.classroom_id
      WHERE cm.classroom_id=${classroomId}::uuid
        AND cm.user_id=${user.vistaUserId}::uuid
        AND cm.classroom_role IN ('teacher','teaching_assistant')
        AND cm.status='active' AND m.status='active'
        AND m.organization_id=c.organization_id
        AND EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          JOIN public.permissions p ON p.id=rp.permission_id
          WHERE rp.role_id=m.role_id AND p.code='learning.delivery.manage'
        )`;
    return rows.length > 0;
  }

  async assertTeacherClassroomPermission(user: AuthenticatedUser, classroomId: string, permissions: string[]): Promise<void> {
    if (this.isSystemAdministrator(user)) return;
    const rows = await this.prisma.$queryRaw<{ classroom_id: string }[]>`
      SELECT cm.classroom_id FROM public.learning_classroom_members cm JOIN public.memberships m ON m.id=cm.membership_id
      JOIN public.learning_classrooms c ON c.id=cm.classroom_id
      WHERE cm.classroom_id=${classroomId}::uuid AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active' AND m.status='active'
        AND m.organization_id=c.organization_id AND cm.classroom_role IN ('teacher','teaching_assistant')
        AND NOT EXISTS (
          SELECT 1 FROM unnest(${permissions}::text[]) required(code)
          WHERE NOT EXISTS (
            SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id
            WHERE rp.role_id=m.role_id AND p.code=required.code
          )
        )`;
    if (!rows.length) throw new NotFoundException("Classroom was not found.");
  }

  async assertStudentClassroomAccess(user: AuthenticatedUser, classroomId: string): Promise<void> {
    if (this.isSystemAdministrator(user)) return;
    if (!user.memberships.some((m) => m.status === "active" && m.permissions.includes("learning.work.write"))) {
      throw new NotFoundException("Assignment was not found.");
    }
    const rows = await this.prisma.$queryRaw<{ classroom_id: string }[]>`
      SELECT cm.classroom_id
      FROM public.learning_classroom_members cm
      JOIN public.memberships m ON m.id = cm.membership_id
      JOIN public.learning_classrooms c ON c.id = cm.classroom_id
      WHERE cm.classroom_id=${classroomId}::uuid AND cm.user_id=${user.vistaUserId}::uuid
        AND cm.classroom_role='student' AND cm.status='active' AND m.status='active'
        AND m.organization_id=c.organization_id`;
    if (!rows.length) throw new NotFoundException("Assignment was not found.");
  }
}
