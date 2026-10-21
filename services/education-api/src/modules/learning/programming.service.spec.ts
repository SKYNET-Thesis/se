import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ProgrammingService } from "./programming.service";

const user = {
  authUserId: "auth-1", vistaUserId: "user-1", email: "student@vista.test", status: "active",
  systemRoleCodes: [], systemPermissions: [],
  memberships: [{ id:"member-1", organizationId:"org-1", roleCode:"student", status:"active", permissions:["learning.work.write"] }],
};
const validRobotProgram = { schemaVersion: 1, kind: "robot_program", steps: [{ type:"wait", durationMs:100 }] };

describe("ProgrammingService M2C", () => {
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const assertStudentClassroomAccess = jest.fn();
  const service = new ProgrammingService({ $queryRaw: queryRaw, $transaction: transaction } as never, { assertStudentClassroomAccess } as never);

  beforeEach(() => {
    queryRaw.mockReset(); transaction.mockReset(); assertStudentClassroomAccess.mockReset();
    assertStudentClassroomAccess.mockResolvedValue(undefined);
  });

  it("rejects unsupported RobotProgram actions before persistence", async () => {
    await expect(service.createProgram(user, "attempt-1", { workspaceJson:{}, robotProgram:{ schemaVersion:1, kind:"robot_program", steps:[{ type:"move.cartesian" }] } }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates a program only for the current learner's scoped attempt", async () => {
    transaction.mockImplementation(async (work) => work({
      $queryRaw: jest.fn().mockResolvedValueOnce([{ attempt_id:"attempt-1", classroom_id:"class-1", assignment_id:"assignment-1", program_id:null }])
        .mockResolvedValueOnce([{ id:"program-1", owner_user_id:"user-1", assignment_id:"assignment-1", title:"My work", schema_version:1, workspace_json:{}, robot_program:validRobotProgram, validation_result:{ valid:true } }]),
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    }));
    const result = await service.createProgram(user, "attempt-1", { title:"My work", workspaceJson:{ blocks:[] }, robotProgram:validRobotProgram });
    expect(assertStudentClassroomAccess).toHaveBeenCalledWith(user, "class-1");
    expect(result.id).toBe("program-1");
  });

  it("rejects a submission version that belongs to a different program", async () => {
    transaction.mockImplementation(async (work) => work({
      $queryRaw: jest.fn().mockResolvedValueOnce([{ attempt_id:"attempt-1", classroom_id:"class-1", assignment_id:"assignment-1", program_id:"program-1" }])
        .mockResolvedValueOnce([]),
      $executeRaw: jest.fn(),
    }));
    await expect(service.submit(user, "attempt-1", { programVersionId:"00000000-0000-0000-0000-000000000001" }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not reveal another learner's attempt as a program", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(service.programForAttempt(user, "attempt-other")).rejects.toBeInstanceOf(NotFoundException);
  });
});
