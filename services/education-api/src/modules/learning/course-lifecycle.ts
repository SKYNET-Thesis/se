import { ConflictException } from '@nestjs/common';

export interface LifecycleDb {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface DeliveryEvidence {
  activeEnrollments: number;
  activeOfferings: number;
  activeClassrooms: number;
  progressRows: number;
  attemptRows: number;
}

/**
 * Delivery evidence is broader than enrollment count: progress, activity completion,
 * attempts and submissions can outlive an enrollment status change.
 */
export async function deliveryEvidence(db: LifecycleDb, courseId: string): Promise<DeliveryEvidence> {
  const rows = await db.$queryRaw<DeliveryEvidence[]>`
    SELECT
      (SELECT COUNT(*)::int FROM public.learning_enrollments e
        WHERE e.course_id=${courseId}::uuid AND e.status='active') AS "activeEnrollments",
      (SELECT COUNT(*)::int FROM public.learning_course_offerings o
        WHERE o.course_id=${courseId}::uuid AND o.status='active') AS "activeOfferings",
      (SELECT COUNT(*)::int FROM public.learning_classrooms c
        JOIN public.learning_course_offerings o ON o.id=c.offering_id
        WHERE o.course_id=${courseId}::uuid AND c.status='active') AS "activeClassrooms",
      (
        (SELECT COUNT(*)::int FROM public.learning_lesson_progress p
          JOIN public.learning_lessons l ON l.id=p.lesson_id
          WHERE l.course_id=${courseId}::uuid
            AND (p.status<>'not_started' OR p.progress_percent>0 OR p.started_at IS NOT NULL))
        +
        (SELECT COUNT(*)::int FROM public.learning_activity_progress ap
          JOIN public.learning_lessons l ON l.id=ap.lesson_id
          WHERE l.course_id=${courseId}::uuid)
      ) AS "progressRows",
      (
        (SELECT COUNT(*)::int FROM public.learning_assignment_attempts att
          JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          JOIN public.learning_assignments a ON a.id=ca.assignment_id
          JOIN public.learning_lessons l ON l.id=a.lesson_id
          WHERE l.course_id=${courseId}::uuid)
        +
        (SELECT COUNT(*)::int FROM public.learning_submissions s
          JOIN public.learning_assignments a ON a.id=s.assignment_id
          JOIN public.learning_lessons l ON l.id=a.lesson_id
          WHERE l.course_id=${courseId}::uuid)
      ) AS "attemptRows"`;
  return rows[0] ?? { activeEnrollments: 0, activeOfferings: 0, activeClassrooms: 0, progressRows: 0, attemptRows: 0 };
}

export async function courseStatus(db: LifecycleDb, courseId: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ status: string }[]>`
    SELECT status FROM public.learning_courses WHERE id=${courseId}::uuid`;
  return rows[0]?.status ?? null;
}

/** Archived courses are frozen even for cosmetic edits. */
export async function assertCourseNotArchived(db: LifecycleDb, courseId: string, action: string): Promise<void> {
  if ((await courseStatus(db, courseId)) === 'archived') {
    throw new ConflictException(`${action} is not allowed because this course is archived.`);
  }
}

/** Archived courses are frozen; published courses with learner delivery only accept additives never destructive edits. */
export async function assertCurriculumMutable(db: LifecycleDb, courseId: string, action: string): Promise<void> {
  const status = await courseStatus(db, courseId);
  if (status === 'archived') throw new ConflictException(`${action} is not allowed because this course is archived.`);
  if (status !== 'published') return;
  const evidence = await deliveryEvidence(db, courseId);
  if (evidence.activeEnrollments + evidence.progressRows + evidence.attemptRows === 0) return;
  throw new ConflictException(
    `${action} is not allowed because this published course already has learner delivery. ` +
    'Create a new course version instead of changing content learners are progressing through.',
  );
}

export interface PublishLessonRow {
  id: string;
  publishedActivities: number;
  legacyCourse: boolean;
}

export async function curriculumDeliverability(db: LifecycleDb, courseId: string): Promise<PublishLessonRow[]> {
  return db.$queryRaw<PublishLessonRow[]>`
    SELECT l.id,
      (SELECT COUNT(*)::int
        FROM public.learning_sections s
        JOIN public.learning_activities a ON a.section_id=s.id AND a.status='published'
        WHERE s.lesson_id=l.id AND s.status='published') AS "publishedActivities",
      EXISTS (
        SELECT 1 FROM public.learning_lessons first
        WHERE first.course_id=l.course_id AND first.ordinal=1
          AND first.content->'courseOverview'->>'label'='Course 1'
      ) AS "legacyCourse"
    FROM public.learning_lessons l
    WHERE l.course_id=${courseId}::uuid
    ORDER BY l.ordinal`;
}
