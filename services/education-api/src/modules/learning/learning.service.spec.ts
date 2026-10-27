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
});
