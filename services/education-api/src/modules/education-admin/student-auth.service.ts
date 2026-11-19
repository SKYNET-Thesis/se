import { createHash } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { StudentLoginDto } from "./dto/student-login.dto";
import { StudentSetupDto } from "./dto/student-setup.dto";
import { StudentPasswordRecoveryDto } from "./dto/student-password-recovery.dto";
import { StudentPasswordChangeDto } from "./dto/student-password-change.dto";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { Prisma } from "@prisma/client";
import { SupabaseAdminService, SupabasePasswordSession } from "./supabase-admin.service";
import { studentTempPasswordEnabled } from "./student-temp-password.feature";

const INVALID_STUDENT_CREDENTIALS = "School code, student code, password, or setup code is invalid.";

/**
 * The first-login change keeps its row lock open across four Supabase round trips (verify, set, sign in, revoke) plus the iat settle
 * delay. Prisma's default interactive-transaction timeout is 5 s, which a whole classroom changing passwords at once exceeds
 * (observed on Production: concurrent changes answered 500 and were compensated back to the temporary password). Give the transaction
 * room; the identity calls have their own network timeouts.
 */
export const FIRST_LOGIN_CHANGE_TRANSACTION = { maxWait: 15_000, timeout: 45_000 } as const;

@Injectable()
export class StudentAuthService {
  constructor(private readonly prisma: PrismaService, private readonly supabase: SupabaseAdminService) {}

  async login(dto: StudentLoginDto) {
    const student = await this.findStudent(dto.schoolCode, dto.studentCode);
    if (!student || student.status !== "active" || student.account_state !== "active" || !student.auth_user_id || (student.password_change_required && student.temporary_password_expires_at && new Date(student.temporary_password_expires_at).getTime() <= Date.now())) {
      throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);
    }
    const internalEmail = this.internalEmail(student.user_id);
    try {
      const session = await this.supabase.authenticateStudent(internalEmail, dto.password);
      return { ...this.publicSession(session), password_change_required: student.password_change_required };
    } catch {
      throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);
    }
  }

  async setup(dto: StudentSetupDto) {
    const student = await this.findPendingStudent(dto.schoolCode, dto.studentCode, this.hashOneTimeCode(dto.setupCode));
    if (!student) throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);
    const claimed = await this.prisma.$executeRaw`
      UPDATE public.auth_tokens
      SET used_at = now()
      WHERE id = ${student.setup_token_id}::uuid
        AND user_id = ${student.user_id}::uuid
        AND purpose = 'student_setup'
        AND used_at IS NULL
        AND expires_at > now()`;
    if (claimed !== 1) throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);

    const internalEmail = this.internalEmail(student.user_id);
    let authUser: { id: string };
    const createdIdentity = !student.auth_user_id;
    try {
      if (student.auth_user_id) {
        await this.supabase.replaceStudentLoginEmail(student.auth_user_id, internalEmail);
        await this.supabase.setStudentPassword(student.auth_user_id, dto.password);
        authUser = { id: student.auth_user_id };
      } else {
        // A stub left by an earlier failed activation would hold the alias email and make the provisioning trigger (and so the identity creation) fail.
        await this.removeLoginAliasStubs(this.prisma, internalEmail, student.user_id);
        authUser = await this.supabase.createStudentIdentity(internalEmail, dto.password);
      }
    } catch {
      await this.releaseSetupCode(student.setup_token_id);
      throw new UnauthorizedException("Student account setup could not be completed.");
    }

    try {
      await this.prisma.$transaction(async tx => {
        // The Supabase project provisions a public.users row for EVERY new Auth identity (trigger handle_new_auth_user). For a student that row is a
        // duplicate of the imported student's own row and holds the same auth_user_id, so it must go before the student row is linked to it.
        await this.removeLoginAliasStubs(tx, internalEmail, student.user_id);
        const linked = await tx.$executeRaw`
          UPDATE public.users
          SET auth_user_id = COALESCE(auth_user_id, ${authUser.id}::uuid), status = 'active'
          WHERE id = ${student.user_id}::uuid
            AND (auth_user_id IS NULL OR auth_user_id = ${authUser.id}::uuid)
            AND status <> 'disabled'`;
        if (linked !== 1) throw new UnauthorizedException("Student account setup could not be completed.");

        const activated = await tx.$executeRaw`
          UPDATE public.education_school_user_profiles
          SET account_state = 'active', updated_at = now()
          WHERE organization_id = ${student.organization_id}::uuid
            AND user_id = ${student.user_id}::uuid
            AND person_type = 'student'
            AND account_state IN ('account_setup_pending', 'invited')`;
        if (activated !== 1) throw new UnauthorizedException("Student account setup could not be completed.");
      });
    } catch {
      if (createdIdentity) {
        try { await this.supabase.deleteStudentIdentity(authUser.id); } catch {}
        try { await this.removeLoginAliasStubs(this.prisma, internalEmail, student.user_id); } catch {}
      }
      await this.releaseSetupCode(student.setup_token_id);
      throw new UnauthorizedException("Student account setup could not be completed.");
    }

    try {
      const session = await this.supabase.authenticateStudent(internalEmail, dto.password);
      return this.publicSession(session);
    } catch {
      throw new UnauthorizedException("Student account was created. Sign in with your school and student codes.");
    }
  }

  async changeFirstLoginPassword(user: AuthenticatedUser, dto: StudentPasswordChangeDto) {
    if (!studentTempPasswordEnabled()) throw new ConflictException("No first-login password change is pending.");
    if (dto.newPassword.length < 12) throw new UnauthorizedException("New password must be at least 12 characters.");
    if (dto.currentPassword === dto.newPassword) throw new UnauthorizedException("Choose a password different from the temporary password.");

    let authPasswordChanged = false;
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<FirstLoginStudent[]>`
          SELECT u.id AS user_id, u.auth_user_id
          FROM public.education_school_user_profiles p
          JOIN public.users u ON u.id = p.user_id
          WHERE p.user_id = ${user.vistaUserId}::uuid
            AND p.person_type = 'student'
            AND p.password_change_required = true
            AND u.auth_user_id = ${user.authUserId}::uuid
            AND u.status = 'active'
            AND p.account_state = 'active'
            AND (p.temporary_password_expires_at IS NULL OR p.temporary_password_expires_at > now())
          ORDER BY p.organization_id
          LIMIT 1
          FOR UPDATE OF p`;
        const student = rows[0];
        if (!student) throw new ConflictException("No first-login password change is pending.");

        const internalEmail = this.internalEmail(student.user_id);
        try {
          await this.supabase.authenticateStudent(internalEmail, dto.currentPassword);
        } catch {
          throw new UnauthorizedException("Current temporary password is incorrect.");
        }

        await this.supabase.setStudentPassword(student.auth_user_id, dto.newPassword);
        authPasswordChanged = true;
        const changed = await tx.$queryRaw<{ password_changed_at: Date }[]>`
          UPDATE public.education_school_user_profiles
          SET password_changed_at = clock_timestamp(), updated_at = now()
          WHERE user_id = ${student.user_id}::uuid AND person_type = 'student' AND password_change_required = true
          RETURNING password_changed_at`;
        const changedAt = changed[0]?.password_changed_at;
        if (!changedAt) throw new ConflictException("Password change state could not be recorded.");

        // Supabase access tokens carry iat (one-second precision). Ensure the replacement session starts after the server-side cutoff.
        const nextSecond = Math.floor(changedAt.getTime() / 1000) * 1000 + 1000;
        await new Promise(resolve => setTimeout(resolve, Math.max(0, nextSecond - Date.now())));
        const session = await this.supabase.authenticateStudent(internalEmail, dto.newPassword);
        const cleared = await tx.$executeRaw`
          UPDATE public.education_school_user_profiles
          SET password_change_required = false, temporary_password_expires_at = NULL, updated_at = now()
          WHERE user_id = ${student.user_id}::uuid AND person_type = 'student' AND password_change_required = true`;
        if (cleared < 1) throw new ConflictException("Password change state could not be completed.");
        // Real revocation of other sessions of this student (e.g. the one that signed in with the temporary password). The iat cutoff in the auth guard remains the server-side backstop.
        await this.supabase.revokeOtherSessions(session.access_token);
        return this.publicSession(session);
      }, FIRST_LOGIN_CHANGE_TRANSACTION);
    } catch (error) {
      if (authPasswordChanged) {
        // If local state persistence failed, restore the known temporary credential so the restricted flow remains recoverable.
        try { await this.supabase.setStudentPassword(user.authUserId, dto.currentPassword); } catch { /* Admin recovery can reissue credentials if compensation fails. */ }
      }
      throw error;
    }
  }

  async recover(dto: StudentPasswordRecoveryDto) {
    const student = await this.findPasswordRecoveryStudent(dto.schoolCode, dto.studentCode, this.hashOneTimeCode(dto.recoveryCode));
    if (!student) throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);
    const claimed = await this.prisma.$executeRaw`
      UPDATE public.auth_tokens
      SET used_at = now()
      WHERE id = ${student.recovery_token_id}::uuid
        AND user_id = ${student.user_id}::uuid
        AND purpose = 'password_reset'
        AND used_at IS NULL
        AND expires_at > now()`;
    if (claimed !== 1) throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);

    try {
      await this.supabase.setStudentPassword(student.auth_user_id, dto.password);
    } catch {
      throw new UnauthorizedException("Student password recovery could not be completed. Ask your school administrator for a new code.");
    }
    return { status: "password_updated" as const };
  }

  private findStudent(schoolCode: string, studentCode: string) {
    const temporaryColumns = studentTempPasswordEnabled()
      ? Prisma.sql`, (SELECT bool_or(p2.password_change_required) FROM public.education_school_user_profiles p2 WHERE p2.user_id = u.id AND p2.person_type = 'student') AS password_change_required,
             (SELECT MIN(p3.temporary_password_expires_at) FROM public.education_school_user_profiles p3 WHERE p3.user_id=u.id AND p3.person_type='student' AND p3.password_change_required=true) AS temporary_password_expires_at`
      : Prisma.sql`, false AS password_change_required, NULL::timestamptz AS temporary_password_expires_at`;
    return this.prisma.$queryRaw<StudentLoginRow[]>`
      SELECT u.id AS user_id, u.auth_user_id, u.status,
             p.account_state${temporaryColumns}
      FROM public.organizations o
      JOIN public.education_school_user_profiles p ON p.organization_id = o.id
      JOIN public.users u ON u.id = p.user_id
      WHERE upper(o.school_code) = upper(${schoolCode.trim()})
        AND upper(p.student_code) = upper(${studentCode.trim()})
        AND p.person_type = 'student'
        AND o.status = 'active'
      LIMIT 1
    `.then(rows => rows[0]);
  }

  private findPendingStudent(schoolCode: string, studentCode: string, setupCodeHash: string) {
    return this.prisma.$queryRaw<PendingStudentRow[]>`
      SELECT u.id AS user_id, u.auth_user_id, o.id AS organization_id, t.id AS setup_token_id
      FROM public.organizations o
      JOIN public.education_school_user_profiles p ON p.organization_id = o.id
      JOIN public.users u ON u.id = p.user_id
      JOIN public.auth_tokens t ON t.user_id = u.id
      WHERE upper(o.school_code) = upper(${schoolCode.trim()})
        AND upper(p.student_code) = upper(${studentCode.trim()})
        AND p.person_type = 'student'
        AND p.account_state IN ('account_setup_pending', 'invited')
        AND u.status IN ('invited', 'active')
        AND o.status = 'active'
        AND t.purpose = 'student_setup'
        AND t.token_hash = ${setupCodeHash}
        AND t.used_at IS NULL
        AND t.expires_at > now()
      LIMIT 1
    `.then(rows => rows[0]);
  }

  private findPasswordRecoveryStudent(schoolCode: string, studentCode: string, recoveryCodeHash: string) {
    return this.prisma.$queryRaw<RecoverableStudent[]>`
      SELECT u.id AS user_id, u.auth_user_id, t.id AS recovery_token_id
      FROM public.organizations o
      JOIN public.education_school_user_profiles p ON p.organization_id = o.id
      JOIN public.users u ON u.id = p.user_id
      JOIN public.memberships m ON m.organization_id = o.id AND m.user_id = u.id
      JOIN public.roles r ON r.id = m.role_id
      JOIN public.auth_tokens t ON t.user_id = u.id
      WHERE upper(o.school_code) = upper(${schoolCode.trim()})
        AND upper(p.student_code) = upper(${studentCode.trim()})
        AND p.person_type = 'student'
        AND p.account_state = 'active'
        AND u.status = 'active'
        AND u.auth_user_id IS NOT NULL
        AND m.status = 'active'
        AND r.code = 'student'
        AND o.status = 'active'
        AND t.purpose = 'password_reset'
        AND t.token_hash = ${recoveryCodeHash}
        AND t.used_at IS NULL
        AND t.expires_at > now()
      LIMIT 1
    `.then(rows => rows[0]);
  }

  private hashOneTimeCode(code: string): string {
    return createHash("sha256").update(code.trim(), "utf8").digest("hex");
  }

  /**
   * Removes the public.users row that the Auth provisioning trigger creates for a student's alias identity. Deliberately narrow: only a row that
   * (a) carries this student's alias email, (b) is not the student's own row, (c) was self-registered by the trigger and (d) has no membership and no
   * school profile. Anything else is left untouched and the activation fails closed.
   */
  private removeLoginAliasStubs(client: Pick<PrismaService, "$executeRaw">, internalEmail: string, studentUserId: string) {
    return client.$executeRaw`
      DELETE FROM public.users s
      WHERE lower(s.email) = lower(${internalEmail})
        AND s.id <> ${studentUserId}::uuid
        AND s.signup_method = 'self_registered'
        AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM public.education_school_user_profiles p WHERE p.user_id = s.id)`;
  }

  private releaseSetupCode(tokenId: string) {
    return this.prisma.$executeRaw`
      UPDATE public.auth_tokens
      SET used_at = NULL
      WHERE id = ${tokenId}::uuid AND purpose = 'student_setup'`;
  }

  private internalEmail(userId: string): string {
    return `student-${userId}@students.auth.vista.invalid`;
  }

  private publicSession(session: SupabasePasswordSession) {
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
    };
  }
}

interface FirstLoginStudent { user_id: string; auth_user_id: string; }

interface StudentLoginRow {
  user_id: string;
  auth_user_id: string | null;
  status: string;
  account_state: string;
  password_change_required: boolean;
  temporary_password_expires_at: Date | string | null;
}

interface PendingStudentRow {
  user_id: string;
  auth_user_id: string | null;
  organization_id: string;
  setup_token_id: string;
}

interface RecoverableStudent {
  user_id: string;
  auth_user_id: string;
  recovery_token_id: string;
}