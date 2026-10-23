import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { ImportSchoolUserRowDto } from "./dto/import-school-users.dto";
import { ImportProvisioningError } from "./import-errors";
import { SupabaseAdminService } from "./supabase-admin.service";

@Injectable()
export class StudentProvisioningService {
  constructor(private readonly prisma: PrismaService, private readonly supabaseAdmin: SupabaseAdminService) {}

  async provision(organizationId: string, row: ImportSchoolUserRowDto, classroomId?: string) {
    const email = row.email?.trim().toLowerCase() || null;
    const fullName = `${row.firstName.trim()} ${row.lastName.trim()}`;
    const studentCode = row.studentCode!.trim();
    const authUserId = email ? (await this.supabaseAdmin.invite(email, fullName)).id : null;
    const accountState = email ? "invited" : "account_setup_pending";

    return this.prisma.$transaction(async tx => {
      const users = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public.users(auth_user_id,email,full_name,status,signup_method)
        VALUES(${authUserId}::uuid,${email},${fullName},'invited','admin_created')
        ON CONFLICT (auth_user_id) DO UPDATE SET full_name=EXCLUDED.full_name
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
        VALUES(${organizationId}::uuid,${userId}::uuid,'student',${studentCode},${row.gradeLevel?.trim() || null},${row.guardianEmail?.trim().toLowerCase() || null},${accountState})
        ON CONFLICT(organization_id,user_id) DO UPDATE SET student_code=EXCLUDED.student_code,grade_level=EXCLUDED.grade_level,guardian_email=EXCLUDED.guardian_email,account_state=EXCLUDED.account_state,updated_at=now()`;
      if (classroomId) await tx.$executeRaw`
        INSERT INTO public.learning_classroom_members(classroom_id,user_id,membership_id,classroom_role,status,joined_at)
        VALUES(${classroomId}::uuid,${userId}::uuid,${membershipId}::uuid,'student','active',now())
        ON CONFLICT(classroom_id,user_id) DO UPDATE SET membership_id=EXCLUDED.membership_id,classroom_role='student',status='active',left_at=NULL`;
      return { userId };
    });
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
