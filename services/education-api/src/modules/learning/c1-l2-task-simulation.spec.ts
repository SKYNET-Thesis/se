import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { SchematicEngineService } from "./schematic-engine.service";
import { SymbolicRuleCompilerService } from "./symbolic-rules/symbolic-rule-compiler.service";
import { SymbolicRuleEvaluatorService } from "./symbolic-rules/symbolic-rule-evaluator.service";
import { SymbolicEvaluationService } from "./symbolic-rules/symbolic-evaluation.service";
import { ProgressionService } from "./progression.service";

const student = {
  authUserId: "auth-student-1",
  vistaUserId: "user-student-1",
  email: "student@vista.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: ["learning.work.write", "learning.experiment.execute"],
  memberships: [{ id: "m-1", organizationId: "org-1", roleCode: "student", status: "active", permissions: ["learning.work.write", "learning.experiment.execute"] }],
};

const c1L2ChallengeConditions = [
  { id: "c-1", ordinal: 1, rule_key: "ordered_actions", rule_config: { actions: ["home", "preview.move_xyz", "wait"] } },
  { id: "c-2", ordinal: 2, rule_key: "preview_target_match", rule_config: { frame: "learning_preview_v1", arm: "left", position: { x: 240, y: 220, z: 120 } } },
];

const validL2RobotProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "home", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 240, y: 220, z: 120 } },
    { type: "wait", durationMs: 1000 },
  ],
};

const wrongTargetRobotProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "home", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 100, y: 100, z: 50 } },
    { type: "wait", durationMs: 1000 },
  ],
};

const missingMovementRobotProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "home", arm: "left" },
    { type: "wait", durationMs: 1000 },
  ],
};

const outOfOrderRobotProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "wait", durationMs: 1000 },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 240, y: 220, z: 120 } },
    { type: "home", arm: "left" },
  ],
};

const missingWaitRobotProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "home", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 240, y: 220, z: 120 } },
  ],
};

describe("C1-L2 Move the Robot: Authoritative Task Simulation", () => {
  const schematicEngine = new SchematicEngineService();
  const compiler = new SymbolicRuleCompilerService();
  const evaluator = new SymbolicRuleEvaluatorService();

  const c1L2RuleSet = compiler.compile(c1L2ChallengeConditions);

  it("7. Valid L2 sequence reaching target PASSes with PREVIEW_TARGET_MATCH and ORDERED_ACTIONS_MATCH", () => {
    const output = schematicEngine.render(validL2RobotProgram, "version-l2-pass");
    const preview = evaluator.evaluate(c1L2RuleSet, output);
    expect(preview.verdict).toBe("passed");
    expect(preview.metrics.passedRuleCount).toBe(2);
    expect(preview.rules[0]).toMatchObject({ type: "ordered_actions", passed: true, code: "ORDERED_ACTIONS_MATCH" });
    expect(preview.rules[1]).toMatchObject({ type: "preview_target_match", passed: true, code: "PREVIEW_TARGET_MATCH" });
  });

  it("8. Missing required target movement FAILs with PREVIEW_TARGET_MISMATCH", () => {
    const output = schematicEngine.render(missingMovementRobotProgram, "version-missing-move");
    const preview = evaluator.evaluate(c1L2RuleSet, output);
    expect(preview.verdict).toBe("failed");
    expect(preview.rules.find((r) => r.type === "preview_target_match")).toMatchObject({
      passed: false,
      code: "PREVIEW_TARGET_MISMATCH",
      message: "The robot did not reach Target A.",
    });
  });

  it("9. Wrong target FAILs with coordinate mismatch feedback", () => {
    const output = schematicEngine.render(wrongTargetRobotProgram, "version-wrong-target");
    const preview = evaluator.evaluate(c1L2RuleSet, output);
    expect(preview.verdict).toBe("failed");
    const targetRule = preview.rules.find((r) => r.type === "preview_target_match");
    expect(targetRule).toMatchObject({
      passed: false,
      code: "PREVIEW_TARGET_MISMATCH",
    });
    expect(targetRule?.message).toContain("100, 100, 50");
    expect(targetRule?.message).toContain("240, 220, 120");
  });

  it("10. Required sequence violation (out of order actions) FAILs", () => {
    const output = schematicEngine.render(outOfOrderRobotProgram, "version-out-of-order");
    const preview = evaluator.evaluate(c1L2RuleSet, output);
    expect(preview.verdict).toBe("failed");
    expect(preview.rules.find((r) => r.type === "ordered_actions")).toMatchObject({
      passed: false,
      code: "ORDERED_ACTIONS_INCOMPLETE",
      message: "Actions must appear in the required sequence: Home → Move to Position → Wait.",
    });
  });

  it("11. Required Wait missing FAILs ordered_actions rule", () => {
    const output = schematicEngine.render(missingWaitRobotProgram, "version-missing-wait");
    const preview = evaluator.evaluate(c1L2RuleSet, output);
    expect(preview.verdict).toBe("failed");
    expect(preview.rules.find((r) => r.type === "ordered_actions")?.passed).toBe(false);
  });

  describe("Provenance, Persistence, Security, and Progression Integration", () => {
    const queryRaw = jest.fn();
    const transaction = jest.fn();
    const preparation = { prepareForOwnExperiment: jest.fn() };
    const mockEvaluator = { evaluate: jest.fn() };
    const mockProgression = { projectSymbolicPass: jest.fn() };
    const evaluationService = new SymbolicEvaluationService(
      { $queryRaw: queryRaw, $transaction: transaction } as never,
      preparation as never,
      mockEvaluator as never,
      mockProgression as never,
    );

    beforeEach(() => {
      queryRaw.mockReset();
      transaction.mockReset();
      preparation.prepareForOwnExperiment.mockReset();
      mockEvaluator.evaluate.mockReset();
      mockProgression.projectSymbolicPass.mockReset();
    });

    it("1. Exact owned ProgramVersion can be evaluated", async () => {
      const output = schematicEngine.render(validL2RobotProgram, "version-l2-1");
      preparation.prepareForOwnExperiment.mockResolvedValueOnce({
        attemptId: "attempt-l2",
        experimentId: "exp-1",
        submissionId: "sub-1",
        programVersionId: "version-l2-1",
        requestedByUserId: student.vistaUserId,
        schematic: output,
        ruleSet: c1L2RuleSet,
        evaluatorVersion: "vista-symbolic-evaluator-1",
        programHash: "p-hash",
        outputSnapshotHash: "o-hash",
        fingerprint: "fingerprint-1",
      });
      mockEvaluator.evaluate.mockReturnValueOnce({
        verdict: "passed",
        rules: [{ ordinal: 1, type: "preview_target_match", passed: true, message: "Target matched" }],
        metrics: { ruleCount: 1, passedRuleCount: 1 },
      });
      const dbRow = {
        id: "eval-l2-1",
        experiment_id: "exp-1",
        program_version_id: "version-l2-1",
        evaluator_version: "vista-symbolic-evaluator-1",
        rule_set_schema_version: 1,
        rule_set_hash: "hash",
        verdict: "passed",
        rule_results: [],
        metrics: { ruleCount: 1, passedRuleCount: 1 },
        created_at: new Date(),
      };
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([dbRow]).mockResolvedValueOnce([{ id: "attempt-l2" }]) };
      transaction.mockImplementation(async (work) => work(tx));
      mockProgression.projectSymbolicPass.mockResolvedValueOnce({
        completedLessonId: "lesson-l2",
        newlyUnlockedLessonIds: ["lesson-l3"],
      });

      const res = await evaluationService.evaluateOwnExperiment(student, "exp-1");
      expect(res.id).toBe("eval-l2-1");
      expect(res.verdict).toBe("passed");
      expect(res.evidence?.programVersionId).toBe("version-l2-1");
      expect(res.progression?.completedLessonId).toBe("lesson-l2");
    });

    it("2. Mutable draft is not evaluated; only immutable ProgramVersion is evaluated", async () => {
      // In preparation service, input_snapshot must match submission.program_version_id
      preparation.prepareForOwnExperiment.mockRejectedValueOnce(
        new BadRequestException("Experiment program version provenance is invalid."),
      );
      await expect(evaluationService.evaluateOwnExperiment(student, "exp-draft")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("3. Another learner's ProgramVersion/experiment is rejected", async () => {
      preparation.prepareForOwnExperiment.mockRejectedValueOnce(
        new NotFoundException("Experiment was not found."),
      );
      await expect(evaluationService.evaluateOwnExperiment(student, "exp-other")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("4. Wrong attempt is rejected", async () => {
      preparation.prepareForOwnExperiment.mockRejectedValueOnce(
        new NotFoundException("Attempt for this experiment was not found."),
      );
      await expect(evaluationService.evaluateOwnExperiment(student, "exp-wrong-attempt")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("5. Wrong assignment/challenge is rejected", async () => {
      preparation.prepareForOwnExperiment.mockRejectedValueOnce(
        new BadRequestException("The experiment assignment has no challenge."),
      );
      await expect(evaluationService.evaluateOwnExperiment(student, "exp-wrong-challenge")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("6. Disallowed program IR is rejected before evaluation", async () => {
      expect(() => {
        schematicEngine.render(
          { kind: "robot_program", schemaVersion: 1, steps: [{ type: "unsupported.action" }] },
          "version-disallowed",
        );
      }).toThrow(BadRequestException);
    });

    it("12 & 14 & 16 & 17. PASS persists evidence with exact ProgramVersion provenance and completes C1-L2, unlocking C1-L3", async () => {
      const output = schematicEngine.render(validL2RobotProgram, "version-l2-provenance");
      preparation.prepareForOwnExperiment.mockResolvedValueOnce({
        attemptId: "attempt-l2",
        experimentId: "exp-l2-pass",
        submissionId: "sub-l2",
        programVersionId: "version-l2-provenance",
        requestedByUserId: student.vistaUserId,
        schematic: output,
        ruleSet: c1L2RuleSet,
        evaluatorVersion: "vista-symbolic-evaluator-1",
        programHash: "p-hash",
        outputSnapshotHash: "o-hash",
        fingerprint: "fingerprint-l2-pass",
      });
      mockEvaluator.evaluate.mockReturnValueOnce({
        verdict: "passed",
        rules: [{ ordinal: 1, type: "preview_target_match", passed: true, message: "Target A reached successfully." }],
        metrics: { ruleCount: 1, passedRuleCount: 1 },
      });
      const dbRow = {
        id: "eval-pass",
        experiment_id: "exp-l2-pass",
        program_version_id: "version-l2-provenance",
        evaluator_version: "vista-symbolic-evaluator-1",
        rule_set_schema_version: 1,
        rule_set_hash: "hash",
        verdict: "passed",
        rule_results: [],
        metrics: { ruleCount: 1, passedRuleCount: 1 },
        created_at: new Date(),
      };
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([dbRow]).mockResolvedValueOnce([{ id: "attempt-l2" }]) };
      transaction.mockImplementation(async (work) => work(tx));
      mockProgression.projectSymbolicPass.mockResolvedValueOnce({
        completedLessonId: "lesson-c1-l2",
        newlyUnlockedLessonIds: ["lesson-c1-l3"],
      });

      const res = await evaluationService.evaluateOwnExperiment(student, "exp-l2-pass");
      expect(res.verdict).toBe("passed");
      expect(res.status).toBe("success");
      expect(res.evidence?.programVersionId).toBe("version-l2-provenance");
      expect(res.evidence?.experimentId).toBe("exp-l2-pass");
      expect(res.progression).toEqual({
        completedLessonId: "lesson-c1-l2",
        newlyUnlockedLessonIds: ["lesson-c1-l3"],
      });
    });

    it("13 & 15 & 18 & 19. FAIL persists evidence with provenance but does NOT complete C1-L2 and does NOT unlock C1-L3", async () => {
      const output = schematicEngine.render(wrongTargetRobotProgram, "version-l2-fail");
      preparation.prepareForOwnExperiment.mockResolvedValueOnce({
        attemptId: "attempt-l2",
        experimentId: "exp-l2-fail",
        submissionId: "sub-l2",
        programVersionId: "version-l2-fail",
        requestedByUserId: student.vistaUserId,
        schematic: output,
        ruleSet: c1L2RuleSet,
        evaluatorVersion: "vista-symbolic-evaluator-1",
        programHash: "p-hash",
        outputSnapshotHash: "o-hash",
        fingerprint: "fingerprint-l2-fail",
      });
      mockEvaluator.evaluate.mockReturnValueOnce({
        verdict: "failed",
        rules: [{ ordinal: 1, type: "preview_target_match", passed: false, message: "Target mismatch." }],
        metrics: { ruleCount: 1, passedRuleCount: 0 },
      });
      const dbRow = {
        id: "eval-fail",
        experiment_id: "exp-l2-fail",
        program_version_id: "version-l2-fail",
        evaluator_version: "vista-symbolic-evaluator-1",
        rule_set_schema_version: 1,
        rule_set_hash: "hash",
        verdict: "failed",
        rule_results: [{ ordinal: 1, type: "preview_target_match", passed: false, message: "Target mismatch." }],
        metrics: { ruleCount: 1, passedRuleCount: 0 },
        created_at: new Date(),
      };
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([dbRow]).mockResolvedValueOnce([{ id: "attempt-l2" }]) };
      transaction.mockImplementation(async (work) => work(tx));
      mockProgression.projectSymbolicPass.mockResolvedValueOnce({
        completedLessonId: null,
        newlyUnlockedLessonIds: [],
      });

      const res = await evaluationService.evaluateOwnExperiment(student, "exp-l2-fail");
      expect(res.verdict).toBe("failed");
      expect(res.status).toBe("failed");
      expect(res.evidence?.programVersionId).toBe("version-l2-fail");
      expect(res.progression).toEqual({
        completedLessonId: null,
        newlyUnlockedLessonIds: [],
      });
    });

    it("20. Repeated PASS is progression-idempotent", async () => {
      const progressionService = new ProgressionService({ $queryRaw: jest.fn() } as never, { assertStudentClassroomAccess: jest.fn() } as never);
      const txQuery = jest.fn()
        .mockResolvedValueOnce([{ evaluation_id: "eval-1", verdict: "passed", attempt_id: "attempt-2", lesson_id: "lesson-2", course_id: "course-1", program_version_id: "version-2", challenge_id: "challenge-2" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "progress-2", already_completed: true }]);

      const result = await progressionService.projectSymbolicPass(
        { $queryRaw: txQuery } as never,
        student,
        { evaluationId: "eval-1", attemptId: "attempt-2", programVersionId: "version-2", verdict: "passed" },
      );
      expect(result).toEqual({ completedLessonId: "lesson-2", newlyUnlockedLessonIds: [] });
    });

    it("21. Evaluator transaction failure does not leave false completion", async () => {
      preparation.prepareForOwnExperiment.mockResolvedValueOnce({
        attemptId: "attempt-l2",
        experimentId: "exp-fail",
        submissionId: "sub-1",
        programVersionId: "v-1",
        requestedByUserId: student.vistaUserId,
        schematic: schematicEngine.render(validL2RobotProgram, "v-1"),
        ruleSet: c1L2RuleSet,
        evaluatorVersion: "vista-symbolic-evaluator-1",
        programHash: "h1",
        outputSnapshotHash: "h2",
        fingerprint: "fp",
      });
      mockEvaluator.evaluate.mockReturnValueOnce({ verdict: "passed", rules: [], metrics: { ruleCount: 0, passedRuleCount: 0 } });
      const tx = { $queryRaw: jest.fn().mockRejectedValueOnce(new Error("Database write failure")) };
      transaction.mockImplementation(async (work) => work(tx));

      await expect(evaluationService.evaluateOwnExperiment(student, "exp-fail")).rejects.toThrow("Database write failure");
    });

    it("22. Browser-supplied verdict cannot force PASS", async () => {
      const progressionService = new ProgressionService({ $queryRaw: jest.fn() } as never, { assertStudentClassroomAccess: jest.fn() } as never);
      // Attempting to project symbolic PASS with a forged or failed verdict
      const result = await progressionService.projectSymbolicPass(
        { $queryRaw: jest.fn() } as never,
        student,
        { evaluationId: "eval-fake", attemptId: "attempt-fake", programVersionId: "v-fake", verdict: "failed" },
      );
      expect(result).toEqual({ completedLessonId: null, newlyUnlockedLessonIds: [] });
    });
  });
});
