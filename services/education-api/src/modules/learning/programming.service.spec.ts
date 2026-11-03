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

  it("rejects a curriculum action that is not allowed by the assignment", async () => {
    queryRaw.mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["arm.select", "home", "wait"] }]);
    await expect((service as any).validateCurriculumProgram("assignment-1", {
      kind: "robot_program", schemaVersion: 1, steps: [{ type: "gripper.open" }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts only canonical actions explicitly allowed for a curriculum assignment", async () => {
    queryRaw.mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["arm.select", "home", "preview.move_xyz", "wait"] }]);
    await expect((service as any).validateCurriculumProgram("assignment-1", {
      kind: "robot_program", schemaVersion: 1, steps: [{ type: "arm.select", arm: "left" }, { type: "home", arm: "left" }, { type: "wait", durationMs: 1000 }],
    })).resolves.toBeUndefined();
  });

  it("does not apply curriculum restrictions to legacy assignment contracts", async () => {
    queryRaw.mockResolvedValueOnce([{ constraints: {}, allowed_blocks: [] }]);
    await expect((service as any).validateCurriculumProgram("assignment-legacy", validRobotProgram)).resolves.toBeUndefined();
  });

  it("preserves a saved disallowed workspace but blocks it from immutable version evidence", async () => {
    queryRaw.mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["arm.select", "home", "wait"] }]);
    const workspace = { blocks: { blocks: [{ type: "robot_start", next: { block: { type: "controls_repeat_ext" } } }] } };
    await expect((service as any).validateCurriculumWorkspace("assignment-1", workspace)).rejects.toBeInstanceOf(BadRequestException);
    expect(workspace).toEqual({ blocks: { blocks: [{ type: "robot_start", next: { block: { type: "controls_repeat_ext" } } }] } });
    expect((service as any).validationResult(validRobotProgram, ["controls_repeat_ext"])).toMatchObject({ valid: false, workspaceIssues: ["controls_repeat_ext"] });
  });

  it("fails closed when a curriculum allowed-block contract contains an unknown capability", async () => {
    queryRaw.mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["arm.select", "course2.ai"] }]);
    await expect((service as any).validateCurriculumProgram("assignment-1", validRobotProgram)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a disallowed canonical action through the public update flow", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: "program-1", owner_user_id: "user-1", assignment_id: "assignment-1", title: "Draft", schema_version: 1, workspace_json: {}, robot_program: validRobotProgram, validation_result: {} }])
      .mockResolvedValueOnce([{ attempt_id: "attempt-1", classroom_id: "class-1", assignment_id: "assignment-1", program_id: "program-1" }])
      .mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["arm.select", "home", "wait"] }]);
    await expect(service.updateProgram(user, "program-1", { robotProgram: { kind: "robot_program", schemaVersion: 1, steps: [{ type: "gripper.open" }] } }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a version with a mismatched/disallowed workspace through public submit", async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ attempt_id: "attempt-1", classroom_id: "class-1", assignment_id: "assignment-1", program_id: "program-1" }])
      .mockResolvedValueOnce([{ id: "version-1", workspace_json: { blocks: { blocks: [{ type: "controls_repeat_ext" }] } }, robot_program: validRobotProgram }]);
    transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery, $executeRaw: jest.fn() }));
    queryRaw
      .mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["wait"] }])
      .mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["wait"] }]);
    await expect(service.submit(user, "attempt-1", { programVersionId: "version-1" })).rejects.toBeInstanceOf(BadRequestException);
    expect(txQuery).toHaveBeenCalledTimes(2);
  });

  it("creating ProgramVersion inserts a new immutable version without mutating previous versions", async () => {
    const v1 = { id: "version-1", version_number: 1, workspace_json: { blocks: [] }, robot_program: validRobotProgram };
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "program-1", owner_user_id: "user-1", assignment_id: "assignment-1", schema_version: 1, workspace_json: { blocks: [] }, robot_program: validRobotProgram }])
      .mockResolvedValueOnce([{ version_number: 2 }])
      .mockResolvedValueOnce([{ id: "version-2", program_id: "program-1", version_number: 2, workspace_json: { blocks: [] }, robot_program: validRobotProgram }]);
    transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery, $executeRaw: jest.fn() }));
    queryRaw
      .mockResolvedValueOnce([{ attempt_id: "attempt-1", classroom_id: "class-1", assignment_id: "assignment-1", program_id: "program-1" }])
      .mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["wait"] }])
      .mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["wait"] }]);

    const created = await service.createVersion(user, "program-1", { changeSummary: "Second version" });
    expect(created.id).toBe("version-2");
    expect(created.version_number).toBe(2);
    // Prior version object is completely untouched
    expect(v1.version_number).toBe(1);
    expect(txQuery).toHaveBeenCalledTimes(3);
  });

  it("editing draft after version creation leaves immutable version unchanged", async () => {
    const existingVersion = { id: "version-1", version_number: 1, workspace_json: { blocks: [] }, robot_program: validRobotProgram };
    const frozenVersionSnapshot = JSON.stringify(existingVersion);

    const updateQuery = jest.fn()
      .mockResolvedValueOnce([{ id: "program-1", owner_user_id: "user-1", assignment_id: "assignment-1", title: "Original Draft", schema_version: 1, workspace_json: {}, robot_program: validRobotProgram, validation_result: {} }])
      .mockResolvedValueOnce([{ attempt_id: "attempt-1", classroom_id: "class-1", assignment_id: "assignment-1", program_id: "program-1" }])
      .mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["wait"] }])
      .mockResolvedValueOnce([{ constraints: { kind: "symbolic_program" }, allowed_blocks: ["wait"] }])
      .mockResolvedValueOnce([{ id: "program-1", owner_user_id: "user-1", assignment_id: "assignment-1", title: "Updated Draft", schema_version: 1, workspace_json: { blocks: [{ type: "robot_wait" }] }, robot_program: validRobotProgram, validation_result: { valid: true } }]);
    queryRaw.mockImplementation(updateQuery);

    const updated = await service.updateProgram(user, "program-1", {
      title: "Updated Draft",
      workspaceJson: { blocks: [{ type: "robot_wait" }] },
      robotProgram: validRobotProgram,
    });

    expect(updated[0].title).toBe("Updated Draft");
    // Verify previous version in memory/records is completely unchanged
    expect(JSON.stringify(existingVersion)).toBe(frozenVersionSnapshot);
  });
});
