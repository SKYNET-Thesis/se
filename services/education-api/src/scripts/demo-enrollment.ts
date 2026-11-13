import type { Prisma } from "@prisma/client";

export interface ClassroomStudentEnrollmentInput {
  courseId: string;
  offeringId: string;
  classroomId: string;
  studentUserId: string;
}

/**
 * `GET /me/learning` (the student's Assignments page) lists a classroom delivery only for a learner who has BOTH an
 * active classroom membership and an active `learning_enrollments` row for that exact (course, offering, classroom).
 * The product creates that row whenever a member is added through the API (EnrollmentDeliveryService); scripts that
 * insert `learning_classroom_members` directly must create it too, with the same idempotent statement, otherwise the
 * student is a "member" who can never see the classroom's assignments.
 */
export async function enrollClassroomStudent(tx: Pick<Prisma.TransactionClient, "$queryRaw">, input: ClassroomStudentEnrollmentInput) {
  const [enrollment] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public.learning_enrollments(course_id, learner_user_id, offering_id, classroom_id, status, enrolled_at)
    VALUES (${input.courseId}::uuid, ${input.studentUserId}::uuid, ${input.offeringId}::uuid, ${input.classroomId}::uuid, 'active', now())
    ON CONFLICT (course_id, learner_user_id, classroom_id)
    DO UPDATE SET status=CASE WHEN public.learning_enrollments.status='completed' THEN 'completed' ELSE 'active' END, offering_id=EXCLUDED.offering_id
    RETURNING id`;
  if (!enrollment) throw new Error("Classroom enrollment could not be created.");
  return enrollment;
}
