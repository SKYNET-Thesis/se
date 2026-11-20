import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ChallengeAuthoringService } from "./challenge-authoring.service";
import { SymbolicRuleCompilerService } from "./symbolic-rules/symbolic-rule-compiler.service";

const instructor = { authUserId: "a", vistaUserId: "u1", email: "i@x.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [{ id: "m", organizationId: "org-1", roleCode: "instructor", status: "active", permissions: ["learning.course.author", "learning.course.publish"] }] };
const student = { ...instructor, memberships: [{ id: "m", organizationId: "org-1", roleCode: "student", status: "active", permissions: [] }] };
const scope = {
  isSystemAdministrator: () => false,
  authoringOrganizationIds: (u: typeof instructor) => u.memberships.filter((m) => m.permissions.includes("learning.course.author")).map((m) => m.organizationId),
  canAuthorOrganization: (u: typeof instructor, org: string | null) => org !== null && u.memberships.some((m) => m.organizationId === org && m.permissions.includes("learning.course.author")),
  canPublishOrganization: (u: typeof instructor, org: string | null) => org !== null && u.memberships.some((m) => m.organizationId === org && m.permissions.includes("learning.course.publish")),
};
const valid = { title: "Open and close", allowedBlocks: ["gripper.open", "wait", "gripper.close"], conditions: [{ ruleKey: "ordered_actions", ruleConfig: { actions: ["gripper.open", "gripper.close"] } }] };

describe("ChallengeAuthoringService", () => {
  const queryRaw = jest.fn(); const create = jest.fn(); const count = jest.fn(); const del = jest.fn(); const update = jest.fn(); const condCreate = jest.fn(); const condDelete = jest.fn(); const findMany = jest.fn();
  const tx = { learning_challenges: { create, update }, learning_challenge_conditions: { create: condCreate, deleteMany: condDelete } };
  const prisma = { $queryRaw: queryRaw, learning_assignments: { count }, learning_challenges: { delete: del, update }, learning_challenge_conditions: { count, findMany }, $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const service = new ChallengeAuthoringService(prisma as never, scope as never, new SymbolicRuleCompilerService());
  beforeEach(() => { [queryRaw, create, count, del, update, condCreate, condDelete, findMany].forEach((m) => m.mockReset()); create.mockResolvedValue({ id: "c1" }); findMany.mockResolvedValue([]); count.mockResolvedValue(0); });

  it("rejects a caller without authoring permission without touching data", async () => {
    await expect(service.create(student as never, valid)).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing title", { ...valid, title: "  " }],
    ["no blocks", { ...valid, allowedBlocks: [] }],
    ["unknown block", { ...valid, allowedBlocks: ["fly.away"] }],
    ["no rules", { ...valid, conditions: [] }],
    ["unsupported rule", { ...valid, conditions: [{ ruleKey: "teleport", ruleConfig: {} }] }],
    ["an action the toolbox does not offer", { ...valid, allowedBlocks: ["gripper.open"], conditions: [{ ruleKey: "ordered_actions", ruleConfig: { actions: ["gripper.open", "gripper.close"] } }] }],
    ["a target rule without the Move block", { ...valid, conditions: [{ ruleKey: "preview_target_match", ruleConfig: { frame: "learning_preview_v1", arm: "left", position: { x: 240, y: 220, z: 120 } } }] }],
    ["a duration rule without the Wait block", { ...valid, allowedBlocks: ["gripper.open"], conditions: [{ ruleKey: "symbolic_duration", ruleConfig: { comparator: "gte", durationMs: 1000 } }] }],
    ["an object grasp rule without Close and Move", { ...valid, conditions: [{ ruleKey: "object_grasped", ruleConfig: {} }] }],
    ["target position not a whole number", { ...valid, allowedBlocks: ["preview.move_xyz"], conditions: [{ ruleKey: "preview_target_match", ruleConfig: { frame: "learning_preview_v1", arm: "left", position: { x: 1.5, y: 2, z: 3 } } }] }],
    ["invalid rule config", { ...valid, conditions: [{ ruleKey: "final_gripper_state", ruleConfig: { arm: "middle", state: "closed" } }] }],
    ["unknown config property", { ...valid, conditions: [{ ruleKey: "arm_selected", ruleConfig: { arm: "left", extra: 1 } }] }],
    ["target out of range", { ...valid, target: { arm: "left" as const, x: 5000, y: 0, z: 0 } }],
  ])("refuses %s with a readable 400", async (_name, body) => {
    await expect(service.create(instructor as never, body as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates an organization-scoped draft and stores the toolbox with its rules", async () => {
    queryRaw.mockResolvedValue([{ id: "c1", title: "Open and close", description: "", status: "draft", organization_id: "org-1", tabletop_config: { allowedBlocks: valid.allowedBlocks, target: null } }]);
    await service.create(instructor as never, valid);
    expect(create.mock.calls[0][0].data).toMatchObject({ organization_id: "org-1", status: "draft", permitted_modes: ["blockly"], tabletop_config: { allowedBlocks: valid.allowedBlocks } });
    expect(condCreate).toHaveBeenCalledTimes(1);
  });

  it("accepts the newer rules when the toolbox can satisfy them and derives the student-visible target from the target rule", async () => {
    queryRaw.mockResolvedValue([{ id: "c1", title: "T", description: "", status: "draft", organization_id: "org-1", tabletop_config: {} }]);
    await service.create(instructor as never, {
      title: "Reach and grasp", allowedBlocks: ["arm.select", "home", "preview.move_xyz", "gripper.open", "gripper.close", "wait"],
      conditions: [
        { ruleKey: "preview_target_match", ruleConfig: { frame: "learning_preview_v1", arm: "left", position: { x: 240, y: 220, z: 120 } } },
        { ruleKey: "object_grasped", ruleConfig: { arm: "left" } }, { ruleKey: "object_lifted", ruleConfig: { minZ: 80 } }, { ruleKey: "object_released", ruleConfig: {} },
        { ruleKey: "object_in_target_zone", ruleConfig: {} }, { ruleKey: "symbolic_duration", ruleConfig: { comparator: "gte", durationMs: 500 } }],
    });
    expect(create.mock.calls[0][0].data.tabletop_config).toMatchObject({ target: { arm: "left", x: 240, y: 220, z: 120 } });
    expect(condCreate).toHaveBeenCalledTimes(6);
  });

  it("will not edit or delete a challenge that an assignment already uses", async () => {
    queryRaw.mockResolvedValue([{ id: "c1", title: "T", description: "", status: "published", organization_id: "org-1", tabletop_config: {} }]);
    count.mockResolvedValue(2);
    await expect(service.update(instructor as never, "c1", { title: "New" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(instructor as never, "c1")).rejects.toBeInstanceOf(ConflictException);
    expect(del).not.toHaveBeenCalled();
  });

  it("cannot publish a challenge without rules", async () => {
    queryRaw.mockResolvedValue([{ id: "c1", title: "T", description: "", status: "draft", organization_id: "org-1", tabletop_config: {} }]);
    count.mockResolvedValue(0);
    await expect(service.publish(instructor as never, "c1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("hides another school's challenge (owner query returns nothing)", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(service.get(instructor as never, "other")).rejects.toBeInstanceOf(NotFoundException);
  });
});
