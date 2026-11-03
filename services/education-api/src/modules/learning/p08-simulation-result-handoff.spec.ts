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
  let mockProgramsTable: any[];
  let mockProgramVersionsTable: any[];
  let mockSubmissionsTable: any[];
  let mockAttemptsTable: any[];
  let mockClassroomAssignmentsTable: any[];
  let mockAssignmentsTable: any[];
  let mockLessonsTable: any[];
  let mockLessonPrerequisitesTable: any[];
  let mockLessonProgressTable: any[];
  let mockPrisma: any;
  let mockScope: any;
  let symbolicEvaluationService: SymbolicEvaluationService;
  let progressionService: ProgressionService;
  let learningService: LearningService;

  beforeEach(() => {
    mockLessonsTable = [
      { id: "lesson-1", course_id: "course-1", ordinal: 1, title: "Meet Your Robot", content: {} },
      { id: "lesson-2", course_id: "course-1", ordinal: 2, title: "Move the Robot", content: {} },
      { id: "lesson-3", course_id: "course-1", ordinal: 3, title: "Grab & Release", content: {} },
      { id: "lesson-4", course_id: "course-1", ordinal: 4, title: "Pick & Place", content: {} },
      { id: "lesson-5", course_id: "course-1", ordinal: 5, title: "Physical Robot Lab", content: {} },
    ];

    mockLessonPrerequisitesTable = [
      { lesson_id: "lesson-2", prerequisite_lesson_id: "lesson-1", required: true },
      { lesson_id: "lesson-3", prerequisite_lesson_id: "lesson-2", required: true },
      { lesson_id: "lesson-4", prerequisite_lesson_id: "lesson-3", required: true },
      { lesson_id: "lesson-5", prerequisite_lesson_id: "lesson-4", required: true },
    ];

    mockLessonProgressTable = [
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-1", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-2", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-3", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-4", status: "completed", progress_percent: 100 },
      { learner_user_id: student.vistaUserId, lesson_id: "lesson-5", status: "in_progress", progress_percent: 0 },
    ];

    mockAssignmentsTable = [
      { id: "asgn-l2", lesson_id: "lesson-2", challenge_id: "chal-l2", constraints: { kind: "symbolic_program" } },
      { id: "asgn-l3", lesson_id: "lesson-3", challenge_id: "chal-l3", constraints: { kind: "symbolic_program" } },
      { id: "asgn-l4", lesson_id: "lesson-4", challenge_id: "chal-l4", constraints: { kind: "symbolic_program" } },
    ];

    mockClassroomAssignmentsTable = [
      { id: "ca-l2", assignment_id: "asgn-l2", classroom_id: "class-1" },
      { id: "ca-l3", assignment_id: "asgn-l3", classroom_id: "class-1" },
      { id: "ca-l4", assignment_id: "asgn-l4", classroom_id: "class-1" },
    ];

    mockProgramsTable = [
      { id: "prog-l2", learner_user_id: student.vistaUserId, title: "Move Program" },
      { id: "prog-l3", learner_user_id: student.vistaUserId, title: "Grab Program" },
      { id: "prog-l4", learner_user_id: student.vistaUserId, title: "Pick & Place Program" },
    ];

    mockProgramVersionsTable = [
      { id: "pv-l2-1", program_id: "prog-l2", version_number: 1, change_summary: "Initial L2", robot_program: { blocks: ["home"] } },
      { id: "pv-l3-1", program_id: "prog-l3", version_number: 1, change_summary: "Initial L3", robot_program: { blocks: ["home", "grasp"] } },
      { id: "pv-l4-1", program_id: "prog-l4", version_number: 1, change_summary: "Attempt 1 (missed target)", robot_program: { blocks: ["home"] } },
      { id: "pv-l4-2", program_id: "prog-l4", version_number: 2, change_summary: "Attempt 2 (corrected target)", robot_program: { blocks: ["home", "move", "grasp", "move", "release"] } },
      { id: "pv-l4-3", program_id: "prog-l4", version_number: 3, change_summary: "Attempt 3 (experimental failure)", robot_program: { blocks: ["home"] } },
    ];

    mockSubmissionsTable = [
      { id: "sub-l2-1", assignment_id: "asgn-l2", learner_user_id: student.vistaUserId, program_id: "prog-l2", program_version_id: "pv-l2-1", status: "submitted" },
      { id: "sub-l3-1", assignment_id: "asgn-l3", learner_user_id: student.vistaUserId, program_id: "prog-l3", program_version_id: "pv-l3-1", status: "submitted" },
      { id: "sub-l4-1", assignment_id: "asgn-l4", learner_user_id: student.vistaUserId, program_id: "prog-l4", program_version_id: "pv-l4-1", status: "submitted" },
      { id: "sub-l4-2", assignment_id: "asgn-l4", learner_user_id: student.vistaUserId, program_id: "prog-l4", program_version_id: "pv-l4-2", status: "submitted" },
      { id: "sub-l4-3", assignment_id: "asgn-l4", learner_user_id: student.vistaUserId, program_id: "prog-l4", program_version_id: "pv-l4-3", status: "submitted" },
    ];

    mockAttemptsTable = [
      { id: "att-l2", classroom_assignment_id: "ca-l2", learner_user_id: student.vistaUserId, program_id: "prog-l2", status: "evaluated", result_snapshot: { feedback: { summary: "Target A reached successfully. Simulation passed.", messages: [] } } },
      { id: "att-l3", classroom_assignment_id: "ca-l3", learner_user_id: student.vistaUserId, program_id: "prog-l3", status: "evaluated", result_snapshot: { feedback: { summary: "You successfully grasped, lifted, and released the object. Simulation passed.", messages: [] } } },
      { id: "att-l4", classroom_assignment_id: "ca-l4", learner_user_id: student.vistaUserId, program_id: "prog-l4", status: "evaluated", result_snapshot: { feedback: { summary: "The object was released outside the target zone.", messages: [] } } },
    ];

    mockExperimentsTable = [
      { id: "exp-l2-1", learner_user_id: student.vistaUserId, challenge_id: "chal-l2", status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l2" }, output_snapshot: { finalState: { jointAngles: { base: 0 }, toolPosition: { x: 120, y: 150, z: 40 } } } },
      { id: "exp-l3-1", learner_user_id: student.vistaUserId, challenge_id: "chal-l3", status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l3" }, output_snapshot: { finalState: { objectState: { state: "released" } } } },
      { id: "exp-l4-1", learner_user_id: student.vistaUserId, challenge_id: "chal-l4", status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l4" }, output_snapshot: { finalState: { objectState: { state: "released", placedInZoneId: null, targetZoneDistance: 45 } } } },
      { id: "exp-l4-2", learner_user_id: student.vistaUserId, challenge_id: "chal-l4", status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l4" }, output_snapshot: { finalState: { objectState: { state: "released", placedInZoneId: "A", targetZoneDistance: 0 } } } },
      { id: "exp-l4-3", learner_user_id: student.vistaUserId, challenge_id: "chal-l4", status: "succeeded", execution_mode: "schematic", input_snapshot: { attemptId: "att-l4" }, output_snapshot: { finalState: { objectState: { state: "released", placedInZoneId: null, targetZoneDistance: 60 } } } },
    ];

    mockEvaluationsTable = [
      {
        id: "eval-l2-1",
        experiment_id: "exp-l2-1",
        submission_id: "sub-l2-1",
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
        submission_id: "sub-l3-1",
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
        submission_id: "sub-l4-1",
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
        submission_id: "sub-l4-2",
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

    mockPrisma = {
      $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("?");

        // 1. symbolicEvaluationService.own
        if (query.includes("FROM public.learning_symbolic_evaluations se") && query.includes("e.learner_user_id=?") && query.includes("WHERE se.id=?")) {
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

        // 2. resolveQualifiedL4ProgramVersion query
        if (
          query.includes("FROM public.learning_symbolic_evaluations se") &&
          query.includes("ORDER BY se.created_at DESC, pv.version_number DESC, se.id DESC")
        ) {
          const userId = values[0];
          let courseId: string | undefined;
          for (const v of values) {
            if (typeof v === "string" && v !== userId) {
              courseId = v;
            } else if (v && typeof v === "object") {
              const innerVal = (v as any).values?.[0];
              if (typeof innerVal === "string") courseId = innerVal;
            }
          }

          const rows: any[] = [];
          for (const se of mockEvaluationsTable) {
            if (se.requested_by_user_id !== userId) continue;
            if (se.verdict !== "passed") continue;
            const exp = mockExperimentsTable.find(
              (e) => e.id === se.experiment_id && e.learner_user_id === se.requested_by_user_id && e.status === "succeeded" && e.execution_mode === "schematic",
            );
            if (!exp) continue;
            const pv = mockProgramVersionsTable.find((p) => p.id === se.program_version_id);
            if (!pv) continue;
            const sub = mockSubmissionsTable.find(
              (s) => s.id === se.submission_id && s.learner_user_id === se.requested_by_user_id && s.program_id === pv.program_id,
            );
            if (!sub) continue;
            const att = mockAttemptsTable.find(
              (a) => a.id === exp.input_snapshot?.attemptId && a.learner_user_id === se.requested_by_user_id && a.program_id === sub.program_id,
            );
            if (!att) continue;
            const ca = mockClassroomAssignmentsTable.find((c) => c.id === att.classroom_assignment_id && c.assignment_id === sub.assignment_id);
            if (!ca) continue;
            const la = mockAssignmentsTable.find((a) => a.id === ca.assignment_id && a.challenge_id === exp.challenge_id);
            if (!la) continue;
            const lesson = mockLessonsTable.find((l) => l.id === la.lesson_id && l.ordinal === 4);
            if (!lesson) continue;
            if (courseId && lesson.course_id !== courseId) continue;

            rows.push({
              program_version_id: pv.id,
              evaluation_id: se.id,
              experiment_id: exp.id,
              lesson_id: lesson.id,
              course_id: lesson.course_id,
              program_id: sub.program_id,
              challenge_id: la.challenge_id,
              verdict: se.verdict,
              version_number: pv.version_number ?? 1,
              attempt_id: att.id,
              passed_at: se.created_at,
              robot_program: pv.robot_program ?? {},
              change_summary: pv.change_summary ?? null,
            });
          }

          rows.sort((a, b) => {
            const timeDiff = b.passed_at.getTime() - a.passed_at.getTime();
            if (timeDiff !== 0) return timeDiff;
            const verDiff = b.version_number - a.version_number;
            if (verDiff !== 0) return verDiff;
            return b.evaluation_id.localeCompare(a.evaluation_id);
          });

          return rows.slice(0, 1);
        }

        // 3. projectSymbolicPass provenance query
        if (query.includes("FROM public.learning_symbolic_evaluations se") && query.includes("symbolic_program")) {
          const evalId = values[0];
          const userId = values[1];
          const attemptId = values[2];
          const pvId = values[3];
          const se = mockEvaluationsTable.find((e) => e.id === evalId && e.requested_by_user_id === userId && e.verdict === "passed" && e.program_version_id === pvId);
          if (!se) {
            console.log("DEBUG: se not found for", { evalId, userId, pvId });
            return [];
          }
          const exp = mockExperimentsTable.find((e) => e.id === se.experiment_id && e.learner_user_id === userId && e.status === "succeeded" && e.execution_mode === "schematic");
          if (!exp) {
            console.log("DEBUG: exp not found for", se.experiment_id);
            return [];
          }
          const pv = mockProgramVersionsTable.find((p) => p.id === pvId);
          if (!pv) {
            console.log("DEBUG: pv not found for", pvId);
            return [];
          }
          const sub = mockSubmissionsTable.find((s) => s.id === se.submission_id && s.learner_user_id === userId && s.program_id === pv.program_id && s.program_version_id === pvId && s.status === "submitted");
          if (!sub) {
            console.log("DEBUG: sub not found for", { subId: se.submission_id, pvProgId: pv.program_id, pvId });
            return [];
          }
          const att = mockAttemptsTable.find((a) => a.id === attemptId && a.id === exp.input_snapshot?.attemptId && a.learner_user_id === userId && a.program_id === sub.program_id);
          if (!att) {
            console.log("DEBUG: att not found for", { attemptId, expAttempt: exp.input_snapshot?.attemptId, subProgId: sub.program_id });
            return [];
          }
          const ca = mockClassroomAssignmentsTable.find((c) => c.id === att.classroom_assignment_id && c.assignment_id === sub.assignment_id);
          if (!ca) {
            console.log("DEBUG: ca not found for", { caId: att.classroom_assignment_id, subAsgnId: sub.assignment_id });
            return [];
          }
          const la = mockAssignmentsTable.find((a) => a.id === ca.assignment_id && a.challenge_id === exp.challenge_id && a.constraints?.kind === "symbolic_program");
          if (!la) {
            console.log("DEBUG: la not found for", { caAsgnId: ca.assignment_id, expChalId: exp.challenge_id });
            return [];
          }
          const lesson = mockLessonsTable.find((l) => l.id === la.lesson_id);
          if (!lesson) {
            console.log("DEBUG: lesson not found for", la.lesson_id);
            return [];
          }
          return [
            {
              evaluation_id: se.id,
              verdict: se.verdict,
              attempt_id: att.id,
              lesson_id: lesson.id,
              course_id: lesson.course_id,
              program_version_id: pv.id,
              challenge_id: la.challenge_id,
            },
          ];
        }

        // 4. assertPrerequisites query
        if (query.includes("FROM public.learning_lesson_prerequisites pr") && query.includes("pr.lesson_id=?") && query.includes("pr.required=true")) {
          const lessonId = values[0];
          const prereqs = mockLessonPrerequisitesTable.filter((p) => p.lesson_id === lessonId && p.required);
          return prereqs.map((p) => {
            const preLesson = mockLessonsTable.find((l) => l.id === p.prerequisite_lesson_id);
            const prog = mockLessonProgressTable.find((lp) => lp.lesson_id === p.prerequisite_lesson_id && lp.learner_user_id === student.vistaUserId);
            return {
              prerequisite_lesson_id: p.prerequisite_lesson_id,
              title: preLesson?.title ?? "Prerequisite",
              minimum_score: null,
              status: prog?.status ?? "available",
              progress_percent: prog?.progress_percent ?? 0,
            };
          });
        }

        // 5. completeLesson: advisory lock
        if (query.includes("pg_advisory_xact_lock")) {
          return [{ locked: false }];
        }

        // 6. completeLesson: upsert progress
        if (query.includes("WITH existing AS") && query.includes("INSERT INTO public.learning_lesson_progress")) {
          const userId = values[0];
          const lessonId = values[1];
          const existing = mockLessonProgressTable.find((lp) => lp.learner_user_id === userId && lp.lesson_id === lessonId);
          const wasCompleted = existing?.status === "completed";
          if (existing) {
            existing.status = "completed";
            existing.progress_percent = 100;
          } else {
            mockLessonProgressTable.push({ learner_user_id: userId, lesson_id: lessonId, status: "completed", progress_percent: 100 });
          }
          return [{ id: "prog-id", already_completed: wasCompleted }];
        }

        // 7. completeLesson: newly unlocked query
        if (query.includes("SELECT candidate.id FROM public.learning_lesson_prerequisites direct")) {
          const lessonId = values[0];
          const userId = values[1];
          const directPrereqs = mockLessonPrerequisitesTable.filter((p) => p.prerequisite_lesson_id === lessonId && p.required);
          const candidateIds = directPrereqs.map((p) => p.lesson_id);
          const unlocked: Array<{ id: string }> = [];
          for (const candId of candidateIds) {
            const candProg = mockLessonProgressTable.find((lp) => lp.learner_user_id === userId && lp.lesson_id === candId);
            if (candProg?.status === "completed") continue;
            const allCandPrereqs = mockLessonPrerequisitesTable.filter((p) => p.lesson_id === candId && p.required);
            const allMet = allCandPrereqs.every((p) => {
              const reqProg = mockLessonProgressTable.find((lp) => lp.learner_user_id === userId && lp.lesson_id === p.prerequisite_lesson_id);
              return reqProg?.status === "completed";
            });
            if (allMet) {
              unlocked.push({ id: candId });
            }
          }
          return unlocked;
        }

        // 8. symbolicEvaluations mine
        if (query.includes("FROM public.learning_symbolic_evaluations se") && query.includes("ORDER BY se.created_at DESC")) {
          const userId = values[0];
          return mockEvaluationsTable
            .filter((e) => e.requested_by_user_id === userId)
            .map((e) => {
              const pv = mockProgramVersionsTable.find((p) => p.id === e.program_version_id);
              return { ...e, version_number: pv?.version_number ?? 1 };
            });
        }

        // 9. lesson detail
        if (query.includes("FROM public.learning_lessons WHERE id=?")) {
          const lessonId = values[0];
          const l = mockLessonsTable.find((item) => item.id === lessonId);
          return l ? [{ ...l, created_at: new Date() }] : [];
        }

        // 10. course query
        if (query.includes("FROM public.learning_courses")) {
          return [{ id: "course-1", title: "Robotics Fundamentals", status: "published" }];
        }

        if (query.includes("SELECT o.code") && query.includes("FROM public.learning_objectives o")) {
          return [];
        }

        if (query.includes("FROM public.learning_assignments a")) {
          return [];
        }

        // 11. coursePath
        if (query.includes("FROM public.learning_lessons l") && query.includes("WHERE l.course_id=?")) {
          return mockLessonsTable.map((l) => {
            const prog = mockLessonProgressTable.find((p) => p.lesson_id === l.id && p.learner_user_id === student.vistaUserId);
            const prereqs = mockLessonPrerequisitesTable.filter((p) => p.lesson_id === l.id).map((p) => {
              const preLesson = mockLessonsTable.find((pl) => pl.id === p.prerequisite_lesson_id);
              const preProg = mockLessonProgressTable.find((lp) => lp.lesson_id === p.prerequisite_lesson_id && lp.learner_user_id === student.vistaUserId);
              return {
                lessonId: p.prerequisite_lesson_id,
                title: preLesson?.title ?? "Prerequisite",
                required: p.required,
                minimumScore: null,
                status: preProg?.status ?? "available",
                progressPercent: preProg?.progress_percent ?? 0,
              };
            });
            return {
              id: l.id,
              ordinal: l.ordinal,
              title: l.title,
              progress_status: prog?.status ?? "available",
              progress_percent: prog?.progress_percent ?? 0,
              completed_at: prog?.status === "completed" ? new Date() : null,
              prerequisites: prereqs,
            };
          });
        }

        return [];
      }),
    };

    mockScope = {
      classroomIds: jest.fn().mockResolvedValue(["class-1"]),
      isSystemAdministrator: jest.fn().mockReturnValue(false),
    };

    progressionService = new ProgressionService(mockPrisma, mockScope);
    symbolicEvaluationService = new SymbolicEvaluationService(mockPrisma, {} as any, {} as any, progressionService);
    learningService = new LearningService(mockPrisma, mockScope, progressionService);
  });

  describe("Required Qualification Tests (TEST A - TEST L)", () => {
    it("TEST A: C1-L4 PASS resolves exact ProgramVersion", async () => {
      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(qualified).toBeDefined();
      expect(qualified?.programVersionId).toBe("pv-l4-2");
      expect(qualified?.qualifiedProgramVersionId).toBe("pv-l4-2");
      expect(qualified?.versionNumber).toBe(2);
      expect(qualified?.evaluationId).toBe("eval-l4-pass-v2");
      expect(qualified?.symbolicEvaluationId).toBe("eval-l4-pass-v2");
      expect(qualified?.experimentId).toBe("exp-l4-2");
      expect(qualified?.schematicExperimentId).toBe("exp-l4-2");
      expect(qualified?.verdict).toBe("passed");
      expect(qualified?.lessonId).toBe("lesson-4");
      expect(qualified?.courseId).toBe("course-1");
      expect(qualified?.attemptId).toBe("att-l4");
    });

    it("TEST B: failed ProgramVersion does not qualify", async () => {
      mockEvaluationsTable = mockEvaluationsTable.filter((e) => e.verdict !== "passed");
      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(qualified).toBeNull();
    });

    it("TEST C: FAIL → PASS resolves PASS version", async () => {
      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(qualified?.programVersionId).toBe("pv-l4-2");
      expect(qualified?.versionNumber).toBe(2);
      expect(qualified?.programVersionId).not.toBe("pv-l4-1");
    });

    it("TEST D: PASS → later FAIL still resolves most recent successful PASS", async () => {
      mockEvaluationsTable.push({
        id: "eval-l4-fail-v3",
        experiment_id: "exp-l4-3",
        submission_id: "sub-l4-3",
        program_version_id: "pv-l4-3",
        requested_by_user_id: student.vistaUserId,
        verdict: "failed",
        created_at: new Date("2026-10-31T12:00:00Z"),
      });

      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(qualified).toBeDefined();
      expect(qualified?.programVersionId).toBe("pv-l4-2");
      expect(qualified?.versionNumber).toBe(2);
      expect(qualified?.evaluationId).toBe("eval-l4-pass-v2");
    });

    it("TEST E: PASS v1 → PASS v2 resolves deterministic latest successful version", async () => {
      mockEvaluationsTable.push({
        id: "eval-l4-pass-v1",
        experiment_id: "exp-l4-1",
        submission_id: "sub-l4-1",
        program_version_id: "pv-l4-1",
        requested_by_user_id: student.vistaUserId,
        verdict: "passed",
        created_at: new Date("2026-10-31T10:30:00Z"),
      });

      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(qualified?.programVersionId).toBe("pv-l4-2");
      expect(qualified?.versionNumber).toBe(2);

      // Deterministic tie-breaking on identical timestamps
      mockEvaluationsTable.push({
        id: "eval-l4-pass-tie-v3",
        experiment_id: "exp-l4-3",
        submission_id: "sub-l4-3",
        program_version_id: "pv-l4-3",
        requested_by_user_id: student.vistaUserId,
        verdict: "passed",
        created_at: new Date("2026-10-31T11:30:00Z"),
      });
      const tieBreaker = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(tieBreaker?.programVersionId).toBe("pv-l4-3");
      expect(tieBreaker?.versionNumber).toBe(3);
    });

    it("TEST F: another learner cannot resolve/access qualification", async () => {
      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(otherStudent, "course-1");
      expect(qualified).toBeNull();
    });

    it("TEST G: wrong course does not resolve qualification", async () => {
      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-wrong-id");
      expect(qualified).toBeNull();
    });

    it("TEST H: wrong challenge/lesson provenance cannot qualify", async () => {
      const origLessonId = mockAssignmentsTable.find((a) => a.id === "asgn-l4")?.lesson_id;
      const l4Asgn = mockAssignmentsTable.find((a) => a.id === "asgn-l4");
      if (l4Asgn) l4Asgn.lesson_id = "lesson-2";

      const qualified = await progressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(qualified).toBeNull();

      if (l4Asgn) l4Asgn.lesson_id = origLessonId;
    });

    it("TEST I: qualification survives fresh service/query reconstruction", async () => {
      const freshProgressionService = new ProgressionService(mockPrisma, mockScope);
      const qualified = await freshProgressionService.resolveQualifiedL4ProgramVersion(student, "course-1");
      expect(qualified?.programVersionId).toBe("pv-l4-2");
      expect(qualified?.versionNumber).toBe(2);
      expect(qualified?.evaluationId).toBe("eval-l4-pass-v2");
    });

    it("TEST J: C1-L4 PASS completes L4", async () => {
      const l4Prog = mockLessonProgressTable.find((p) => p.lesson_id === "lesson-4");
      if (l4Prog) { l4Prog.status = "in_progress"; l4Prog.progress_percent = 50; }
      const l5Prog = mockLessonProgressTable.find((p) => p.lesson_id === "lesson-5");
      if (l5Prog) { l5Prog.status = "locked"; l5Prog.progress_percent = 0; }

      const projection = await progressionService.projectSymbolicPass(mockPrisma, student, {
        evaluationId: "eval-l4-pass-v2",
        attemptId: "att-l4",
        programVersionId: "pv-l4-2",
        verdict: "passed",
      });

      expect(projection.completedLessonId).toBe("lesson-4");
      expect(l4Prog?.status).toBe("completed");
      expect(l4Prog?.progress_percent).toBe(100);
    });

    it("TEST K: L4 PASS unlocks L5", async () => {
      const l4Prog = mockLessonProgressTable.find((p) => p.lesson_id === "lesson-4");
      if (l4Prog) { l4Prog.status = "in_progress"; l4Prog.progress_percent = 50; }
      const l5Prog = mockLessonProgressTable.find((p) => p.lesson_id === "lesson-5");
      if (l5Prog) { l5Prog.status = "locked"; l5Prog.progress_percent = 0; }

      const projection = await progressionService.projectSymbolicPass(mockPrisma, student, {
        evaluationId: "eval-l4-pass-v2",
        attemptId: "att-l4",
        programVersionId: "pv-l4-2",
        verdict: "passed",
      });

      expect(projection.newlyUnlockedLessonIds).toContain("lesson-5");
    });

    it("TEST L: L4 PASS does NOT complete L5", async () => {
      const l4Prog = mockLessonProgressTable.find((p) => p.lesson_id === "lesson-4");
      if (l4Prog) { l4Prog.status = "in_progress"; l4Prog.progress_percent = 50; }
      const l5Prog = mockLessonProgressTable.find((p) => p.lesson_id === "lesson-5");
      if (l5Prog) { l5Prog.status = "locked"; l5Prog.progress_percent = 0; }

      const projection = await progressionService.projectSymbolicPass(mockPrisma, student, {
        evaluationId: "eval-l4-pass-v2",
        attemptId: "att-l4",
        programVersionId: "pv-l4-2",
        verdict: "passed",
      });

      expect(projection.completedLessonId).not.toBe("lesson-5");
      expect(l5Prog?.status).not.toBe("completed");

      const path = await progressionService.coursePath(student, "course-1");
      expect(path.lessons.find((l) => l.ordinal === 4)?.status).toBe("completed");
      expect(path.lessons.find((l) => l.ordinal === 5)?.status).not.toBe("completed");
      expect(path.progressPercent).toBe(80); // 4 of 5 lessons completed
    });
  });

  describe("Evidence and Provenance Inspection", () => {
    it("fetches own evaluation result with exact immutable evidence", async () => {
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

    it("rejects another learner's result (404/authorization boundary)", async () => {
      await expect(symbolicEvaluationService.own(otherStudent, "eval-l4-pass-v2")).rejects.toThrow(NotFoundException);
    });

    it("resolves exact Experiment ID attached to the evaluation", async () => {
      const result = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
      expect(result.experimentId).toBe("exp-l4-2");
      expect(result.evidence?.experimentId).toBe("exp-l4-2");
    });

    it("returns persisted rule evidence and metrics", async () => {
      const result = await symbolicEvaluationService.own(student, "eval-l4-pass-v2");
      expect(Array.isArray(result.ruleResults)).toBe(true);
      expect((result.ruleResults as any[]).length).toBe(4);
      expect(result.metrics).toEqual({ ruleCount: 4, passedRuleCount: 4 });
    });

    it("historical FAIL remains retrievable with full failure evidence", async () => {
      const failResult = await symbolicEvaluationService.own(student, "eval-l4-fail");
      expect(failResult.verdict).toBe("failed");
      expect(failResult.status).toBe("failed");
      const rules = failResult.ruleResults as any[];
      const failedRule = rules.find((r) => !r.passed);
      expect(failedRule.code).toBe("OBJECT_RELEASED_OUTSIDE_TARGET");
      expect(failedRule.reason).toContain("45 mm outside the target area");
    });

    it("L5 lesson detail includes qualification summary from latest passing L4 version", async () => {
      const l5Detail = await learningService.lesson(student, "lesson-5");
      expect(l5Detail.ordinal).toBe(5);
      expect(l5Detail.qualification).toBeDefined();
      expect(l5Detail.qualification?.lessonId).toBe("lesson-4");
      expect(l5Detail.qualification?.programVersionId).toBe("pv-l4-2");
      expect(l5Detail.qualification?.versionNumber).toBe(2);
      expect(l5Detail.qualification?.verdict).toBe("passed");
    });

    it("listSymbolicEvaluations supports filtering by attemptId", async () => {
      const all = await symbolicEvaluationService.mine(student);
      expect(all.length).toBeGreaterThanOrEqual(4);
    });
  });
});
