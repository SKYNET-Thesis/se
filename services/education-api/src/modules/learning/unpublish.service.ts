import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "./learning-scope.service";

/**
 * Withdrawal of published content. Only possible while NO learner evidence depends on it; otherwise the content must be archived/closed,
 * which keeps every grade, attempt and progress record intact. Nothing here deletes data.
 */
@Injectable()
export class UnpublishService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  /** published -> draft, only when the course has no school delivery (offering) and no enrollment. */
  async unpublishCourse(user: AuthenticatedUser, courseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; organization_id: string | null }>>`SELECT id, status, organization_id FROM public.learning_courses WHERE id=${courseId}::uuid FOR NO KEY UPDATE`;
      const course = rows[0];
      if (!course || !this.scope.canPublishOrganization(user, course.organization_id)) throw new NotFoundException("Course was not found.");
      if (course.status !== "published") throw new ConflictException("Only a published course can be unpublished.");
      const [dependents] = await tx.$queryRaw<Array<{ offerings: number; enrollments: number }>>`
        SELECT (SELECT count(*)::int FROM public.learning_course_offerings WHERE course_id=${courseId}::uuid) AS offerings,
               (SELECT count(*)::int FROM public.learning_enrollments WHERE course_id=${courseId}::uuid) AS enrollments`;
      if (dependents.offerings > 0 || dependents.enrollments > 0) {
        throw new ConflictException("This course is already delivered to a school or has enrolled learners. Archive it instead; learner records are kept.");
      }
      await tx.$executeRaw`UPDATE public.learning_courses SET status='draft', updated_at=now() WHERE id=${courseId}::uuid`;
      return { id: courseId, status: "draft" };
    });
  }

  /** published -> draft for one classroom delivery, only before any student has started an attempt. */
  async unpublishAssignment(user: AuthenticatedUser, classroomId: string, assignmentId: string) {
    await this.scope.assertTeacherClassroomAccess(user, classroomId);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM public.learning_classroom_assignments WHERE classroom_id=${classroomId}::uuid AND assignment_id=${assignmentId}::uuid FOR UPDATE`;
      const delivery = rows[0];
      if (!delivery) throw new NotFoundException("Assignment was not found.");
      if (delivery.status !== "published") throw new ConflictException("Only a published assignment can be unpublished.");
      const [attempts] = await tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM public.learning_assignment_attempts WHERE classroom_assignment_id=${delivery.id}::uuid`;
      if ((attempts?.n ?? 0) > 0) throw new ConflictException("Students have already started this assignment. Close it instead; their work and grades are kept.");
      await tx.$executeRaw`UPDATE public.learning_classroom_assignments SET status='draft' WHERE id=${delivery.id}::uuid`;
      return { id: delivery.id, status: "draft" };
    });
  }
}
