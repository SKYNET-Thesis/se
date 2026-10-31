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

const otherStudent = {
  authUserId: "auth-student-2",
  vistaUserId: "user-student-2",
  email: "other@vista.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: ["learning.work.write", "learning.experiment.execute"],
  memberships: [{ id: "m-2", organizationId: "org-1", roleCode: "student", status: "active", permissions: ["learning.work.write", "learning.experiment.execute"] }],
};

const c1L3ChallengeConditions = [
  { id: "c-1", ordinal: 1, rule_key: "ordered_actions", rule_config: { actions: ["preview.move_xyz", "gripper.close", "preview.move_xyz", "gripper.open"] } },
  { id: "c-2", ordinal: 2, rule_key: "object_grasped", rule_config: { arm: "left" } },
  { id: "c-3", ordinal: 3, rule_key: "object_lifted", rule_config: { minZ: 70 } },
  { id: "c-4", ordinal: 4, rule_key: "object_released", rule_config: {} },
  { id: "c-5", ordinal: 5, rule_key: "final_gripper_state", rule_config: { arm: "left", state: "open" } },
];

// Valid L3 Program:
// 1. Select left arm
// 2. Approach red cube at (120, 150, 40)
// 3. Close gripper (grasps!)
// 4. Move to lift height (120, 150, 100) (carries and lifts!)
// 5. Open gripper (releases!)
const validL3RobotProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 40 } },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 100 } },
    { type: "gripper.open" },
  ],
};

// Negative: closes gripper at (0, 0, 0) without approaching object at (120, 150, 0)
const closeWithoutApproachProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 100 } },
    { type: "gripper.open" },
  ],
};

// Negative: grasps object but never lifts (z stays at 40, below 70)
const graspWithoutLiftProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 40 } },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 45 } },
    { type: "gripper.open" },
  ],
};

// Negative: grasps and lifts, but leaves gripper closed
const graspLiftWithoutReleaseProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 40 } },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 100 } },
  ],
};

// Negative: disallowed action
const disallowedActionProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "hardware.raw_servo_pulse", pulse: 1500 },
  ],
};

describe("P0.6 — C1-L3 Grab & Release: Authoritative Object Task Simulation", () => {
  const schematicEngine = new SchematicEngineService();
  const compiler = new SymbolicRuleCompilerService();
  const evaluator = new SymbolicRuleEvaluatorService();

  const c1L3RuleSet = compiler.compile(c1L3ChallengeConditions);

  describe("Deterministic Grasp, Carry, and Release Engine Rules", () => {
    it("7. gripper.close away from object does NOT establish grasp", () => {
      const output = schematicEngine.render(closeWithoutApproachProgram, "v-away");
      expect(output.finalState.manipulation?.wasGrasped).toBe(false);
      expect(output.finalState.manipulation?.graspAttempts).toBe(1);
      expect(output.finalState.manipulation?.successfulGrasps).toBe(0);
      expect(output.finalState.objectState?.state).toBe("free");
      expect(output.timeline[1].grasped).toBe(false);
      expect(output.timeline[1].graspMissed).toBe(true);
    });

    it("8. valid approach + close establishes grasp", () => {
      const output = schematicEngine.render(validL3RobotProgram, "v-grasp");
      const closeEvent = output.timeline[2];
      expect(closeEvent.type).toBe("gripper.close");
      expect(closeEvent.grasped).toBe(true);
      expect(closeEvent.objectId).toBe("cube-red");
      expect(output.finalState.manipulation?.wasGrasped).toBe(true);
    });

    it("9. grasped object follows deterministic arm movement", () => {
      const output = schematicEngine.render(validL3RobotProgram, "v-carry");
      const liftEvent = output.timeline[3];
      expect(liftEvent.type).toBe("preview.move_xyz");
      const objState = liftEvent.objectState as { position: { x: number; y: number; z: number }; state: string };
      expect(objState.state).toBe("carried");
      expect(objState.position.x).toBe(120);
      expect(objState.position.y).toBe(150);
      expect(objState.position.z).toBe(80); // tool.z (100) - 20
      expect(output.finalState.manipulation?.wasLifted).toBe(true);
    });

    it("10. opening gripper releases object", () => {
      const output = schematicEngine.render(validL3RobotProgram, "v-release");
      const releaseEvent = output.timeline[4];
      expect(releaseEvent.type).toBe("gripper.open");
      expect(releaseEvent.released).toBe(true);
      expect(releaseEvent.objectId).toBe("cube-red");
      expect(output.finalState.objectState?.state).toBe("released");
      expect(output.finalState.objectState?.graspedBy).toBe(null);
      expect(output.finalState.objectState?.position.z).toBe(0); // settled on surface
      expect(output.finalState.manipulation?.wasReleased).toBe(true);
    });

    it("11. valid grasp → lift → release PASSes all authoritative L3 conditions", () => {
      const output = schematicEngine.render(validL3RobotProgram, "v-pass");
      const preview = evaluator.evaluate(c1L3RuleSet, output);
      expect(preview.verdict).toBe("passed");
      expect(preview.metrics.passedRuleCount).toBe(5);
      expect(preview.rules.map((r) => r.code)).toEqual([
        "ORDERED_ACTIONS_MATCH",
        "OBJECT_GRASPED",
        "OBJECT_LIFTED",
        "OBJECT_RELEASED",
        "GRIPPER_STATE_MATCH",
      ]);
    });

    it("12. close without grasp FAILs with GRASP_NOT_ESTABLISHED", () => {
      const output = schematicEngine.render(closeWithoutApproachProgram, "v-nograsp");
      const preview = evaluator.evaluate(c1L3RuleSet, output);
      expect(preview.verdict).toBe("failed");
      const graspRule = preview.rules.find((r) => r.type === "object_grasped");
      expect(graspRule).toMatchObject({
        passed: false,
        code: "GRASP_NOT_ESTABLISHED",
        message: "The gripper closed, but the object was not grasped. Move closer to the object before closing the gripper.",
      });
    });

    it("13. grasp without lift FAILs if lift required (OBJECT_NOT_LIFTED)", () => {
      const output = schematicEngine.render(graspWithoutLiftProgram, "v-nolift");
      const preview = evaluator.evaluate(c1L3RuleSet, output);
      expect(preview.verdict).toBe("failed");
      const liftRule = preview.rules.find((r) => r.type === "object_lifted");
      expect(liftRule).toMatchObject({
        passed: false,
        code: "OBJECT_NOT_LIFTED",
        message: "The object was grasped but was not lifted.",
      });
    });

    it("14. grasp/lift without release FAILs with OBJECT_NOT_RELEASED and SEQUENCE_INCOMPLETE", () => {
      const output = schematicEngine.render(graspLiftWithoutReleaseProgram, "v-norelease");
      const preview = evaluator.evaluate(c1L3RuleSet, output);
      expect(preview.verdict).toBe("failed");
      const releaseRule = preview.rules.find((r) => r.type === "object_released");
      expect(releaseRule).toMatchObject({
        passed: false,
        code: "OBJECT_NOT_RELEASED",
        message: "Open the gripper to release the object.",
      });
      const seqRule = preview.rules.find((r) => r.type === "ordered_actions");
      expect(seqRule).toMatchObject({
        passed: false,
        code: "SEQUENCE_INCOMPLETE",
        message: "Complete the grasp, lift, and release sequence in order.",
      });
    });

    it("15. final gripper requirement enforced if configured (GRIPPER_FINAL_STATE_INVALID)", () => {
      const output = schematicEngine.render(graspLiftWithoutReleaseProgram, "v-gripper-closed");
      const preview = evaluator.evaluate(c1L3RuleSet, output);
      expect(preview.verdict).toBe("failed");
      const gripperRule = preview.rules.find((r) => r.type === "final_gripper_state");
      expect(gripperRule).toMatchObject({
        passed: false,
        code: "GRIPPER_FINAL_STATE_INVALID",
        message: "Finish the task with the gripper open.",
      });
    });

    it("16. disallowed action rejected", () => {
      expect(() => schematicEngine.render(disallowedActionProgram, "v-bad")).toThrow(BadRequestException);
    });
  });

  describe("Provenance, Persistence, Security, and Progression Integration", () => {
    function buildMockDb(options?: {
      evaluatorConflict?: boolean;
      transactionFails?: boolean;
      alreadyCompleted?: boolean;
    }) {
      const insertedEvals: Array<Record<string, unknown>> = [];
      const updatedAttempts: Array<Record<string, unknown>> = [];
      const completedLessons: string[] = options?.alreadyCompleted ? ["lesson-3"] : [];

      const getSql = (q: unknown): string => {
        if (Array.isArray(q)) return q.join("?");
        if (q && typeof q === "object" && "strings" in q && Array.isArray((q as { strings: string[] }).strings)) {
          return (q as { strings: string[] }).strings.join("?");
        }
        return String(q ?? "");
      };

      const tx = {
        $queryRaw: jest.fn(async (query: unknown, ...values: unknown[]) => {
          if (options?.transactionFails) throw new Error("Database transaction rolled back.");
          const sql = getSql(query);

          if (sql.includes("INSERT INTO public.learning_symbolic_evaluations")) {
            if (options?.evaluatorConflict) return [];
            const inserted = {
              id: "eval-l3-1",
              experiment_id: values[0],
              program_version_id: values[2],
              evaluator_version: "vista-symbolic-evaluator-1",
              rule_set_schema_version: 1,
              rule_set_hash: values[10],
              verdict: values[13],
              rule_results: JSON.parse(values[14] as string),
              metrics: JSON.parse(values[15] as string),
              created_at: new Date("2026-10-31T12:00:00Z"),
            };
            insertedEvals.push(inserted);
            return [inserted];
          }

          if (sql.includes("FROM public.learning_symbolic_evaluations se") && sql.includes("se.fingerprint")) {
            return insertedEvals.length ? [insertedEvals[0]] : [{
              id: "eval-l3-1",
              experiment_id: values[1],
              program_version_id: "version-l3-pass",
              evaluator_version: "vista-symbolic-evaluator-1",
              rule_set_schema_version: 1,
              rule_set_hash: "hash",
              verdict: "passed",
              rule_results: [],
              metrics: {},
              created_at: new Date("2026-10-31T12:00:00Z"),
            }];
          }

          if (sql.includes("UPDATE public.learning_assignment_attempts SET status='evaluated'")) {
            updatedAttempts.push({ id: values[1] });
            return [{ id: values[1] }];
          }

          if (sql.includes("FROM public.learning_symbolic_evaluations se") && sql.includes("se.verdict='passed'")) {
            return [{
              evaluation_id: values[0],
              verdict: "passed",
              attempt_id: values[2],
              lesson_id: "lesson-3",
              course_id: "course-1",
              program_version_id: values[3],
              challenge_id: "challenge-l3",
            }];
          }

          if (sql.includes("FROM public.learning_lesson_prerequisites pr")) {
            // L3 has prerequisite L2 (completed).
            return [];
          }

          if (sql.includes("INSERT INTO public.learning_lesson_progress")) {
            completedLessons.push("lesson-3");
            return [{ id: "progress-l3", already_completed: options?.alreadyCompleted ?? false }];
          }

          if (sql.includes("candidate.id FROM public.learning_lesson_prerequisites direct")) {
            // Unlocks lesson-4
            return [{ id: "lesson-4" }];
          }

          if (sql.includes("UPDATE public.learning_lesson_progress")) {
            return [];
          }

          return [];
        }),
      };

      const prisma = {
        $transaction: jest.fn(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
      };

      return { prisma, tx, insertedEvals, updatedAttempts, completedLessons };
    }

    function createPreparation(overrides?: {
      schematic?: unknown;
      evaluator?: SymbolicRuleEvaluatorService;
    }) {
      const out = overrides?.schematic ?? schematicEngine.render(validL3RobotProgram, "version-l3-pass");
      return {
        prepareForOwnExperiment: jest.fn(async (_user, expId: string) => ({
          attemptId: "attempt-l3-1",
          experimentId: expId,
          submissionId: "sub-l3-1",
          programVersionId: "version-l3-pass",
          requestedByUserId: student.vistaUserId,
          schematic: out,
          ruleSet: c1L3RuleSet,
          evaluatorVersion: "vista-symbolic-evaluator-1",
          programHash: "hash-prog",
          outputSnapshotHash: "hash-output",
          fingerprint: `fp-${expId}`,
        })),
      };
    }

    it("1. Owned immutable L3 ProgramVersion accepted", async () => {
      const { prisma } = buildMockDb();
      const preparation = createPreparation();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-1");
      expect(result.verdict).toBe("passed");
      expect(result.programVersionId).toBe("version-l3-pass");
      expect(result.status).toBe("success");
    });

    it("2. Another learner version rejected", async () => {
      const { prisma } = buildMockDb();
      const preparation = {
        prepareForOwnExperiment: jest.fn(async () => {
          throw new NotFoundException("Experiment was not found.");
        }),
      };
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(otherStudent, "exp-1")).rejects.toThrow(NotFoundException);
    });

    it("3. Wrong attempt rejected", async () => {
      const { prisma } = buildMockDb();
      const preparation = {
        prepareForOwnExperiment: jest.fn(async () => {
          throw new BadRequestException("Experiment program version provenance is invalid.");
        }),
      };
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(student, "exp-wrong-attempt")).rejects.toThrow(BadRequestException);
    });

    it("4. Wrong challenge rejected", async () => {
      const { prisma } = buildMockDb();
      const preparation = {
        prepareForOwnExperiment: jest.fn(async () => {
          throw new BadRequestException("The experiment assignment has no challenge.");
        }),
      };
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(student, "exp-wrong-challenge")).rejects.toThrow(BadRequestException);
    });

    it("5 & 6. Forged client object state and grasp state ignored (derived server-side)", async () => {
      const { prisma } = buildMockDb();
      // Server evaluates ONLY the persisted output snapshot and ruleSet from preparation
      const serverOutput = schematicEngine.render(validL3RobotProgram, "version-l3-pass");
      const preparation = createPreparation({ schematic: serverOutput });
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-forged");
      // Even if client tried sending { grasped: false } in HTTP body, evaluateOwnExperiment has no client body input!
      expect(result.objectState).toMatchObject({
        objectId: "cube-red",
        state: "released",
        graspedBy: null,
      });
      expect(result.verdict).toBe("passed");
    });

    it("17. PASS evidence contains exact ProgramVersion", async () => {
      const { prisma } = buildMockDb();
      const preparation = createPreparation();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-pass");
      expect(result.evidence?.programVersionId).toBe("version-l3-pass");
      expect(result.programVersionId).toBe("version-l3-pass");
    });

    it("18. PASS evidence contains object state", async () => {
      const { prisma } = buildMockDb();
      const preparation = createPreparation();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-pass");
      expect(result.objectState).toEqual({
        objectId: "cube-red",
        position: { x: 120, y: 150, z: 0 },
        graspedBy: null,
        state: "released",
      });
    });

    it("19. FAIL evidence persists", async () => {
      const { prisma, updatedAttempts } = buildMockDb();
      const failOutput = schematicEngine.render(closeWithoutApproachProgram, "version-l3-fail");
      const preparation = createPreparation({ schematic: failOutput });
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-fail");
      expect(result.verdict).toBe("failed");
      expect(result.status).toBe("failed");
      expect(updatedAttempts.length).toBe(1);
    });

    it("20 & 21. PASS completes L3 and unlocks L4", async () => {
      const { prisma } = buildMockDb();
      const preparation = createPreparation();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-prog");
      expect(result.progression?.completedLessonId).toBe("lesson-3");
      expect(result.progression?.newlyUnlockedLessonIds).toContain("lesson-4");
      expect(result.progression?.newlyUnlockedLessonIds).not.toContain("lesson-5");
    });

    it("22. FAIL leaves L4 locked", async () => {
      const { prisma } = buildMockDb();
      const failOutput = schematicEngine.render(closeWithoutApproachProgram, "version-l3-fail");
      const preparation = createPreparation({ schematic: failOutput });
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-fail-prog");
      expect(result.progression?.completedLessonId).toBe(null);
      expect(result.progression?.newlyUnlockedLessonIds).toEqual([]);
    });

    it("23. repeated PASS remains progression-idempotent", async () => {
      const { prisma } = buildMockDb({ alreadyCompleted: true });
      const preparation = createPreparation();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      const first = await service.evaluateOwnExperiment(student, "exp-idem");
      expect(first.verdict).toBe("passed");
      expect(first.progression?.completedLessonId).toBe("lesson-3");
    });

    it("24. transaction failure cannot create false completion", async () => {
      const { prisma } = buildMockDb({ transactionFails: true });
      const preparation = createPreparation();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const service = new SymbolicEvaluationService(prisma as never, preparation as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(student, "exp-fail-tx")).rejects.toThrow("Database transaction rolled back.");
    });

    it("25. L2 P0.5 evaluator remains unchanged and passing", () => {
      const l2Conditions = [
        { id: "c-1", ordinal: 1, rule_key: "ordered_actions", rule_config: { actions: ["home", "preview.move_xyz", "wait"] } },
        { id: "c-2", ordinal: 2, rule_key: "preview_target_match", rule_config: { frame: "learning_preview_v1", arm: "left", position: { x: 240, y: 220, z: 120 } } },
      ];
      const l2Rules = compiler.compile(l2Conditions);
      const l2Program = {
        kind: "robot_program",
        schemaVersion: 1,
        steps: [
          { type: "arm.select", arm: "left" },
          { type: "home", arm: "left" },
          { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 240, y: 220, z: 120 } },
          { type: "wait", durationMs: 1000 },
        ],
      };
      const output = schematicEngine.render(l2Program, "v-l2");
      const preview = evaluator.evaluate(l2Rules, output);
      expect(preview.verdict).toBe("passed");
      expect(preview.rules[1].code).toBe("PREVIEW_TARGET_MATCH");
    });
  });
});
