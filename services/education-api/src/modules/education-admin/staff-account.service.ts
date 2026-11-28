import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning/learning-scope.service";
import { CreateStaffAccountDto, StaffPasswordChangeDto, StaffRole } from "./dto/staff-account.dto";
import { SupabaseAdminService } from "./supabase-admin.service";
import { staffTempPasswordEnabled } from "./staff-temp-password.feature";

const DEFAULT_TTL_HOURS = 72;
const FIRST_LOGIN_TX = { timeout: 30_000, maxWait: 10_000 };

export interface StaffCredentialResult {
  userId: string; organizationId: string; role: StaffRole; fullName: string; email: string;
  accountState: "password_change_required" | "invited";
  /** Present exactly once, only in the response to the authorized administrator. Never stored, never logged. */
  temporaryPassword?: string; temporaryPasswordExpiresAt?: string;
}

/**
 * Direct account creation and e-mail invitation for School Administrators and Instructors.
 * Students keep their own provisioning pipeline (StudentProvisioningService).
 * Invariants: no plaintext password is persisted or logged; the Auth identity and the application rows are created together or not at all;
 * an existing account is never overwritten; the first-login state is server-side (public.users.password_change_required).
 */
@Injectable()
export class StaffAccountService {
  private readonly logger = new Logger(StaffAccountService.name);
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly supabase: SupabaseAdminService) {}

  capabilities() { return { staffDirectAccountsEnabled: staffTempPasswordEnabled() }; }

  /** Who may provision which role. Cross-school and escalation attempts look like "not found" (no tenant disclosure). */
  private authorize(user: AuthenticatedUser, organizationId: string, role: StaffRole) {
    if (this.scope.isSystemAdministrator(user)) return;
    if (role === "school_admin") throw new NotFoundException("Organization was not found.");
    const membership = user.memberships.find((m) => m.organizationId === organizationId && m.status === "active");
    if (!membership || !membership.permissions.includes("education.members.provision")) throw new NotFoundException("Organization was not found.");
  }

  private ttlHours() {
    const value = Number(process.env.STAFF_TEMP_PASSWORD_TTL_HOURS);
    return Number.isFinite(value) && value >= 1 && value <= 24 * 14 ? value : DEFAULT_TTL_HOURS;
  }
  private newPassword() { return randomBytes(24).toString("base64url"); }

  async create(user: AuthenticatedUser, organizationId: string, dto: CreateStaffAccountDto): Promise<StaffCredentialResult> {
    this.authorize(user, organizationId, dto.role);
    const email = dto.email.trim().toLowerCase(); const fullName = dto.fullName.trim();
    const employeeCode = dto.employeeCode?.trim();
    if (dto.role === "instructor" && !employeeCode) throw new BadRequestException("An employee code is required for an instructor.");
    if (dto.role === "school_admin" && employeeCode) throw new BadRequestException("An employee code applies to instructors only.");
    const org = await this.prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM public.organizations WHERE id=${organizationId}::uuid AND type='institution' LIMIT 1`;
    if (!org[0]) throw new NotFoundException("Organization was not found.");
    if (org[0].status !== "active") throw new ConflictException("Accounts can only be created in an active school.");
    const duplicate = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.users WHERE lower(email)=${email} LIMIT 1`;
    if (duplicate[0]) throw new ConflictException("An account with this e-mail address already exists.");
    if (dto.role === "instructor") {
      const code = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.education_school_user_profiles WHERE organization_id=${organizationId}::uuid AND lower(employee_code)=${employeeCode!.toLowerCase()} LIMIT 1`;
      if (code[0]) throw new ConflictException("This employee code is already used in this school.");
    }
    return dto.method === "direct"
      ? this.createDirect(user, organizationId, dto.role, fullName, email, employeeCode)
      : this.createInvited(user, organizationId, dto.role, fullName, email, employeeCode);
  }

  private async createDirect(actor: AuthenticatedUser, organizationId: string, role: StaffRole, fullName: string, email: string, employeeCode?: string): Promise<StaffCredentialResult> {
    if (!staffTempPasswordEnabled()) throw new ConflictException("Direct account creation is not enabled on this server.");
    const password = this.newPassword();
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3_600_000);
    let identity: { id: string };
    try {
      const created = await this.supabase.createStaffIdentity(email, password);
      if (!created.created) throw new ConflictException("An account with this e-mail address already exists.");
      identity = created.user;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException("The account could not be created. Nothing was saved.");
    }
    try {
      const userId = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO public.users(auth_user_id,email,full_name,status,signup_method,email_verified_at,password_change_required,temporary_password_expires_at)
          VALUES(${identity.id}::uuid,${email},${fullName},'active','admin_created',now(),true,${expiresAt}) RETURNING id`;
        const id = rows[0]?.id; if (!id) throw new Error("user row missing");
        await this.persistMembership(tx, id, organizationId, role, employeeCode, "active");
        await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
          VALUES(${actor.vistaUserId}::uuid,${organizationId}::uuid,'account.created','user',${id}::uuid,jsonb_build_object('method','direct','role',${role}::text,'email',${email}::text))`;
        return id;
      }, FIRST_LOGIN_TX);
      return { userId, organizationId, role, fullName, email, accountState: "password_change_required", temporaryPassword: password, temporaryPasswordExpiresAt: expiresAt.toISOString() };
    } catch (error) {
      // Application persistence failed: remove the Auth identity so no half-created account can sign in. Never report success.
      try { await this.supabase.deleteStudentIdentity(identity.id); } catch { this.logger.error({ event: "staff_account_cleanup_failed", authUserId: identity.id }); }
      this.logger.error({ event: "staff_account_create_failed", reason: error instanceof Error ? error.constructor.name : "unknown" });
      throw new BadRequestException("The account could not be created. Nothing was saved.");
    }
  }

  private async createInvited(actor: AuthenticatedUser, organizationId: string, role: StaffRole, fullName: string, email: string, employeeCode?: string): Promise<StaffCredentialResult> {
    let identity: { id: string };
    try { identity = await this.supabase.invite(email, fullName); }
    catch { throw new BadRequestException("The invitation could not be sent. Nothing was saved."); }
    try {
      const userId = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO public.users(auth_user_id,email,full_name,status,signup_method) VALUES(${identity.id}::uuid,${email},${fullName},'invited','admin_created') RETURNING id`;
        const id = rows[0]?.id; if (!id) throw new Error("user row missing");
        await this.persistMembership(tx, id, organizationId, role, employeeCode, "invited");
        await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
          VALUES(${actor.vistaUserId}::uuid,${organizationId}::uuid,'account.invited','user',${id}::uuid,jsonb_build_object('method','invite','role',${role}::text,'email',${email}::text))`;
        return id;
      }, FIRST_LOGIN_TX);
      return { userId, organizationId, role, fullName, email, accountState: "invited" };
    } catch (error) {
      try { await this.supabase.deleteStudentIdentity(identity.id); } catch { this.logger.error({ event: "staff_invite_cleanup_failed", authUserId: identity.id }); }
      this.logger.error({ event: "staff_invite_failed", reason: error instanceof Error ? error.constructor.name : "unknown" });
      throw new BadRequestException("The invitation could not be saved. Nothing was created.");
    }
  }

  private async persistMembership(tx: Prisma.TransactionClient, userId: string, organizationId: string, role: StaffRole, employeeCode: string | undefined, accountState: "active" | "invited") {
    const inserted = await tx.$executeRaw`INSERT INTO public.memberships(user_id,organization_id,role_id,status)
      SELECT ${userId}::uuid,${organizationId}::uuid,r.id,'active' FROM public.roles r WHERE r.code=${role} AND r.scope='organization'`;
    if (inserted !== 1) throw new Error("membership not created");
    if (role === "instructor") {
      await tx.$executeRaw`INSERT INTO public.education_school_user_profiles(organization_id,user_id,person_type,employee_code,account_state)
        VALUES(${organizationId}::uuid,${userId}::uuid,'teacher',${employeeCode!},${accountState})`;
    }
  }

  /** Target must belong to the organization; returns it with the role the caller is judged against. */
  private async target(organizationId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; auth_user_id: string | null; email: string | null; full_name: string; status: string; password_change_required: boolean; role_code: StaffRole }>>`
      SELECT u.id,u.auth_user_id,u.email,u.full_name,u.status,u.password_change_required,r.code AS role_code
      FROM public.users u JOIN public.memberships m ON m.user_id=u.id AND m.organization_id=${organizationId}::uuid JOIN public.roles r ON r.id=m.role_id
      WHERE u.id=${userId}::uuid AND r.code IN ('school_admin','instructor') LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("Account was not found.");
    return rows[0];
  }

  /**
   * Recovers an account that exists in Authentication but never obtained a usable password (e.g. an invitation whose link failed).
   * Keeps the Auth user id, profile and membership. REFUSES any account that has ever signed in or already completed a password change.
   */
  async recoverPending(actor: AuthenticatedUser, organizationId: string, userId: string): Promise<StaffCredentialResult> {
    if (!staffTempPasswordEnabled()) throw new ConflictException("Credential recovery is not enabled on this server.");
    const target = await this.target(organizationId, userId);
    this.authorize(actor, organizationId, target.role_code);
    if (target.status !== "invited" || !target.auth_user_id) throw new ConflictException("Only a pending invitation can be recovered. Use password recovery for an active account.");
    const auth = await this.supabase.getAuthUser(target.auth_user_id).catch(() => { throw new BadRequestException("The identity provider could not verify this account."); });
    if (!auth) throw new ConflictException("The identity no longer exists. Send a new invitation.");
    if (auth.lastSignInAt) throw new ConflictException("This person has already signed in. Use password recovery instead of resetting the password.");
    return this.issue(actor, organizationId, target, "account.recovered");
  }

  /** Re-sends the e-mail invitation of an account that has not accepted it yet (an Instructor for a School Admin, a School Admin for a System Admin). Never touches an active account. */
  async resendInvitation(actor: AuthenticatedUser, organizationId: string, userId: string) {
    const target = await this.target(organizationId, userId);
    this.authorize(actor, organizationId, target.role_code);
    if (target.status !== "invited" || !target.email) throw new ConflictException("Only a pending invitation can be sent again.");
    try { await this.supabase.resendInvite(target.email, target.full_name); }
    catch { throw new BadRequestException("The invitation could not be sent. Nothing was changed."); }
    await this.prisma.$executeRaw`INSERT INTO public.audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
      VALUES(${actor.vistaUserId}::uuid,${organizationId}::uuid,'account.invitation_resent','user',${userId}::uuid,jsonb_build_object('role',${target.role_code}::text))`;
    return { userId, organizationId, role: target.role_code, fullName: target.full_name, email: target.email, accountState: "invited" as const };
  }

  /** Re-issues temporary credentials for an account whose first-login change is still pending. Never touches an account with a permanent password. */
  async resetTemporary(actor: AuthenticatedUser, organizationId: string, userId: string): Promise<StaffCredentialResult> {
    if (!staffTempPasswordEnabled()) throw new ConflictException("Credential reset is not enabled on this server.");
    const target = await this.target(organizationId, userId);
    this.authorize(actor, organizationId, target.role_code);
    if (!target.password_change_required) throw new ConflictException("This account already has a permanent password. Use password recovery.");
    return this.issue(actor, organizationId, target, "account.credentials_reset");
  }

  private async issue(actor: AuthenticatedUser, organizationId: string, target: { id: string; auth_user_id: string | null; email: string | null; full_name: string; role_code: StaffRole }, action: string): Promise<StaffCredentialResult> {
    const password = this.newPassword(); const expiresAt = new Date(Date.now() + this.ttlHours() * 3_600_000);
    try { await this.supabase.setStudentPassword(target.auth_user_id!, password); }
    catch { throw new BadRequestException("The credentials could not be issued. Nothing was changed."); }
    let cutoff: Date | null = null;
    await this.prisma.$transaction(async (tx) => {
      // password_changed_at = now() makes every earlier session stale (SESSION_ROTATED), i.e. sessions are revoked.
      const rows = await tx.$queryRaw<Array<{ password_changed_at: Date }>>`UPDATE public.users SET status='active',email_verified_at=COALESCE(email_verified_at,now()),password_change_required=true,
        temporary_password_expires_at=${expiresAt},password_changed_at=clock_timestamp(),updated_at=now() WHERE id=${target.id}::uuid RETURNING password_changed_at`;
      if (!rows[0]) throw new Error("user not updated");
      cutoff = rows[0].password_changed_at;
      await tx.$executeRaw`UPDATE public.education_school_user_profiles SET account_state='active',updated_at=now() WHERE user_id=${target.id}::uuid AND organization_id=${organizationId}::uuid`;
      await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
        VALUES(${actor.vistaUserId}::uuid,${organizationId}::uuid,${action},'user',${target.id}::uuid,jsonb_build_object('role',${target.role_code}::text))`;
    }, FIRST_LOGIN_TX);
    // Access tokens carry iat with one-second precision and the guard rejects iat <= password_changed_at: do not hand out credentials that could
    // be used within the same second as the cutoff (that session would be treated as stale).
    if (cutoff) await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(cutoff!.getTime() / 1000) * 1000 + 1000 - Date.now())));
    return { userId: target.id, organizationId, role: target.role_code, fullName: target.full_name, email: target.email ?? "", accountState: "password_change_required", temporaryPassword: password, temporaryPasswordExpiresAt: expiresAt.toISOString() };
  }

  /** The mandatory first-login change. Server-verified: needs the temporary password, sets a different permanent one, clears the gate, rotates sessions. */
  async changeFirstLoginPassword(user: AuthenticatedUser, dto: StaffPasswordChangeDto) {
    if (!staffTempPasswordEnabled()) throw new ConflictException("No first-login password change is pending.");
    if (dto.currentPassword === dto.newPassword) throw new UnauthorizedException("Choose a password different from the temporary password.");
    if (user.email && dto.newPassword.toLowerCase().includes(user.email.split("@")[0]!.toLowerCase()) && user.email.split("@")[0]!.length >= 4) throw new UnauthorizedException("The password must not contain your e-mail name.");
    let authPasswordChanged = false;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string; auth_user_id: string; email: string }>>`
          SELECT u.id,u.auth_user_id,u.email FROM public.users u
          WHERE u.id=${user.vistaUserId}::uuid AND u.auth_user_id=${user.authUserId}::uuid AND u.password_change_required=true AND u.status='active' AND u.email IS NOT NULL
            AND (u.temporary_password_expires_at IS NULL OR u.temporary_password_expires_at>now()) FOR UPDATE OF u`;
        const row = rows[0];
        if (!row) throw new ConflictException("No first-login password change is pending.");
        try { await this.supabase.authenticateStudent(row.email, dto.currentPassword); }
        catch { throw new UnauthorizedException("Current temporary password is incorrect."); }
        await this.supabase.setStudentPassword(row.auth_user_id, dto.newPassword);
        authPasswordChanged = true;
        const changed = await tx.$queryRaw<Array<{ password_changed_at: Date }>>`UPDATE public.users SET password_changed_at=clock_timestamp(),updated_at=now() WHERE id=${row.id}::uuid RETURNING password_changed_at`;
        const at = changed[0]?.password_changed_at; if (!at) throw new ConflictException("Password change state could not be recorded.");
        // Access tokens carry iat with one-second precision: start the replacement session after the server-side cutoff.
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(at.getTime() / 1000) * 1000 + 1000 - Date.now())));
        const session = await this.supabase.authenticateStudent(row.email, dto.newPassword);
        const cleared = await tx.$executeRaw`UPDATE public.users SET password_change_required=false,temporary_password_expires_at=NULL,updated_at=now() WHERE id=${row.id}::uuid AND password_change_required=true`;
        if (cleared < 1) throw new ConflictException("Password change state could not be completed.");
        await tx.$executeRaw`INSERT INTO public.audit_logs(actor_user_id,action,target_type,target_id,details) VALUES(${row.id}::uuid,'account.first_login_password_changed','user',${row.id}::uuid,'{}'::jsonb)`;
        await this.supabase.revokeOtherSessions(session.access_token);
        return { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, expires_at: session.expires_at, token_type: session.token_type };
      }, FIRST_LOGIN_TX);
    } catch (error) {
      if (authPasswordChanged) { try { await this.supabase.setStudentPassword(user.authUserId, dto.currentPassword); } catch { /* an administrator can reset the temporary credentials */ } }
      throw error;
    }
  }
}
