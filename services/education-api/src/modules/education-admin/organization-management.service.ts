import { randomBytes } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning/learning-scope.service";
import { SupabaseAdminService } from "./supabase-admin.service";
import { DigitalTwinRevocationService } from "../learning/digital-twin-revocation.service";
import { classifyImportError } from "./import-errors";
import { AssignOrganizationAdministratorDto, CreateOrganizationDto, UpdateOrganizationDto } from "./dto/organization.dto";

/** System Administrator-only organization lifecycle and School Administrator assignment. Never reachable by tenant roles (404). */
@Injectable()
export class OrganizationManagementService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly supabaseAdmin: SupabaseAdminService, private readonly twinRevocation?: DigitalTwinRevocationService) {}

  private assertSystemAdmin(user: AuthenticatedUser) {
    if (!this.scope.isSystemAdministrator(user)) throw new NotFoundException("Organization was not found.");
  }

  async list(user: AuthenticatedUser) {
    this.assertSystemAdmin(user);
    return this.prisma.$queryRaw`
      SELECT o.id, o.name, o.school_code AS "schoolCode", o.type, o.segment, o.status,
             o.contract_start AS "contractStart", o.contract_end AS "contractEnd", o.created_at AS "createdAt", o.updated_at AS "updatedAt",
             COALESCE((SELECT count(*) FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.organization_id=o.id AND m.status='active' AND r.code='school_admin'),0)::int AS "administratorCount",
             COALESCE((SELECT count(*) FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.organization_id=o.id AND m.status='active' AND r.code='instructor'),0)::int AS "instructorCount",
             COALESCE((SELECT count(*) FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.organization_id=o.id AND m.status='active' AND r.code='student'),0)::int AS "studentCount",
             COALESCE((SELECT count(*) FROM public.learning_classrooms c WHERE c.organization_id=o.id AND c.status='active'),0)::int AS "classroomCount"
      FROM public.organizations o
      WHERE o.type='institution'
      ORDER BY o.name ASC`;
  }

  async detail(user: AuthenticatedUser, organizationId: string) {
    this.assertSystemAdmin(user);
    const rows = (await this.list(user)) as Array<{ id: string }>;
    const org = rows.find((row) => row.id === organizationId);
    if (!org) throw new NotFoundException("Organization was not found.");
    return { ...org, administrators: await this.administrators(user, organizationId) };
  }

  async administrators(user: AuthenticatedUser, organizationId: string) {
    this.assertSystemAdmin(user);
    return this.prisma.$queryRaw`
      SELECT u.id AS "userId", u.full_name AS "fullName", u.email, u.status AS "userStatus", m.id AS "membershipId", m.status AS "membershipStatus",
             CASE WHEN u.auth_user_id IS NULL OR u.email_verified_at IS NULL THEN 'invited' ELSE 'active' END AS "accountState"
      FROM public.memberships m JOIN public.roles r ON r.id=m.role_id JOIN public.users u ON u.id=m.user_id
      WHERE m.organization_id=${organizationId}::uuid AND r.code='school_admin'
      ORDER BY u.full_name`;
  }

  async create(user: AuthenticatedUser, dto: CreateOrganizationDto) {
    this.assertSystemAdmin(user);
    this.assertContract(dto.contractStart, dto.contractEnd);
    const name = dto.name.trim();
    const duplicate = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.organizations WHERE lower(name)=lower(${name}) AND type='institution' LIMIT 1`;
    if (duplicate[0]) throw new ConflictException("An organization with this name already exists.");
    const schoolCode = (dto.schoolCode?.trim().toUpperCase()) || `VST-${randomBytes(5).toString("hex").toUpperCase()}`;
    const codeTaken = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.organizations WHERE upper(school_code)=${schoolCode} LIMIT 1`;
    if (codeTaken[0]) throw new ConflictException("This school code is already in use.");
    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO public.organizations(name, school_code, type, segment, status, contract_start, contract_end)
        VALUES(${name}, ${schoolCode}, 'institution', ${dto.segment ?? "education"}, 'active', ${dto.contractStart ?? null}::date, ${dto.contractEnd ?? null}::date)
        RETURNING id`;
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
        VALUES(${user.vistaUserId}::uuid, ${rows[0]!.id}::uuid, 'organization.created', 'organization', ${rows[0]!.id}::uuid, jsonb_build_object('name', ${name}::text, 'schoolCode', ${schoolCode}::text))`;
      return rows[0]!.id;
    });
    return this.detail(user, created);
  }

  async update(user: AuthenticatedUser, organizationId: string, dto: UpdateOrganizationDto) {
    this.assertSystemAdmin(user);
    const current = await this.prisma.$queryRaw<Array<{ id: string; name: string; status: string; contract_start: Date | null; contract_end: Date | null }>>`
      SELECT id, name, status, contract_start, contract_end FROM public.organizations WHERE id=${organizationId}::uuid AND type='institution' LIMIT 1`;
    const org = current[0];
    if (!org) throw new NotFoundException("Organization was not found.");
    if (org.status === "closed" && dto.status && dto.status !== "closed") throw new ConflictException("A closed organization cannot be reopened.");
    const start = dto.contractStart ?? (org.contract_start ? org.contract_start.toISOString().slice(0, 10) : undefined);
    const end = dto.contractEnd ?? (org.contract_end ? org.contract_end.toISOString().slice(0, 10) : undefined);
    this.assertContract(start, end);
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== org.name.toLowerCase()) {
      const duplicate = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.organizations WHERE lower(name)=lower(${name}) AND type='institution' AND id<>${organizationId}::uuid LIMIT 1`;
      if (duplicate[0]) throw new ConflictException("An organization with this name already exists.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE public.organizations SET name=COALESCE(${name ?? null}, name), segment=COALESCE(${dto.segment ?? null}, segment), status=COALESCE(${dto.status ?? null}, status),
        contract_start=COALESCE(${dto.contractStart ?? null}::date, contract_start), contract_end=COALESCE(${dto.contractEnd ?? null}::date, contract_end), updated_at=now() WHERE id=${organizationId}::uuid`;
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
        VALUES(${user.vistaUserId}::uuid, ${organizationId}::uuid, ${dto.status && dto.status !== org.status ? "organization.status_changed" : "organization.updated"}, 'organization', ${organizationId}::uuid,
               jsonb_build_object('from', ${org.status}::text, 'status', ${dto.status ?? org.status}::text))`;
    });
    if (dto.status && dto.status !== "active" && dto.status !== org.status) void this.twinRevocation?.revoke({ organizationId });
    return this.detail(user, organizationId);
  }

  /** Assigns (inviting when needed) a School Administrator. Idempotent per user+organization; reactivates a suspended membership. */
  async assignAdministrator(user: AuthenticatedUser, organizationId: string, dto: AssignOrganizationAdministratorDto) {
    this.assertSystemAdmin(user);
    const org = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM public.organizations WHERE id=${organizationId}::uuid AND type='institution' LIMIT 1`;
    if (!org[0]) throw new NotFoundException("Organization was not found.");
    if (org[0].status === "closed") throw new ConflictException("A closed organization cannot receive administrators.");
    const email = dto.email.trim().toLowerCase(); const fullName = dto.fullName.trim();
    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.users WHERE lower(email)=${email} LIMIT 1`;
    let userId = existing[0]?.id;
    if (!userId) {
      let authUserId: string | null = null;
      try { authUserId = (await this.supabaseAdmin.invite(email, fullName)).id; }
      catch (error) { const safe = classifyImportError(error); throw new BadRequestException(safe.message ?? "The administrator could not be invited."); }
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`INSERT INTO public.users(auth_user_id,email,full_name,status,signup_method) VALUES(${authUserId}::uuid,${email},${fullName},'invited','admin_created')
        ON CONFLICT (auth_user_id) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`;
      userId = rows[0]?.id;
    }
    if (!userId) throw new BadRequestException("The administrator could not be created.");
    const other = await this.prisma.$queryRaw<Array<{ organization_id: string }>>`
      SELECT m.organization_id FROM public.memberships m WHERE m.user_id=${userId}::uuid AND m.organization_id<>${organizationId}::uuid AND m.status='active' LIMIT 1`;
    if (other[0]) throw new ConflictException("This person already belongs to another organization.");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO public.memberships(user_id,organization_id,role_id,status)
        SELECT ${userId}::uuid, ${organizationId}::uuid, r.id, 'active' FROM public.roles r WHERE r.code='school_admin' AND r.scope='organization'
        ON CONFLICT(user_id,organization_id) DO UPDATE SET role_id=EXCLUDED.role_id, status='active'`;
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
        VALUES(${user.vistaUserId}::uuid, ${organizationId}::uuid, 'organization.administrator_assigned', 'user', ${userId}::uuid, jsonb_build_object('email', ${email}::text))`;
    });
    return this.administrators(user, organizationId);
  }

  /** Suspends a School Administrator membership. The last active administrator cannot be removed from an active organization. */
  async revokeAdministrator(user: AuthenticatedUser, organizationId: string, userId: string) {
    this.assertSystemAdmin(user);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT m.id, m.status FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.organization_id=${organizationId}::uuid AND m.user_id=${userId}::uuid AND r.code='school_admin' LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("Administrator was not found.");
    if (rows[0].status === "active") {
      const remaining = await this.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.organization_id=${organizationId}::uuid AND r.code='school_admin' AND m.status='active' AND m.user_id<>${userId}::uuid`;
      if ((remaining[0]?.n ?? 0) === 0) throw new ConflictException("Assign another School Administrator before removing the last one.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE public.memberships SET status='suspended' WHERE id=${rows[0]!.id}::uuid`;
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
        VALUES(${user.vistaUserId}::uuid, ${organizationId}::uuid, 'organization.administrator_revoked', 'user', ${userId}::uuid, '{}'::jsonb)`;
    });
    return this.administrators(user, organizationId);
  }

  /** Re-sends the invitation to a School Administrator who has not accepted it yet. */
  async reissueAdministratorInvitation(user: AuthenticatedUser, organizationId: string, userId: string) {
    this.assertSystemAdmin(user);
    const rows = await this.prisma.$queryRaw<Array<{ email: string | null; full_name: string; status: string }>>`
      SELECT u.email, u.full_name, u.status FROM public.memberships m JOIN public.roles r ON r.id=m.role_id JOIN public.users u ON u.id=m.user_id
      WHERE m.organization_id=${organizationId}::uuid AND m.user_id=${userId}::uuid AND r.code='school_admin' LIMIT 1`;
    const target = rows[0];
    if (!target) throw new NotFoundException("Administrator was not found.");
    if (target.status !== "invited") throw new ConflictException("This person has already accepted the invitation.");
    if (!target.email) throw new BadRequestException("This administrator has no e-mail address to invite.");
    await this.supabaseAdmin.resendInvite(target.email, target.full_name);
    await this.prisma.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
      VALUES(${user.vistaUserId}::uuid, ${organizationId}::uuid, 'organization.administrator_invitation_reissued', 'user', ${userId}::uuid, '{}'::jsonb)`;
    return { userId, email: target.email, status: "invitation_sent" as const };
  }

  /**
   * Account-level switch: a disabled account is rejected by every request (the auth guard), in every organization.
   * Platform operators and the caller themselves cannot be disabled here (lock-out protection).
   */
  async setAccountStatus(user: AuthenticatedUser, userId: string, status: "active" | "disabled") {
    this.assertSystemAdmin(user);
    if (userId === user.vistaUserId) throw new ForbiddenException("You cannot change your own account.");
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: string; auth_user_id: string | null; email_verified_at: Date | null; system_roles: number; student_memberships: number }>>`
      SELECT u.id, u.status, u.auth_user_id, u.email_verified_at, (SELECT count(*)::int FROM public.user_system_roles s WHERE s.user_id=u.id) AS system_roles,
             (SELECT count(*)::int FROM public.memberships m JOIN public.roles r ON r.id=m.role_id WHERE m.user_id=u.id AND r.code='student') AS student_memberships
      FROM public.users u WHERE u.id=${userId}::uuid LIMIT 1`;
    const target = rows[0];
    if (!target) throw new NotFoundException("User was not found.");
    if (target.system_roles > 0) throw new ForbiddenException("Platform administrators cannot be changed here.");
    // Re-enabling restores the state the account had. Students are active without ever verifying an e-mail (school-provisioned identity), so they
    // return to active; instructors/administrators who never accepted their invitation stay invited and are activated by their first verified sign-in.
    const next = status === "disabled" ? "disabled" : (target.auth_user_id && (target.email_verified_at || target.student_memberships > 0) ? "active" : "invited");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE public.users SET status=${next}, updated_at=now() WHERE id=${userId}::uuid`;
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
        VALUES(${user.vistaUserId}::uuid, NULL, ${status === "disabled" ? "user.account_disabled" : "user.account_enabled"}, 'user', ${userId}::uuid, jsonb_build_object('from', ${target.status}::text, 'to', ${next}::text))`;
    });
    if (next === "disabled") void this.twinRevocation?.revoke({ userId });
    return { userId, status: next };
  }

  private assertContract(start?: string, end?: string) {
    if (start && end && end < start) throw new BadRequestException("Contract end must not be before contract start.");
  }
}
