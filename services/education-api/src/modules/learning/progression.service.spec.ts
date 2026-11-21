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

  it("returns server-authored course overview and lesson preview metadata", async () => {
    queryRaw
      .mockResolvedValueOnce([{
        id: "course-1", title: "Robotics Fundamentals", status: "published",
        description: "A five-lesson robotics foundation.", label: "Course 1", level: "Beginner",
        recommended_grades: "Grades 6–8", learning_outcome: "Student can independently program a Pick & Place task.",
        competencies: [{ code: "C1.SAFETY.AWARENESS", title: "Robot safety awareness" }],
      }])
      .mockResolvedValueOnce(lessons.map((lesson, index) => ({
        ...lesson,
        summary: `Objective ${index + 1}`,
        learning_items: ["Learn", "Practice"],
        estimated_minutes: 15 + index * 5,
      })));

    const path = await service.coursePath(student, "course-1");

    expect(path.course).toMatchObject({
      description: "A five-lesson robotics foundation.",
      label: "Course 1",
      level: "Beginner",
      recommendedGrades: "Grades 6–8",
      learningOutcome: expect.stringContaining("Pick & Place"),
      competencies: [{ code: "C1.SAFETY.AWARENESS", title: "Robot safety awareness" }],
    });
    expect(path.lessons[0]).toMatchObject({
      summary: "Objective 1",
      learningItems: ["Learn", "Practice"],
      estimatedMinutes: 15,
    });
    const lessonSql = (queryRaw.mock.calls[1][0] as TemplateStringsArray).join("?");
    expect(lessonSql).toContain("l.content->>'summary'");
    expect(lessonSql).toContain("learningObjectives");
  });

  it("does not project Course 1 overview metadata onto another enrolled course", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: "course-2", title: "Robot Discovery", status: "published", description: "Legacy course", competencies: [] }])
      .mockResolvedValueOnce([{ ...lessons[0], id: "legacy-lesson", title: "Legacy lesson" }]);

    const path = await service.coursePath(student, "course-2");

    expect(path.course).toMatchObject({ title: "Robot Discovery", label: null, level: null, recommendedGrades: null, learningOutcome: null });
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

  it("final submission never applies the course-level prerequisite rule, even when enforcement is on (a prerequisite added after the attempt started must not discard the work)", async () => {
    const saved = process.env.COURSE_PREREQUISITES_ENFORCED_FROM; process.env.COURSE_PREREQUISITES_ENFORCED_FROM = "always";
    try {
      const txQuery = jest.fn()
        .mockResolvedValueOnce([{ attempt_id: "attempt-1", lesson_id: "lesson-1", course_id: "course-1", classroom_id: "class-1", status: "in_progress", constraints: { kind: "knowledge_check", questions: [{ id: "safety", options: ["stop", "continue"] }] }, success_criteria: { kind: "knowledge_check", passPercent: 100, answerKey: { safety: "stop" } }, delivery_status: "published", close_at: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "attempt-1" }])
        .mockResolvedValueOnce([]);
      transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery }));
      await expect(service.submitKnowledgeCheck(student, "attempt-1", { answers: [{ questionId: "safety", optionId: "continue" }] })).resolves.toMatchObject({ passed: false });
      const fragments: string[] = (txQuery.mock.calls[1] as unknown[]).slice(1).flatMap((value) => (value && typeof value === "object" && "sql" in (value as object) ? [String((value as { sql: string }).sql)] : []));
      expect(fragments).toContain("'[]'::jsonb");                                          // the course-level column is the constant empty list
      expect(fragments.some((sql: string) => sql.includes("owner_course"))).toBe(false);          // the prerequisite sub-select is not even evaluated
    } finally { if (saved === undefined) delete process.env.COURSE_PREREQUISITES_ENFORCED_FROM; else process.env.COURSE_PREREQUISITES_ENFORCED_FROM = saved; }
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

  it("queries authoritative student quizzes across enrolled courses", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        lesson_id: "l-1",
        lesson_title: "Meet Your Robot",
        lesson_ordinal: 1,
        course_id: "c-1",
        course_title: "Robotics Fundamentals",
        assignment_id: "a-1",
        quiz_title: "Safety Knowledge Check",
        classroom_assignment_id: "ca-1",
        attempt_id: "att-1",
        attempt_status: "evaluated",
        score: 100,
        passed: true,
        pass_percent: 80,
        status: "passed",
      },
    ]);
    const quizzes = await service.myQuizzes(student);
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0].quiz_title).toBe("Safety Knowledge Check");
    expect(quizzes[0].status).toBe("passed");
    expect(quizzes[0].score).toBe(100);
  });

  describe("course-level prerequisites", () => {
    const unmet = [{ id: "course-0", title: "SO-101 Beginner" }];

    it("locks every unfinished lesson (and keeps completed ones) while a prerequisite course is incomplete", async () => {
      queryRaw
        .mockResolvedValueOnce([{ id: "course-1", title: "SO-101 Intermediate", status: "published", unmet_course_prerequisites: unmet }])
        .mockResolvedValueOnce([{ ...lessons[0], progress_status: "completed", progress_percent: 100 }, ...lessons.slice(1)]);
      const path = await service.coursePath(student, "course-1");
      expect(path.lessons.map((lesson) => lesson.status)).toEqual(["completed", "locked", "locked", "locked", "locked"]);
      expect(path.currentLessonId).toBeNull();
      expect(path.lessons[1].lockReason).toMatchObject({ code: "COURSE_PREREQUISITE_NOT_COMPLETED", unmetCourses: unmet, message: "Complete SO-101 Beginner first to unlock this course." });
      expect(path.course.unmetPrerequisites).toEqual(unmet);
    });

    it("leaves the path untouched once the prerequisite is completed", async () => {
      queryRaw.mockResolvedValueOnce([{ id: "course-1", title: "SO-101 Intermediate", status: "published", unmet_course_prerequisites: [] }]).mockResolvedValueOnce(lessons);
      const path = await service.coursePath(student, "course-1");
      expect(path.lessons.map((lesson) => lesson.status)).toEqual(["current", "locked", "locked", "locked", "locked"]);
      expect(path.lessons[0].lockReason).toBeNull();
      expect(path.course.unmetPrerequisites).toEqual([]);
    });

    it("refuses attempts, media and knowledge checks with COURSE_PREREQUISITE_NOT_COMPLETED", async () => {
      queryRaw.mockResolvedValueOnce([{ prerequisite_lesson_id: null, title: null, minimum_score: null, status: null, progress_percent: null, unmet_courses: unmet }]);
      await expect(service.assertPrerequisites({ $queryRaw: queryRaw }, student.vistaUserId, "lesson-1")).rejects.toMatchObject({ response: { code: "COURSE_PREREQUISITE_NOT_COMPLETED", unmetCourses: unmet } });
    });

    it("keeps lessons the learner already completed or started reachable while the rest stay locked", async () => {
      queryRaw
        .mockResolvedValueOnce([{ id: "course-1", title: "SO-101 Intermediate", status: "published", unmet_course_prerequisites: unmet }])
        .mockResolvedValueOnce([{ ...lessons[0], progress_status: "completed", progress_percent: 100 }, { ...lessons[1], progress_status: "in_progress", prerequisites: [] }, ...lessons.slice(2)]);
      const path = await service.coursePath(student, "course-1");
      expect(path.lessons.map((lesson) => lesson.status)).toEqual(["completed", "in_progress", "locked", "locked", "locked"]);
      expect(path.lessons[2].lockReason).toMatchObject({ code: "COURSE_PREREQUISITE_NOT_COMPLETED" });
    });

    it("never applies the course rule to a final submission or evidence-based completion (courseLevel: false), even if the row reports unmet courses", async () => {
      queryRaw.mockResolvedValueOnce([{ prerequisite_lesson_id: null, title: null, minimum_score: null, status: null, progress_percent: null, unmet_courses: unmet }]);
      await expect(service.assertPrerequisites({ $queryRaw: queryRaw }, student.vistaUserId, "lesson-1", { courseLevel: false })).resolves.toBeUndefined();
    });

    it("still enforces the lesson-level rule on submission when courseLevel is false", async () => {
      queryRaw.mockResolvedValueOnce([{ prerequisite_lesson_id: "lesson-0", title: "Intro", minimum_score: null, status: "in_progress", progress_percent: null, unmet_courses: [] }]);
      await expect(service.assertPrerequisites({ $queryRaw: queryRaw }, student.vistaUserId, "lesson-1", { courseLevel: false })).rejects.toMatchObject({ response: { code: "PREREQUISITE_NOT_COMPLETED" } });
    });

    it("does not treat a lesson without prerequisites as blocked", async () => {
      queryRaw.mockResolvedValueOnce([{ prerequisite_lesson_id: null, title: null, minimum_score: null, status: null, progress_percent: null, unmet_courses: [] }]);
      await expect(service.assertPrerequisites({ $queryRaw: queryRaw }, student.vistaUserId, "lesson-1")).resolves.toBeUndefined();
    });
  });
});
