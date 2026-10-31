import { ConflictException, NotFoundException } from "@nestjs/common";
import { LearningService } from "./learning.service";

const user = {
  authUserId: "auth-1", vistaUserId: "user-1", email: "student@vista.test", status: "active",
  systemRoleCodes: [], systemPermissions: [],
  memberships: [{ id:"member-1", organizationId:"org-1", roleCode:"student", status:"active", permissions:["learning.work.write"] }],
};

describe("LearningService assignment delivery", () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const transaction = jest.fn();
  const assertStudentClassroomAccess = jest.fn();
  const service = new LearningService(
    { $queryRaw: queryRaw, $transaction: transaction } as never,
    { assertStudentClassroomAccess } as never,
  );

  beforeEach(() => {
    queryRaw.mockReset(); executeRaw.mockReset(); transaction.mockReset(); assertStudentClassroomAccess.mockReset();
    assertStudentClassroomAccess.mockResolvedValue(undefined);
  });

  it("returns classroom curriculum identity with delivery options", async () => {
    const curriculumQuery = jest.fn().mockResolvedValue([{
      course_id: "course-1", course_title: "Robotics Foundations", lesson_id: "lesson-1", lesson_title: "Gripper",
    }]);
    const curriculumService = new LearningService(
      { $queryRaw: curriculumQuery } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(curriculumService.deliveryOptions(user, "class-1")).resolves.toEqual([
      expect.objectContaining({ course_id: "course-1", course_title: "Robotics Foundations" }),
    ]);
    const sql = String(curriculumQuery.mock.calls[0][0]);
    expect(sql).toContain("co.id AS course_id");
    expect(sql).toContain("co.title AS course_title");
  });

  it("derives learner identity from CurrentUser and creates the next own attempt", async () => {
    queryRaw.mockResolvedValue([{ classroom_id:"class-a", max_attempts:3 }]);
    transaction.mockImplementation(async (work) => work({
      $executeRaw: executeRaw.mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ n:2, existing:1 }]).mockResolvedValueOnce([{ id:"attempt-2", learner_user_id:"user-1", attempt_number:2 }]),
    }));
    const result = await service.startAttempt(user, "classroom-assignment-a");
    expect(assertStudentClassroomAccess).toHaveBeenCalledWith(user, "class-a");
    expect(result).toEqual({ id:"attempt-2", learner_user_id:"user-1", attempt_number:2 });
    const deliverySql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(deliverySql).toContain("learning_enrollments");
    expect(deliverySql).toContain("enrollment.course_id=lesson.course_id");
    expect(deliverySql).toContain("enrollment.offering_id=offering.id");
    expect(deliverySql).toContain("enrollment.classroom_id=classroom.id");
  });

  it("returns current learning only from an active enrollment matching course, offering, and classroom", async () => {
    const scopedQuery = jest.fn().mockResolvedValue([]);
    const scopedService = new LearningService({ $queryRaw: scopedQuery } as never, {} as never);
    await scopedService.myLearning(user);
    const sql = (scopedQuery.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain("learning_enrollments");
    expect(sql).toContain("e.course_id=co.id");
    expect(sql).toContain("e.offering_id=o.id");
    expect(sql).toContain("e.classroom_id=c.id");
    expect(sql).toContain("e.status='active'");
  });

  it("lists learner courses only through one exact active authoritative delivery chain", async () => {
    const scopedQuery = jest.fn().mockResolvedValue([]);
    const scopedService = new LearningService(
      { $queryRaw: scopedQuery } as never,
      { classroomIds: jest.fn().mockResolvedValue([]), isSystemAdministrator: jest.fn().mockReturnValue(false) } as never,
    );

    await scopedService.courses(user, { page: 1, pageSize: 20 });

    const sql = (scopedQuery.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("e.course_id=c.id");
    expect(sql).toContain("o.id=e.offering_id");
    expect(sql).toContain("cl.id=e.classroom_id");
    expect(sql).toContain("cl.offering_id=o.id");
    expect(sql).not.toContain("OR m.id IS NOT NULL");
  });

  it("rejects direct reads of a locked lesson before returning its content", async () => {
    const lockedQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "lesson-2", course_id: "course-1", title: "Move", content: {}, ordinal: 2, created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals" }]);
    const lockedService = new LearningService(
      { $queryRaw: lockedQuery } as never,
      { classroomIds: jest.fn().mockResolvedValue([]), isSystemAdministrator: jest.fn().mockReturnValue(false) } as never,
      { coursePath: jest.fn().mockResolvedValue({ lessons: [{ id: "lesson-2", status: "locked", lockReason: "Complete L1" }] }) } as never,
    );

    await expect(lockedService.lesson(user, "lesson-2")).rejects.toBeInstanceOf(ConflictException);
    expect(lockedQuery).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the authoritative progression path cannot be resolved", async () => {
    const pathFailure = new Error("progression unavailable");
    const scopedQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "lesson-2", course_id: "course-1", title: "Move", content: {}, ordinal: 2, created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals" }]);
    const scopedService = new LearningService(
      { $queryRaw: scopedQuery } as never,
      { isSystemAdministrator: jest.fn().mockReturnValue(false) } as never,
      { coursePath: jest.fn().mockRejectedValue(pathFailure) } as never,
    );

    await expect(scopedService.lesson(user, "lesson-2")).rejects.toBe(pathFailure);
    expect(scopedQuery).toHaveBeenCalledTimes(2);
  });

  it("returns the existing in-progress attempt for an idempotent retry",async()=>{queryRaw.mockResolvedValue([{classroom_id:"class-a",max_attempts:3}]);const existing={id:"attempt-1",classroom_assignment_id:"classroom-assignment-a",learner_user_id:"user-1",attempt_number:1,status:"in_progress",started_at:new Date()};transaction.mockImplementation(async work=>work({$executeRaw:executeRaw,$queryRaw:jest.fn().mockResolvedValueOnce([existing])}));await expect(service.startAttempt(user,"classroom-assignment-a")).resolves.toEqual(existing);});

  it("hides unpublished or unavailable assignments", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(service.startAttempt(user, "classroom-assignment-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(assertStudentClassroomAccess).not.toHaveBeenCalled();
  });

  it("denies an attempt once its classroom-assignment limit is reached", async () => {
    queryRaw.mockResolvedValue([{ classroom_id:"class-a", max_attempts:1 }]);
    transaction.mockImplementation(async (work) => work({
      $executeRaw: executeRaw.mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ n:2, existing:1 }]),
    }));
    await expect(service.startAttempt(user, "classroom-assignment-a")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates assignment content and classroom delivery atomically as a draft", async () => {
    const assertTeacherClassroomAccess = jest.fn().mockResolvedValue(undefined);
    const rootQuery = jest.fn().mockResolvedValueOnce([{ id: "lesson-1", organization_id: "org-1" }]);
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "assignment-1" }])
      .mockResolvedValueOnce([{ id: "delivery-1", assignment_id: "assignment-1", status: "draft", published_by: null }]);
    const transaction = jest.fn(async (work) => work({ $queryRaw: txQuery }));
    const draftService = new LearningService(
      { $queryRaw: rootQuery, $transaction: transaction } as never,
      { assertTeacherClassroomAccess } as never,
    );

    const result = await draftService.createAssignment(user, "class-1", {
      lessonId: "lesson-1", title: "Draft challenge", instructions: "Build it",
    });

    expect(assertTeacherClassroomAccess).toHaveBeenCalledWith(user, "class-1");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txQuery).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ id: "delivery-1", status: "draft", published_by: null });
    expect(String(txQuery.mock.calls[1][0])).toContain("draft");
  });

  it("rolls back assignment content when classroom delivery creation fails", async () => {
    const rootQuery = jest.fn().mockResolvedValueOnce([{ id: "lesson-1", organization_id: "org-1" }]);
    const txQuery = jest.fn().mockResolvedValueOnce([{ id: "assignment-1" }]).mockRejectedValueOnce(new Error("delivery failed"));
    const transaction = jest.fn(async (work) => work({ $queryRaw: txQuery }));
    const draftService = new LearningService(
      { $queryRaw: rootQuery, $transaction: transaction } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(draftService.createAssignment(user, "class-1", { lessonId: "lesson-1", title: "Draft" }))
      .rejects.toThrow("delivery failed");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(rootQuery).toHaveBeenCalledTimes(1);
  });

  it("rejects a challenge that is not a published organization or global Blockly challenge", async () => {
    const rootQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "lesson-1", organization_id: "org-1" }])
      .mockResolvedValueOnce([]);
    const draftService = new LearningService(
      { $queryRaw: rootQuery, $transaction: jest.fn() } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(draftService.createAssignment(user, "class-1", {
      lessonId: "lesson-1", challengeId: "challenge-1", title: "Draft",
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("requires symbolic success conditions when classifying a Blockly challenge as schematic-compatible", async () => {
    const rootQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "lesson-1", organization_id: "org-1" }])
      .mockResolvedValueOnce([]);
    const draftService = new LearningService(
      { $queryRaw: rootQuery, $transaction: jest.fn() } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(draftService.createAssignment(user, "class-1", {
      lessonId: "lesson-1", challengeId: "challenge-without-symbolic-rules", title: "Draft",
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(String(rootQuery.mock.calls[1][0])).toContain("learning_challenge_conditions");
  });

  it("publishes a draft and records the authenticated instructor", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "delivery-1", status: "draft" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "delivery-1", assignment_id: "assignment-1", status: "published", published_by: "user-1" }]);
    const transaction = jest.fn(async (work) => work({ $queryRaw: txQuery }));
    const publishService = new LearningService(
      { $transaction: transaction } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await (publishService as unknown as { publishAssignment: Function }).publishAssignment(user, "class-1", "assignment-1");

    expect(result).toMatchObject({ status: "published", published_by: "user-1" });
    expect(txQuery).toHaveBeenCalledTimes(3);
  });

  it("returns the authoritative state when publishing an already published assignment", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "delivery-1", status: "published" }])
      .mockResolvedValueOnce([{ id: "delivery-1", status: "published" }]);
    const transaction = jest.fn(async (work) => work({ $queryRaw: txQuery }));
    const publishService = new LearningService(
      { $transaction: transaction } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await (publishService as unknown as { publishAssignment: Function }).publishAssignment(user, "class-1", "assignment-1");

    expect(result).toMatchObject({ status: "published" });
    expect(txQuery).toHaveBeenCalledTimes(2);
  });

  it.each(["closed", "archived"])("rejects publishing from %s", async (status) => {
    const txQuery = jest.fn().mockResolvedValueOnce([{ id: "delivery-1", status }]);
    const publishService = new LearningService(
      { $transaction: jest.fn(async (work) => work({ $queryRaw: txQuery })) } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect((publishService as unknown as { publishAssignment: Function }).publishAssignment(user, "class-1", "assignment-1"))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    "a student",
    "an instructor outside the classroom",
    "an instructor from another organization",
  ])("denies create and publish for %s", async () => {
    const denied = jest.fn().mockRejectedValue(new NotFoundException("Classroom was not found."));
    const deniedService = new LearningService(
      { $queryRaw: jest.fn(), $transaction: jest.fn() } as never,
      { assertTeacherClassroomAccess: denied } as never,
    );

    await expect(deniedService.createAssignment(user, "forged-class", { lessonId: "lesson-1", title: "Draft" }))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect((deniedService as unknown as { publishAssignment: Function }).publishAssignment(user, "forged-class", "forged-assignment"))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not reveal an assignment from another classroom", async () => {
    const txQuery = jest.fn().mockResolvedValueOnce([]);
    const publishService = new LearningService(
      { $transaction: jest.fn(async (work) => work({ $queryRaw: txQuery })) } as never,
      { assertTeacherClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect((publishService as unknown as { publishAssignment: Function }).publishAssignment(user, "class-1", "assignment-from-class-2"))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it("denies editing shared assignment content unless the instructor can manage every delivery", async () => {
    const assertTeacherClassroomAccess = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotFoundException("Classroom was not found."));
    const update = jest.fn();
    const sharedService = new LearningService(
      { $queryRaw: jest.fn().mockResolvedValue([{ classroom_id: "class-1" }, { classroom_id: "class-other-org" }]), learning_assignments: { update } } as never,
      { assertTeacherClassroomAccess } as never,
    );

    await expect(sharedService.updateAssignment(user, "class-1", "assignment-shared", { title: "Forged edit" }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(assertTeacherClassroomAccess).toHaveBeenNthCalledWith(1, user, "class-1");
    expect(assertTeacherClassroomAccess).toHaveBeenNthCalledWith(2, user, "class-other-org");
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps drafts hidden and returns published work from the authoritative learner query", async () => {
    const studentQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ classroom_assignment_id: "delivery-1", title: "Published" }]);
    const studentService = new LearningService(
      { $queryRaw: studentQuery } as never,
      {} as never,
    );

    await expect(studentService.myLearning(user)).resolves.toEqual([]);
    await expect(studentService.myLearning(user)).resolves.toEqual([{ classroom_assignment_id: "delivery-1", title: "Published" }]);
    for (const [template] of studentQuery.mock.calls) {
      const sql = String(template);
      expect(sql).toContain("ca.status='published'");
      expect(sql).toContain("cm.classroom_role='student'");
      expect(sql).toContain("m.organization_id=c.organization_id");
    }
  });

  it("returns enriched lesson read model with normalized content, objectives, and progression status", async () => {
    const lessonQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "lesson-1", course_id: "course-1", title: "Meet Your Robot", content: { version: 1, summary: "Identify safe robot-lab behavior" }, ordinal: 1, created_at: new Date() }]) // lesson
      .mockResolvedValueOnce([{ id: "course-1", title: "Robotics Fundamentals" }]) // courses
      .mockResolvedValueOnce([{ code: "C1-L1", description: "Identify robot components", competency_code: "C1.SAFETY", competency_title: "Safety" }]) // objectives
      .mockResolvedValueOnce([{ assignment_id: "assign-1", classroom_assignment_id: "ca-1", title: "Safety Knowledge Check", instructions: "Answer", allowed_blocks: [], constraints: { kind: "knowledge_check" } }]) // assignments
      .mockResolvedValueOnce([]); // attempts

    const mockProgression = {
      coursePath: jest.fn().mockResolvedValue({
        course: { id: "course-1", title: "Robotics Fundamentals" },
        progressPercent: 0,
        currentLessonId: "lesson-1",
        lessons: [{ id: "lesson-1", status: "current", progressPercent: 0, lockReason: null, prerequisite: [] }],
      }),
      assertPrerequisites: jest.fn(),
    };

    const enrichedService = new LearningService(
      { $queryRaw: lessonQuery } as never,
      { classroomIds: jest.fn().mockResolvedValue([]), isSystemAdministrator: jest.fn().mockReturnValue(false) } as never,
      mockProgression as never,
    );

    const result = await enrichedService.lesson(user, "lesson-1");
    expect(result.id).toBe("lesson-1");
    expect(result.title).toBe("Meet Your Robot");
    expect(result.status).toBe("current");
    expect(result.content.summary).toBe("Identify safe robot-lab behavior");
    expect(result.objectives).toHaveLength(1);
    expect(result.objectives[0].code).toBe("C1-L1");
    expect(result.assignment).toMatchObject({ classroomAssignmentId: "ca-1" });
  });

  it("blocks starting an attempt on a locked lesson with ConflictException", async () => {
    const mockProgression = {
      assertPrerequisites: jest.fn().mockRejectedValue(new ConflictException({
        code: "PREREQUISITE_NOT_COMPLETED",
        prerequisiteLessonId: "lesson-1",
        message: "Complete Meet Your Robot before starting this lesson.",
      })),
    };

    const blockedService = new LearningService(
      { $queryRaw: jest.fn().mockResolvedValue([{ classroom_id: "class-1", lesson_id: "lesson-2", max_attempts: 3 }]) } as never,
      { assertStudentClassroomAccess: jest.fn().mockResolvedValue(undefined) } as never,
      mockProgression as never,
    );

    await expect(blockedService.startAttempt(user, "ca-locked"))
      .rejects.toThrow(ConflictException);
    expect(mockProgression.assertPrerequisites).toHaveBeenCalledWith(expect.anything(), user.vistaUserId, "lesson-2");
  });
});

