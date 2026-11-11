import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { runCourseSyncTransaction } from './course-sync-transaction';

type Tx = Prisma.TransactionClient;

/**
 * Owns the classroom-derived enrollment lifecycle. Learning history (lesson progress, attempts,
 * submissions) is never deleted here.
 *
 * Schema contract (verified Production baseline 2026-11-09): one enrollment row per
 * (course, learner, classroom) and statuses `active | completed | revoked`. Because every classroom
 * owns its own row, releasing one classroom can never remove access granted by another classroom.
 *
 * Concurrency: every operation that reads or changes a classroom's eligibility, membership or enrollments
 * first takes `FOR NO KEY UPDATE` on that classroom row (see lockClassroomIn) and only then reads state.
 * Under READ COMMITTED the statements that follow the lock see everything the previous lock holder
 * committed, so a synchronization can never re-activate a student who was removed, or enroll anybody into a
 * classroom that was archived, in the meantime. The lock order is always course -> classroom (ascending id)
 * -> rows of that classroom; no code path takes a second classroom lock while holding one, so classroom
 * operations cannot deadlock with each other. NO KEY UPDATE does not block foreign-key checks.
 */
@Injectable()
export class EnrollmentDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  synchronizeClassroom(classroomId: string) {
    return this.prisma.$transaction((tx) => this.synchronizeClassroomIn(tx, classroomId));
  }

  /** Serializes all lifecycle work on one classroom. Returns the locked, freshly read classroom row. */
  async lockClassroomIn(tx: Tx, classroomId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; organization_id: string; offering_id: string; status: string }>>`
      SELECT id, organization_id, offering_id, status FROM public.learning_classrooms
      WHERE id=${classroomId}::uuid FOR NO KEY UPDATE`;
    return rows[0] ?? null;
  }

  /** Enrolls every active student of a deliverable classroom (active classroom, active offering, published course). */
  async synchronizeClassroomIn(tx: Tx, classroomId: string) {
    if (!(await this.lockClassroomIn(tx, classroomId))) throw new NotFoundException('An active published classroom course was not found.');
    const course = await tx.$queryRaw<Array<{ course_id: string }>>`
      SELECT o.course_id
      FROM public.learning_classrooms c
      JOIN public.learning_course_offerings o ON o.id=c.offering_id
      JOIN public.learning_courses course ON course.id=o.course_id AND course.status='published'
      WHERE c.id=${classroomId}::uuid AND c.status='active' AND o.status='active'`;
    if (!course[0]) throw new NotFoundException('An active published classroom course was not found.');

    return tx.$queryRaw<Array<{ id: string; learner_user_id: string; status: string }>>`
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
        ORDER BY s.user_id
        ON CONFLICT (course_id, learner_user_id, classroom_id)
        DO UPDATE SET
          status=CASE WHEN public.learning_enrollments.status='completed' THEN 'completed' ELSE 'active' END,
          offering_id=EXCLUDED.offering_id
        RETURNING id, learner_user_id, status
      ), initialized_progress AS (
        INSERT INTO public.learning_lesson_progress(learner_user_id, lesson_id, status, progress_percent)
        SELECT s.user_id, l.id, 'not_started', 0
        FROM active_students s JOIN public.learning_lessons l ON l.course_id=${course[0].course_id}::uuid
        ORDER BY s.user_id, l.id
        ON CONFLICT (learner_user_id, lesson_id) DO NOTHING
      ) SELECT id, learner_user_id, status FROM enrolled`;
  }

  /**
   * Membership changes must never fail because the classroom's course is not deliverable yet
   * (draft course, inactive offering). Enrollment is created when delivery becomes possible.
   */
  async synchronizeIfDeliverable(classroomId: string) {
    return this.prisma.$transaction((tx) => this.synchronizeIfDeliverableIn(tx, classroomId));
  }

  async synchronizeIfDeliverableIn(tx: Tx, classroomId: string) {
    try {
      return await this.synchronizeClassroomIn(tx, classroomId);
    } catch (error) {
      // The deliverability check runs before any write, so ignoring it leaves the transaction clean.
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  /**
   * Synchronizes every active classroom whose active offering delivers the course. Classrooms are visited in
   * ascending id order (stable lock order) inside the caller's transaction, so a failure on any classroom
   * aborts the whole synchronization instead of leaving some classrooms enrolled and others not.
   */
  async synchronizeCourseIn(tx: Tx, courseId: string) {
    // Lock every eligible classroom first, in ascending id order, and only then write. Classrooms of one course share
    // per-learner lesson-progress rows; writing in one classroom while still waiting for the lock of the next one would
    // let a single-classroom synchronization (holding that lock, waiting for our progress rows) deadlock with us.
    const classrooms = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT c.id
      FROM public.learning_classrooms c
      JOIN public.learning_course_offerings o ON o.id=c.offering_id
      WHERE o.course_id=${courseId}::uuid AND o.status='active' AND c.status='active'
      ORDER BY c.id
      FOR NO KEY UPDATE OF c`;
    let enrolled = 0;
    for (const classroom of classrooms) {
      const rows = await this.synchronizeIfDeliverableIn(tx, classroom.id);
      enrolled += rows?.length ?? 0;
    }
    return { classrooms: classrooms.length, enrolled };
  }

  /** Idempotent, all-or-nothing retry entry point for a course whose classrooms still lack enrollments. */
  synchronizeCourse(courseId: string) {
    return runCourseSyncTransaction(this.prisma, (tx) => this.synchronizeCourseIn(tx, courseId));
  }

  revokeClassroomEnrollment(classroomId: string, studentId: string) {
    return this.prisma.$transaction((tx) => this.releaseIn(tx, classroomId, studentId));
  }

  /**
   * Releases classroom-derived access: this classroom's active enrollments become `revoked`. Rows of
   * other classrooms, completed enrollments and all learning history are untouched.
   * Pass no `studentId` to release the whole classroom.
   */
  async releaseIn(tx: Tx, classroomId: string, studentId?: string) {
    await this.lockClassroomIn(tx, classroomId);
    return studentId
      ? tx.$queryRaw<Array<{ id: string; status: 'revoked' }>>`
          UPDATE public.learning_enrollments SET status='revoked'
          WHERE classroom_id=${classroomId}::uuid AND learner_user_id=${studentId}::uuid AND status='active'
          RETURNING id, status`
      : tx.$queryRaw<Array<{ id: string; status: 'revoked' }>>`
          UPDATE public.learning_enrollments SET status='revoked'
          WHERE classroom_id=${classroomId}::uuid AND status='active'
          RETURNING id, status`;
  }
}
