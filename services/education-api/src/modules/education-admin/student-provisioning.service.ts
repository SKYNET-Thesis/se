import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { ImportSchoolUserRowDto } from "./dto/import-school-users.dto";
import { ImportProvisioningError } from "./import-errors";

const SETUP_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class StudentProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provision(organizationId: string, row: ImportSchoolUserRowDto, classroomId?: string) {
    const email = row.email?.trim().toLowerCase() || null;
    const fullName = `${row.firstName.trim()} ${row.lastName.trim()}`;
    const studentCode = row.studentCode!.trim().toUpperCase();

    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${studentCode.toLowerCase()}))`;
      const existing = (await tx.$queryRaw<ExistingStudent[]>`
        SELECT p.user_id, u.auth_user_id, p.account_state,
          EXISTS (
            SELECT 1 FROM public.auth_tokens t
            WHERE t.user_id=u.id AND t.purpose='student_setup'
              AND t.used_at IS NULL AND t.expires_at > now()
          ) AS has_live_setup_code
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
}
