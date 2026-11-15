import { NotFoundException } from "@nestjs/common";
import { SymbolicEvaluationService } from "./symbolic-evaluation.service";

const user = { authUserId: "auth-1", vistaUserId: "student-1", email: "student@vista.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [] };
const prepared = { assignmentKind: "symbolic_program", attemptId: "attempt-1", experimentId: "experiment-1", submissionId: "submission-1", programVersionId: "version-1", requestedByUserId: "student-1", evaluatorVersion: "vista-symbolic-evaluator-1" as const, schematic: { schemaVersion: 1 as const, engineVersion: "vista-schematic-1", robotProgramVersionId: "version-1", timeline: [], finalState: { selectedArm: null, grippers: { left: "open" as const, right: "open" as const } }, warnings: [] }, ruleSet: { kind: "symbolic_rule_set" as const, schemaVersion: 1 as const, rules: [], sources: [], canonicalJson: "{}", ruleSetHash: "rules-a" }, programHash: "program-a", outputSnapshotHash: "output-a", fingerprint: "fingerprint-a" };
const row = { id: "evaluation-1", experiment_id: "experiment-1", program_version_id: "version-1", evaluator_version: "vista-symbolic-evaluator-1", rule_set_schema_version: 1, rule_set_hash: "rules-a", verdict: "passed", rule_results: [], metrics: { ruleCount: 0, passedRuleCount: 0 }, created_at: new Date("2026-10-15T00:00:00Z") };

describe("SymbolicEvaluationService", () => {
  const queryRaw = jest.fn(); const transaction = jest.fn(); const preparation = { prepareForOwnExperiment: jest.fn() }; const evaluator = { evaluate: jest.fn() }; const progression = { projectSymbolicPass: jest.fn() };
  const service = new SymbolicEvaluationService({ $queryRaw: queryRaw, $transaction: transaction } as never, preparation as never, evaluator as never, progression as never);
  beforeEach(() => { queryRaw.mockReset(); transaction.mockReset(); preparation.prepareForOwnExperiment.mockReset().mockResolvedValue(prepared); evaluator.evaluate.mockReset().mockReturnValue({ verdict: "passed", rules: [], metrics: row.metrics }); progression.projectSymbolicPass.mockReset().mockResolvedValue({ completedLessonId: "lesson-1", newlyUnlockedLessonIds: ["lesson-2"] }); });
  it("persists evidence, marks its attempt evaluated, and projects PASS atomically", async () => { const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{id:"attempt-1"}]) }; transaction.mockImplementation(async (work) => work(tx)); await expect(service.evaluateOwnExperiment(user, "experiment-1")).resolves.toMatchObject({ id: "evaluation-1", verdict: "passed", programVersionId: "version-1", progression: { completedLessonId: "lesson-1", newlyUnlockedLessonIds: ["lesson-2"] } }); expect(progression.projectSymbolicPass).toHaveBeenCalledWith(tx,user,{evaluationId:"evaluation-1",attemptId:"attempt-1",programVersionId:"version-1",verdict:"passed"}); });
  it("does not mark the attempt when evidence persistence fails", async () => { const txQuery = jest.fn().mockRejectedValueOnce(new Error("write failed")); const txExecute = jest.fn(); transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery, $executeRaw: txExecute })); await expect(service.evaluateOwnExperiment(user, "experiment-1")).rejects.toThrow("write failed"); expect(txExecute).not.toHaveBeenCalled(); });
  it("converges duplicate evidence before marking evaluated", async () => { const txQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]).mockResolvedValueOnce([{id:"attempt-1"}]); transaction.mockImplementation(async (work) => work({ $queryRaw: txQuery })); await expect(service.evaluateOwnExperiment(user, "experiment-1")).resolves.toMatchObject({ id: "evaluation-1" }); expect(txQuery).toHaveBeenCalledTimes(3); });
  it("rolls back when the owning attempt cannot transition",async()=>{const txQuery=jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]);transaction.mockImplementation(async work=>work({$queryRaw:txQuery}));await expect(service.evaluateOwnExperiment(user,"experiment-1")).rejects.toThrow("Attempt could not be finalized");});
  it("persists a failed verdict without completing progression", async () => { evaluator.evaluate.mockReturnValue({ verdict: "failed", rules: [{ ordinal: 1, passed: false }], metrics: { ruleCount: 1, passedRuleCount: 0 } }); const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([{ ...row, verdict: "failed", rule_results: [{ ordinal: 1, passed: false }], metrics: { ruleCount: 1, passedRuleCount: 0 } }]).mockResolvedValueOnce([{id:"attempt-1"}]) }; transaction.mockImplementation(async (work) => work(tx)); progression.projectSymbolicPass.mockResolvedValue({ completedLessonId:null,newlyUnlockedLessonIds:[] }); await expect(service.evaluateOwnExperiment(user, "experiment-1")).resolves.toMatchObject({ verdict: "failed", progression:{completedLessonId:null,newlyUnlockedLessonIds:[]} }); expect(progression.projectSymbolicPass).toHaveBeenCalledWith(tx,user,expect.objectContaining({verdict:"failed"})); });
  it("rolls back evidence when progression persistence fails",async()=>{const tx={ $queryRaw:jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{id:"attempt-1"}])};transaction.mockImplementation(async work=>work(tx));progression.projectSymbolicPass.mockRejectedValueOnce(new Error("progress write failed"));await expect(service.evaluateOwnExperiment(user,"experiment-1")).rejects.toThrow("progress write failed");});
  it("reports and persists the evaluated ProgramVersion number, not a fixed version 1", async () => {
    preparation.prepareForOwnExperiment.mockResolvedValueOnce({ ...prepared, versionNumber: 3 });
    const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "attempt-1" }]) };
    transaction.mockImplementation(async (work) => work(tx));
    const response = await service.evaluateOwnExperiment(user, "experiment-1");
    expect(response.versionNumber).toBe(3);
    expect(response.evidence?.versionNumber).toBe(3);
    const persistedSnapshot = (tx.$queryRaw.mock.calls[1] as unknown[]).find((value) => typeof value === "string" && value.includes("\"evidence\"")) as string;
    expect(JSON.parse(persistedSnapshot).evidence.versionNumber).toBe(3);
  });
  describe("evaluating the submitted version of a non-curriculum (teacher-created) assignment", () => {
    it.each([[null], ["knowledge_check"]])("records evidence, finalizes the attempt and completes no lesson (assignment kind %p)", async (kind) => {
      preparation.prepareForOwnExperiment.mockResolvedValueOnce({ ...prepared, assignmentKind: kind, submissionStatus: "submitted" });
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "attempt-1" }]) };
      transaction.mockImplementation(async (work) => work(tx));
      await expect(service.evaluateOwnExperiment(user, "experiment-1")).resolves.toMatchObject({ id: "evaluation-1", verdict: "passed", attemptId: "attempt-1", progression: { completedLessonId: null, newlyUnlockedLessonIds: [] } });
      expect(progression.projectSymbolicPass).not.toHaveBeenCalled();
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2); // evidence insert + attempt finalization, nothing else is written
    });
    it("still rolls back when the attempt cannot be finalized (immutability of other states is preserved)", async () => {
      preparation.prepareForOwnExperiment.mockResolvedValueOnce({ ...prepared, assignmentKind: null, submissionStatus: "submitted" });
      transaction.mockImplementation(async (work) => work({ $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]) }));
      await expect(service.evaluateOwnExperiment(user, "experiment-1")).rejects.toThrow("Attempt could not be finalized");
      expect(progression.projectSymbolicPass).not.toHaveBeenCalled();
    });
    it("a curriculum (symbolic_program) assignment still projects the PASS and still rolls back when provenance fails", async () => {
      preparation.prepareForOwnExperiment.mockResolvedValue({ ...prepared, assignmentKind: "symbolic_program", submissionStatus: "submitted" });
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "attempt-1" }]) };
      transaction.mockImplementation(async (work) => work(tx));
      await expect(service.evaluateOwnExperiment(user, "experiment-1")).resolves.toMatchObject({ progression: { completedLessonId: "lesson-1" } });
      progression.projectSymbolicPass.mockRejectedValueOnce(new Error("Symbolic PASS provenance could not be verified for progression."));
      transaction.mockImplementation(async (work) => work({ $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "attempt-1" }]) }));
      await expect(service.evaluateOwnExperiment(user, "experiment-1")).rejects.toThrow("provenance");
    });
    it("a simulation run on a draft submission never projects progression for any assignment kind", async () => {
      preparation.prepareForOwnExperiment.mockResolvedValueOnce({ ...prepared, assignmentKind: "symbolic_program", submissionStatus: "draft" });
      transaction.mockImplementation(async (work) => work({ $queryRaw: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "attempt-1" }]) }));
      await service.evaluateOwnExperiment(user, "experiment-1");
      expect(progression.projectSymbolicPass).not.toHaveBeenCalled();
    });
  });
  it("returns only owned evaluation evidence", async () => { queryRaw.mockResolvedValueOnce([row]); await expect(service.own(user, "evaluation-1")).resolves.toMatchObject({ id: "evaluation-1" }); queryRaw.mockResolvedValueOnce([]); await expect(service.own(user, "other")).rejects.toBeInstanceOf(NotFoundException); });
  it("lists only owned evidence", async () => { queryRaw.mockResolvedValueOnce([row]); await expect(service.mine(user)).resolves.toHaveLength(1); });
});
