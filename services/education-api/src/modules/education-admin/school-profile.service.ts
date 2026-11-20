import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning/learning-scope.service";
import { SupabaseAdminService } from "./supabase-admin.service";
import { DigitalTwinRevocationService } from "../learning/digital-twin-revocation.service";
import { BadRequestException } from "@nestjs/common";

/** School Administrator self-service: school profile, read-only role/permission matrix, and member access status. All scoped to the caller's organization. */
@Injectable()
export class SchoolProfileService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly supabaseAdmin: SupabaseAdminService, private readonly twinRevocation?: DigitalTwinRevocationService) {}

  private assertPermission(user: AuthenticatedUser, organizationId: string, permission: string) {
    if (this.scope.isSystemAdministrator(user)) return;
    const membership = user.memberships.find((item) => item.organizationId === organizationId && item.status === "active");
    if (!membership?.permissions.includes(permission)) throw new NotFoundException("Organization was not found.");
  }

  async profile(user: AuthenticatedUser, organizationId: string) {
    this.assertPermission(user, organizationId, "education.members.read");
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT o.id, o.name, o.school_code AS "schoolCode", o.segment, o.status, o.contract_start AS "contractStart", o.contract_end AS "contractEnd", o.created_at AS "createdAt"
      FROM public.organizations o WHERE o.id=${organizationId}::uuid AND o.type='institution' LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("Organization was not found.");
    const administrators = await this.prisma.$queryRaw`
      SELECT u.id AS "userId", u.full_name AS "fullName", u.email
      FROM public.memberships m JOIN public.roles r ON r.id=m.role_id JOIN public.users u ON u.id=m.user_id
      WHERE m.organization_id=${organizationId}::uuid AND m.status='active' AND r.code='school_admin' ORDER BY u.full_name`;
    return { ...rows[0], administrators };
  }

  async updateProfile(user: AuthenticatedUser, organizationId: string, name: string) {
    this.assertPermission(user, organizationId, "education.members.provision");
    const trimmed = name.trim();
    const duplicate = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.organizations WHERE lower(name)=lower(${trimmed}) AND type='institution' AND id<>${organizationId}::uuid LIMIT 1`;
    if (duplicate[0]) throw new ConflictException("An organization with this name already exists.");
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`UPDATE public.organizations SET name=${trimmed}, updated_at=now() WHERE id=${organizationId}::uuid AND type='institution'`;
      if (updated === 0) throw new NotFoundException("Organization was not found.");
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
        VALUES(${user.vistaUserId}::uuid, ${organizationId}::uuid, 'organization.profile_updated', 'organization', ${organizationId}::uuid, jsonb_build_object('name', ${trimmed}::text))`;
    });
    return this.profile(user, organizationId);
  }

  /** Organization-scoped roles with their granted permissions and active member counts in this school. Read-only: permissions are platform-defined. */
  async roles(user: AuthenticatedUser, organizationId: string) {
    this.assertPermission(user, organizationId, "education.members.read");
    return this.prisma.$queryRaw`
      SELECT r.code, r.name,
             COALESCE((SELECT array_agg(p.code ORDER BY p.code) FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id), ARRAY[]::text[]) AS permissions,
             (SELECT count(*)::int FROM public.memberships m WHERE m.role_id=r.id AND m.organization_id=${organizationId}::uuid AND m.status='active') AS "memberCount"
      FROM public.roles r WHERE r.scope='organization' ORDER BY r.code`;
  }

  /** Suspends or reactivates a student/instructor in this school. Administrators and the caller cannot be changed here (lock-out protection). */
  async setMemberStatus(user: AuthenticatedUser, organizationId: string, userId: string, status: "active" | "suspended") {
    this.assertPermission(user, organizationId, "education.members.provision");
    if (userId === user.vistaUserId) throw new ForbiddenException("You cannot change your own access.");
    const rows = await this.prisma.$queryRaw<Array<{ id: string; role: string; status: string }>>`
      SELECT m.id, r.code AS role, m.status FROM public.memberships m JOIN public.roles r ON r.id=m.role_id
      WHERE m.organization_id=${organizationId}::uuid AND m.user_id=${userId}::uuid LIMIT 1`;
    const target = rows[0];
    if (!target) throw new NotFoundException("Member was not found.");
    if (!["student", "instructor"].includes(target.role)) throw new ForbiddenException("Only students and instructors can be changed here.");
    if (target.status === "revoked") throw new ConflictException("This membership was revoked.");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE public.memberships SET status=${status} WHERE id=${target.id}::uuid`;
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
        VALUES(${user.vistaUserId}::uuid, ${organizationId}::uuid, ${status === "suspended" ? "member.access_suspended" : "member.access_restored"}, 'user', ${userId}::uuid, jsonb_build_object('role', ${target.role}::text))`;
    });
    // A suspended member loses the right to watch live robot streams at once.
    if (status === "suspended") void this.twinRevocation?.revoke({ userId, organizationId });
    return { userId, status };
  }

  /** Re-sends the invitation to an instructor who has not accepted it yet. Accepted accounts and other roles are refused. */
  async reissueInstructorInvitation(user: AuthenticatedUser, organizationId: string, userId: string) {
    this.assertPermission(user, organizationId, "education.members.provision");
    const rows = await this.prisma.$queryRaw<Array<{ email: string | null; full_name: string; status: string; role: string; membership_status: string }>>`
      SELECT u.email, u.full_name, u.status, r.code AS role, m.status AS membership_status
      FROM public.memberships m JOIN public.users u ON u.id=m.user_id JOIN public.roles r ON r.id=m.role_id
      WHERE m.organization_id=${organizationId}::uuid AND m.user_id=${userId}::uuid LIMIT 1`;
    const target = rows[0];
    if (!target || target.role !== "instructor") throw new NotFoundException("Instructor was not found.");
    if (target.status !== "invited") throw new ConflictException("This person has already accepted the invitation.");
    if (!target.email) throw new BadRequestException("This instructor has no e-mail address to invite.");
    await this.supabaseAdmin.resendInvite(target.email, target.full_name);
    await this.prisma.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
      VALUES(${user.vistaUserId}::uuid, ${organizationId}::uuid, 'member.invitation_reissued', 'user', ${userId}::uuid, jsonb_build_object('role', 'instructor'))`;
    return { userId, email: target.email, status: "invitation_sent" as const };
  }
}
