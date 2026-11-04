import { createHash } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { StudentLoginDto } from "./dto/student-login.dto";
import { StudentSetupDto } from "./dto/student-setup.dto";
import { SupabaseAdminService, SupabasePasswordSession } from "./supabase-admin.service";

const INVALID_STUDENT_CREDENTIALS = "School code, student code, password, or setup code is invalid.";

@Injectable()
export class StudentAuthService {
  constructor(private readonly prisma: PrismaService, private readonly supabase: SupabaseAdminService) {}

  async login(dto: StudentLoginDto) {
    const student = await this.findStudent(dto.schoolCode, dto.studentCode);
    if (!student || student.status !== "active" || student.account_state !== "active" || !student.auth_user_id) {
      throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);
    }
    const internalEmail = this.internalEmail(student.user_id);
    try {
      const session = await this.supabase.authenticateStudent(internalEmail, dto.password);
      return this.publicSession(session);
    } catch {
      throw new UnauthorizedException(INVALID_STUDENT_CREDENTIALS);
    }
  }

  async setup(dto: StudentSetupDto) {
    const student = await this.findPendingStudent(dto.schoolCode, dto.studentCode, this.hashSetupCode(dto.setupCode));
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
        authUser = await this.supabase.createStudentIdentity(internalEmail, dto.password);
      }
    } catch {
      await this.releaseSetupCode(student.setup_token_id);
      throw new UnauthorizedException("Student account setup could not be completed.");
    }

    try {
      await this.prisma.$transaction(async tx => {
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

  private findStudent(schoolCode: string, studentCode: string) {
    return this.prisma.$queryRaw<StudentLoginRow[]>`
      SELECT u.id AS user_id, u.auth_user_id, u.status,
             p.account_state
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

  private hashSetupCode(code: string): string {
    return createHash("sha256").update(code.trim(), "utf8").digest("hex");
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

interface StudentLoginRow {
  user_id: string;
  auth_user_id: string | null;
  status: string;
  account_state: string;
}

interface PendingStudentRow {
  user_id: string;
  auth_user_id: string | null;
  organization_id: string;
  setup_token_id: string;
}