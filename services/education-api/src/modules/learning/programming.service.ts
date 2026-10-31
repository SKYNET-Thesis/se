import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { CreateProgramDto } from "./dto/create-program.dto";
import { CreateProgramVersionDto } from "./dto/create-program-version.dto";
import { SubmitAttemptDto } from "./dto/submit-attempt.dto";
import { UpdateProgramDto } from "./dto/update-program.dto";
import { LearningScopeService } from "./learning-scope.service";

interface AttemptProgramRow { attempt_id: string; classroom_id: string; assignment_id: string; program_id: string | null; }
export interface ProgramRow { id: string; owner_user_id: string; assignment_id: string | null; title: string; schema_version: number; workspace_json: unknown; robot_program: unknown; validation_result: unknown; }

@Injectable()
export class ProgrammingService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  async programForAttempt(user: AuthenticatedUser, attemptId: string) {
    const attempt = await this.ownAttempt(user, attemptId);
    if (!attempt.program_id) throw new NotFoundException("Program was not found.");
    return this.ownProgram(user, attempt.program_id);
  }

  async createProgram(user: AuthenticatedUser, attemptId: string, dto: CreateProgramDto) {
    this.validateRobotProgram(dto.robotProgram);
    return this.prisma.$transaction(async (tx) => {
      const attempts = await tx.$queryRaw<AttemptProgramRow[]>`
        SELECT a.id AS attempt_id, ca.classroom_id, ca.assignment_id, a.program_id
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
        WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid FOR UPDATE`;
      const attempt = attempts[0];
      if (!attempt) throw new NotFoundException("Attempt was not found.");
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id);
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
    const current = await this.ownProgram(user, programId);
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
      await this.assertProgramHasOwnScopedAttempt(user, programId);
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

  async submit(user: AuthenticatedUser, attemptId: string, dto: SubmitAttemptDto) {
    return this.prisma.$transaction(async (tx) => {
      const attempts = await tx.$queryRaw<AttemptProgramRow[]>`
        SELECT a.id AS attempt_id,ca.classroom_id,ca.assignment_id,a.program_id
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
        WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid FOR UPDATE`;
      const attempt = attempts[0];
      if (!attempt?.program_id) throw new NotFoundException("Attempt program was not found.");
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id);
      const versions = await tx.$queryRaw<{ id: string; workspace_json: unknown; robot_program: unknown }[]>`
        SELECT id,workspace_json,robot_program FROM public.learning_program_versions
        WHERE id=${dto.programVersionId}::uuid AND program_id=${attempt.program_id}::uuid`;
      const version = versions[0];
      if (!version) throw new BadRequestException("Program version does not belong to this attempt program.");
      await this.validateCurriculumProgram(attempt.assignment_id, version.robot_program as Record<string, unknown>);
      await this.validateCurriculumWorkspace(attempt.assignment_id, version.workspace_json);
      const submissions = await tx.$queryRaw<{ id: string; assignment_id: string; learner_user_id: string; program_id: string; program_version_id: string; status: string; submitted_at: Date }[]>`
        INSERT INTO public.learning_submissions(assignment_id,learner_user_id,program_id,program_version_id,submitted_workspace,submitted_program,reflection,status,submitted_at)
        VALUES(${attempt.assignment_id}::uuid,${user.vistaUserId}::uuid,${attempt.program_id}::uuid,${dto.programVersionId}::uuid,
          ${JSON.stringify(version.workspace_json)}::jsonb,${JSON.stringify(version.robot_program)}::jsonb,${dto.reflection ?? null},'submitted',now())
        ON CONFLICT (assignment_id,learner_user_id) DO UPDATE SET
          program_id=EXCLUDED.program_id,program_version_id=EXCLUDED.program_version_id,
          submitted_workspace=EXCLUDED.submitted_workspace,submitted_program=EXCLUDED.submitted_program,
          reflection=EXCLUDED.reflection,status='submitted',submitted_at=now()
        RETURNING id,assignment_id,learner_user_id,program_id,program_version_id,status,submitted_at`;
      await tx.$executeRaw`
        UPDATE public.learning_assignment_attempts SET status='submitted',submitted_at=now(),
          workspace_snapshot=${JSON.stringify(version.workspace_json)}::jsonb,program_snapshot=${JSON.stringify(version.robot_program)}::jsonb
        WHERE id=${attemptId}::uuid`;
      return submissions[0];
    });
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

  private async ownProgram(user: AuthenticatedUser, programId: string): Promise<ProgramRow> {
    const programs = await this.prisma.$queryRaw<ProgramRow[]>`
      SELECT p.id,p.owner_user_id,p.assignment_id,p.title,p.schema_version,p.workspace_json,p.robot_program,p.validation_result
      FROM public.learning_programs p WHERE p.id=${programId}::uuid AND p.owner_user_id=${user.vistaUserId}::uuid`;
    const program = programs[0];
    if (!program) throw new NotFoundException("Program was not found.");
    await this.assertProgramHasOwnScopedAttempt(user, programId);
    return program;
  }

  private async assertProgramHasOwnScopedAttempt(user: AuthenticatedUser, programId: string): Promise<void> {
    const attempts = await this.prisma.$queryRaw<AttemptProgramRow[]>`
      SELECT a.id AS attempt_id,ca.classroom_id,ca.assignment_id,a.program_id
      FROM public.learning_assignment_attempts a
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
      WHERE a.program_id=${programId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid LIMIT 1`;
    if (!attempts[0]) throw new NotFoundException("Program was not found.");
    await this.scope.assertStudentClassroomAccess(user, attempts[0].classroom_id);
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
