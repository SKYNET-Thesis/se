import { NotFoundException } from "@nestjs/common";
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

  it("derives learner identity from CurrentUser and creates the next own attempt", async () => {
    queryRaw.mockResolvedValue([{ classroom_id:"class-a", max_attempts:3 }]);
    transaction.mockImplementation(async (work) => work({
      $executeRaw: executeRaw.mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValueOnce([{ n:2, existing:1 }]).mockResolvedValueOnce([{ id:"attempt-2", learner_user_id:"user-1", attempt_number:2 }]),
    }));
    const result = await service.startAttempt(user, "classroom-assignment-a");
    expect(assertStudentClassroomAccess).toHaveBeenCalledWith(user, "class-a");
    expect(result).toEqual({ id:"attempt-2", learner_user_id:"user-1", attempt_number:2 });
  });

  it("hides unpublished or unavailable assignments", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(service.startAttempt(user, "classroom-assignment-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(assertStudentClassroomAccess).not.toHaveBeenCalled();
  });

  it("denies an attempt once its classroom-assignment limit is reached", async () => {
    queryRaw.mockResolvedValue([{ classroom_id:"class-a", max_attempts:1 }]);
    transaction.mockImplementation(async (work) => work({
      $executeRaw: executeRaw.mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ n:2, existing:1 }]),
    }));
    await expect(service.startAttempt(user, "classroom-assignment-a")).rejects.toBeInstanceOf(NotFoundException);
  });
});
