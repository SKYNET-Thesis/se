import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/database/prisma.service";
import { AuthenticatedUser } from "../../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "../learning-scope.service";
import { ChallengeConditionInput, NormalizedRuleSetV1, canonicalJson, sha256 } from "./symbolic-rule-compiler.service";
import { SchematicOutputV1, SymbolicRuleEvaluatorService } from "./symbolic-rule-evaluator.service";
import { SymbolicRuleCompilerService } from "./symbolic-rule-compiler.service";

export const SYMBOLIC_EVALUATOR_VERSION = "vista-symbolic-evaluator-1";

interface EvaluationChainRow {
  attempt_id: string;
  experiment_id: string; learner_user_id: string; status: string; execution_mode: string;
  input_snapshot: unknown; output_snapshot: unknown; submission_id: string;
  assignment_id: string; program_version_id: string; challenge_id: string | null;
  classroom_id: string; robot_program: unknown;
}

export interface PreparedSymbolicEvaluation {
  attemptId: string; experimentId: string; submissionId: string; programVersionId: string; requestedByUserId: string;
  schematic: SchematicOutputV1; ruleSet: NormalizedRuleSetV1;
  evaluatorVersion: typeof SYMBOLIC_EVALUATOR_VERSION; programHash: string;
  outputSnapshotHash: string; fingerprint: string;
}

/** Internal-only future-evaluation boundary. It derives every authority input
 * from the authenticated user and persisted experiment chain; no client rules,
 * challenge IDs or schematic output can enter this service. */
@Injectable()
export class SymbolicEvaluationPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: LearningScopeService,
    private readonly compiler: SymbolicRuleCompilerService,
    private readonly evaluator: SymbolicRuleEvaluatorService,
  ) {}

  async prepareForOwnExperiment(user: AuthenticatedUser, experimentId: string): Promise<PreparedSymbolicEvaluation> {
    if (user.status !== "active") throw new ForbiddenException("Inactive users cannot evaluate experiments.");
    this.requireCapability(user);
    const rows = await this.prisma.$queryRaw<EvaluationChainRow[]>`
      SELECT a.id AS attempt_id,e.id AS experiment_id,e.learner_user_id,e.status,e.execution_mode,e.input_snapshot,e.output_snapshot,
             s.id AS submission_id,s.assignment_id,s.program_version_id,la.challenge_id,ca.classroom_id,pv.robot_program
      FROM public.learning_experiments e
      JOIN public.learning_submissions s ON s.id=e.submission_id AND s.learner_user_id=e.learner_user_id
      JOIN public.learning_assignments la ON la.id=s.assignment_id
      JOIN public.learning_assignment_attempts a ON a.id::text=e.input_snapshot->>'attemptId'
        AND a.learner_user_id=s.learner_user_id AND a.program_id=s.program_id
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id AND ca.assignment_id=s.assignment_id
      JOIN public.learning_program_versions pv ON pv.id=s.program_version_id AND pv.program_id=s.program_id
      WHERE e.id=${experimentId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid`;
    const row = rows[0];
    if (!row) throw new NotFoundException("Experiment was not found.");
    await this.scope.assertStudentClassroomAccess(user, row.classroom_id);
    if (row.status !== "succeeded" || row.execution_mode !== "schematic") throw new BadRequestException("Only a completed schematic experiment can be evaluated.");
    if (!row.challenge_id) throw new BadRequestException("The experiment assignment has no challenge.");
    const input = asRecord(row.input_snapshot, "Experiment input provenance is invalid.");
    if (input.programVersionId !== row.program_version_id) throw new BadRequestException("Experiment program version provenance is invalid.");
    const output = row.output_snapshot;
    this.evaluator.assertSupportedOutput(output);
    if (output.robotProgramVersionId !== row.program_version_id) throw new BadRequestException("Persisted schematic output program version does not match the submission.");
    const conditions = await this.prisma.$queryRaw<ChallengeConditionInput[]>`
      SELECT id,ordinal,rule_key,rule_config FROM public.learning_challenge_conditions
      WHERE challenge_id=${row.challenge_id}::uuid ORDER BY ordinal ASC,id ASC`;
    const ruleSet = this.compiler.compile(conditions);
    const programHash = sha256(canonicalJson(row.robot_program));
    const outputSnapshotHash = sha256(canonicalJson(output));
    const fingerprint = sha256(canonicalJson({ experimentId: row.experiment_id, programHash, outputSnapshotHash,
      schematicSchemaVersion: output.schemaVersion, schematicEngineVersion: output.engineVersion,
      evaluatorVersion: SYMBOLIC_EVALUATOR_VERSION, ruleSetSchemaVersion: ruleSet.schemaVersion, ruleSetHash: ruleSet.ruleSetHash }));
    return { attemptId: row.attempt_id, experimentId: row.experiment_id, submissionId: row.submission_id, programVersionId: row.program_version_id,
      requestedByUserId: user.vistaUserId, schematic: output, ruleSet, evaluatorVersion: SYMBOLIC_EVALUATOR_VERSION,
      programHash, outputSnapshotHash, fingerprint };
  }

  private requireCapability(user: AuthenticatedUser): void {
    if (!user.systemPermissions.includes("learning.experiment.execute") && !user.memberships.some((membership) => membership.status === "active" && membership.permissions.includes("learning.experiment.execute"))) throw new NotFoundException("Experiment was not found.");
  }
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException(message);
  return value as Record<string, unknown>;
}
