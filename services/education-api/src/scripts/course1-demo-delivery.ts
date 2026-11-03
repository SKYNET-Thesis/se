import { PrismaClient } from "@prisma/client";
import { COURSE_1_BLUEPRINT, seedCourse1 } from "./seed-course1";

export const COURSE_1_DEMO_OFFERING_CODE = "ROBOTICS-FUNDAMENTALS-DEMO";
export const COURSE_1_DEMO_CLASSROOM_CODE = "ROBOTICS-FUNDAMENTALS-A";

export interface Course1DemoDeliveryInput {
  organizationId: string;
  courseId: string;
  createdByUserId: string;
  instructorUserId: string;
  instructorMembershipId: string;
  studentUserId: string;
  studentMembershipId: string;
}

export async function provisionCourse1DemoDelivery(prisma: PrismaClient, input: Course1DemoDeliveryInput) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.learning_courses.findFirst({
      where: { id: input.courseId, organization_id: input.organizationId, title: COURSE_1_BLUEPRINT.title, status: "published" },
      select: { id: true },
    });
    if (!course) throw new Error("Authoritative Course 1 was not found in the requested organization.");

    const lessons = await tx.learning_lessons.findMany({
      where: { course_id: course.id },
      orderBy: { ordinal: "asc" },
      select: { id: true, ordinal: true, learning_assignments: { select: { id: true, title: true } } },
    });
    if (lessons.length !== COURSE_1_BLUEPRINT.lessons.length) throw new Error("Authoritative Course 1 delivery requires exactly five lessons.");
    const deliveries = lessons.map((lesson, index) => {
      const expected = COURSE_1_BLUEPRINT.lessons[index];
      if (lesson.ordinal !== expected.ordinal) throw new Error("Authoritative Course 1 lessons are not in canonical order.");
      const assignment = lesson.learning_assignments.find((item) => item.title === expected.assignment.title);
      if (!assignment) throw new Error(`Authoritative assignment is missing for Course 1 lesson ${expected.ordinal}.`);
      return assignment;
    });

    const offering = await tx.learning_course_offerings.upsert({
      where: { organization_id_code: { organization_id: input.organizationId, code: COURSE_1_DEMO_OFFERING_CODE } },
      update: { course_id: course.id, title: COURSE_1_BLUEPRINT.title, status: "active" },
      create: { organization_id: input.organizationId, course_id: course.id, code: COURSE_1_DEMO_OFFERING_CODE, title: COURSE_1_BLUEPRINT.title, status: "active", created_by: input.createdByUserId },
    });
    const classroom = await tx.learning_classrooms.upsert({
      where: { organization_id_code: { organization_id: input.organizationId, code: COURSE_1_DEMO_CLASSROOM_CODE } },
      update: { offering_id: offering.id, status: "active" },
      create: { organization_id: input.organizationId, offering_id: offering.id, name: "Robotics Fundamentals Class A", code: COURSE_1_DEMO_CLASSROOM_CODE, status: "active", created_by: input.createdByUserId },
    });
    await tx.learning_classroom_members.upsert({
      where: { classroom_id_user_id: { classroom_id: classroom.id, user_id: input.instructorUserId } },
      update: { membership_id: input.instructorMembershipId, classroom_role: "teacher", status: "active" },
      create: { classroom_id: classroom.id, user_id: input.instructorUserId, membership_id: input.instructorMembershipId, classroom_role: "teacher", status: "active" },
    });
    await tx.learning_classroom_members.upsert({
      where: { classroom_id_user_id: { classroom_id: classroom.id, user_id: input.studentUserId } },
      update: { membership_id: input.studentMembershipId, classroom_role: "student", status: "active" },
      create: { classroom_id: classroom.id, user_id: input.studentUserId, membership_id: input.studentMembershipId, classroom_role: "student", status: "active" },
    });
    const enrollment = await tx.learning_enrollments.upsert({
      where: { course_id_learner_user_id: { course_id: course.id, learner_user_id: input.studentUserId } },
      update: { offering_id: offering.id, classroom_id: classroom.id, status: "active", completed_at: null },
      create: { course_id: course.id, learner_user_id: input.studentUserId, offering_id: offering.id, classroom_id: classroom.id, status: "active" },
    });
    for (const assignment of deliveries) {
      await tx.learning_classroom_assignments.upsert({
        where: { classroom_id_assignment_id: { classroom_id: classroom.id, assignment_id: assignment.id } },
        update: { status: "published", published_by: input.instructorUserId },
        create: { classroom_id: classroom.id, assignment_id: assignment.id, status: "published", published_by: input.instructorUserId },
      });
    }
    return { courseId: course.id, offeringId: offering.id, classroomId: classroom.id, enrollmentId: enrollment.id, lessonCount: lessons.length };
  }, { timeout: 30_000 });
}

const prisma = new PrismaClient();

async function requiredUser(email: string) {
  const user = await prisma.users.findFirst({ where: { email, status: "active" }, select: { id: true } });
  if (!user) throw new Error(`Missing active demo user ${email}.`);
  return user;
}

async function main() {
  const organization = await prisma.organizations.findFirst({ where: { name: "VISTA Academy", type: "institution", status: "active" }, select: { id: true } });
  if (!organization) throw new Error("Missing active VISTA Academy organization.");
  const [admin, instructor, student] = await Promise.all([
    requiredUser("admin@vista.demo"), requiredUser("instructor@vista.demo"), requiredUser("student@vista.demo"),
  ]);
  const memberships = await prisma.memberships.findMany({
    where: { organization_id: organization.id, user_id: { in: [instructor.id, student.id] }, status: "active" },
    select: { id: true, user_id: true },
  });
  const instructorMembership = memberships.find((item) => item.user_id === instructor.id);
  const studentMembership = memberships.find((item) => item.user_id === student.id);
  if (!instructorMembership || !studentMembership) throw new Error("Missing active demo organization memberships.");
  const curriculum = await seedCourse1(prisma, organization.id, admin.id);
  const result = await provisionCourse1DemoDelivery(prisma, {
    organizationId: organization.id, courseId: curriculum.courseId, createdByUserId: admin.id,
    instructorUserId: instructor.id, instructorMembershipId: instructorMembership.id,
    studentUserId: student.id, studentMembershipId: studentMembership.id,
  });
  console.log(`Course 1 demo delivery ready: ${result.courseId} (${result.lessonCount} lessons).`);
}

if (require.main === module) void main().finally(() => prisma.$disconnect());
