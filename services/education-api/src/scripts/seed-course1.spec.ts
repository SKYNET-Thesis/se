import { COURSE_1_BLUEPRINT, syncChallengeConditions, validateCourse1Blueprint } from "./seed-course1";

describe("Course 1 seed blueprint", () => {
  it("defines exactly five ordered lessons and a linear prerequisite chain", () => {
    expect(COURSE_1_BLUEPRINT.lessons.map((lesson) => lesson.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(COURSE_1_BLUEPRINT.lessons.map((lesson) => lesson.prerequisiteOrdinal)).toEqual([null, 1, 2, 3, 4]);
    expect(() => validateCourse1Blueprint(COURSE_1_BLUEPRINT)).not.toThrow();
  });

  it("uses unique stable identifiers and server-supported symbolic rules", () => {
    expect(new Set(COURSE_1_BLUEPRINT.competencies.map((item) => item.code)).size).toBe(COURSE_1_BLUEPRINT.competencies.length);
    const titles = COURSE_1_BLUEPRINT.lessons.map((lesson) => lesson.challenge.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(COURSE_1_BLUEPRINT.lessons[0].assignment.constraints).toMatchObject({ kind: "knowledge_check" });
    for (const lesson of COURSE_1_BLUEPRINT.lessons.slice(1, 4)) {
      expect(lesson.challenge.conditions.length).toBeGreaterThan(0);
    }
    expect(COURSE_1_BLUEPRINT.lessons[4].challenge.conditions).toEqual([]);
  });

  it("keeps L5 physical completion out of the seed contract", () => {
    expect(COURSE_1_BLUEPRINT.lessons[4].assignment.constraints).toMatchObject({
      kind: "physical_lab",
      completionAuthority: "future_physical_evidence",
    });
  });

  it("updates symbolic conditions by stable ordinal instead of deleting their identities", async () => {
    const rows = new Map<number, { id: string; ordinal: number }>();
    const model = {
      findMany: jest.fn(async () => [...rows.values()]),
      create: jest.fn(async ({ data }: { data: { ordinal: number } }) => { rows.set(data.ordinal, { id: `condition-${data.ordinal}`, ordinal: data.ordinal }); }),
      update: jest.fn(async () => undefined),
    };
    const conditions = COURSE_1_BLUEPRINT.lessons[1].challenge.conditions;
    await syncChallengeConditions({ learning_challenge_conditions: model } as never, "challenge-1", conditions);
    await syncChallengeConditions({ learning_challenge_conditions: model } as never, "challenge-1", conditions);
    expect(model.create).toHaveBeenCalledTimes(conditions.length);
    expect(model.update).toHaveBeenCalledTimes(conditions.length);
  });

  it("coexists with historical Robot Discovery data and never performs destructive deletes", async () => {
    const deleteSpy = jest.fn();
    const deleteManySpy = jest.fn();

    const mockTx = {
      learning_courses: {
        findFirst: jest.fn(async ({ where }: { where: { title: string } }) => {
          // If querying for "Robotics Fundamentals", it's not found on first seed
          if (where.title === COURSE_1_BLUEPRINT.title) return null;
          // If querying for "Robot Discovery", it would be historical
          return { id: "historical-course-id", title: "Robot Discovery" };
        }),
        create: jest.fn(async ({ data }: { data: { title: string } }) => ({ id: "c1-course-id", ...data })),
        update: jest.fn(async ({ data }: { data: { title: string } }) => ({ id: "c1-course-id", ...data })),
        delete: deleteSpy,
        deleteMany: deleteManySpy,
      },
      learning_competencies: { upsert: jest.fn(async ({ create }: { create: { code: string } }) => ({ id: `comp-${create.code}`, ...create })) },
      learning_lessons: { upsert: jest.fn(async ({ create }: { create: { ordinal: number } }) => ({ id: `lesson-${create.ordinal}`, ...create })) },
      learning_objectives: { upsert: jest.fn(async ({ create }: { create: { code: string } }) => ({ id: `obj-${create.code}`, ...create })) },
      learning_objective_competencies: { upsert: jest.fn(async () => ({ id: "obj-comp-1" })) },
      learning_assignments: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: { title: string } }) => ({ id: "assignment-1", ...data })),
        update: jest.fn(async () => ({ id: "assignment-1" })),
        delete: deleteSpy,
        deleteMany: deleteManySpy,
      },
      learning_challenges: {
        create: jest.fn(async ({ data }: { data: { title: string } }) => ({ id: "challenge-1", ...data })),
        update: jest.fn(async () => ({ id: "challenge-1" })),
        delete: deleteSpy,
        deleteMany: deleteManySpy,
      },
      learning_challenge_conditions: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: { data: { ordinal: number } }) => ({ id: `cond-${data.ordinal}`, ...data })),
        update: jest.fn(async () => undefined),
      },
      learning_lesson_prerequisites: {
        upsert: jest.fn(async () => ({ id: "prereq-1" })),
        delete: deleteSpy,
        deleteMany: deleteManySpy,
      },
      learning_assignment_attempts: { delete: deleteSpy, deleteMany: deleteManySpy },
      learning_experiments: { delete: deleteSpy, deleteMany: deleteManySpy },
      learning_submissions: { delete: deleteSpy, deleteMany: deleteManySpy },
      learning_enrollments: { delete: deleteSpy, deleteMany: deleteManySpy },
    };

    const mockPrisma = {
      organizations: { findUnique: jest.fn(async () => ({ id: "org-1" })) },
      users: { findUnique: jest.fn(async () => ({ id: "user-1" })) },
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(mockTx)),
    };

    const { seedCourse1 } = await import("./seed-course1");
    const result = await seedCourse1(mockPrisma as never, "org-1", "user-1");

    expect(result).toEqual({ courseId: "c1-course-id", lessonCount: 5 });
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(deleteManySpy).not.toHaveBeenCalled();
  });
});
