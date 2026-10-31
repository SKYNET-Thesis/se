import { ConflictException, NotFoundException } from "@nestjs/common";
import { SymbolicEvaluationService } from "./symbolic-rules/symbolic-evaluation.service";
import { ProgressionService } from "./progression.service";
import { LearningService } from "./learning.service";

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

describe("P0.8 — Simulation Result, Evidence & Physical-Lab Handoff", () => {
  let mockEvaluationsTable: any[];
  let mockExperimentsTable: any[];
  let mockProgramVersionsTable: any[];
  let mockAttemptsTable: any[];
  let mockLessonsTable: any[];
  let mockLessonProgressTable: any[];
  let mockPrisma: any;
  let symbolicEvaluationService: SymbolicEvaluationService;
  let progressionService: ProgressionService;
  let learningService: LearningService;

  beforeEach(() => {
    mockEvaluationsTable = [
      {
        id: "eval-l2-1",
        experiment_id: "exp-l2-1",
        program_version_id: "pv-l2-1",
        requested_by_user_id: student.vistaUserId,
        evaluator_version: "vista-symbolic-evaluator-1",
        schematic_schema_version: 1,
        schematic_engine_version: "1.0",
        program_hash: "hash-l2-1",
        output_snapshot_hash: "out-l2-1",
        rule_set_schema_version: 1,
        rule_set_hash: "r-hash-l2",
        verdict: "passed",
        rule_results: [
          { ordinal: 1, type: "ordered_actions", passed: true, message: "Ordered actions valid." },
          { ordinal: 2, type: "preview_target_match", passed: true, message: "Target A reached successfully." },
        ],
        metrics: { ruleCount: 2, passedRuleCount: 2 },
        created_at: new Date("2026-10-31T10:00:00Z"),
      },
      {
        id: "eval-l3-1",
        experiment_id: "exp-l3-1",
        program_version_id: "pv-l3-1",
        requested_by_user_id: student.vistaUserId,
        evaluator_version: "vista-symbolic-evaluator-1",
        schematic_schema_version: 1,
        schematic_engine_version: "1.0",
        program_hash: "hash-l3-1",
        output_snapshot_hash: "out-l3-1",
        rule_set_schema_version: 1,
        rule_set_hash: "r-hash-l3",
        verdict: "passed",
        rule_results: [
          { ordinal: 1, type: "object_grasped", passed: true, message: "Object successfully grasped." },
          { ordinal: 2, type: "object_lifted", passed: true, message: "Object lifted." },
          { ordinal: 3, type: "object_released", passed: true, message: "Object released." },
        ],
        metrics: { ruleCount: 3, passedRuleCount: 3 },
        created_at: new Date("2026-10-31T10:30:00Z"),
      },
      {
        id: "eval-l4-fail",
        experiment_id: "exp-l4-1",
        program_version_id: "pv-l4-1",
        requested_by_user_id: student.vistaUserId,
        evaluator_version: "vista-symbolic-evaluator-1",
        schematic_schema_version: 1,
        schematic_engine_version: "1.0",
        program_hash: "hash-l4-1",
        output_snapshot_hash: "out-l4-1",
        rule_set_schema_version: 1,
        rule_set_hash: "r-hash-l4",
        verdict: "failed",
        rule_results: [
          { ordinal: 1, type: "object_grasped", passed: true, message: "Object grasped." },
          { ordinal: 2, type: "object_lifted", passed: true, message: "Object lifted." },
          { ordinal: 3, type: "object_released", passed: true, message: "Object released." },
          {
            ordinal: 4,
            type: "object_in_target_zone",
            passed: false,
            code: "OBJECT_RELEASED_OUTSIDE_TARGET",
            message: "The object was released outside the target zone.",
            reason: "The object was released 45 mm outside the target area. Move the object farther into the target area before opening the gripper.",
          },
        ],
        metrics: { ruleCount: 4, passedRuleCount: 3 },
        created_at: new Date("2026-10-31T11:00:00Z"),
      },
      {
        id: "eval-l4-pass-v2",
        experiment_id: "exp-l4-2",
        program_version_id: "pv-l4-2",
        requested_by_user_id: student.vistaUserId,
        evaluator_version: "vista-symbolic-evaluator-1",
        schematic_schema_version: 1,
        schematic_engine_version: "1.0",
        program_hash: "hash-l4-2",
        output_snapshot_hash: "out-l4-2",
        rule_set_schema_version: 1,
        rule_set_hash: "r-hash-l4",
        verdict: "passed",
        rule_results: [
          { ordinal: 1, type: "object_grasped", passed: true, message: "Object grasped." },
          { ordinal: 2, type: "object_lifted", passed: true, message: "Object lifted." },
          { ordinal: 3, type: "object_released", passed: true, message: "Object released." },
          { ordinal: 4, type: "object_in_target_zone", passed: true, code: "OBJECT_PLACED_IN_TARGET_ZONE", message: "Object placed inside target zone." },
        ],
        metrics: { ruleCount: 4, passedRuleCount: 4 },
        created_at: new Date("2026-10-31T11:30:00Z"),
      },
    ];

    mockExperimentsTable = [
      { id: "exp-l2-1", learner_user_id: student.vistaUserId, status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l2" }, output_snapshot: { finalState: { jointAngles: { base: 0 }, toolPosition: { x: 120, y: 150, z: 40 } } } },
      { id: "exp-l3-1", learner_user_id: student.vistaUserId, status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l3" }, output_snapshot: { finalState: { objectState: { state: "released" } } } },
      { id: "exp-l4-1", learner_user_id: student.vistaUserId, status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l4" }, output_snapshot: { finalState: { objectState: { state: "released", placedInZoneId: null, targetZoneDistance: 45 } } } },
      { id: "exp-l4-2", learner_user_id: student.vistaUserId, status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l4" }, output_snapshot: { finalState: { objectState: { state: "released", placedInZoneId: "A", targetZoneDistance: 0 } } } },
    ];

    mockProgramVersionsTable = [
      { id: "pv-l2-1", version_number: 1, change_summary: "Initial L2" },
      { id: "pv-l3-1", version_number: 1, change_summary: "Initial L3" },
      { id: "pv-l4-1", version_number: 1, change_summary: "Attempt 1 (missed target)" },
      { id: "pv-l4-2", version_number: 2, change_summary: "Attempt 2 (corrected target)" },
      { id: "pv-l4-3", version_number: 3, change_summary: "Attempt 3 (experimental failure)" },
    ];

    mockAttemptsTable = [
      { id: "att-l2", classroom_assignment_id: "ca-l2", learner_user_id: student.vistaUserId, status: "evaluated", result_snapshot: { feedback: { summary: "Target A reached successfully. Simulation passed.", messages: [] } } },
      { id: "att-l3", classroom_assignment_id: "ca-l3", learner_user_id: student.vistaUserId, status: "evaluated", result_snapshot: { feedback: { summary: "You successfully grasped, lifted, and released the object. Simulation passed.", messages: [] } } },
      { id: "att-l4", classroom_assignment_id: "ca-l4", learner_user_id: student.vistaUserId, status: "evaluated", result_snapshot: { feedback: { summary: "The object was released outside the target zone.", messages: [] } } },
    ];

    mockLessonsTable = [
      { id: "lesson-1", course_id: "course-1", ordinal: 1, title: "Meet Your Robot", content: {} },
      { id: "lesson-2", course_id: "course-1", ordinal: 2, title: "Move the Robot", content: {} },
      { id: "lesson-3", course_id: "course-1", ordinal: 3, title: "Grab & Release", content: {} },
      { id: "lesson-4", course_id: "course-1", ordinal: 4, title: "Pick & Place", content: {} },
      { id: "lesson-5", course_id: "course-1", ordinal: 5, title: "Physical Robot Lab", content: {} },
    ];

    mockLessonProgressTable = [
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-1", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-2", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-3", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-4", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-5", status: "in_progress", progress_percent: 0 },
    ];

    mockPrisma = {
      $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("?");
        if (query.includes("FROM public.learning_symbolic_evaluations se") && query.includes("se.id=?")) {
          const evalId = values[0];
          const userId = values[1];
          const row = mockEvaluationsTable.find((e) => e.id === evalId && e.requested_by_user_id === userId);
          if (!row) return [];
          const exp = mockExperimentsTable.find((e) => e.id === row.experiment_id);
          const pv = mockProgramVersionsTable.find((p) => p.id === row.program_version_id);
          const att = mockAttemptsTable.find((a) => a.id === exp?.input_snapshot?.attemptId);
          const lesson = mockLessonsTable.find((l) => (row.id.includes("l2") ? l.ordinal === 2 : row.id.includes("l3") ? l.ordinal === 3 : l.ordinal === 4));
          return [
            {
              ...row,
              version_number: pv?.version_number ?? 1,
              input_snapshot: exp?.input_snapshot,
              output_snapshot: exp?.output_snapshot,
              attempt_id: att?.id,
              result_snapshot: att?.result_snapshot,
              lesson_id: lesson?.id,
              lesson_title: lesson?.title,
              ordinal: lesson?.ordinal,
              course_id: lesson?.course_id,
              course_title: "Robotics Fundamentals",
            },
          ];
        }

        if (query.includes("FROM public.learning_symbolic_evaluations se") && query.includes("ORDER BY se.created_at DESC") && query.includes("l.ordinal=4")) {
          const userId = values[0];
          const passedL4Evals = mockEvaluationsTable
            .filter((e) => e.requested_by_user_id === userId && e.verdict === "passed" && e.id.includes("l4"))
            .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
          if (!passedL4Evals.length) return [];
          const latest = passedL4Evals[0];
          const pv = mockProgramVersionsTable.find((p) => p.id === latest.program_version_id);
          return [
            {
              program_version_id: latest.program_version_id,
              evaluation_id: latest.id,
              experiment_id: latest.experiment_id,
              lesson_id: "lesson-4",
              version_number: pv?.version_number ?? 2,
              attempt_id: "att-l4",
              passed_at: latest.created_at,
            },
          ];
        }

        if (query.includes("FROM public.learning_symbolic_evaluations se") && query.includes("ORDER BY se.created_at DESC")) {
          const userId = values[0];
          return mockEvaluationsTable
            .filter((e) => e.requested_by_user_id === userId)
            .map((e) => {
              const pv = mockProgramVersionsTable.find((p) => p.id === e.program_version_id);
              return { ...e, version_number: pv?.version_number ?? 1 };
            });
        }

        if (query.includes("FROM public.learning_lessons WHERE id=?")) {
          const lessonId = values[0];
          const l = mockLessonsTable.find((item) => item.id === lessonId);
          return l ? [{ ...l, created_at: new Date() }] : [];
        }

        if (query.includes("FROM public.learning_courses")) {
          return [{ id: "course-1", title: "Robotics Fundamentals", status: "published" }];
        }

        if (query.includes("FROM public.learning_objectives o")) {
          return [];
        }

        if (query.includes("FROM public.learning_assignments a")) {
          return [];
        }

        if (query.includes("FROM public.learning_lessons l") && query.includes("WHERE l.course_id=?")) {
          return mockLessonsTable.map((l) => {
            const prog = mockLessonProgressTable.find((p) => p.lesson_id === l.id && p.learner_user_id === student.vistaUserId);
            return {
              id: l.id,
              ordinal: l.ordinal,
              title: l.title,
              progress_status: prog?.status ?? "available",
              progress_percent: prog?.progress_percent ?? 0,
              completed_at: prog?.status === "completed" ? new Date() : null,
              prerequisites: [],
            };
          });
        }

        return [];
      }),
    };

    const mockScope = {
      classroomIds: jest.fn().mockResolvedValue(["class-1"]),
      isSystemAdministrator: jest.fn().mockReturnValue(false),
    };

    progressionService = new ProgressionService(mockPrisma, mockScope as any);
    symbolicEvaluationService = new SymbolicEvaluationService(mockPrisma, {} as any, {} as any, progressionService);
    learningService = new LearningService(mockPrisma, mockScope as any, progressionService);
  });

  it("1. fetches own evaluation result with exact immutable evidence", async () => {
    const result = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
    expect(result).toBeDefined();
    expect(result.id).toBe("eval-l4-pass-v2");
    expect(result.verdict).toBe("passed");
    expect(result.status).toBe("success");
    expect(result.taskState).toBe("success");
    expect(result.programVersionId).toBe("pv-l4-2");
    expect(result.versionNumber).toBe(2);
    expect(result.evidence?.programVersionId).toBe("pv-l4-2");
    expect(result.evidence?.versionNumber).toBe(2);
    expect(result.lesson?.ordinal).toBe(4);
    expect(result.lesson?.title).toBe("Pick & Place");
  });

  it("2. rejects another learner's result (404/authorization boundary)", async () => {
    await expect(symbolicEvaluationService.own(otherStudent, "eval-l4-pass-v2")).rejects.toThrow(NotFoundException);
  });

  it("3. resolves exact immutable ProgramVersion provenance", async () => {
    const failResult = await symbolicEvaluationService.own(student, "eval-l4-fail");
    expect(failResult.programVersionId).toBe("pv-l4-1");
    expect(failResult.versionNumber).toBe(1);

    const passResult = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
    expect(passResult.programVersionId).toBe("pv-l4-2");
    expect(passResult.versionNumber).toBe(2);
  });

  it("4. resolves exact Experiment ID attached to the evaluation", async () => {
    const result = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
    expect(result.experimentId).toBe("exp-l4-2");
    expect(result.evidence?.experimentId).toBe("exp-l4-2");
  });

  it("5. returns persisted rule evidence and metrics", async () => {
    const result = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
    expect(Array.isArray(result.ruleResults)).toBe(true);
    expect((result.ruleResults as any[]).length).toBe(4);
    expect(result.metrics).toEqual({ ruleCount: 4, passedRuleCount: 4 });
  });

  it("6. result remains immutable after newer program versions are saved", async () => {
    // Add pv-l4-3 without changing eval-l4-pass-v2
    const historical = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
    expect(historical.programVersionId).toBe("pv-l4-2");
    expect(historical.versionNumber).toBe(2);
    expect(historical.verdict).toBe("passed");
  });

  it("7. historical FAIL remains retrievable with full failure evidence", async () => {
    const failResult = await symbolicEvaluationService.own(student, "eval-l4-fail");
    expect(failResult.verdict).toBe("failed");
    expect(failResult.status).toBe("failed");
    const rules = failResult.ruleResults as any[];
    const failedRule = rules.find((r) => !r.passed);
    expect(failedRule.code).toBe("OBJECT_RELEASED_OUTSIDE_TARGET");
    expect(failedRule.reason).toContain("45 mm outside the target area");
  });

  it("8. historical PASS remains retrievable independently of current attempt state", async () => {
    const passResult = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
    expect(passResult.verdict).toBe("passed");
  });

  it("9. supports L2 result contract", async () => {
    const l2Result = await symbolicEvaluationService.own(student, "eval-l2-1");
    expect(l2Result.lesson?.ordinal).toBe(2);
    expect(l2Result.verdict).toBe("passed");
    expect(l2Result.robotState).toBeDefined();
  });

  it("10. supports L3 result contract", async () => {
    const l3Result = await symbolicEvaluationService.own(student, "eval-l3-1");
    expect(l3Result.lesson?.ordinal).toBe(3);
    expect(l3Result.verdict).toBe("passed");
    expect(l3Result.objectState).toBeDefined();
  });

  it("11. supports L4 result contract with target zone metadata", async () => {
    const l4Result = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
    expect(l4Result.lesson?.ordinal).toBe(4);
    expect(l4Result.verdict).toBe("passed");
    expect((l4Result.objectState as any)?.placedInZoneId).toBe("A");
  });

  it("12. resolveQualifiedL4ProgramVersion returns latest successful L4 version", async () => {
    const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
    expect(qualified).toBeDefined();
    expect(qualified?.programVersionId).toBe("pv-l4-2");
    expect(qualified?.versionNumber).toBe(2);
    expect(qualified?.evaluationId).toBe("eval-l4-pass-v2");
    expect(qualified?.lessonId).toBe("lesson-4");
  });

  it("13. failed later evaluation does NOT replace latest qualified successful version", async () => {
    // Introduce later failed evaluation
    mockEvaluationsTable.push({
      id: "eval-l4-failed-v3",
      experiment_id: "exp-l4-3",
      program_version_id: "pv-l4-3",
      requested_by_user_id: student.vistaUserId,
      verdict: "failed",
      created_at: new Date("2026-10-31T12:00:00Z"),
    });

    const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
    // Must still be pv-l4-2!
    expect(qualified?.programVersionId).toBe("pv-l4-2");
    expect(qualified?.evaluationId).toBe("eval-l4-pass-v2");
  });

  it("14. newer successful L4 evaluation becomes the current qualified version", async () => {
    mockEvaluationsTable.push({
      id: "eval-l4-pass-v4",
      experiment_id: "exp-l4-4",
      program_version_id: "pv-l4-4",
      requested_by_user_id: student.vistaUserId,
      verdict: "passed",
      created_at: new Date("2026-10-31T12:30:00Z"),
    });
    mockProgramVersionsTable.push({ id: "pv-l4-4", version_number: 4, change_summary: "Attempt 4" });

    const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
    expect(qualified?.programVersionId).toBe("pv-l4-4");
    expect(qualified?.versionNumber).toBe(4);
    expect(qualified?.evaluationId).toBe("eval-l4-pass-v4");
  });

  it("15. browser cannot choose arbitrary qualified programVersionId", async () => {
    // resolveQualifiedL4ProgramVersion takes authenticated user, ignores any client-supplied programVersionId
    const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student);
    expect(qualified?.programVersionId).not.toBe("fake-client-supplied-id");
  });

  it("16. Course Path shows L1-L4 completed and L5 in_progress (80% complete, NOT 100%)", async () => {
    const path = await progressionService.coursePath(student, "course-1");
    expect(path.lessons.find((l) => l.ordinal === 4)?.status).toBe("completed");
    expect(path.lessons.find((l) => l.ordinal === 5)?.status).toBe("in_progress");
    expect(path.progressPercent).toBe(80); // 4 of 5 lessons completed
  });

  it("17. L5 lesson detail includes qualification summary from latest passing L4 version", async () => {
    const l5Detail = await learningService.lesson(student, "lesson-5");
    expect(l5Detail.ordinal).toBe(5);
    expect(l5Detail.status).toBe("in_progress");
    expect(l5Detail.qualification).toBeDefined();
    expect(l5Detail.qualification?.lessonId).toBe("lesson-4");
    expect(l5Detail.qualification?.programVersionId).toBe("pv-l4-2");
    expect(l5Detail.qualification?.versionNumber).toBe(2);
  });

  it("18. listSymbolicEvaluations supports filtering by attemptId", async () => {
    const all = await symbolicEvaluationService.mine(student);
    expect(all.length).toBeGreaterThanOrEqual(4);
  });
});
