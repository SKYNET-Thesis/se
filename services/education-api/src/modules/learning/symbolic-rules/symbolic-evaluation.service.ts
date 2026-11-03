import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/database/prisma.service";
import { AuthenticatedUser } from "../../identity/auth/authenticated-user.interface";
import { ProgressionProjection } from "../dto/course-path.dto";
import { ProgressionService } from "../progression.service";
import { SymbolicEvaluationPreparationService } from "./symbolic-evaluation-preparation.service";
import { SymbolicRuleEvaluatorService } from "./symbolic-rule-evaluator.service";

export interface SymbolicEvaluationResponse {
  id: string; experimentId: string; programVersionId: string; versionNumber?: number; evaluatorVersion: string;
  ruleSetSchemaVersion: number; ruleSetHash: string; verdict: "passed" | "failed";
  ruleResults: unknown; metrics: unknown; createdAt: Date; progression?: ProgressionProjection;
  status?: "success" | "failed";
  taskState?: "not_started" | "in_progress" | "success" | "failed";
  robotState?: unknown;
  objectState?: unknown;
  attemptId?: string;
  lesson?: { id: string; title: string; ordinal: number; courseId: string; courseTitle: string };
  feedback?: { summary: string; messages: string[]; code?: string; message?: string };
  evidence?: { experimentId: string; evaluationId: string; programVersionId: string; versionNumber?: number };
}

/** Append-only persistence for completed deterministic symbolic evidence. */
@Injectable()
export class SymbolicEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: SymbolicEvaluationPreparationService,
    private readonly evaluator: SymbolicRuleEvaluatorService,
    private readonly progression: ProgressionService,
  ) {}

  async evaluateOwnExperiment(user: AuthenticatedUser, experimentId: string): Promise<SymbolicEvaluationResponse> {
    const prepared = await this.preparation.prepareForOwnExperiment(user, experimentId);
    const preview = this.evaluator.evaluate(prepared.ruleSet, prepared.schematic);
    const snapshot = { kind: prepared.ruleSet.kind, schemaVersion: prepared.ruleSet.schemaVersion, rules: prepared.ruleSet.rules, sources: prepared.ruleSet.sources };
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<DbEvaluation[]>`
        INSERT INTO public.learning_symbolic_evaluations(
          experiment_id,submission_id,program_version_id,requested_by_user_id,evaluator_version,
          schematic_schema_version,schematic_engine_version,program_hash,output_snapshot_hash,
          rule_set_schema_version,rule_set_hash,rule_set_snapshot,fingerprint,verdict,rule_results,metrics
        ) VALUES (
          ${prepared.experimentId}::uuid,${prepared.submissionId}::uuid,${prepared.programVersionId}::uuid,${prepared.requestedByUserId}::uuid,${prepared.evaluatorVersion},
          ${prepared.schematic.schemaVersion},${prepared.schematic.engineVersion},${prepared.programHash},${prepared.outputSnapshotHash},
          ${prepared.ruleSet.schemaVersion},${prepared.ruleSet.ruleSetHash},${JSON.stringify(snapshot)}::jsonb,${prepared.fingerprint},${preview.verdict},${JSON.stringify(preview.rules)}::jsonb,${JSON.stringify(preview.metrics)}::jsonb
        ) ON CONFLICT (fingerprint) DO NOTHING
        RETURNING id,experiment_id,program_version_id,evaluator_version,rule_set_schema_version,rule_set_hash,verdict,rule_results,metrics,created_at`;
      let evidence = inserted[0];
      if (!evidence) {
        const existing = await tx.$queryRaw<DbEvaluation[]>`
        SELECT se.id,se.experiment_id,se.program_version_id,se.evaluator_version,se.rule_set_schema_version,se.rule_set_hash,se.verdict,se.rule_results,se.metrics,se.created_at
        FROM public.learning_symbolic_evaluations se
        JOIN public.learning_experiments e ON e.id=se.experiment_id
        WHERE se.fingerprint=${prepared.fingerprint} AND se.requested_by_user_id=${user.vistaUserId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid`;
        if (!existing[0]) throw new NotFoundException("Symbolic evaluation was not found.");
        evidence = existing[0];
      }
      const response = map(evidence);
      const passed = response.verdict === "passed";
      const status: "success" | "failed" = passed ? "success" : "failed";
      const taskState: "success" | "failed" = passed ? "success" : "failed";
      const robotState = prepared.schematic.finalState;
      const objectState = prepared.schematic.finalState.objectState ?? null;
      const failedRules = (preview.rules || []).filter((rule) => !rule.passed);
      const isPickAndPlace = prepared.ruleSet.rules.some((r) => r.type === "object_in_target_zone");
      const isManipulation = prepared.ruleSet.rules.some((r) => r.type === "object_grasped" || r.type === "object_lifted" || r.type === "object_released");
      const feedback = {
        summary: passed
          ? isPickAndPlace
            ? "You successfully placed the object inside the target zone. Course 1 simulation challenge complete."
            : isManipulation
            ? "You successfully grasped, lifted, and released the object. Simulation passed."
            : "Target A reached successfully. Simulation passed."
          : (failedRules[0]?.message || "The robot program did not complete the required task."),
        messages: (preview.rules || []).map((rule) => rule.message || rule.reason),
      };
      const versionNumber = (prepared as any).versionNumber ?? 1;
      const resultEvidence = {
        experimentId: prepared.experimentId,
        evaluationId: response.id,
        programVersionId: response.programVersionId,
        versionNumber,
      };
      const finalized=await tx.$queryRaw<{id:string}[]>`UPDATE public.learning_assignment_attempts SET status='evaluated',result_snapshot=${JSON.stringify({ evaluationId: response.id, programVersionId: response.programVersionId, verdict: response.verdict, ruleResults: response.ruleResults, metrics: response.metrics, status, taskState, robotState, objectState, feedback, evidence: resultEvidence })}::jsonb WHERE id=${prepared.attemptId}::uuid AND learner_user_id=${user.vistaUserId}::uuid AND status IN ('submitted','evaluated') RETURNING id`;
      if(!finalized[0])throw new ConflictException("Attempt could not be finalized after evaluation.");
      const progression = await this.progression.projectSymbolicPass(tx, user, {
        evaluationId: response.id,
        attemptId: prepared.attemptId,
        programVersionId: response.programVersionId,
        verdict: response.verdict,
      });
      return { ...response, versionNumber, attemptId: prepared.attemptId, status, taskState, robotState, objectState, feedback, evidence: resultEvidence, progression };
    });
  }

  async own(user: AuthenticatedUser, evaluationId: string): Promise<SymbolicEvaluationResponse> {
    const rows = await this.prisma.$queryRaw<Array<DbEvaluation & {
      version_number: number | null;
      attempt_id: string | null;
      input_snapshot: any;
      output_snapshot: any;
      result_snapshot: any;
      lesson_id: string | null;
      lesson_title: string | null;
      ordinal: number | null;
      course_id: string | null;
      course_title: string | null;
    }>>`
      SELECT se.id,se.experiment_id,se.program_version_id,se.evaluator_version,se.rule_set_schema_version,
             se.rule_set_hash,se.verdict,se.rule_results,se.metrics,se.created_at,
             pv.version_number,
             e.input_snapshot, e.output_snapshot,
             a.id::text AS attempt_id, a.result_snapshot,
             l.id::text AS lesson_id, l.title AS lesson_title, l.ordinal,
             c.id::text AS course_id, c.title AS course_title
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments e ON e.id=se.experiment_id
      LEFT JOIN public.learning_program_versions pv ON pv.id=se.program_version_id
      LEFT JOIN public.learning_assignment_attempts a ON a.id::text=e.input_snapshot->>'attemptId'
      LEFT JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
      LEFT JOIN public.learning_assignments la ON la.id=ca.assignment_id
      LEFT JOIN public.learning_lessons l ON l.id=la.lesson_id
      LEFT JOIN public.learning_courses c ON c.id=l.course_id
      WHERE se.id=${evaluationId}::uuid
        AND se.requested_by_user_id=${user.vistaUserId}::uuid
        AND e.learner_user_id=${user.vistaUserId}::uuid`;
    const row = rows[0];
    if (!row) throw new NotFoundException("Symbolic evaluation was not found.");
    const base = map(row);
    const passed = row.verdict === "passed";
    const status: "success" | "failed" = passed ? "success" : "failed";
    const taskState: "success" | "failed" = passed ? "success" : "failed";
    const robotState = row.output_snapshot?.finalState ?? row.result_snapshot?.robotState ?? null;
    const objectState = row.output_snapshot?.finalState?.objectState ?? row.result_snapshot?.objectState ?? null;
    const rules = Array.isArray(row.rule_results) ? row.rule_results : [];
    const isPickAndPlace = rules.some((r: any) => r.type === "object_in_target_zone");
    const isManipulation = rules.some((r: any) => r.type === "object_grasped" || r.type === "object_lifted" || r.type === "object_released");
    const failedRule = rules.find((r: any) => !r.passed);
    const feedback = row.result_snapshot?.feedback ?? {
      summary: passed
        ? isPickAndPlace
          ? "You successfully placed the object inside the target zone. Course 1 simulation challenge complete."
          : isManipulation
          ? "You successfully grasped, lifted, and released the object. Simulation passed."
          : "Target A reached successfully. Simulation passed."
        : (failedRule?.message || "The robot program did not complete the required task."),
      messages: rules.map((r: any) => r.message || r.reason),
      code: failedRule?.code,
      message: failedRule?.message,
    };
    return {
      ...base,
      versionNumber: row.version_number ?? 1,
      status,
      taskState,
      robotState,
      objectState,
      feedback,
      attemptId: row.attempt_id ?? (row.input_snapshot?.attemptId as string | undefined),
      evidence: {
        experimentId: row.experiment_id,
        evaluationId: row.id,
        programVersionId: row.program_version_id,
        versionNumber: row.version_number ?? 1,
      },
      lesson: row.lesson_id ? {
        id: row.lesson_id,
        title: row.lesson_title ?? "Lesson",
        ordinal: row.ordinal ?? 1,
        courseId: row.course_id ?? "",
        courseTitle: row.course_title ?? "Course",
      } : undefined,
    };
  }

  async mine(user: AuthenticatedUser, attemptId?: string): Promise<SymbolicEvaluationResponse[]> {
    const rows = await this.prisma.$queryRaw<Array<DbEvaluation & { version_number: number | null }>>`
      SELECT se.id,se.experiment_id,se.program_version_id,se.evaluator_version,se.rule_set_schema_version,se.rule_set_hash,se.verdict,se.rule_results,se.metrics,se.created_at,
             pv.version_number
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments e ON e.id=se.experiment_id
      LEFT JOIN public.learning_program_versions pv ON pv.id=se.program_version_id
      WHERE se.requested_by_user_id=${user.vistaUserId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid
      ${attemptId ? Prisma.sql`AND e.input_snapshot->>'attemptId'=${attemptId}` : Prisma.empty}
      ORDER BY se.created_at DESC`;
    return rows.map((r) => ({
      ...map(r),
      versionNumber: r.version_number ?? 1,
      status: r.verdict === "passed" ? "success" : "failed",
      taskState: r.verdict === "passed" ? "success" : "failed",
    }));
  }
}

interface DbEvaluation { id: string; experiment_id: string; program_version_id: string; evaluator_version: string; rule_set_schema_version: number; rule_set_hash: string; verdict: "passed" | "failed"; rule_results: unknown; metrics: unknown; created_at: Date; }
function map(row: DbEvaluation): SymbolicEvaluationResponse { return { id: row.id, experimentId: row.experiment_id, programVersionId: row.program_version_id, evaluatorVersion: row.evaluator_version, ruleSetSchemaVersion: row.rule_set_schema_version, ruleSetHash: row.rule_set_hash, verdict: row.verdict, ruleResults: row.rule_results, metrics: row.metrics, createdAt: row.created_at }; }

