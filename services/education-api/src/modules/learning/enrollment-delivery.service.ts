import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

/** Owns the classroom-scoped enrollment lifecycle; learning history is never deleted here. */
@Injectable()
export class EnrollmentDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async synchronizeClassroom(classroomId: string) {
    return this.prisma.$transaction(async (tx) => {
      const course = await tx.$queryRaw<Array<{ course_id: string }>>`
        SELECT o.course_id
        FROM public.learning_classrooms c
        JOIN public.learning_course_offerings o ON o.id=c.offering_id
        JOIN public.learning_courses course ON course.id=o.course_id AND course.status='published'
        WHERE c.id=${classroomId}::uuid AND c.status='active' AND o.status='active'`;
      if (!course[0]) throw new NotFoundException('An active published classroom course was not found.');

      return tx.$queryRaw`
        WITH active_students AS (
          SELECT cm.user_id
          FROM public.learning_classroom_members cm
          JOIN public.learning_classrooms c ON c.id=cm.classroom_id
          JOIN public.memberships m ON m.id=cm.membership_id
          WHERE cm.classroom_id=${classroomId}::uuid
            AND cm.classroom_role='student' AND cm.status='active'
            AND c.status='active' AND m.status='active' AND m.organization_id=c.organization_id
        ), enrolled AS (
          INSERT INTO public.learning_enrollments(course_id, learner_user_id, offering_id, classroom_id, status, enrolled_at)
          SELECT ${course[0].course_id}::uuid, s.user_id, c.offering_id, c.id, 'active', now()
          FROM active_students s JOIN public.learning_classrooms c ON c.id=${classroomId}::uuid
          ON CONFLICT (course_id, learner_user_id, classroom_id)
          DO UPDATE SET status='active', offering_id=EXCLUDED.offering_id
          RETURNING id, learner_user_id, status
        ), initialized_progress AS (
          INSERT INTO public.learning_lesson_progress(learner_user_id, lesson_id, status, progress_percent)
          SELECT s.user_id, l.id, 'not_started', 0
          FROM active_students s JOIN public.learning_lessons l ON l.course_id=${course[0].course_id}::uuid
          ON CONFLICT (learner_user_id, lesson_id) DO NOTHING
        ) SELECT id, learner_user_id, status FROM enrolled`;
    });
  }

  async revokeClassroomEnrollment(classroomId: string, studentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        UPDATE public.learning_enrollments
        SET status='revoked'
        WHERE classroom_id=${classroomId}::uuid AND learner_user_id=${studentId}::uuid AND status='active'
        RETURNING id, status`;
      return rows[0] ?? null;
    });
  }
}
