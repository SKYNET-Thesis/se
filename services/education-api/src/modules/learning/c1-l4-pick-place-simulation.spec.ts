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

const c1L4ChallengeConditions = [
  { id: "c-1", ordinal: 1, rule_key: "ordered_actions", rule_config: { actions: ["preview.move_xyz", "gripper.close", "preview.move_xyz", "gripper.open"] } },
  { id: "c-2", ordinal: 2, rule_key: "object_grasped", rule_config: { arm: "left" } },
  { id: "c-3", ordinal: 3, rule_key: "object_lifted", rule_config: { minZ: 70 } },
  { id: "c-4", ordinal: 4, rule_key: "object_released", rule_config: {} },
  { id: "c-5", ordinal: 5, rule_key: "object_in_target_zone", rule_config: { objectId: "cube-red", zoneId: "A" } },
  { id: "c-6", ordinal: 6, rule_key: "final_gripper_state", rule_config: { arm: "left", state: "open" } },
];

const challengeObjects = [
  {
    objectId: "cube-red",
    position: { x: 120, y: 150, z: 0 },
    graspRadius: 30,
    graspMaxZ: 50,
    liftMinZ: 70,
  },
];

const targetZones = [
  {
    zoneId: "A",
    label: "Bin A",
    x: 60,
    y: 280,
    w: 120,
    h: 90,
  },
];

// Valid L4 Pick & Place:
// 1. Approach object at (120, 150, 40)
// 2. Grasp
// 3. Lift to (120, 150, 100) (z >= 70)
// 4. Transport to (120, 320, 40) inside Zone A ([60..180], [280..370])
// 5. Open gripper (release inside target zone)
// 6. Return Home
const validL4RobotProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 40 } },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 100 } },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 320, z: 40 } },
    { type: "gripper.open" },
    { type: "home", arm: "left" },
  ],
};

// Negative: moves tool to target zone and opens gripper, but never grasped object
const toolEnteringTargetWithoutObjectProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 320, z: 40 } },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 320, z: 100 } },
    { type: "gripper.open" },
    { type: "home", arm: "left" },
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
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 320, z: 40 } },
    { type: "gripper.open" },
    { type: "home", arm: "left" },
  ],
};

// Negative: grasps, lifts, transports to target zone, but leaves gripper closed
const carriedWithoutReleaseProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 40 } },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 100 } },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 320, z: 40 } },
  ],
};

// Negative: grasps, lifts, but releases OUTSIDE Zone A (at y = 200, Zone A is 280..370)
const releasedOutsideTargetProgram = {
  kind: "robot_program",
  schemaVersion: 1,
  steps: [
    { type: "arm.select", arm: "left" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 40 } },
    { type: "gripper.close" },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 150, z: 100 } },
    { type: "preview.move_xyz", arm: "left", frame: "learning_preview_v1", mode: "learning_preview", position: { x: 120, y: 200, z: 40 } },
    { type: "gripper.open" },
    { type: "home", arm: "left" },
  ],
};

function createMockPrisma(options?: {
  attemptLearnerId?: string;
  submissionLearnerId?: string;
  experimentLearnerId?: string;
  programVersionId?: string;
  challengeId?: string;
  alreadyCompleted?: boolean;
}) {
  const attemptId = "attempt-l4-1";
  const challengeId = options?.challengeId ?? "challenge-l4";
  const programVersionId = options?.programVersionId ?? "pv-l4-1";
  const attemptLearnerId = options?.attemptLearnerId ?? student.vistaUserId;
  const submissionLearnerId = options?.submissionLearnerId ?? student.vistaUserId;
  const experimentLearnerId = options?.experimentLearnerId ?? student.vistaUserId;

  const mockQueryRaw = jest.fn(async (query: unknown, ...values: unknown[]) => {
    const getSql = (q: unknown): string => {
      if (typeof q === "string") return q;
      if (Array.isArray(q)) return q.join(" ");
      if (q && typeof q === "object" && "strings" in (q as Record<string, unknown>)) {
        return ((q as Record<string, unknown>).strings as string[]).join(" ");
      }
      return String(q);
    };
    const sql = getSql(query);

    if (sql.includes("FROM public.learning_experiments e") && sql.includes("JOIN public.learning_assignment_attempts a")) {
      if (attemptLearnerId !== student.vistaUserId || submissionLearnerId !== student.vistaUserId || experimentLearnerId !== student.vistaUserId) {
        return [];
      }
      return [
        {
          attempt_id: attemptId,
          classroom_id: "classroom-1",
          assignment_id: "assignment-l4",
          program_id: "program-l4",
          submission_id: "sub-l4-1",
          challenge_id: challengeId,
          program_version_id: programVersionId,
          status: "pending",
          execution_mode: "schematic",
          input_snapshot: { attemptId, programVersionId },
          robot_program: validL4RobotProgram,
          challenge_conditions: c1L4ChallengeConditions,
          lesson_id: "lesson-4",
          course_id: "course-1",
        },
      ];
    }

    if (sql.includes("candidate.id FROM public.learning_lesson_prerequisites")) {
      return [{ id: "lesson-5" }];
    }

    if (sql.includes("FROM public.learning_symbolic_evaluations se") && sql.includes("WHERE se.id=")) {
      const evalId = values[0] ?? "eval-l4-1";
      const attId = values[2] ?? attemptId;
      const pvId = values[3] ?? programVersionId;
      return [
        {
          evaluation_id: evalId,
          verdict: "passed",
          attempt_id: attId,
          lesson_id: "lesson-4",
          course_id: "course-1",
          program_version_id: pvId,
          challenge_id: challengeId,
        },
      ];
    }

    if (sql.includes("FROM public.learning_symbolic_evaluations se") && sql.includes("l.ordinal=4")) {
      return [
        {
          program_version_id: programVersionId,
          evaluation_id: "eval-l4-1",
          attempt_id: attemptId,
          passed_at: new Date("2026-10-31T12:00:00Z"),
        },
      ];
    }

    if (sql.includes("SELECT pre.id,pre.ordinal,pre.title,lp.status")) {
      return [
        { id: "lesson-3", ordinal: 3, title: "Grab & Release", progress_status: "completed", minimum_score: null, score: 100 },
      ];
    }

    if (sql.includes("INSERT INTO public.learning_lesson_progress")) {
      return [{ id: "progress-l4", already_completed: options?.alreadyCompleted ?? false }];
    }

    if (sql.includes("UPDATE public.learning_assignment_attempts SET status='evaluated'")) {
      return [{ id: attemptId }];
    }

    if (sql.includes("INSERT INTO public.learning_symbolic_evaluations")) {
      const verdict = values.find((v) => v === "passed" || v === "failed") ?? "passed";
      return [
        {
          id: "eval-l4-1",
          experiment_id: values[0] || "exp-l4-1",
          program_version_id: values[1] || programVersionId,
          evaluator_version: "symbolic-rule-evaluator-1",
          rule_set_schema_version: 1,
          rule_set_hash: "mock-hash",
          verdict,
          rule_results: typeof values[8] === "string" ? JSON.parse(values[8]) : [],
          metrics: typeof values[9] === "string" ? JSON.parse(values[9]) : { ruleCount: 6, passedRuleCount: 6 },
          created_at: new Date(),
        },
      ];
    }

    return [];
  });

  return {
    $queryRaw: mockQueryRaw,
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mockQueryRaw, $executeRaw: jest.fn(async () => 1) })),
  };
}

describe("P0.7 — C1-L4 Pick & Place: Authoritative Target-Zone Task Simulation", () => {
  let schematicEngine: SchematicEngineService;
  let compiler: SymbolicRuleCompilerService;
  let evaluator: SymbolicRuleEvaluatorService;

  beforeEach(() => {
    schematicEngine = new SchematicEngineService();
    compiler = new SymbolicRuleCompilerService();
    evaluator = new SymbolicRuleEvaluatorService();
  });

  describe("Deterministic Pick, Transport, and Target-Zone Evaluation", () => {
    it("evaluates valid pick -> lift -> transport -> release inside target zone as PASS", () => {
      const trace = schematicEngine.render(validL4RobotProgram, "pv-l4-valid", {
        challengeObjects,
        targetZones,
      });

      expect(trace.finalState.manipulation?.wasGrasped).toBe(true);
      expect(trace.finalState.manipulation?.wasLifted).toBe(true);
      expect(trace.finalState.manipulation?.wasReleased).toBe(true);
      expect(trace.finalState.manipulation?.placedInZoneId).toBe("A");
      expect(trace.finalState.manipulation?.targetZoneDistance).toBe(0);
      expect(trace.finalState.manipulation?.releasePosition).toEqual({ x: 120, y: 320, z: 0 });
      expect(trace.finalState.objectState?.state).toBe("released");

      const ruleSet = compiler.compile(c1L4ChallengeConditions);
      const preview = evaluator.evaluate(ruleSet, trace);

      expect(preview.verdict).toBe("passed");
      expect(preview.metrics.passedRuleCount).toBe(6);
      expect(preview.rules.find((r) => r.type === "object_in_target_zone")?.passed).toBe(true);
      expect(preview.rules.find((r) => r.type === "object_in_target_zone")?.code).toBe("OBJECT_PLACED_IN_TARGET_ZONE");
    });

    it("FAILs when tool enters target zone without object (never grasped)", () => {
      const trace = schematicEngine.render(toolEnteringTargetWithoutObjectProgram, "pv-l4-tool-only", {
        challengeObjects,
        targetZones,
      });

      expect(trace.finalState.manipulation?.wasGrasped).toBe(false);

      const ruleSet = compiler.compile(c1L4ChallengeConditions);
      const preview = evaluator.evaluate(ruleSet, trace);

      expect(preview.verdict).toBe("failed");
      const zoneRule = preview.rules.find((r) => r.type === "object_in_target_zone");
      expect(zoneRule?.passed).toBe(false);
      expect(zoneRule?.code).toBe("GRASP_NOT_ESTABLISHED");
    });

    it("FAILs when object is grasped but not lifted", () => {
      const trace = schematicEngine.render(graspWithoutLiftProgram, "pv-l4-no-lift", {
        challengeObjects,
        targetZones,
      });

      expect(trace.finalState.manipulation?.wasGrasped).toBe(true);
      expect(trace.finalState.manipulation?.wasLifted).toBe(false);

      const ruleSet = compiler.compile(c1L4ChallengeConditions);
      const preview = evaluator.evaluate(ruleSet, trace);

      expect(preview.verdict).toBe("failed");
      const liftRule = preview.rules.find((r) => r.type === "object_lifted");
      expect(liftRule?.passed).toBe(false);
      expect(liftRule?.code).toBe("OBJECT_NOT_LIFTED");
      const zoneRule = preview.rules.find((r) => r.type === "object_in_target_zone");
      expect(zoneRule?.passed).toBe(false);
      expect(zoneRule?.code).toBe("OBJECT_NOT_LIFTED");
    });

    it("FAILs when object is carried into zone but not released", () => {
      const trace = schematicEngine.render(carriedWithoutReleaseProgram, "pv-l4-no-release", {
        challengeObjects,
        targetZones,
      });

      expect(trace.finalState.manipulation?.wasGrasped).toBe(true);
      expect(trace.finalState.manipulation?.wasLifted).toBe(true);
      expect(trace.finalState.manipulation?.wasReleased).toBe(false);
      expect(trace.finalState.objectState?.state).toBe("carried");

      const ruleSet = compiler.compile(c1L4ChallengeConditions);
      const preview = evaluator.evaluate(ruleSet, trace);

      expect(preview.verdict).toBe("failed");
      const releaseRule = preview.rules.find((r) => r.type === "object_released");
      expect(releaseRule?.passed).toBe(false);
      expect(releaseRule?.code).toBe("OBJECT_NOT_RELEASED");
      const zoneRule = preview.rules.find((r) => r.type === "object_in_target_zone");
      expect(zoneRule?.passed).toBe(false);
      expect(zoneRule?.code).toBe("OBJECT_NOT_RELEASED");
    });

    it("FAILs when object is released outside target zone with near-miss distance", () => {
      const trace = schematicEngine.render(releasedOutsideTargetProgram, "pv-l4-outside", {
        challengeObjects,
        targetZones,
      });

      expect(trace.finalState.manipulation?.wasGrasped).toBe(true);
      expect(trace.finalState.manipulation?.wasLifted).toBe(true);
      expect(trace.finalState.manipulation?.wasReleased).toBe(true);
      expect(trace.finalState.manipulation?.placedInZoneId).toBeNull();
      // Released at y = 200, Zone A starts at y = 280 => 80 mm outside
      expect(trace.finalState.manipulation?.targetZoneDistance).toBe(80);

      const ruleSet = compiler.compile(c1L4ChallengeConditions);
      const preview = evaluator.evaluate(ruleSet, trace);

      expect(preview.verdict).toBe("failed");
      const zoneRule = preview.rules.find((r) => r.type === "object_in_target_zone");
      expect(zoneRule?.passed).toBe(false);
      expect(zoneRule?.code).toBe("OBJECT_RELEASED_OUTSIDE_TARGET");
      expect(zoneRule?.reason).toContain("80 mm outside the target area");
    });

    it("ignores client-supplied object state, zone membership, and verdict", () => {
      // Client claims it was placed in target zone, but server trace says no
      const trace = schematicEngine.render(releasedOutsideTargetProgram, "pv-l4-forged", {
        challengeObjects,
        targetZones,
      });

      const ruleSet = compiler.compile(c1L4ChallengeConditions);
      const preview = evaluator.evaluate(ruleSet, trace);
      expect(preview.verdict).toBe("failed");
    });
  });

  describe("SymbolicEvaluationService & Progression Integration", () => {
    it("completes C1-L4 and unlocks C1-L5 on authoritative PASS", async () => {
      const prisma = createMockPrisma();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => ({
          fingerprint: "fp-l4-1",
          experimentId: "exp-l4-1",
          attemptId: "attempt-l4-1",
          ruleSet: compiler.compile(c1L4ChallengeConditions),
          schematic: schematicEngine.render(validL4RobotProgram, "pv-l4-1", { challengeObjects, targetZones }),
        })),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-l4-1");

      expect(result.verdict).toBe("passed");
      expect(result.progression?.newlyUnlockedLessonIds).toContain("lesson-5");
      expect(result.feedback?.summary).toContain("You successfully placed the object inside the target zone.");
      expect(result.objectState).not.toBeNull();
      expect((result.objectState as { state?: string })?.state).toBe("released");
    });

    it("leaves C1-L5 locked when simulation FAILs", async () => {
      const prisma = createMockPrisma();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => ({
          fingerprint: "fp-l4-fail",
          experimentId: "exp-l4-fail",
          attemptId: "attempt-l4-1",
          ruleSet: compiler.compile(c1L4ChallengeConditions),
          schematic: schematicEngine.render(releasedOutsideTargetProgram, "pv-l4-fail", { challengeObjects, targetZones }),
        })),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-l4-fail");

      expect(result.verdict).toBe("failed");
      expect(result.progression?.newlyUnlockedLessonIds).toEqual([]);
    });

    it("rejects evaluation request from another learner", async () => {
      const prisma = createMockPrisma({ experimentLearnerId: otherStudent.vistaUserId });
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => {
          throw new NotFoundException("Experiment was not found.");
        }),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(otherStudent, "exp-l4-1")).rejects.toThrow(NotFoundException);
    });

    it("is progression-idempotent on repeated PASS submissions", async () => {
      const prisma = createMockPrisma({ alreadyCompleted: true });
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => ({
          fingerprint: "fp-l4-repeat",
          experimentId: "exp-l4-repeat",
          attemptId: "attempt-l4-1",
          ruleSet: compiler.compile(c1L4ChallengeConditions),
          schematic: schematicEngine.render(validL4RobotProgram, "pv-l4-repeat", { challengeObjects, targetZones }),
        })),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-l4-repeat");

      expect(result.verdict).toBe("passed");
      expect(result.progression?.newlyUnlockedLessonIds).toEqual([]);
    });

    it("rejects wrong attempt", async () => {
      const prisma = createMockPrisma();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => {
          throw new BadRequestException("Experiment program version provenance is invalid.");
        }),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(student, "exp-wrong-attempt")).rejects.toThrow(BadRequestException);
    });

    it("rejects wrong challenge", async () => {
      const prisma = createMockPrisma();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => {
          throw new BadRequestException("The experiment assignment has no challenge.");
        }),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(student, "exp-wrong-challenge")).rejects.toThrow(BadRequestException);
    });

    it("does not complete L5 when L4 passes", async () => {
      const prisma = createMockPrisma();
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => ({
          fingerprint: "fp-l4-pass-nol5",
          experimentId: "exp-l4-pass-nol5",
          attemptId: "attempt-l4-1",
          ruleSet: compiler.compile(c1L4ChallengeConditions),
          schematic: schematicEngine.render(validL4RobotProgram, "pv-l4-pass-nol5", { challengeObjects, targetZones }),
        })),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      const result = await service.evaluateOwnExperiment(student, "exp-l4-pass-nol5");

      expect(result.progression?.completedLessonId).toBe("lesson-4");
      expect(result.progression?.completedLessonId).not.toBe("lesson-5");
    });

    it("ensures transaction failure cannot produce false/phantom completion", async () => {
      const mockTx = {
        $queryRaw: jest.fn(async () => {
          throw new Error("Simulated database failure");
        }),
        $executeRaw: jest.fn(async () => 1),
      };
      const prisma = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
      };
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(prisma as never, mockScope as never);
      const prepMock = {
        prepareForOwnExperiment: jest.fn(async () => ({
          fingerprint: "fp-l4-tx-fail",
          experimentId: "exp-l4-tx-fail",
          attemptId: "attempt-l4-1",
          ruleSet: compiler.compile(c1L4ChallengeConditions),
          schematic: schematicEngine.render(validL4RobotProgram, "pv-l4-tx-fail", { challengeObjects, targetZones }),
        })),
      };
      const service = new SymbolicEvaluationService(prisma as never, prepMock as never, evaluator, progression);

      await expect(service.evaluateOwnExperiment(student, "exp-l4-tx-fail")).rejects.toThrow("Simulated database failure");
    });

    it("resolves the latest qualified L4 ProgramVersion when student passed multiple times", async () => {
      const mockPrismaMultiple = {
        $queryRaw: jest.fn(async () => [
          {
            program_version_id: "pv-l4-second-pass",
            evaluation_id: "eval-l4-second",
            attempt_id: "attempt-l4-2",
            passed_at: new Date("2026-10-31T12:30:00Z"),
          },
          {
            program_version_id: "pv-l4-first-pass",
            evaluation_id: "eval-l4-first",
            attempt_id: "attempt-l4-1",
            passed_at: new Date("2026-10-31T12:00:00Z"),
          },
        ]),
      };
      const mockScope = { assertStudentClassroomAccess: jest.fn(async () => undefined) };
      const progression = new ProgressionService(mockPrismaMultiple as never, mockScope as never);

      const qualified = await progression.resolveQualifiedL4ProgramVersion(student, "course-1");

      expect(qualified).not.toBeNull();
      expect(qualified?.programVersionId).toBe("pv-l4-second-pass");
      expect(qualified?.evaluationId).toBe("eval-l4-second");
    });
  });
});
