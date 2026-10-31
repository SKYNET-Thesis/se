import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ProgressionService } from "./progression.service";

const student = {
  authUserId: "auth-1",
  vistaUserId: "11111111-1111-4111-8111-111111111111",
  email: "student@vista.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: [],
  memberships: [{ id: "member-1", organizationId: "org-1", roleCode: "student", status: "active", permissions: ["learning.work.write", "learning.experiment.execute"] }],
};

const lessons = [
  { id: "lesson-1", ordinal: 1, title: "Meet Your Robot", progress_status: null, progress_percent: null, completed_at: null, prerequisites: [] },
  { id: "lesson-2", ordinal: 2, title: "Move the Robot", progress_status: null, progress_percent: null, completed_at: null, prerequisites: [{ lessonId: "lesson-1", title: "Meet Your Robot", required: true, minimumScore: null, status: null, progressPercent: null }] },
  { id: "lesson-3", ordinal: 3, title: "Grab & Release", progress_status: null, progress_percent: null, completed_at: null, prerequisites: [{ lessonId: "lesson-2", title: "Move the Robot", required: true, minimumScore: null, status: null, progressPercent: null }] },
  { id: "lesson-4", ordinal: 4, title: "Pick & Place", progress_status: null, progress_percent: null, completed_at: null, prerequisites: [{ lessonId: "lesson-3", title: "Grab & Release", required: true, minimumScore: null, status: null, progressPercent: null }] },
  { id: "lesson-5", ordinal: 5, title: "Physical Robot Lab", progress_status: null, progress_percent: null, completed_at: null, prerequisites: [{ lessonId: "lesson-4", title: "Pick & Place", required: true, minimumScore: null, status: null, progressPercent: null }] },
];

describe("ProgressionService", () => {
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const assertStudentClassroomAccess = jest.fn();
  const service = new ProgressionService({ $queryRaw: queryRaw, $transaction: transaction } as never, { assertStudentClassroomAccess } as never);

  beforeEach(() => { queryRaw.mockReset(); transaction.mockReset(); assertStudentClassroomAccess.mockReset(); assertStudentClassroomAccess.mockResolvedValue(undefined); });

  it("returns L1 current and L2-L5 locked without mutating progress", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals", status: "published" }]).mockResolvedValueOnce(lessons);
    const path = await service.coursePath(student, "course-1");
    expect(path.currentLessonId).toBe("lesson-1");
    expect(path.progressPercent).toBe(0);
    expect(path.lessons.map((lesson: { status: string }) => lesson.status)).toEqual(["current", "locked", "locked", "locked", "locked"]);
    expect(path.lessons[1].lockReason).toMatchObject({ code: "PREREQUISITE_NOT_COMPLETED", prerequisiteLessonId: "lesson-1" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("scopes the authoritative path through one active enrollment identity chain", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals", status: "published" }]).mockResolvedValueOnce(lessons);
    await service.coursePath(student, "course-1");
    const accessSql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(accessSql).toContain("learning_enrollments");
    expect(accessSql).toContain("e.offering_id=o.id");
    expect(accessSql).toContain("e.classroom_id=classroom.id");
    expect(accessSql).toContain("o.course_id=c.id");
    expect(accessSql).not.toContain(" OR EXISTS");
  });

  it("uses the lowest eligible incomplete lesson as current and preserves completed progress after reload", async () => {
    const persisted = lessons.map((lesson, index) => {
      if (index === 0) return { ...lesson, progress_status: "completed", progress_percent: 100, completed_at: new Date("2026-10-31T00:00:00Z") };
      if (index === 1) return { ...lesson, prerequisites: [{ lessonId: "lesson-1", title: "Meet Your Robot", required: true, minimumScore: null, status: "completed", progressPercent: 100 }] };
      return lesson;
    });
    queryRaw.mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals", status: "published" }]).mockResolvedValueOnce(persisted);
    const path = await service.coursePath(student, "course-1");
    expect(path.currentLessonId).toBe("lesson-2");
    expect(path.progressPercent).toBe(20);
    expect(path.lessons.map((lesson: { status: string }) => lesson.status)).toEqual(["completed", "current", "locked", "locked", "locked"]);
  });

  it("respects prerequisite minimum score and returns no current lesson after course completion", async () => {
    const scored = lessons.map((lesson) => ({ ...lesson, progress_status: "completed", progress_percent: 100, completed_at: new Date() }));
    scored[1] = { ...scored[1], prerequisites: [{ lessonId: "lesson-1", title: "Meet Your Robot", required: true, minimumScore: 90, status: "completed", progressPercent: 80 }] } as never;
    queryRaw.mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals", status: "published" }]).mockResolvedValueOnce(scored);
    const path = await service.coursePath(student, "course-1");
    expect(path.lessons[1].status).toBe("completed");
    expect(path.currentLessonId).toBeNull();
    expect(path.progressPercent).toBe(100);
  });

  it("locks an incomplete lesson when a completed prerequisite misses its minimum score", async () => {
    const scored = lessons.map((lesson) => ({ ...lesson }));
    scored[0] = { ...scored[0], progress_status: "completed", progress_percent: 80, completed_at: new Date() } as never;
    scored[1] = { ...scored[1], prerequisites: [{ lessonId: "lesson-1", title: "Meet Your Robot", required: true, minimumScore: 90, status: "completed", progressPercent: 80 }] } as never;
    queryRaw.mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals", status: "published" }]).mockResolvedValueOnce(scored);
    const path = await service.coursePath(student, "course-1");
    expect(path.lessons[1]).toMatchObject({ status: "locked", lockReason: { code: "PREREQUISITE_MINIMUM_SCORE_NOT_MET" } });
  });

  it("does not disclose a course outside the learner enrollment/classroom scope", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(service.coursePath(student, "course-other")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("grades L1 on the server and atomically completes only a passing attempt", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ attempt_id: "attempt-1", lesson_id: "lesson-1", course_id: "course-1", classroom_id: "class-1", status: "in_progress", constraints: { kind: "knowledge_check", questions: [{ id: "safety", options: ["stop", "continue"] }] }, success_criteria: { kind: "knowledge_check", passPercent: 100, answerKey: { safety: "stop" } } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "progress-1" }])
      .mockResolvedValueOnce([{ id: "lesson-2" }]);
    transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery }));
    await expect(service.submitKnowledgeCheck(student, "attempt-1", { answers: [{ questionId: "safety", optionId: "stop" }] })).resolves.toMatchObject({ passed: true, score: 100, completedLessonId: "lesson-1", newlyUnlockedLessonIds: ["lesson-2"] });
    expect(txQuery).toHaveBeenCalledTimes(6);
    expect((txQuery.mock.calls[3][0] as TemplateStringsArray).join("?")).toContain("IS NULL AS locked");
  });

  it("persists a failed knowledge check without projecting completion", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ attempt_id: "attempt-1", lesson_id: "lesson-1", course_id: "course-1", classroom_id: "class-1", status: "in_progress", constraints: { kind: "knowledge_check", questions: [{ id: "safety", options: ["stop", "continue"] }] }, success_criteria: { kind: "knowledge_check", passPercent: 100, answerKey: { safety: "stop" } } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([]);
    transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery }));
    await expect(service.submitKnowledgeCheck(student, "attempt-1", { answers: [{ questionId: "safety", optionId: "continue" }] })).resolves.toMatchObject({ passed: false, score: 0, completedLessonId: null, newlyUnlockedLessonIds: [] });
    expect(txQuery).toHaveBeenCalledTimes(4);
  });

  it("rejects incomplete, duplicated, client-forged, or another learner knowledge-check input", async () => {
    const row = { attempt_id: "attempt-1", lesson_id: "lesson-1", course_id: "course-1", classroom_id: "class-1", status: "in_progress", constraints: { kind: "knowledge_check", questions: [{ id: "safety", options: ["stop", "continue"] }] }, success_criteria: { kind: "knowledge_check", passPercent: 100, answerKey: { safety: "stop" } } };
    transaction.mockImplementation(async (work) => work({ $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]) }));
    await expect(service.submitKnowledgeCheck(student, "attempt-1", { answers: [] })).rejects.toBeInstanceOf(BadRequestException);
    transaction.mockImplementation(async (work) => work({ $queryRaw: jest.fn().mockResolvedValueOnce([]) }));
    await expect(service.submitKnowledgeCheck(student, "attempt-other", { answers: [{ questionId: "safety", optionId: "stop" }] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("projects only persisted matching symbolic PASS evidence and remains idempotent", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ evaluation_id: "eval-1", verdict: "passed", attempt_id: "attempt-2", lesson_id: "lesson-2", course_id: "course-1", program_version_id: "version-2", challenge_id: "challenge-2" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "progress-2" }])
      .mockResolvedValueOnce([{ id: "lesson-3" }]);
    const result = await service.projectSymbolicPass({ $queryRaw: txQuery } as never, student, { evaluationId: "eval-1", attemptId: "attempt-2", programVersionId: "version-2", verdict: "passed" });
    expect(result).toEqual({ completedLessonId: "lesson-2", newlyUnlockedLessonIds: ["lesson-3"] });
    expect((txQuery.mock.calls[0][0] as TemplateStringsArray).join("?")).toContain("la.constraints->>'kind'='symbolic_program'");
    expect(txQuery).toHaveBeenCalledTimes(5);
  });

  it("enforces classroom write scope and rejects a finalized knowledge-check attempt", async () => {
    const row = { attempt_id: "attempt-1", lesson_id: "lesson-1", course_id: "course-1", classroom_id: "class-1", status: "in_progress", constraints: { kind: "knowledge_check", questions: [{ id: "safety", options: ["stop"] }] }, success_criteria: { kind: "knowledge_check", passPercent: 100, answerKey: { safety: "stop" } } };
    assertStudentClassroomAccess.mockRejectedValueOnce(new NotFoundException());
    transaction.mockImplementationOnce(async (work) => work({ $queryRaw: jest.fn().mockResolvedValueOnce([row]) }));
    await expect(service.submitKnowledgeCheck(student, "attempt-1", { answers: [{ questionId: "safety", optionId: "stop" }] })).rejects.toBeInstanceOf(NotFoundException);
    transaction.mockImplementationOnce(async (work) => work({ $queryRaw: jest.fn().mockResolvedValueOnce([]) }));
    await expect(service.submitKnowledgeCheck(student, "attempt-1", { answers: [{ questionId: "safety", optionId: "stop" }] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns no duplicate unlock when the same PASS is projected again", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ evaluation_id: "eval-1", verdict: "passed", attempt_id: "attempt-2", lesson_id: "lesson-2", course_id: "course-1", program_version_id: "version-2", challenge_id: "challenge-2" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "progress-2", already_completed: true }]);
    await expect(service.projectSymbolicPass({ $queryRaw: txQuery } as never, student, { evaluationId: "eval-1", attemptId: "attempt-2", programVersionId: "version-2", verdict: "passed" }))
      .resolves.toEqual({ completedLessonId: "lesson-2", newlyUnlockedLessonIds: [] });
  });

  it("L4 PASS unlocks L5 but never completes L5", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ evaluation_id: "eval-4", verdict: "passed", attempt_id: "attempt-4", lesson_id: "lesson-4", course_id: "course-1", program_version_id: "version-4", challenge_id: "challenge-4" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "progress-4", already_completed: false }])
      .mockResolvedValueOnce([{ id: "lesson-5" }]);
    await expect(service.projectSymbolicPass({ $queryRaw: txQuery } as never, student, { evaluationId: "eval-4", attemptId: "attempt-4", programVersionId: "version-4", verdict: "passed" }))
      .resolves.toEqual({ completedLessonId: "lesson-4", newlyUnlockedLessonIds: ["lesson-5"] });
  });

  it("opening or viewing L1 does not complete it and performs zero writes", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals", status: "published" }]).mockResolvedValueOnce(lessons);
    const path = await service.coursePath(student, "course-1");
    expect(path.lessons[0].status).toBe("current");
    expect(path.lessons[0].progressPercent).toBe(0);
    expect(path.lessons[0].completedAt).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("repeated L1 PASS is idempotent and produces no duplicate unlocks", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ attempt_id: "attempt-1", lesson_id: "lesson-1", course_id: "course-1", classroom_id: "class-1", status: "in_progress", constraints: { kind: "knowledge_check", questions: [{ id: "safety", options: ["stop", "continue"] }] }, success_criteria: { kind: "knowledge_check", passPercent: 100, answerKey: { safety: "stop" } } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "attempt-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "progress-1", already_completed: true }]);
    transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery }));
    await expect(service.submitKnowledgeCheck(student, "attempt-1", { answers: [{ questionId: "safety", optionId: "stop" }] })).resolves.toMatchObject({
      passed: true,
      score: 100,
      completedLessonId: "lesson-1",
      newlyUnlockedLessonIds: [],
    });
  });

  it("does not unlock when challenge does not match the symbolic assignment", async () => {
    const txQuery = jest.fn().mockResolvedValueOnce([]);
    await expect(service.projectSymbolicPass({ $queryRaw: txQuery } as never, student, { evaluationId: "eval-1", attemptId: "attempt-2", programVersionId: "version-2", verdict: "passed" })).rejects.toThrow("Symbolic PASS provenance could not be verified");
  });

  it("does not unlock from a wrong learner, challenge, attempt, or ProgramVersion chain", async () => {
    const txQuery = jest.fn().mockResolvedValueOnce([]);
    await expect(service.projectSymbolicPass({ $queryRaw: txQuery } as never, student, { evaluationId: "eval-1", attemptId: "attempt-2", programVersionId: "wrong-version", verdict: "passed" })).rejects.toBeInstanceOf(ConflictException);
  });
});
