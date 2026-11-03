import { provisionCourse1DemoDelivery } from "./course1-demo-delivery";

describe("Course 1 demo delivery integration", () => {
  it("creates one idempotent authoritative identity chain without mutating legacy delivery", async () => {
    const legacyUpdate = jest.fn();
    const state = {
      offerings: new Set<string>(), classrooms: new Set<string>(), members: new Set<string>(),
      enrollments: new Set<string>(), deliveries: new Set<string>(),
      legacy: { membershipStatus: "active", attempts: 5, submissions: 1, experiments: 7 },
    };
    const legacyBefore = JSON.stringify(state.legacy);
    const tx = {
      learning_courses: {
        findFirst: jest.fn().mockResolvedValue({ id: "course-1", organization_id: "org-1", title: "Robotics Fundamentals", status: "published" }),
        update: legacyUpdate,
      },
      learning_lessons: {
        findMany: jest.fn().mockResolvedValue([
          "Safety Knowledge Check", "Reach Target A", "Grab and Release an Object", "Pick and Place to Target Zone", "Run the Qualified Program",
        ].map((title, index) => ({
          ordinal: index + 1,
          id: `lesson-${index + 1}`,
          learning_assignments: [{ id: `assignment-${index + 1}`, title }],
        }))),
      },
      learning_course_offerings: {
        upsert: jest.fn(async ({ where }) => {
          state.offerings.add(JSON.stringify(where));
          return { id: "offering-1" };
        }),
      },
      learning_classrooms: {
        upsert: jest.fn(async ({ where }) => {
          state.classrooms.add(JSON.stringify(where));
          return { id: "classroom-1" };
        }),
      },
      learning_classroom_members: { upsert: jest.fn(async ({ where }) => { state.members.add(JSON.stringify(where)); return {}; }) },
      learning_enrollments: { upsert: jest.fn(async ({ where }) => { state.enrollments.add(JSON.stringify(where)); return { id: "enrollment-1" }; }) },
      learning_classroom_assignments: { upsert: jest.fn(async ({ where }) => { state.deliveries.add(JSON.stringify(where)); return {}; }) },
    };
    const prisma = { $transaction: jest.fn(async (work) => work(tx)) };
    const input = {
      organizationId: "org-1",
      courseId: "course-1",
      createdByUserId: "admin-1",
      instructorUserId: "teacher-1",
      instructorMembershipId: "teacher-membership-1",
      studentUserId: "student-1",
      studentMembershipId: "student-membership-1",
    };

    const first = await provisionCourse1DemoDelivery(prisma as never, input);
    const second = await provisionCourse1DemoDelivery(prisma as never, input);

    expect(tx.learning_course_offerings.upsert).toHaveBeenCalledTimes(2);
    expect(tx.learning_classrooms.upsert).toHaveBeenCalledTimes(2);
    expect(tx.learning_enrollments.upsert).toHaveBeenCalledTimes(2);
    expect(tx.learning_classroom_assignments.upsert).toHaveBeenCalledTimes(10);
    expect(tx.learning_classroom_members.upsert).toHaveBeenCalledTimes(4);
    expect(second).toEqual(first);
    expect(state.offerings.size).toBe(1);
    expect(state.classrooms.size).toBe(1);
    expect(state.members.size).toBe(2);
    expect(state.enrollments.size).toBe(1);
    expect(state.deliveries.size).toBe(5);
    expect(JSON.stringify(state.legacy)).toBe(legacyBefore);
    expect(state.legacy.membershipStatus).toBe("active");
    expect(legacyUpdate).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { timeout: 30_000 });
  });

  it("rejects an incomplete or cross-course delivery before publishing assignments", async () => {
    const classroomAssignmentUpsert = jest.fn();
    const tx = {
      learning_courses: { findFirst: jest.fn().mockResolvedValue({ id: "course-1", organization_id: "org-1", title: "Robotics Fundamentals", status: "published" }) },
      learning_lessons: { findMany: jest.fn().mockResolvedValue([{ id: "lesson-1", ordinal: 1, learning_assignments: [] }]) },
      learning_course_offerings: { upsert: jest.fn() },
      learning_classrooms: { upsert: jest.fn() },
      learning_classroom_members: { upsert: jest.fn() },
      learning_enrollments: { upsert: jest.fn() },
      learning_classroom_assignments: { upsert: classroomAssignmentUpsert },
    };
    const prisma = { $transaction: jest.fn(async (work) => work(tx)) };

    await expect(provisionCourse1DemoDelivery(prisma as never, {
      organizationId: "org-1", courseId: "course-1", createdByUserId: "admin-1",
      instructorUserId: "teacher-1", instructorMembershipId: "teacher-membership-1",
      studentUserId: "student-1", studentMembershipId: "student-membership-1",
    })).rejects.toThrow("exactly five lessons");
    expect(classroomAssignmentUpsert).not.toHaveBeenCalled();
  });
});
