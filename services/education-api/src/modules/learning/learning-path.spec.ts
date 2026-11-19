import { LearningService } from "./learning.service";

const user = { vistaUserId: "11111111-1111-4111-8111-111111111111", status: "active", memberships: [], systemRoleCodes: [], systemPermissions: [] } as never;
const row = (id: string, title: string, level: string, ordinal: number, total: number, completed: number, prereq: string[] = []) =>
  ({ id, title, description: null, level, levelLabel: level, ordinal, tags: ["SO-101"], prerequisiteCourseIds: prereq, totalLessons: BigInt(total), completedLessons: BigInt(completed) });

function service(rows: unknown[], outside: unknown[] = []) {
  const queryRaw = jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce(outside);
  return new LearningService({ $queryRaw: queryRaw } as never, {} as never);
}

describe("student learning path", () => {
  it("orders BEGINNER → INTERMEDIATE → ADVANCED, tracks completion and locks a course until its prerequisite is completed", async () => {
    const result = await service([row("b", "Robotics Basics", "BEGINNER", 1, 5, 5), row("i", "Blockly Motion", "INTERMEDIATE", 2, 6, 0, ["b"]), row("a", "Kinematics Lab", "ADVANCED", 3, 4, 0, ["i"])]).learningPath(user);
    expect(result.courses.map((c) => [c.id, c.state, c.progressPercent])).toEqual([["b", "completed", 100], ["i", "available", 0], ["a", "locked", 0]]);
    expect(result.courses[2].lockedReason).toBe("Complete Blockly Motion first.");
    expect(result.recommendedNext).toMatchObject({ id: "i", reason: "Next course on your path." });
    expect(result.levels).toEqual([{ code: "BEGINNER", label: "Beginner", total: 1, completed: 1 }, { code: "INTERMEDIATE", label: "Intermediate", total: 1, completed: 0 }, { code: "ADVANCED", label: "Advanced", total: 1, completed: 0 }]);
  });

  it("recommends the course in progress first and explains a prerequisite the student is not enrolled in", async () => {
    const started = await service([row("b", "Robotics Basics", "BEGINNER", 1, 4, 1), row("i", "Blockly Motion", "INTERMEDIATE", 2, 6, 0, ["outside"])], [{ id: "outside", title: "Python Intro" }]).learningPath(user);
    expect(started.recommendedNext).toMatchObject({ id: "b", reason: "Continue where you left off." });
    expect(started.courses[1].state).toBe("locked");
    expect(started.courses[1].lockedReason).toContain("Python Intro");
    expect(started.courses[1].lockedReason).toContain("ask your school to enroll you");
    expect(started.courses[0].progressPercent).toBe(25);
  });

  it("returns no recommendation when everything is complete or nothing is enrolled", async () => {
    expect((await service([row("b", "Basics", "BEGINNER", 1, 3, 3)]).learningPath(user)).recommendedNext).toBeNull();
    expect((await service([]).learningPath(user)).courses).toEqual([]);
  });
});
