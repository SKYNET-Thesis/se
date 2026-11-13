import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { CreateProgramDto } from "./dto/create-program.dto";
import { CreateProgramVersionDto } from "./dto/create-program-version.dto";
import { SubmitAttemptDto } from "./dto/submit-attempt.dto";
import { UpdateProgramDto } from "./dto/update-program.dto";
import { assertRobotProgramBounds } from "./robot-program-limits";
import { LearningScopeService } from "./learning-scope.service";
import { assertAttemptOpen, loadOwnAttempt, loadOwnAttemptByProgram } from "./attempt-lifecycle";
import { SUBMISSION_UPLOAD_GRACE_MS } from "./submission-file.validation";
import { ProgressionService } from "./progression.service";
import { SchemaCompatibilityService } from "./schema-compatibility.service";

interface AttemptProgramRow { attempt_id: string; classroom_id: string; assignment_id: string; program_id: string | null; }
export interface ProgramRow { id: string; owner_user_id: string; assignment_id: string | null; title: string; schema_version: number; workspace_json: unknown; robot_program: unknown; validation_result: unknown; }

@Injectable()
export class ProgrammingService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly progression?: ProgressionService, private readonly compat?: SchemaCompatibilityService) {}

  async programForAttempt(user: AuthenticatedUser, attemptId: string) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (!attempt.program_id) throw new NotFoundException("Program was not found.");
    return this.ownProgram(user, attempt.program_id);
  }

  async createProgram(user: AuthenticatedUser, attemptId: string, dto: CreateProgramDto) {
    this.validateRobotProgram(dto.robotProgram);
    return this.prisma.$transaction(async (tx) => {
      const attempt = await loadOwnAttempt(tx, user.vistaUserId, attemptId, true);
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id, { requireActiveEnrollment: true });
      assertAttemptOpen(attempt);
      if (attempt.program_id) throw new ConflictException("This attempt already has a program.");
      if (this.hasLearningPreview(dto.robotProgram)) await this.validateRobotProgram(dto.robotProgram, await this.assignmentAllowsLearningPreview(attempt.assignment_id));
      await this.validateCurriculumProgram(attempt.assignment_id, dto.robotProgram);
      const workspaceIssues = await this.curriculumWorkspaceIssues(attempt.assignment_id, dto.workspaceJson);
      const created = await tx.$queryRaw<ProgramRow[]>`
        INSERT INTO public.learning_programs(owner_user_id,assignment_id,title,schema_version,workspace_json,robot_program,validation_result)
        VALUES(${user.vistaUserId}::uuid,${attempt.assignment_id}::uuid,${dto.title ?? "Untitled program"},1,
          ${JSON.stringify(dto.workspaceJson)}::jsonb,${JSON.stringify(dto.robotProgram)}::jsonb,
          ${JSON.stringify(this.validationResult(dto.robotProgram, workspaceIssues))}::jsonb)
        RETURNING id,owner_user_id,assignment_id,title,schema_version,workspace_json,robot_program,validation_result`;
      await tx.$executeRaw`UPDATE public.learning_assignment_attempts SET program_id=${created[0].id}::uuid WHERE id=${attemptId}::uuid`;
      return created[0];
    });
  }

  async updateProgram(user: AuthenticatedUser, programId: string, dto: UpdateProgramDto) {
    const current = await this.ownProgram(user, programId, true);
    await this.assertProgramAttemptOpen(user, programId);
    if (dto.robotProgram) { this.validateRobotProgram(dto.robotProgram); if (this.hasLearningPreview(dto.robotProgram)) await this.validateRobotProgram(dto.robotProgram, await this.assignmentAllowsLearningPreview(current.assignment_id)); await this.validateCurriculumProgram(current.assignment_id, dto.robotProgram); }
    const workspace = dto.workspaceJson === undefined ? current.workspace_json : dto.workspaceJson;
    const robot = dto.robotProgram === undefined ? current.robot_program : dto.robotProgram;
    const workspaceIssues = await this.curriculumWorkspaceIssues(current.assignment_id, workspace);
    return this.prisma.$queryRaw<ProgramRow[]>`
      UPDATE public.learning_programs SET
        title=${dto.title ?? current.title}, workspace_json=${JSON.stringify(workspace)}::jsonb,
        robot_program=${JSON.stringify(robot)}::jsonb,
        validation_result=${JSON.stringify(this.validationResult(robot as Record<string, unknown>, workspaceIssues))}::jsonb,
        updated_at=now()
      WHERE id=${programId}::uuid AND owner_user_id=${user.vistaUserId}::uuid
      RETURNING id,owner_user_id,assignment_id,title,schema_version,workspace_json,robot_program,validation_result`;
  }

  async versions(user: AuthenticatedUser, programId: string) {
    await this.ownProgram(user, programId);
    return this.prisma.$queryRaw`
      SELECT id,program_id,version_number,workspace_json,robot_program,validation_result,change_summary,created_by,created_at
      FROM public.learning_program_versions WHERE program_id=${programId}::uuid ORDER BY version_number DESC`;
  }

  async createVersion(user: AuthenticatedUser, programId: string, dto: CreateProgramVersionDto) {
    return this.prisma.$transaction(async (tx) => {
      const programs = await tx.$queryRaw<ProgramRow[]>`
        SELECT p.id,p.owner_user_id,p.assignment_id,p.title,p.schema_version,p.workspace_json,p.robot_program,p.validation_result
        FROM public.learning_programs p
        WHERE p.id=${programId}::uuid AND p.owner_user_id=${user.vistaUserId}::uuid FOR UPDATE`;
      const program = programs[0];
      if (!program) throw new NotFoundException("Program was not found.");
      await this.assertProgramAttemptOpen(user, programId, tx);
      this.validateRobotProgram(program.robot_program as Record<string, unknown>);
      if (this.hasLearningPreview(program.robot_program as Record<string, unknown>)) await this.validateRobotProgram(program.robot_program as Record<string, unknown>, await this.assignmentAllowsLearningPreview(program.assignment_id));
      await this.validateCurriculumProgram(program.assignment_id, program.robot_program as Record<string, unknown>);
      await this.validateCurriculumWorkspace(program.assignment_id, program.workspace_json);
      const next = await tx.$queryRaw<{ version_number: number }[]>`
        SELECT COALESCE(MAX(version_number),0)+1 AS version_number
        FROM public.learning_program_versions WHERE program_id=${programId}::uuid`;
      const created = await tx.$queryRaw<{
        id: string;
        program_id: string;
        version_number: number;
        workspace_json: unknown;
        robot_program: unknown;
        validation_result: unknown;
        change_summary: string | null;
        created_by: string;
        created_at: Date;
      }[]>`
        INSERT INTO public.learning_program_versions(program_id,version_number,workspace_json,robot_program,validation_result,change_summary,created_by)
        VALUES(${programId}::uuid,${next[0].version_number},${JSON.stringify(program.workspace_json)}::jsonb,
          ${JSON.stringify(program.robot_program)}::jsonb,${JSON.stringify(this.validationResult(program.robot_program as Record<string, unknown>))}::jsonb,
          ${dto.changeSummary ?? null},${user.vistaUserId}::uuid)
        RETURNING id,program_id,version_number,workspace_json,robot_program,validation_result,change_summary,created_by,created_at`;
      return created[0];
    });
  }

  /**
   * THE explicit final action. A simulation run (create experiment, run, evaluate) never calls this: runs are bound to the
   * attempt's draft submission and leave the attempt open. Submitting promotes that draft (or creates the row) to the attempt's
   * single final submission, locks the attempt, and, when the submitted version already has a persisted symbolic evaluation,
   * finalizes the attempt as evaluated and projects a PASS to lesson progression (what the old combined flow did at run time).
   */
  async submit(user: AuthenticatedUser, attemptId: string, dto: SubmitAttemptDto) {
    await this.compat?.requireStage2();
    return this.prisma.$transaction(async (tx) => {
      const attempt = await loadOwnAttempt(tx, user.vistaUserId, attemptId, true);
      if (!attempt.program_id) throw new NotFoundException("Attempt program was not found.");
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id, { requireActiveEnrollment: true });
      // One final submission per attempt: a submitted/evaluated attempt, a closed or unavailable delivery is rejected.
      assertAttemptOpen(attempt);
      const versions = await tx.$queryRaw<{ id: string; workspace_json: unknown; robot_program: unknown }[]>`
        SELECT id,workspace_json,robot_program FROM public.learning_program_versions
        WHERE id=${dto.programVersionId}::uuid AND program_id=${attempt.program_id}::uuid`;
      const version = versions[0];
      if (!version) throw new BadRequestException("Program version does not belong to this attempt program.");
      await this.validateCurriculumProgram(attempt.assignment_id, version.robot_program as Record<string, unknown>);
      await this.validateCurriculumWorkspace(attempt.assignment_id, version.workspace_json);
      // Submission readiness: an upload that is still being verified must finish (or be removed) first.
      const pending = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.learning_submission_files
        WHERE attempt_id=${attemptId}::uuid AND status='pending' AND created_at > now() - (${SUBMISSION_UPLOAD_GRACE_MS / 1000}::int * interval '1 second')`;
      if ((pending[0]?.n ?? 0) > 0) throw new ConflictException({ code: "ATTACHMENT_PENDING", message: "Finish or remove the file uploads in progress before submitting." });
      type Row = { id: string; attempt_id: string; assignment_id: string; learner_user_id: string; program_id: string; program_version_id: string; status: string; submitted_at: Date };
      const existing = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id,status FROM public.learning_submissions WHERE attempt_id=${attemptId}::uuid FOR UPDATE`;
      if (existing[0] && existing[0].status !== "draft") throw new ConflictException({ code: "ALREADY_SUBMITTED", message: "This attempt already has a final submission." });
      let submissions: Row[];
      try {
        submissions = existing[0]
          ? await tx.$queryRaw<Row[]>`
              UPDATE public.learning_submissions SET program_id=${attempt.program_id}::uuid,program_version_id=${dto.programVersionId}::uuid,
                submitted_workspace=${JSON.stringify(version.workspace_json)}::jsonb,submitted_program=${JSON.stringify(version.robot_program)}::jsonb,
                reflection=${dto.reflection ?? null},status='submitted',submitted_at=now()
              WHERE id=${existing[0].id}::uuid AND status='draft'
              RETURNING id,attempt_id,assignment_id,learner_user_id,program_id,program_version_id,status,submitted_at`
          : await tx.$queryRaw<Row[]>`
              INSERT INTO public.learning_submissions(assignment_id,learner_user_id,program_id,program_version_id,submitted_workspace,submitted_program,reflection,status,submitted_at,attempt_id)
              VALUES(${attempt.assignment_id}::uuid,${user.vistaUserId}::uuid,${attempt.program_id}::uuid,${dto.programVersionId}::uuid,
                ${JSON.stringify(version.workspace_json)}::jsonb,${JSON.stringify(version.robot_program)}::jsonb,${dto.reflection ?? null},'submitted',now(),${attemptId}::uuid)
              RETURNING id,attempt_id,assignment_id,learner_user_id,program_id,program_version_id,status,submitted_at`;
      } catch (error) {
        const detail = JSON.stringify((error as { meta?: unknown })?.meta ?? "") + String((error as { message?: unknown })?.message ?? "");
        // Defense in depth: the legacy UNIQUE(assignment_id, learner_user_id) still exists (Stage 2 not applied).
        if (detail.includes("learning_submissions_assignment_id_learner_user_id_key")) {
          throw new ServiceUnavailableException("Attempt-based submissions are not enabled in this environment yet: the D03 Stage 2 database migration has not been applied.");
        }
        if (detail.includes("learning_submissions_attempt_id_key")) throw new ConflictException({ code: "ALREADY_SUBMITTED", message: "This attempt already has a final submission." });
        throw error;
      }
      // A persisted evaluation of exactly this version (recorded by an earlier simulation run) finalizes the attempt as evaluated.
      const snapshots = await tx.$queryRaw<{ result_snapshot: { evaluationId?: string; programVersionId?: string; verdict?: string } | null }[]>`
        SELECT result_snapshot FROM public.learning_assignment_attempts WHERE id=${attemptId}::uuid`;
      const evaluation = snapshots[0]?.result_snapshot;
      const evaluated = Boolean(evaluation?.evaluationId && evaluation.programVersionId === dto.programVersionId);
      const updated = await tx.$executeRaw`
        UPDATE public.learning_assignment_attempts SET status=${evaluated ? "evaluated" : "submitted"},submitted_at=now(),
          workspace_snapshot=${JSON.stringify(version.workspace_json)}::jsonb,program_snapshot=${JSON.stringify(version.robot_program)}::jsonb
        WHERE id=${attemptId}::uuid AND status='in_progress'`;
      if (updated !== 1) throw new ConflictException({ code: "ATTEMPT_NOT_IN_PROGRESS", message: "This attempt is no longer open for changes." });
      // Lesson progression is a curriculum contract (`constraints.kind = symbolic_program`). A teacher-created classroom
      // assignment has no such contract, so a passing run must still submit; it just completes no curriculum lesson.
      const curriculum = evaluated && evaluation?.verdict === "passed" && this.progression
        ? await this.isCurriculumProgramming(tx, attempt.assignment_id)
        : false;
      const progression = curriculum && this.progression
        ? await this.progression.projectSymbolicPass(tx as never, user, { evaluationId: evaluation!.evaluationId as string, attemptId, programVersionId: dto.programVersionId, verdict: "passed" })
        : { completedLessonId: null, newlyUnlockedLessonIds: [] };
      return { ...submissions[0], evaluated, progression };
    });
  }

  private async isCurriculumProgramming(db: Pick<PrismaService, "$queryRaw">, assignmentId: string | null): Promise<boolean> {
    if (!assignmentId) return false;
    const rows = await db.$queryRaw<Array<{ kind: string | null }>>`SELECT constraints->>'kind' AS kind FROM public.learning_assignments WHERE id=${assignmentId}::uuid`;
    return rows?.[0]?.kind === "symbolic_program";
  }

  private async ownAttempt(user: AuthenticatedUser, attemptId: string): Promise<AttemptProgramRow> {
    const attempts = await this.prisma.$queryRaw<AttemptProgramRow[]>`
      SELECT a.id AS attempt_id,ca.classroom_id,ca.assignment_id,a.program_id
      FROM public.learning_assignment_attempts a
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
      WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid`;
    const attempt = attempts[0];
    if (!attempt) throw new NotFoundException("Attempt was not found.");
    await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id);
    return attempt;
  }

  private async ownProgram(user: AuthenticatedUser, programId: string, requireActiveEnrollment = false): Promise<ProgramRow> {
    const programs = await this.prisma.$queryRaw<ProgramRow[]>`
      SELECT p.id,p.owner_user_id,p.assignment_id,p.title,p.schema_version,p.workspace_json,p.robot_program,p.validation_result
      FROM public.learning_programs p WHERE p.id=${programId}::uuid AND p.owner_user_id=${user.vistaUserId}::uuid`;
    const program = programs[0];
    if (!program) throw new NotFoundException("Program was not found.");
    await this.assertProgramHasOwnScopedAttempt(user, programId, requireActiveEnrollment);
    return program;
  }

  private async assertProgramHasOwnScopedAttempt(user: AuthenticatedUser, programId: string, requireActiveEnrollment = false): Promise<void> {
    const attempts = await this.prisma.$queryRaw<AttemptProgramRow[]>`
      SELECT a.id AS attempt_id,ca.classroom_id,ca.assignment_id,a.program_id
      FROM public.learning_assignment_attempts a
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
      WHERE a.program_id=${programId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid LIMIT 1`;
    if (!attempts[0]) throw new NotFoundException("Program was not found.");
    await this.scope.assertStudentClassroomAccess(user, attempts[0].classroom_id, { requireActiveEnrollment });
  }

  /** A program may be edited or versioned only while its attempt is open (in progress, published, not closed). */
  private async assertProgramAttemptOpen(user: AuthenticatedUser, programId: string, db: { $queryRaw: PrismaService["$queryRaw"] } = this.prisma): Promise<void> {
    const attempt = await loadOwnAttemptByProgram(db as never, user.vistaUserId, programId, db !== this.prisma);
    await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id, { requireActiveEnrollment: true });
    assertAttemptOpen(attempt);
  }

  private async assignmentAllowsLearningPreview(assignmentId: string | null): Promise<boolean> {
    if (!assignmentId) return false;
    const rows = await this.prisma.$queryRaw<{ allowed: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM public.learning_assignments a
        WHERE a.id=${assignmentId}::uuid AND (
          a.allowed_blocks ? 'preview.move_xyz'
          OR EXISTS(SELECT 1 FROM public.learning_challenge_conditions c WHERE c.challenge_id=a.challenge_id AND c.rule_key='preview_target_match')
        )
      ) AS allowed`;
    return rows[0]?.allowed === true;
  }

  private hasLearningPreview(value: Record<string, unknown>): boolean { return Array.isArray(value?.steps) && value.steps.some((step) => (step as Record<string, unknown>)?.type === "preview.move_xyz"); }

  private async validateCurriculumProgram(assignmentId: string | null, value: Record<string, unknown>): Promise<void> {
    if (!assignmentId) return;
    const rows = await this.prisma.$queryRaw<Array<{ constraints: unknown; allowed_blocks: string[] }>>`
      SELECT constraints,allowed_blocks FROM public.learning_assignments WHERE id=${assignmentId}::uuid`;
    const assignment = rows?.[0];
    const constraints = assignment?.constraints && typeof assignment.constraints === "object" && !Array.isArray(assignment.constraints) ? assignment.constraints as Record<string, unknown> : {};
    if (constraints.kind !== "symbolic_program") return;
    const allowed = new Set(Array.isArray(assignment.allowed_blocks) ? assignment.allowed_blocks : []);
    const supported = new Set(["arm.select", "home", "preview.move_xyz", "wait", "gripper.open", "gripper.close"]);
    if ([...allowed].some((id) => !supported.has(id))) throw new BadRequestException("This lesson contains an unsupported allowed-block capability.");
    for (const step of value.steps as Array<Record<string, unknown>>) {
      if (!allowed.has(step.type as string)) throw new BadRequestException("This program uses an action that is not available for this lesson.");
    }
  }

  private async validateCurriculumWorkspace(assignmentId: string | null, workspace: unknown): Promise<void> {
    const disallowed = await this.curriculumWorkspaceIssues(assignmentId, workspace);
    if (disallowed.length) throw new BadRequestException("The saved Blockly workspace contains blocks that are not available for this lesson.");
  }

  private async curriculumWorkspaceIssues(assignmentId: string | null, workspace: unknown): Promise<string[]> {
    if (!assignmentId) return [];
    const rows = await this.prisma.$queryRaw<Array<{ constraints: unknown; allowed_blocks: string[] }>>`
      SELECT constraints,allowed_blocks FROM public.learning_assignments WHERE id=${assignmentId}::uuid`;
    const assignment = rows?.[0];
    const constraints = assignment?.constraints && typeof assignment.constraints === "object" && !Array.isArray(assignment.constraints) ? assignment.constraints as Record<string, unknown> : {};
    if (constraints.kind !== "symbolic_program") return [];
    const mapping: Record<string, string> = { "arm.select": "robot_select_arm", home: "robot_move_home", "preview.move_xyz": "robot_move_to", wait: "robot_wait", "gripper.open": "robot_gripper_open", "gripper.close": "robot_gripper_close" };
    const allowed = new Set(["robot_start", ...(assignment.allowed_blocks ?? []).map((id) => mapping[id]).filter(Boolean)]);
    const disallowed = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (typeof record.type === "string" && !allowed.has(record.type)) disallowed.add(record.type);
      Object.values(record).forEach(visit);
    };
    visit(workspace);
    return [...disallowed].sort();
  }

  private validateRobotProgram(value: Record<string, unknown>, allowLearningPreview?: boolean): void {
    assertRobotProgramBounds(value);
    if (!value || typeof value !== "object" || value.schemaVersion !== 1 || value.kind !== "robot_program" || !Array.isArray(value.steps)) {
      throw new BadRequestException("RobotProgram must be a version 1 robot_program with steps.");
    }
    const allowed = new Set(["wait", "arm.select", "gripper.open", "gripper.close", "home", "preview.move_xyz"]);
    for (const step of value.steps) {
      if (!step || typeof step !== "object" || !allowed.has((step as Record<string, unknown>).type as string)) {
        throw new BadRequestException("RobotProgram contains an unsupported action.");
      }
      const typed = step as Record<string, unknown>;
      if (typed.type === "wait" && (!Number.isInteger(typed.durationMs) || (typed.durationMs as number) < 0 || (typed.durationMs as number) > 60000)) {
        throw new BadRequestException("wait requires durationMs between 0 and 60000.");
      }
      if (typed.type === "arm.select" && typed.arm !== "left" && typed.arm !== "right") {
        throw new BadRequestException("arm.select requires left or right arm.");
      }
      if (typed.type === "preview.move_xyz") {
        if (allowLearningPreview === false) throw new BadRequestException("preview.move_xyz is only allowed for a learning-preview coordinate assignment.");
        const position = typed.position as Record<string, unknown> | null;
        if (typed.mode !== "learning_preview" || typed.frame !== "learning_preview_v1" || (typed.arm !== "left" && typed.arm !== "right") || !position || typeof position !== "object" || ![position.x, position.y, position.z].every(Number.isInteger)) {
          throw new BadRequestException("preview.move_xyz requires learning_preview_v1, an arm, and integer x/y/z coordinates.");
        }
        if ((position.x as number) < 0 || (position.x as number) > 600 || (position.y as number) < 0 || (position.y as number) > 400 || (position.z as number) < 10 || (position.z as number) > 300) {
          throw new BadRequestException("preview.move_xyz coordinates must stay inside the Learning Preview Coordinate Frame bounds.");
        }
      }
    }
  }

  private validationResult(robotProgram: Record<string, unknown>, workspaceIssues: string[] = []) {
    return { valid: workspaceIssues.length === 0, schemaVersion: 1, actionCount: (robotProgram.steps as unknown[]).length, workspaceIssues, validatedAt: new Date().toISOString() };
  }
}
