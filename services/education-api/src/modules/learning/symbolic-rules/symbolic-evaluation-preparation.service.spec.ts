import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { SymbolicRuleCompilerService } from "./symbolic-rule-compiler.service";
import { SymbolicRuleEvaluatorService } from "./symbolic-rule-evaluator.service";
import { SymbolicEvaluationPreparationService } from "./symbolic-evaluation-preparation.service";

const user = { authUserId: "auth-1", vistaUserId: "student-1", email: "student@vista.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [{ id: "member-1", organizationId: "org-1", roleCode: "student", status: "active", permissions: ["learning.work.write", "learning.experiment.execute"] }] };
const output = { schemaVersion: 1, engineVersion: "vista-schematic-1", robotProgramVersionId: "version-1", timeline: [{ index: 0, atMs: 0, type: "arm.select", selectedArm: "left" }, { index: 1, atMs: 0, type: "wait", durationMs: 100 }], finalState: { selectedArm: "left", grippers: { left: "open", right: "open" } }, warnings: [] };
const chain = (overrides: Record<string, unknown> = {}) => ({ experiment_id: "experiment-1", learner_user_id: "student-1", status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "attempt-1", programVersionId: "version-1" }, output_snapshot: output, submission_id: "submission-1", assignment_id: "assignment-1", program_version_id: "version-1", challenge_id: "challenge-1", classroom_id: "classroom-1", robot_program: { kind: "robot_program", schemaVersion: 1, steps: [{ type: "wait", durationMs: 100 }] }, ...overrides });
const conditions: Array<{ id: string; ordinal: number; rule_key: string; rule_config: unknown }> = [{ id: "condition-1", ordinal: 1, rule_key: "action_present", rule_config: { action: "wait" } }];

describe("SymbolicEvaluationPreparationService", () => {
  const queryRaw = jest.fn(); const assertStudentClassroomAccess = jest.fn();
  const service = new SymbolicEvaluationPreparationService({ $queryRaw: queryRaw } as never, { assertStudentClassroomAccess } as never, new SymbolicRuleCompilerService(), new SymbolicRuleEvaluatorService());
  beforeEach(() => { queryRaw.mockReset(); assertStudentClassroomAccess.mockReset(); assertStudentClassroomAccess.mockResolvedValue(undefined); });
  const prepare = async (row = chain(), rules = conditions) => { queryRaw.mockResolvedValueOnce([row]).mockResolvedValueOnce(rules); return service.prepareForOwnExperiment(user, "experiment-1"); };

  it("loads only an own successful schematic chain and creates deterministic immutable preparation", async () => {
    const prepared = await prepare();
    expect(assertStudentClassroomAccess).toHaveBeenCalledWith(user, "classroom-1");
    expect(prepared).toMatchObject({ experimentId: "experiment-1", submissionId: "submission-1", programVersionId: "version-1", requestedByUserId: "student-1", evaluatorVersion: "vista-symbolic-evaluator-1" });
    expect(prepared.ruleSet.ruleSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not disclose another learner experiment", async () => { queryRaw.mockResolvedValueOnce([]); await expect(service.prepareForOwnExperiment(user, "other-experiment")).rejects.toBeInstanceOf(NotFoundException); });
  it("rejects inactive users before querying", async () => { await expect(service.prepareForOwnExperiment({ ...user, status: "disabled" }, "experiment-1")).rejects.toBeInstanceOf(ForbiddenException); expect(queryRaw).not.toHaveBeenCalled(); });
  it("rejects a missing execution capability or inactive classroom scope without compiling rules", async () => { await expect(service.prepareForOwnExperiment({ ...user, memberships: [{ ...user.memberships[0], permissions: ["learning.work.write"] }] }, "experiment-1")).rejects.toBeInstanceOf(NotFoundException); expect(queryRaw).not.toHaveBeenCalled(); queryRaw.mockResolvedValueOnce([chain()]); assertStudentClassroomAccess.mockRejectedValueOnce(new NotFoundException()); await expect(service.prepareForOwnExperiment(user, "experiment-1")).rejects.toBeInstanceOf(NotFoundException); });
  it("rejects a chain without a persisted assignment challenge", async () => { await expect(prepare(chain({ challenge_id: null }))).rejects.toBeInstanceOf(BadRequestException); });
  it("rejects malformed or unknown persisted challenge conditions", async () => {
    await expect(prepare(chain(), [{ ...conditions[0], rule_config: { action: "wait", extra: true } }])).rejects.toMatchObject({ code: "UNKNOWN_CONFIG_PROPERTY" });
    queryRaw.mockReset(); await expect(prepare(chain(), [{ ...conditions[0], rule_key: "collision_free", rule_config: {} }])).rejects.toMatchObject({ code: "UNKNOWN_RULE_KEY" });
  });
  it("rejects mismatched submitted ProgramVersion provenance", async () => { await expect(prepare(chain({ input_snapshot: { attemptId: "attempt-1", programVersionId: "other-version" } }))).rejects.toBeInstanceOf(BadRequestException); });
  it("rejects persisted output that does not belong to the submitted ProgramVersion", async () => { await expect(prepare(chain({ output_snapshot: { ...output, robotProgramVersionId: "other-version" } }))).rejects.toBeInstanceOf(BadRequestException); });
  it("rejects non-succeeded or non-schematic experiments", async () => { await expect(prepare(chain({ status: "running" }))).rejects.toBeInstanceOf(BadRequestException); queryRaw.mockReset(); await expect(prepare(chain({ execution_mode: "simulation" }))).rejects.toBeInstanceOf(BadRequestException); });
  it("changes semantic hash and fingerprint after mutable conditions change without relying on old conditions", async () => {
    const first = await prepare(); queryRaw.mockReset();
    const second = await prepare(chain(), [{ ...conditions[0], rule_config: { action: "arm.select" } }]);
    expect(second.ruleSet.ruleSetHash).not.toBe(first.ruleSet.ruleSetHash); expect(second.fingerprint).not.toBe(first.fingerprint);
    expect(first.ruleSet.rules[0]).toMatchObject({ action: "wait" });
  });
});
