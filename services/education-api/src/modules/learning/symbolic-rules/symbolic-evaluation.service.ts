import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/database/prisma.service";
import { AuthenticatedUser } from "../../identity/auth/authenticated-user.interface";
import { ProgressionProjection } from "../dto/course-path.dto";
import { ProgressionService } from "../progression.service";
import { SymbolicEvaluationPreparationService } from "./symbolic-evaluation-preparation.service";
import { SymbolicRuleEvaluatorService } from "./symbolic-rule-evaluator.service";

export interface SymbolicEvaluationResponse {
  id: string; experimentId: string; programVersionId: string; evaluatorVersion: string;
  ruleSetSchemaVersion: number; ruleSetHash: string; verdict: "passed" | "failed";
  ruleResults: unknown; metrics: unknown; createdAt: Date; progression?: ProgressionProjection;
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
      const finalized=await tx.$queryRaw<{id:string}[]>`UPDATE public.learning_assignment_attempts SET status='evaluated',result_snapshot=${JSON.stringify({ evaluationId: response.id, programVersionId: response.programVersionId, verdict: response.verdict, ruleResults: response.ruleResults, metrics: response.metrics })}::jsonb WHERE id=${prepared.attemptId}::uuid AND learner_user_id=${user.vistaUserId}::uuid AND status IN ('submitted','evaluated') RETURNING id`;
      if(!finalized[0])throw new ConflictException("Attempt could not be finalized after evaluation.");
      const progression = await this.progression.projectSymbolicPass(tx, user, {
        evaluationId: response.id,
        attemptId: prepared.attemptId,
        programVersionId: response.programVersionId,
        verdict: response.verdict,
      });
      return { ...response, progression };
    });
  }

  async own(user: AuthenticatedUser, evaluationId: string): Promise<SymbolicEvaluationResponse> {
    const rows = await this.prisma.$queryRaw<DbEvaluation[]>`
      SELECT se.id,se.experiment_id,se.program_version_id,se.evaluator_version,se.rule_set_schema_version,se.rule_set_hash,se.verdict,se.rule_results,se.metrics,se.created_at
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments e ON e.id=se.experiment_id
      WHERE se.id=${evaluationId}::uuid AND se.requested_by_user_id=${user.vistaUserId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid`;
    if (!rows[0]) throw new NotFoundException("Symbolic evaluation was not found.");
    return map(rows[0]);
  }

  async mine(user: AuthenticatedUser): Promise<SymbolicEvaluationResponse[]> {
    const rows = await this.prisma.$queryRaw<DbEvaluation[]>`
      SELECT se.id,se.experiment_id,se.program_version_id,se.evaluator_version,se.rule_set_schema_version,se.rule_set_hash,se.verdict,se.rule_results,se.metrics,se.created_at
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments e ON e.id=se.experiment_id
      WHERE se.requested_by_user_id=${user.vistaUserId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid
      ORDER BY se.created_at DESC`;
    return rows.map(map);
  }
}

interface DbEvaluation { id: string; experiment_id: string; program_version_id: string; evaluator_version: string; rule_set_schema_version: number; rule_set_hash: string; verdict: "passed" | "failed"; rule_results: unknown; metrics: unknown; created_at: Date; }
function map(row: DbEvaluation): SymbolicEvaluationResponse { return { id: row.id, experimentId: row.experiment_id, programVersionId: row.program_version_id, evaluatorVersion: row.evaluator_version, ruleSetSchemaVersion: row.rule_set_schema_version, ruleSetHash: row.rule_set_hash, verdict: row.verdict, ruleResults: row.rule_results, metrics: row.metrics, createdAt: row.created_at }; }
