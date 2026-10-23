import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning/learning-scope.service";
import { ImportClassroomStudentsDto } from "./dto/import-classroom-students.dto";
import { ImportSchoolUserRowDto } from "./dto/import-school-users.dto";
import { classifyImportError, ImportProvisioningError, type ImportErrorCode } from "./import-errors";
import { StudentProvisioningService } from "./student-provisioning.service";

export type ClassroomStudentPreviewStatus = "new_student" | "existing_student" | "already_in_class" | "needs_review";
export interface ClassroomStudentPreviewRow {
  row: number;
  firstName: string;
  lastName: string;
  studentCode: string;
  gradeLevel: string;
  email: string | null;
  status: ClassroomStudentPreviewStatus;
  errors: string[];
  warnings: string[];
}
interface ResolvedStudent {
  code: string;
  userId: string;
  membershipId: string;
  roleCode: string;
  fullName: string;
  email: string | null;
  gradeLevel: string | null;
  guardianEmail: string | null;
  classroomMemberId: string | null;
}

@Injectable()
export class ClassroomStudentImportService {
  private readonly logger = new Logger(ClassroomStudentImportService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: LearningScopeService,
    private readonly studentProvisioning: StudentProvisioningService,
  ) {}

  async preview(user: AuthenticatedUser, organizationId: string, classroomId: string, dto: ImportClassroomStudentsDto) {
    await this.assertClassroomAccess(user, organizationId, classroomId);
    const prepared = this.prepare(dto.rows);
    const validCodes = [...new Set(prepared.filter(item => item.errors.length === 0).map(item => item.code))];
    const existing = await this.resolveStudents(organizationId, classroomId, validCodes);
    const byCode = new Map(existing.map(student => [student.code, student]));
    const rows: ClassroomStudentPreviewRow[] = prepared.map(item => {
      const student = byCode.get(item.code);
      const errors = student && student.roleCode !== "student" ? [...item.errors, "Existing school record is not an active student."] : item.errors;
      const warnings = student && this.profileDiffers(student, item.row) ? ["Profile data differs from CSV."] : [];
      const status: ClassroomStudentPreviewStatus = errors.length > 0
        ? "needs_review"
        : student?.classroomMemberId
          ? "already_in_class"
          : student
            ? "existing_student"
            : "new_student";
      return {
        row: item.index + 2,
        firstName: item.row.firstName?.trim() ?? "",
        lastName: item.row.lastName?.trim() ?? "",
        studentCode: item.row.studentCode?.trim() ?? "",
        gradeLevel: item.row.gradeLevel?.trim() ?? "",
        email: item.row.email?.trim().toLowerCase() || null,
        status,
        errors,
        warnings,
      };
    });
    return {
      processed: rows.length,
      newStudents: rows.filter(item => item.status === "new_student").length,
      existingStudents: rows.filter(item => item.status === "existing_student").length,
      alreadyInClass: rows.filter(item => item.status === "already_in_class").length,
      needsReview: rows.filter(item => item.status === "needs_review").length,
      rows,
    };
  }

  async confirm(user: AuthenticatedUser, organizationId: string, classroomId: string, dto: ImportClassroomStudentsDto) {
    await this.assertClassroomAccess(user, organizationId, classroomId);
    const prepared = this.prepare(dto.rows);
    const validCodes = [...new Set(prepared.filter(item => item.errors.length === 0).map(item => item.code))];
    const existing = await this.resolveStudents(organizationId, classroomId, validCodes);
    const byCode = new Map(existing.map(student => [student.code, student]));
    const results: Array<{ row: number; status: "created_and_added" | "existing_added" | "unchanged" | "failed"; code?: ImportErrorCode; message?: string; name: string; studentCode?: string }> = [];

    for (const item of prepared) {
      const name = `${item.row.firstName ?? ""} ${item.row.lastName ?? ""}`.trim();
      const base = { row: item.index + 2, name, studentCode: item.row.studentCode };
      if (item.errors.length > 0) {
        results.push({ ...base, status: "failed", code: "VALIDATION_ERROR", message: item.errors.join(" ") });
        continue;
      }
      const student = byCode.get(item.code);
      if (student && student.roleCode !== "student") {
        results.push({ ...base, status: "failed", code: "VALIDATION_ERROR", message: "Existing school record is not an active student." });
        continue;
      }
      if (student?.classroomMemberId) {
        results.push({ ...base, status: "unchanged" });
        continue;
      }
      try {
        if (student) {
          await this.studentProvisioning.addExistingStudentToClassroom({ userId: student.userId, membershipId: student.membershipId }, classroomId);
          results.push({ ...base, status: "existing_added" });
        } else {
          await this.studentProvisioning.provision(organizationId, item.row, classroomId);
          results.push({ ...base, status: "created_and_added" });
        }
      } catch (error) {
        const safe = classifyImportError(error);
        this.logger.error({ event: "classroom_student_import_failed", row: item.index + 2, organizationId, classroomId, identifier: item.row.studentCode, code: safe.code, error: error instanceof ImportProvisioningError ? error.internalDetail : error instanceof Error ? error.message : String(error) });
        results.push({ ...base, status: "failed", ...safe });
      }
    }

    return {
      processed: results.length,
      createdAndAdded: results.filter(item => item.status === "created_and_added").length,
      existingAdded: results.filter(item => item.status === "existing_added").length,
      unchanged: results.filter(item => item.status === "unchanged").length,
      failed: results.filter(item => item.status === "failed").length,
      results,
    };
  }

  private prepare(rows: ImportSchoolUserRowDto[]) {
    const codes = rows.map(row => row.studentCode?.trim().toLowerCase() ?? "");
    const emails = rows.map(row => row.email?.trim().toLowerCase() ?? "");
    const codeCounts = new Map<string, number>(); const emailCounts = new Map<string, number>();
    codes.filter(Boolean).forEach(code => codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1));
    emails.filter(Boolean).forEach(email => emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1));
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return rows.map((row, index) => {
      const code = codes[index];
      const email = emails[index];
      const guardianEmail = row.guardianEmail?.trim().toLowerCase() ?? "";
      const errors: string[] = [];
      if (!row.firstName?.trim()) errors.push("First name is required.");
      if (!row.lastName?.trim()) errors.push("Last name is required.");
      if (!code) errors.push("Student code is required.");
      if (!row.gradeLevel?.trim()) errors.push("Grade level is required.");
      if (email && !emailPattern.test(email)) errors.push("Email is malformed.");
      if (guardianEmail && !emailPattern.test(guardianEmail)) errors.push("Guardian email is malformed.");
      if (code && (codeCounts.get(code) ?? 0) > 1) errors.push("Duplicate student code in upload.");
      if (email && (emailCounts.get(email) ?? 0) > 1) errors.push("Duplicate email in upload.");
      return { row, index, code, errors };
    });
  }

  private async resolveStudents(organizationId: string, classroomId: string, codes: string[]) {
    if (codes.length === 0) return [] as ResolvedStudent[];
    return this.prisma.$queryRaw<ResolvedStudent[]>`
      SELECT lower(p.student_code) AS code,
             p.user_id AS "userId",m.id AS "membershipId",r.code AS "roleCode",u.full_name AS "fullName",u.email,
             p.grade_level AS "gradeLevel",p.guardian_email AS "guardianEmail",cm.id AS "classroomMemberId"
      FROM public.education_school_user_profiles p
      JOIN public.users u ON u.id=p.user_id
      JOIN public.memberships m ON m.organization_id=p.organization_id AND m.user_id=p.user_id AND m.status='active'
      JOIN public.roles r ON r.id=m.role_id
      LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=${classroomId}::uuid AND cm.user_id=p.user_id AND cm.status='active'
      WHERE p.organization_id=${organizationId}::uuid AND p.person_type='student'
        AND lower(p.student_code)=ANY(${codes}::text[])`;
  }

  private profileDiffers(existing: ResolvedStudent, row: ImportSchoolUserRowDto) {
    const fullName = `${row.firstName?.trim() ?? ""} ${row.lastName?.trim() ?? ""}`.trim().toLowerCase();
    return existing.fullName.trim().toLowerCase() !== fullName
      || (existing.gradeLevel ?? "").trim().toLowerCase() !== (row.gradeLevel ?? "").trim().toLowerCase()
      || (existing.email ?? "").trim().toLowerCase() !== (row.email ?? "").trim().toLowerCase()
      || (existing.guardianEmail ?? "").trim().toLowerCase() !== (row.guardianEmail ?? "").trim().toLowerCase();
  }

  private async assertClassroomAccess(user: AuthenticatedUser, organizationId: string, classroomId: string) {
    if (!this.scope.isSystemAdministrator(user)) {
      const membership = user.memberships.find(item => item.organizationId === organizationId && item.status === "active");
      if (!membership?.permissions.includes("education.classroom.members.manage") || !membership.permissions.includes("education.members.provision")) {
        throw new NotFoundException("Classroom was not found.");
      }
    }
    const classroom = await this.prisma.learning_classrooms.findFirst({ where: { id: classroomId, organization_id: organizationId }, select: { id: true } });
    if (!classroom) throw new NotFoundException("Classroom was not found.");
  }
}
