import { NotFoundException } from "@nestjs/common";
import { SymbolicEvaluationService } from "./symbolic-evaluation.service";

const user = { authUserId: "auth-1", vistaUserId: "student-1", email: "student@vista.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [] };
const prepared = { experimentId: "experiment-1", submissionId: "submission-1", programVersionId: "version-1", requestedByUserId: "student-1", evaluatorVersion: "vista-symbolic-evaluator-1" as const, schematic: { schemaVersion: 1 as const, engineVersion: "vista-schematic-1", robotProgramVersionId: "version-1", timeline: [], finalState: { selectedArm: null, grippers: { left: "open" as const, right: "open" as const } }, warnings: [] }, ruleSet: { kind: "symbolic_rule_set" as const, schemaVersion: 1 as const, rules: [], sources: [], canonicalJson: "{}", ruleSetHash: "rules-a" }, programHash: "program-a", outputSnapshotHash: "output-a", fingerprint: "fingerprint-a" };
const row = { id: "evaluation-1", experiment_id: "experiment-1", program_version_id: "version-1", evaluator_version: "vista-symbolic-evaluator-1", rule_set_schema_version: 1, rule_set_hash: "rules-a", verdict: "passed", rule_results: [], metrics: { ruleCount: 0, passedRuleCount: 0 }, created_at: new Date("2026-10-15T00:00:00Z") };

describe("SymbolicEvaluationService", () => {
  const queryRaw = jest.fn(); const transaction = jest.fn(); const preparation = { prepareForOwnExperiment: jest.fn() }; const evaluator = { evaluate: jest.fn() };
  const service = new SymbolicEvaluationService({ $queryRaw: queryRaw, $transaction: transaction } as never, preparation as never, evaluator as never);
  beforeEach(() => { queryRaw.mockReset(); transaction.mockReset(); preparation.prepareForOwnExperiment.mockReset().mockResolvedValue(prepared); evaluator.evaluate.mockReset().mockReturnValue({ verdict: "passed", rules: [], metrics: row.metrics }); });
  it("persists a completed result from trusted preparation only", async () => { const txQuery = jest.fn().mockResolvedValueOnce([row]); transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery })); const result = await service.evaluateOwnExperiment(user, "experiment-1"); expect(preparation.prepareForOwnExperiment).toHaveBeenCalledWith(user, "experiment-1"); expect(result).toMatchObject({ id: "evaluation-1", verdict: "passed", programVersionId: "version-1" }); expect(txQuery).toHaveBeenCalledTimes(1); });
  it("converges duplicates by loading the unique fingerprint record", async () => { const txQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]); transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery })); await expect(service.evaluateOwnExperiment(user, "experiment-1")).resolves.toMatchObject({ id: "evaluation-1" }); expect(txQuery).toHaveBeenCalledTimes(2); });
  it("persists a failed symbolic verdict as machine evidence, not a score", async () => { evaluator.evaluate.mockReturnValue({ verdict: "failed", rules: [{ ordinal: 1, passed: false }], metrics: { ruleCount: 1, passedRuleCount: 0 } }); const txQuery = jest.fn().mockResolvedValueOnce([{ ...row, verdict: "failed", rule_results: [{ ordinal: 1, passed: false }], metrics: { ruleCount: 1, passedRuleCount: 0 } }]); transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery })); await expect(service.evaluateOwnExperiment(user, "experiment-1")).resolves.toMatchObject({ verdict: "failed", metrics: { passedRuleCount: 0 } }); });
  it("returns only an evaluation owned through the learner experiment chain", async () => { queryRaw.mockResolvedValueOnce([row]); await expect(service.own(user, "evaluation-1")).resolves.toMatchObject({ id: "evaluation-1" }); queryRaw.mockResolvedValueOnce([]); await expect(service.own(user, "other-evaluation")).rejects.toBeInstanceOf(NotFoundException); });
  it("lists only evaluations owned through the learner's own experiment chain", async () => {
    queryRaw.mockResolvedValueOnce([row]);
    await expect(service.mine(user)).resolves.toEqual([expect.objectContaining({ id: "evaluation-1" })]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
