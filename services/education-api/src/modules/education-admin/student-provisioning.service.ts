import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { ImportSchoolUserRowDto } from "./dto/import-school-users.dto";
import { ImportProvisioningError } from "./import-errors";
import { SupabaseAdminService } from "./supabase-admin.service";

const SETUP_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TEMP_PASSWORD_TTL_HOURS = 72;

export interface StudentProvisionResult {
  userId: string;
  status: "created" | "unchanged";
  setupCode?: string;
  temporaryPassword?: string;
  temporaryPasswordExpiresAt?: string;
  credentialProvisioningPending?: boolean;
}

@Injectable()
@Injectable()
export class StudentProvisioningService {
  constructor(private readonly prisma: PrismaService, private readonly supabase: SupabaseAdminService, private readonly config: ConfigService) {}

  async provision(organizationId: string, row: ImportSchoolUserRowDto, classroomId?: string): Promise<StudentProvisionResult> {
    const email = row.email?.trim().toLowerCase() || null;
    const fullName = `${row.firstName.trim()} ${row.lastName.trim()}`;
    const studentCode = row.studentCode!.trim().toUpperCase();

    if (this.temporaryPasswordEnabled()) return this.provisionWithTemporaryPassword(organizationId, row, studentCode, email, fullName, classroomId);

    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${studentCode.toLowerCase()}))`;
      const existing = (await tx.$queryRaw<ExistingStudent[]>`
        SELECT p.user_id, u.auth_user_id, p.account_state,
          EXISTS (SELECT 1 FROM public.auth_tokens t WHERE t.user_id=u.id AND t.purpose='student_setup' AND t.used_at IS NULL AND t.expires_at > now()) AS has_live_setup_code
        FROM public.education_school_user_profiles p
        JOIN public.users u ON u.id=p.user_id
        WHERE p.organization_id=${organizationId}::uuid
          AND p.person_type='student'
          AND upper(p.student_code)=upper(${studentCode})
        LIMIT 1
        FOR UPDATE OF p`)[0];

      if (existing) {
        const requiresSetup = existing.account_state === "account_setup_pending" || existing.account_state === "invited";
        const setupCode = requiresSetup && !existing.has_live_setup_code
          ? await this.issueSetupCode(tx, existing.user_id)
          : undefined;
        if (classroomId) await this.addClassroomMembership(tx, existing.user_id, organizationId, classroomId);
        return { userId: existing.user_id, status: "unchanged" as const, setupCode };
      }

      const users = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public.users(email,full_name,status,signup_method)
        VALUES(${email},${fullName},'invited','admin_created')
        RETURNING id`;
      const userId = users[0]?.id;
      if (!userId) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Domain user insert returned no row.");
      const memberships = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public.memberships(user_id,organization_id,role_id,status)
        SELECT ${userId}::uuid,${organizationId}::uuid,r.id,'active' FROM public.roles r WHERE r.code='student'
        ON CONFLICT(user_id,organization_id) DO UPDATE SET role_id=EXCLUDED.role_id,status='active'
        RETURNING id`;
      const membershipId = memberships[0]?.id;
      if (!membershipId) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Student membership insert returned no row.");
      await tx.$executeRaw`
        INSERT INTO public.education_school_user_profiles(organization_id,user_id,person_type,student_code,grade_level,guardian_email,account_state)
        VALUES(${organizationId}::uuid,${userId}::uuid,'student',${studentCode},${row.gradeLevel?.trim() || null},${row.guardianEmail?.trim().toLowerCase() || null},'account_setup_pending')`;
      if (classroomId) await this.addClassroomMembership(tx, userId, organizationId, classroomId, membershipId);
      const setupCode = await this.issueSetupCode(tx, userId);
      return { userId, status: "created" as const, setupCode };
    });
  }

  private async provisionWithTemporaryPassword(organizationId: string, row: ImportSchoolUserRowDto, studentCode: string, email: string | null, fullName: string, classroomId?: string) {
    const claimToken = randomUUID();
    const claim = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${studentCode.toLowerCase()}))`;
      const existing = (await tx.$queryRaw<ExistingStudent[]>`
        SELECT p.user_id, u.auth_user_id, p.account_state,
          EXISTS (SELECT 1 FROM public.auth_tokens t WHERE t.user_id=u.id AND t.purpose='student_setup' AND t.used_at IS NULL AND t.expires_at > now()) AS has_live_setup_code,
          p.password_change_required, p.provisioning_claim_token,
          (p.provisioning_lease_until > now()) AS provisioning_lease_active
        FROM public.education_school_user_profiles p JOIN public.users u ON u.id=p.user_id
        WHERE p.organization_id=${organizationId}::uuid AND p.person_type='student' AND upper(p.student_code)=upper(${studentCode})
        LIMIT 1 FOR UPDATE OF p`)[0];
      if (existing) {
        if (existing.provisioning_claim_token) { // in-progress provisioning is "invited" + a claim token (account_state has no separate provisioning value)
          if (existing.provisioning_lease_active) return { kind: "unchanged" as const, userId: existing.user_id, credentialProvisioningPending: true };
          await tx.$executeRaw`
            UPDATE public.education_school_user_profiles
            SET provisioning_claim_token=${claimToken}::uuid,provisioning_lease_until=now()+interval '1 hour',updated_at=now()
            WHERE organization_id=${organizationId}::uuid AND user_id=${existing.user_id}::uuid AND account_state='invited' AND provisioning_claim_token IS NOT NULL`;
          return { kind: "claimed" as const, userId: existing.user_id, authUserId: existing.auth_user_id, membershipId: null as string | null };
        }
        const requiresSetup = existing.account_state === "account_setup_pending" || existing.account_state === "invited";
        const setupCode = requiresSetup && !existing.has_live_setup_code ? await this.issueSetupCode(tx, existing.user_id) : undefined;
        if (classroomId) await this.addClassroomMembership(tx, existing.user_id, organizationId, classroomId);
        return { kind: "unchanged" as const, userId: existing.user_id, setupCode };
      }

      const userRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public.users(email,full_name,status,signup_method)
        VALUES(${email},${fullName},'invited','admin_created') RETURNING id`;
      const userId = userRows[0]?.id;
      if (!userId) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Student record could not be created.");
      const memberships = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public.memberships(user_id,organization_id,role_id,status)
        SELECT ${userId}::uuid,${organizationId}::uuid,r.id,'active' FROM public.roles r WHERE r.code='student'
        ON CONFLICT(user_id,organization_id) DO UPDATE SET role_id=EXCLUDED.role_id,status='active' RETURNING id`;
      const membershipId = memberships[0]?.id;
      if (!membershipId) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Student membership could not be created.");
      await tx.$executeRaw`
        INSERT INTO public.education_school_user_profiles(organization_id,user_id,person_type,student_code,grade_level,guardian_email,account_state,provisioning_claim_token,provisioning_lease_until)
        VALUES(${organizationId}::uuid,${userId}::uuid,'student',${studentCode},${row.gradeLevel?.trim() || null},${row.guardianEmail?.trim().toLowerCase() || null},'invited',${claimToken}::uuid,now()+interval '1 hour')`;
      return { kind: "claimed" as const, userId, authUserId: null, membershipId };
    });
    if (claim.kind === "unchanged") return { userId: claim.userId, status: "unchanged" as const, setupCode: claim.setupCode, credentialProvisioningPending: claim.credentialProvisioningPending };

    const temporaryPassword = randomBytes(24).toString("base64url");
    const expiresAt = this.temporaryPasswordExpiry();
    const alias = this.internalEmail(claim.userId);
    const identity = await this.supabase.createStudentIdentityIfMissing(alias, temporaryPassword);
    if (identity.created) {
      // New Auth users normally have a trigger-created public.users stub. If the trigger is absent, identity ownership is still safe because the alias is UUID-derived and the app row is currently unlinked.
    } else {
      const orphan = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM public.users s WHERE s.auth_user_id=${identity.user.id}::uuid AND lower(s.email)=lower(${alias})
          AND s.signup_method='self_registered'
          AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id=s.id)
          AND NOT EXISTS (SELECT 1 FROM public.education_school_user_profiles p WHERE p.user_id=s.id)
        LIMIT 1`;
      const alreadyLinked = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM public.users WHERE id=${claim.userId}::uuid AND auth_user_id=${identity.user.id}::uuid AND status='invited' LIMIT 1`;
      if (!orphan[0] && !alreadyLinked[0]) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Student identity is already linked to another account.");
      if (!alreadyLinked[0]) await this.supabase.setStudentPassword(identity.user.id, temporaryPassword);
    }

    const finalized = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${studentCode.toLowerCase()}))`;
      const owned = await tx.$queryRaw<{ user_id: string }[]>`
        SELECT user_id FROM public.education_school_user_profiles
        WHERE organization_id=${organizationId}::uuid AND user_id=${claim.userId}::uuid AND person_type='student'
          AND account_state='invited' AND provisioning_claim_token=${claimToken}::uuid
          AND provisioning_lease_until > now() FOR UPDATE`;
      if (!owned[0]) return false;
      await tx.$executeRaw`
        DELETE FROM public.users s WHERE lower(s.email)=lower(${alias}) AND s.id<>${claim.userId}::uuid
          AND s.signup_method='self_registered'
          AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id=s.id)
          AND NOT EXISTS (SELECT 1 FROM public.education_school_user_profiles p WHERE p.user_id=s.id)`;
      const linked = await tx.$executeRaw`
        UPDATE public.users SET auth_user_id=${identity.user.id}::uuid,status='active'
        WHERE id=${claim.userId}::uuid AND (auth_user_id IS NULL OR auth_user_id=${identity.user.id}::uuid) AND status='invited'`;
      if (linked !== 1) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Student identity could not be linked.");
      await tx.$executeRaw`
        UPDATE public.memberships SET status='active' WHERE user_id=${claim.userId}::uuid AND organization_id=${organizationId}::uuid AND status='invited'`;
      const activated = await tx.$executeRaw`
        UPDATE public.education_school_user_profiles
        SET account_state='active',password_change_required=true,temporary_password_expires_at=${expiresAt},
            provisioning_claim_token=NULL,provisioning_lease_until=NULL,updated_at=now()
        WHERE organization_id=${organizationId}::uuid AND user_id=${claim.userId}::uuid AND person_type='student'
          AND account_state='invited' AND provisioning_claim_token=${claimToken}::uuid`;
      if (activated !== 1) throw new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "Student account could not be activated.");
      if (classroomId) await this.addClassroomMembership(tx, claim.userId, organizationId, classroomId, claim.membershipId ?? undefined);
      return true;
    });
    if (!finalized) return { userId: claim.userId, status: "unchanged" as const };
    return { userId: claim.userId, status: "created" as const, temporaryPassword, temporaryPasswordExpiresAt: expiresAt.toISOString() };
  }

  async reissueTemporaryPassword(organizationId: string, studentId: string, actorUserId: string) {
    if (!this.temporaryPasswordEnabled()) throw new ForbiddenException("Temporary student credentials are not enabled.");
    this.consumeReissueAllowance(actorUserId);
    const temporaryPassword = randomBytes(24).toString("base64url");
    const expiresAt = this.temporaryPasswordExpiry();
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${studentId}), hashtext('temporary-password-reissue'))`;
      const rows = await tx.$queryRaw<Array<{ auth_user_id: string; user_id: string }>>`
        SELECT u.auth_user_id,p.user_id FROM public.education_school_user_profiles p JOIN public.users u ON u.id=p.user_id
        WHERE p.organization_id=${organizationId}::uuid AND p.user_id=${studentId}::uuid AND p.person_type='student'
          AND p.account_state='active' AND p.password_change_required=true AND u.status='active' AND u.auth_user_id IS NOT NULL
        FOR UPDATE OF p`;
      const student = rows[0];
      if (!student) throw new NotFoundException("A pending student account was not found.");
      // The profile is still forced into password change; even if the provider update succeeds and the DB commit fails,
      // no ordinary VISTA route becomes available and a subsequent explicit reissue can recover the account.
      await this.supabase.setStudentPassword(student.auth_user_id, temporaryPassword);
      await tx.$executeRaw`
        UPDATE public.education_school_user_profiles
        SET temporary_password_expires_at=${expiresAt},password_changed_at=clock_timestamp(),updated_at=now()
        WHERE user_id=${student.user_id}::uuid AND person_type='student' AND password_change_required=true`;
      await tx.$executeRaw`
        INSERT INTO public.audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
        VALUES(${actorUserId}::uuid,${organizationId}::uuid,'student.temporary_password.reissued','student',${studentId}::uuid,
          jsonb_build_object('expiresAt',${expiresAt}))`;
      const cutoff = Date.now() - (Date.now() % 1000) + 1000;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, cutoff - Date.now())));
      return { studentId, temporaryPassword, temporaryPasswordExpiresAt: expiresAt.toISOString() };
    });
  }

  /**
   * At most 5 reissues per administrator per hour. The runtime database role may only INSERT into audit_logs (migration L),
   * so the limit is an in-process sliding window (per API instance) rather than a count over the audit table.
   */
  private readonly reissueWindow = new Map<string, number[]>();
  private consumeReissueAllowance(actorUserId: string) {
    const now = Date.now();
    const recent = (this.reissueWindow.get(actorUserId) ?? []).filter(at => now - at < 60 * 60 * 1000);
    if (recent.length >= 5) throw new HttpException("Temporary password reissue limit reached.", HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.reissueWindow.set(actorUserId, recent);
    if (this.reissueWindow.size > 5000) for (const [key, times] of this.reissueWindow) if (!times.some(at => now - at < 60 * 60 * 1000)) this.reissueWindow.delete(key);
  }

  private temporaryPasswordEnabled() { return this.config.get<string>("STUDENT_TEMP_PASSWORD_ENABLED")?.toLowerCase() === "true"; }

  private temporaryPasswordExpiry() {
    const configured = Number(this.config.get<string>("STUDENT_TEMP_PASSWORD_TTL_HOURS") ?? DEFAULT_TEMP_PASSWORD_TTL_HOURS);
    const hours = Number.isFinite(configured) && configured >= 1 && configured <= 720 ? configured : DEFAULT_TEMP_PASSWORD_TTL_HOURS;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private internalEmail(userId: string) { return `student-${userId}@students.auth.vista.invalid`; }


  private async issueSetupCode(tx: Prisma.TransactionClient, userId: string): Promise<string> {
    const code = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(code, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + SETUP_CODE_TTL_MS);
    await tx.$executeRaw`
      INSERT INTO public.auth_tokens(user_id,purpose,token_hash,expires_at)
      VALUES(${userId}::uuid,'student_setup',${tokenHash},${expiresAt})`;
    return code;
  }

  private async addClassroomMembership(tx: Prisma.TransactionClient, userId: string, organizationId: string, classroomId: string, membershipId?: string) {
    if (membershipId) {
      await tx.$executeRaw`
        INSERT INTO public.learning_classroom_members(classroom_id,user_id,membership_id,classroom_role,status,joined_at)
        VALUES(${classroomId}::uuid,${userId}::uuid,${membershipId}::uuid,'student','active',now())
        ON CONFLICT(classroom_id,user_id) DO UPDATE SET membership_id=EXCLUDED.membership_id,classroom_role='student',status='active',left_at=NULL`;
      return;
    }
    await tx.$executeRaw`
      INSERT INTO public.learning_classroom_members(classroom_id,user_id,membership_id,classroom_role,status,joined_at)
      SELECT ${classroomId}::uuid,${userId}::uuid,m.id,'student','active',now()
      FROM public.memberships m
      WHERE m.user_id=${userId}::uuid AND m.organization_id=${organizationId}::uuid
      ON CONFLICT(classroom_id,user_id) DO UPDATE SET membership_id=EXCLUDED.membership_id,classroom_role='student',status='active',left_at=NULL`;
  }

  async addExistingStudentToClassroom(student: { userId: string; membershipId: string }, classroomId: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO public.learning_classroom_members(classroom_id,user_id,membership_id,classroom_role,status,joined_at)
        VALUES(${classroomId}::uuid,${student.userId}::uuid,${student.membershipId}::uuid,'student','active',now())
        ON CONFLICT(classroom_id,user_id) DO UPDATE SET membership_id=EXCLUDED.membership_id,classroom_role='student',status='active',left_at=NULL`;
    });
  }
}

interface ExistingStudent {
  user_id: string;
  auth_user_id: string | null;
  account_state: string;
  has_live_setup_code: boolean;
  password_change_required?: boolean;
  provisioning_claim_token?: string | null;
  provisioning_lease_active?: boolean;
}
