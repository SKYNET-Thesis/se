import { ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { ProgressionService } from "./progression.service";
import { RobotRuntimeClient, RuntimeSnapshot } from "./robot-runtime.client";
import { IotCommandService, IotPublishDefiniteFailureError } from "./iot-command.service";

export const TERMINAL_CONTROL_SESSION_STATES = [
  "released",
  "completed",
  "succeeded",
  "failed",
  "cancelled",
  "stopped",
  "timed_out",
  "preflight_failed",
] as const;

type EligibilityCode =
  | "PHYSICAL_EXECUTION_NOT_ELIGIBLE"
  | "SYMBOLIC_PASS_REQUIRED"
  | "ROBOT_NOT_ALLOCATED"
  | "ROBOT_ENTITLEMENT_INVALID"
  | "CONTROL_SESSION_POLICY_INVALID";

interface PhysicalScope {
  attempt_id: string;
  classroom_assignment_id: string;
  assignment_id: string;
  challenge_id: string | null;
  classroom_id: string;
  organization_id: string;
  membership_id: string;
  program_id: string;
  submission_id: string | null;
  program_version_id: string | null;
  robot_program: unknown;
  symbolic_evaluation_id: string | null;
  symbolic_verdict: string | null;
  robot_id: string | null;
  robot_name: string | null;
  robot_model: string | null;
  robot_serial: string | null;
  entitlement_id: string | null;
  safety_profile_id: string | null;
  safety_profile_snapshot: unknown;
  mode_id: string | null;
}

interface ActiveSession {
  control_session_id: string;
  state: string;
  experiment_id: string | null;
  experiment_status: string | null;
  learner_user_id: string | null;
  attempt_id: string | null;
  submission_id: string | null;
  program_version_id: string | null;
}

interface ExecutionRecord {
  experiment_id: string;
  control_session_id: string;
  robot_id: string;
  robot_name: string;
  robot_model: string;
  robot_serial: string;
  program_version_id: string;
  status: string;
  run_id: string | null;
  runtime_started?: boolean;
}

@Injectable()
export class PhysicalExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: RobotRuntimeClient,
    @Optional() private readonly progression?: ProgressionService,
    @Optional() private readonly iot?: IotCommandService,
  ) {}

  async eligibility(user: AuthenticatedUser, attemptId: string) {
    this.requireStudentCapability(user);
    const scope = await this.resolveScope(this.prisma, user, attemptId);
    const reason = this.ineligibility(scope);
    const readiness = await this.probeReadiness(scope);
    if (reason) return { eligible: false as const, ...reason, readiness };
    return { ...this.eligibleDto(scope), readiness };
  }

  private async probeReadiness(scope: PhysicalScope) {
    let runtimeOnline = false;
    let robotReady = false;
    let estopActive = false;
    let motionEnabled = false;
    let runtimeStopped = false;
    let checkikReachable = false;
    let activeSession = false;

    if (scope.robot_id) {
      const active = await this.activeSession(this.prisma, scope.robot_id);
      activeSession = Boolean(active);
      try {
        const snap = await this.runtime.status(scope.robot_id);
        if (snap) {
          runtimeOnline = true;
          runtimeStopped = snap.stopped === true;
          const checkik = snap.checkik as Record<string, unknown> | undefined;
          if (checkik && checkik.reachable) {
            checkikReachable = true;
            const checkikSnap = (checkik.snapshot as Record<string, unknown> | undefined) ?? {};
            const backend = (checkikSnap.backend as Record<string, unknown> | undefined) ?? {};
            const readiness = (checkikSnap.readiness as Record<string, unknown> | undefined) ?? {};
            motionEnabled = backend.motionEnabled === true;
            estopActive = backend.latchedMotionLock === true;
            robotReady = readiness.ready === true && !estopActive && motionEnabled;
          }
        }
      } catch {
        // runtime offline
      }
    }

    return {
      allocated: Boolean(scope.robot_id),
      entitled: Boolean(scope.entitlement_id),
      symbolicPassed: Boolean(scope.symbolic_evaluation_id && scope.symbolic_verdict === "passed"),
      runtimeOnline,
      runtimeStopped,
      checkikReachable,
      robotReady,
      estopActive,
      motionEnabled,
      activeSession,
    };
  }

  async prepare(user: AuthenticatedUser, attemptId: string) {
    this.requireStudentCapability(user);
    return this.prisma.$transaction(async (tx) => {
      let scope = await this.resolveScope(tx, user, attemptId);
      this.assertEligible(scope);
      if (!scope.safety_profile_id || !scope.mode_id) {
        throw this.businessConflict("CONTROL_SESSION_POLICY_INVALID", "Physical execution session policy is not configured.");
      }

      // PostgreSQL hashes the complete UUID text into a stable signed 64-bit key.
      // A hash collision can only serialize unrelated Robots; it cannot permit two
      // owners for the same Robot. Transaction scope releases the lock automatically.
      const lockedRobotId = scope.robot_id as string;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockedRobotId}::text, 0))`;

      // Allocation, entitlement and evidence may have changed while this request
      // waited for the Robot lock, so the authoritative chain is loaded again.
      scope = await this.resolveScope(tx, user, attemptId);
      this.assertEligible(scope);
      if (scope.robot_id !== lockedRobotId) {
        throw this.businessConflict("PHYSICAL_EXECUTION_NOT_ELIGIBLE", "Physical execution eligibility changed. Try again.");
      }
      if (!scope.safety_profile_id || !scope.mode_id) {
        throw this.businessConflict("CONTROL_SESSION_POLICY_INVALID", "Physical execution session policy is not configured.");
      }

      const active = await this.activeSession(tx, scope.robot_id as string);
      if (active) {
        if (this.isEquivalent(active, scope, user)) return this.existingDto(active, scope);
        throw this.businessConflict("ROBOT_BUSY", "The allocated Robot is currently in use.");
      }

      const provenance = this.provenance(scope, user);
      const sessions = await tx.$queryRaw<Array<{ id: string; state: string; created_at: Date }>>`
        INSERT INTO public.control_sessions(
          organization_id,membership_id,robot_id,mode_id,safety_profile_id,
          safety_profile_snapshot,state,summary,metadata
        ) VALUES(
          ${scope.organization_id}::uuid,${scope.membership_id}::uuid,${scope.robot_id}::uuid,
          ${scope.mode_id}::uuid,${scope.safety_profile_id}::uuid,
          ${JSON.stringify(scope.safety_profile_snapshot ?? {})}::jsonb,'created',
          ${JSON.stringify({ gate: "wf03_gate1", runtimeStarted: false })}::jsonb,
          ${JSON.stringify(provenance)}::jsonb
        )
        RETURNING id,state,created_at`;
      const session = sessions[0];
      if (!session) throw new Error("Control Session persistence returned no row.");

      const experiments = await tx.$queryRaw<Array<{ id: string; status: string; execution_mode: string; created_at: Date }>>`
        INSERT INTO public.learning_experiments(
          challenge_id,submission_id,learner_user_id,method,execution_mode,status,
          control_session_id,input_snapshot
        ) VALUES(
          ${scope.challenge_id}::uuid,${scope.submission_id}::uuid,${user.vistaUserId}::uuid,
          'blockly','real_robot','pending',${session.id}::uuid,${JSON.stringify(provenance)}::jsonb
        )
        RETURNING id,status,execution_mode,created_at`;
      const experiment = experiments[0];
      if (!experiment) throw new Error("Physical Experiment persistence returned no row.");

      await tx.$executeRaw`
        UPDATE public.control_sessions
        SET metadata=metadata || ${JSON.stringify({ experimentId: experiment.id })}::jsonb
        WHERE id=${session.id}::uuid`;
      await tx.$executeRaw`
        INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data)
        VALUES(${experiment.id}::uuid,0,'physical_execution_prepared',
          ${JSON.stringify({ controlSessionId: session.id, runtimeStarted: false, gate: "wf03_gate1" })}::jsonb)`;

      return {
        id: experiment.id,
        status: experiment.status,
        executionMode: experiment.execution_mode,
        idempotent: false,
        controlSession: { id: session.id, state: session.state },
        ...this.eligibleDto(scope),
      };
    });
  }

  async start(user: AuthenticatedUser, attemptId: string, dto?: { safetyConfirmed?: boolean }) {
    this.requireStudentCapability(user);
    if (!dto?.safetyConfirmed) {
      throw this.businessConflict("SAFETY_CONFIRMATION_REQUIRED", "Explicit safety confirmation is required before physical execution.");
    }

    const prepared = await this.prepare(user, attemptId);
    const scope = await this.resolveScope(this.prisma, user, attemptId);
    this.assertEligible(scope);
    if (!prepared.id || !scope.robot_id || !scope.program_version_id) {
      throw this.businessConflict("PHYSICAL_EXECUTION_NOT_ELIGIBLE", "Physical execution is not available.");
    }

    if (this.progression) {
      const qualified = await this.progression.resolveQualifiedL4ProgramVersion(user);
      if (!qualified || qualified.verdict !== "passed" || qualified.qualifiedProgramVersionId !== scope.program_version_id) {
        throw this.businessConflict("PROGRAM_VERSION_NOT_QUALIFIED", "The program version is not qualified by an authoritative simulation PASS.");
      }
    }

    let runtimeSnap: RuntimeSnapshot | null = null;
    if (!this.iot?.enabled()) try {
      runtimeSnap = await this.runtime.status(scope.robot_id);
    } catch {
      throw this.businessConflict("ROBOT_RUNTIME_UNAVAILABLE", "Robot execution service is unavailable.");
    }
    if (!runtimeSnap && !this.iot?.enabled()) {
      throw this.businessConflict("ROBOT_RUNTIME_UNAVAILABLE", "Robot execution service is unavailable.");
    }
    if (runtimeSnap?.stopped === true) {
      throw this.businessConflict("ROBOT_RUNTIME_STOPPED", "Robot runtime is stopped.");
    }
    const checkik = runtimeSnap?.checkik as Record<string, unknown> | undefined;
    if (checkik && checkik.reachable === false) {
      throw this.businessConflict("CHECKIK_UNAVAILABLE", "Robot hardware safety controller is unavailable.");
    }
    const checkikSnap = (checkik?.snapshot ?? {}) as Record<string, unknown>;
    const backend = (checkikSnap.backend ?? {}) as Record<string, unknown>;
    const readiness = (checkikSnap.readiness ?? {}) as Record<string, unknown>;
    if (backend.latchedMotionLock === true) {
      throw this.businessConflict("ESTOP_ACTIVE", "Emergency stop is active on the robot.");
    }
    if (backend.motionEnabled === false) {
      throw this.businessConflict("MOTION_NOT_AUTHORIZED", "Physical motion is not authorized by the safety controller.");
    }
    if (readiness.ready === false) {
      throw this.businessConflict("ROBOT_NOT_READY", "Robot is not in a ready state for motion.");
    }

    const runId = `wf03-${prepared.id}`;
    const runRequest = {
      runId,
      programVersionId: scope.program_version_id,
      profile: "lesson",
      program: scope.robot_program,
    };
    const snapshot = this.iot?.enabled()
      ? await this.publishIotLifecycle(prepared.id, prepared.controlSession.id, scope.robot_id, runRequest)
      : await this.runtime.createRun(scope.robot_id, runRequest);
    try {
      await this.persistRuntimeSnapshot(prepared.id, prepared.controlSession.id, runId, snapshot);
    } catch {
      try { await this.runtime.cancelRun(scope.robot_id, runId); } catch { /* reconciliation remains required */ }
      throw this.businessConflict("EXECUTION_PERSISTENCE_FAILED", "Robot execution state could not be persisted safely.");
    }
    return this.executionDto({
      experiment_id: prepared.id, control_session_id: prepared.controlSession.id,
      robot_id: scope.robot_id, robot_name: scope.robot_name ?? "Robot", robot_model: scope.robot_model ?? "",
      robot_serial: scope.robot_serial ?? "", program_version_id: scope.program_version_id,
      status: prepared.status ?? "pending", run_id: runId,
    }, snapshot);
  }

  async status(user: AuthenticatedUser, experimentId: string) {
    this.requireStudentCapability(user);
    const execution = await this.execution(user, experimentId);
    // IoT acknowledgements arrive asynchronously at the edge.  Until the
    // deployment's acknowledgement sink is configured, never fall back to a
    // private runtime HTTP request from an IAM/cloud API process.
    if (this.iot?.enabled()) {
      const lifecycle = await this.prisma.$queryRaw<Array<{state:string;acknowledged_at:Date|null;completed_at:Date|null;error_code:string|null}>>`
        SELECT state,acknowledged_at,completed_at,error_code FROM public.iot_command_lifecycles
        WHERE experiment_id=${experimentId}::uuid ORDER BY created_at DESC LIMIT 1`;
      const row = lifecycle[0];
      const state = row?.state === "acknowledged" ? "queued" : row?.state === "executing" ? "running" : row?.state === "completed" ? "succeeded" : row?.state === "failed" || row?.state === "timed_out" ? "failed" : "queued";
      return this.executionDto(execution, { state, startedAtMs: row?.acknowledged_at?.getTime(), endedAtMs: row?.completed_at?.getTime(), errorCode: row?.error_code ?? undefined });
    }
    const runId = execution.run_id ?? `wf03-${execution.experiment_id}`;
    let snapshot: RuntimeSnapshot;
    try {
      snapshot = await this.runtime.getRun(execution.robot_id, runId);
    } catch (error) {
      const code = error instanceof ConflictException ? (error.getResponse() as { code?: string }).code : null;
      if (code === "ROBOT_RUNTIME_UNAVAILABLE") throw error;
      if (code === "ROBOT_RUNTIME_RUN_NOT_FOUND" && !execution.runtime_started) return this.executionDto(execution, { state: execution.status });
      snapshot = { state: "failed", errorCode: "runtime_run_lost" };
    }
    await this.persistRuntimeSnapshot(execution.experiment_id, execution.control_session_id, runId, snapshot);
    return this.executionDto(execution, snapshot);
  }

  async stop(user: AuthenticatedUser, experimentId: string) {
    this.requireStudentCapability(user);
    const execution = await this.execution(user, experimentId);
    if (this.isTerminalRuntimeState(execution.status)) {
      return this.executionDto(execution, { state: execution.status });
    }
    const runId = execution.run_id ?? `wf03-${execution.experiment_id}`;
    const snapshot = await this.runtime.cancelRun(execution.robot_id, runId);
    await this.persistRuntimeSnapshot(execution.experiment_id, execution.control_session_id, runId, snapshot, "stop_requested");
    return this.executionDto(execution, snapshot);
  }

  async active(user: AuthenticatedUser, attemptId: string) {
    this.requireStudentCapability(user);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT e.id FROM public.learning_experiments e
      JOIN public.control_sessions cs ON cs.id=e.control_session_id
      JOIN public.memberships m ON m.id=cs.membership_id AND m.organization_id=cs.organization_id
        AND m.user_id=${user.vistaUserId}::uuid AND m.status='active'
      JOIN public.learning_classroom_members cm ON cm.membership_id=m.id
        AND cm.classroom_id=(e.input_snapshot->>'classroomId')::uuid
        AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active' AND cm.classroom_role='student'
      WHERE e.learner_user_id=${user.vistaUserId}::uuid AND e.execution_mode='real_robot'
        AND e.input_snapshot->>'attemptId'=${attemptId}
        AND COALESCE((e.input_snapshot->>'runtimeStarted')::boolean,false)=true
      ORDER BY e.created_at DESC LIMIT 1`;
    return rows[0] ? this.status(user, rows[0].id) : null;
  }

  private requireStudentCapability(user: AuthenticatedUser) {
    const permitted = user.status === "active" && user.memberships.some((membership) =>
      membership.status === "active" && membership.roleCode === "student" &&
      membership.permissions.includes("learning.experiment.execute"),
    );
    if (!permitted) throw new NotFoundException({ code: "PHYSICAL_EXECUTION_NOT_ELIGIBLE", message: "Physical execution is not available." });
  }

  private async resolveScope(db: Pick<PrismaService, "$queryRaw">, user: AuthenticatedUser, attemptId: string): Promise<PhysicalScope> {
    const rows = await db.$queryRaw<PhysicalScope[]>`
      SELECT
        a.id AS attempt_id,ca.id AS classroom_assignment_id,ca.assignment_id,la.challenge_id,
        ca.classroom_id,c.organization_id,m.id AS membership_id,a.program_id,
        s.id AS submission_id,s.program_version_id,pv.robot_program,
        se.id AS symbolic_evaluation_id,se.verdict AS symbolic_verdict,
        allocation.robot_id,r.name AS robot_name,r.model_name AS robot_model,r.serial_no AS robot_serial,
        entitlement.id AS entitlement_id,
        COALESCE(m.safety_profile_id,role.default_safety_profile_id) AS safety_profile_id,
        CASE WHEN sp.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id',sp.id,'name',sp.name,'maxSpeedPct',sp.max_speed_pct,
          'workspaceLimit',sp.workspace_limit,'maxSessionMinutes',sp.max_session_minutes,
          'requireEstopAck',sp.require_estop_ack,'allowedModes',sp.allowed_modes
        ) END AS safety_profile_snapshot,
        mode.id AS mode_id
      FROM public.learning_assignment_attempts a
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id AND ca.status='published'
      JOIN public.learning_assignments la ON la.id=ca.assignment_id
      JOIN public.learning_classrooms c ON c.id=ca.classroom_id AND c.status='active'
      JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id
        AND cm.user_id=a.learner_user_id AND cm.classroom_role='student' AND cm.status='active'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=a.learner_user_id
        AND m.organization_id=c.organization_id AND m.status='active'
      JOIN public.roles role ON role.id=m.role_id AND role.code='student'
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          JOIN public.permissions permission ON permission.id=rp.permission_id
          WHERE rp.role_id=role.id AND permission.code='learning.experiment.execute'
        )
      LEFT JOIN public.learning_submissions s ON s.assignment_id=ca.assignment_id
        AND s.learner_user_id=a.learner_user_id AND (s.attempt_id=a.id OR (s.attempt_id IS NULL AND s.program_id=a.program_id)) AND s.status='submitted'
      LEFT JOIN public.learning_program_versions pv ON pv.id=s.program_version_id AND pv.program_id=a.program_id
      LEFT JOIN LATERAL (
        SELECT evidence.id,evidence.verdict
        FROM public.learning_symbolic_evaluations evidence
        JOIN public.learning_experiments schematic ON schematic.id=evidence.experiment_id
          AND schematic.submission_id=s.id AND schematic.learner_user_id=a.learner_user_id
          AND schematic.execution_mode='schematic' AND schematic.status='succeeded'
        WHERE evidence.submission_id=s.id AND evidence.program_version_id=s.program_version_id
          AND evidence.requested_by_user_id=a.learner_user_id
          AND evidence.verdict='passed'
          AND schematic.input_snapshot->>'attemptId'=a.id::text
        ORDER BY evidence.created_at DESC LIMIT 1
      ) se ON true
      LEFT JOIN public.learning_classroom_robot_allocations allocation ON allocation.classroom_id=c.id
      LEFT JOIN public.robots r ON r.id=allocation.robot_id
      LEFT JOIN LATERAL (
        SELECT entitlement_row.id
        FROM public.org_entitlements entitlement_row
        WHERE entitlement_row.organization_id=c.organization_id
          AND entitlement_row.robot_id=allocation.robot_id
          AND entitlement_row.resource_type='robot'
          AND entitlement_row.valid_from<=now()
          AND (entitlement_row.valid_to IS NULL OR entitlement_row.valid_to>now())
        ORDER BY entitlement_row.valid_from DESC LIMIT 1
      ) entitlement ON true
      LEFT JOIN public.safety_profiles sp ON sp.id=COALESCE(m.safety_profile_id,role.default_safety_profile_id)
      LEFT JOIN public.control_modes mode ON mode.code='blockly' AND mode.code=ANY(sp.allowed_modes)
      WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid
      LIMIT 1`;
    if (!rows[0]) throw new NotFoundException({ code: "PHYSICAL_EXECUTION_NOT_ELIGIBLE", message: "Physical execution is not available." });
    return rows[0];
  }

  private ineligibility(scope: PhysicalScope): { code: EligibilityCode; message: string } | null {
    if (!scope.submission_id || !scope.program_version_id || !scope.robot_program) return { code: "PHYSICAL_EXECUTION_NOT_ELIGIBLE", message: "Submit an evaluated ProgramVersion before requesting physical execution." };
    if (!scope.symbolic_evaluation_id || scope.symbolic_verdict !== "passed") return { code: "SYMBOLIC_PASS_REQUIRED", message: "A matching persisted symbolic PASS is required." };
    if (!scope.robot_id) return { code: "ROBOT_NOT_ALLOCATED", message: "No Robot is allocated to this Classroom." };
    if (!scope.entitlement_id) return { code: "ROBOT_ENTITLEMENT_INVALID", message: "The allocated Robot is not currently entitled to this Organization." };
    return null;
  }

  private assertEligible(scope: PhysicalScope) {
    const reason = this.ineligibility(scope);
    if (reason) throw this.businessConflict(reason.code, reason.message);
  }

  private activeSession(db: Pick<PrismaService, "$queryRaw">, robotId: string) {
    const terminal = Prisma.join(TERMINAL_CONTROL_SESSION_STATES);
    return Promise.resolve(db.$queryRaw<ActiveSession[]>(Prisma.sql`
      SELECT cs.id AS control_session_id,cs.state,e.id AS experiment_id,e.status AS experiment_status,
        e.learner_user_id,e.input_snapshot->>'attemptId' AS attempt_id,
        e.submission_id,e.input_snapshot->>'programVersionId' AS program_version_id
      FROM public.control_sessions cs
      LEFT JOIN LATERAL (
        SELECT physical.* FROM public.learning_experiments physical
        WHERE physical.control_session_id=cs.id AND physical.execution_mode='real_robot'
        ORDER BY physical.created_at DESC LIMIT 1
      ) e ON true
      WHERE cs.robot_id=${robotId}::uuid AND cs.ended_at IS NULL
        AND cs.state NOT IN (${terminal})
      ORDER BY cs.created_at DESC LIMIT 1`)).then((rows) => (Array.isArray(rows) ? rows[0] : null) ?? null).catch(() => null);
  }

  private isEquivalent(active: ActiveSession, scope: PhysicalScope, user: AuthenticatedUser) {
    return active.experiment_id && active.learner_user_id === user.vistaUserId &&
      active.attempt_id === scope.attempt_id && active.submission_id === scope.submission_id &&
      active.program_version_id === scope.program_version_id;
  }

  private provenance(scope: PhysicalScope, user: AuthenticatedUser) {
    return {
      kind: "physical_execution_preparation",
      attemptId: scope.attempt_id,
      classroomAssignmentId: scope.classroom_assignment_id,
      assignmentId: scope.assignment_id,
      submissionId: scope.submission_id,
      programId: scope.program_id,
      programVersionId: scope.program_version_id,
      symbolicEvaluationId: scope.symbolic_evaluation_id,
      studentId: user.vistaUserId,
      classroomId: scope.classroom_id,
      robotId: scope.robot_id,
      organizationId: scope.organization_id,
      runtimeStarted: false,
    };
  }

  private eligibleDto(scope: PhysicalScope) {
    return {
      eligible: true as const,
      classroom: { id: scope.classroom_id, assignmentId: scope.assignment_id },
      robot: { id: scope.robot_id as string, name: scope.robot_name as string, model: scope.robot_model as string, serial: scope.robot_serial as string },
      programVersion: { id: scope.program_version_id as string },
      symbolicEvaluation: { id: scope.symbolic_evaluation_id as string, verdict: "passed" as const },
    };
  }

  private existingDto(active: ActiveSession, scope: PhysicalScope) {
    return {
      id: active.experiment_id,
      status: active.experiment_status,
      executionMode: "real_robot" as const,
      idempotent: true,
      controlSession: { id: active.control_session_id, state: active.state },
      ...this.eligibleDto(scope),
    };
  }

  private async execution(user: AuthenticatedUser, experimentId: string) {
    const rows = await this.prisma.$queryRaw<ExecutionRecord[]>`
      SELECT e.id AS experiment_id,e.control_session_id,cs.robot_id,r.name AS robot_name,
        r.model_name AS robot_model,r.serial_no AS robot_serial,
        e.input_snapshot->>'programVersionId' AS program_version_id,e.status,
        COALESCE(e.input_snapshot->>'runtimeRunId',cs.metadata->>'runtimeRunId') AS run_id,
        COALESCE((e.input_snapshot->>'runtimeStarted')::boolean,(cs.metadata->>'runtimeStarted')::boolean,false) AS runtime_started
      FROM public.learning_experiments e
      JOIN public.control_sessions cs ON cs.id=e.control_session_id
      JOIN public.robots r ON r.id=cs.robot_id
      JOIN public.memberships m ON m.id=cs.membership_id AND m.organization_id=cs.organization_id
        AND m.user_id=${user.vistaUserId}::uuid AND m.status='active'
      JOIN public.roles role ON role.id=m.role_id AND role.code='student'
      JOIN public.learning_classroom_members cm ON cm.membership_id=m.id
        AND cm.classroom_id=(e.input_snapshot->>'classroomId')::uuid
        AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active' AND cm.classroom_role='student'
      WHERE e.id=${experimentId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid
        AND e.execution_mode='real_robot' LIMIT 1`;
    if (!rows[0]) throw new NotFoundException({ code: "PHYSICAL_EXECUTION_NOT_FOUND", message: "Physical execution was not found." });
    return rows[0];
  }

  private state(snapshot: RuntimeSnapshot) {
    const runtimeState = typeof snapshot.state === "string" ? snapshot.state : "failed";
    if (runtimeState === "queued") return { experiment: "pending", session: "created", terminal: false };
    if (runtimeState === "running") return { experiment: "running", session: "active", terminal: false };
    if (runtimeState === "succeeded") return { experiment: "succeeded", session: "completed", terminal: true };
    if (runtimeState === "cancelled") return { experiment: "cancelled", session: "stopped", terminal: true };
    if (runtimeState === "stopped") return { experiment: "stopped", session: "stopped", terminal: true };
    if (runtimeState === "preflight_failed") return { experiment: "failed", session: "fault", terminal: true };
    if (snapshot.errorCode === "runtime_execution_timeout") return { experiment: "failed", session: "fault", terminal: true };
    return { experiment: "failed", session: "fault", terminal: true };
  }

  private async publishIotLifecycle(experimentId: string, sessionId: string, robotId: string, request: Record<string, unknown>): Promise<RuntimeSnapshot> {
    if (!this.iot) throw new Error("IoT publisher missing");
    const command = this.iot.createRunCommand(robotId, Date.now(), request);
    const owner = `api-${command.commandId}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${robotId}::text, 1))`;
      await tx.$executeRaw`
        INSERT INTO public.iot_command_lifecycles(command_id,experiment_id,control_session_id,robot_id,state,issued_at,expires_at,last_sequence,command_payload)
        VALUES(${command.commandId},${experimentId}::uuid,${sessionId}::uuid,${robotId}::uuid,'pending_publish',
          to_timestamp(${command.issuedAtMs}::double precision/1000),to_timestamp(${command.expiresAtMs}::double precision/1000),-1,${JSON.stringify(command.payload)}::jsonb)`;
    });
    const claimed = await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`
      UPDATE public.iot_command_lifecycles SET state='publishing',publish_attempts=publish_attempts+1,publish_owner=${owner},publish_started_at=now(),publish_lease_until=now()+interval '30 seconds',updated_at=now()
      WHERE command_id=${command.commandId} AND state='pending_publish'`));
    if (claimed !== 1) throw new Error("iot publish intent claim lost");
    try { await this.iot.publishRunCommand(command); }
    catch (error) {
      const state = error instanceof IotPublishDefiniteFailureError ? "publish_failed" : "reconciliation_required";
      const publishError = state === "publish_failed" ? "publish_failed" : "publish_outcome_unknown";
      await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`
        UPDATE public.iot_command_lifecycles SET state=${state},publish_lease_until=NULL,publish_error=${publishError},updated_at=now()
        WHERE command_id=${command.commandId} AND state='publishing' AND publish_owner=${owner}`));
      throw error;
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE public.iot_command_lifecycles SET state='queued',publish_lease_until=NULL,updated_at=now()
        WHERE command_id=${command.commandId} AND state='publishing' AND publish_owner=${owner}`;
      return { state: "queued", events: [{ type: "iot_command_published", commandId: command.commandId }] };
    });
  }

  private async persistRuntimeSnapshot(experimentId: string, sessionId: string, runId: string, snapshot: RuntimeSnapshot, requestedEvent?: string) {
    const mapped = this.state(snapshot);
    const safe = {
      state: typeof snapshot.state === "string" ? snapshot.state : "failed",
      errorCode: typeof snapshot.errorCode === "string" ? snapshot.errorCode : null,
      startedAtMs: typeof snapshot.startedAtMs === "number" ? snapshot.startedAtMs : null,
      endedAtMs: typeof snapshot.endedAtMs === "number" ? snapshot.endedAtMs : null,
      events: Array.isArray(snapshot.events) ? snapshot.events : [],
    };
    await this.prisma.$transaction(async (tx) => {
      const experimentUpdated = await tx.$executeRaw`
        UPDATE public.learning_experiments SET status=${mapped.experiment},
          input_snapshot=input_snapshot || ${JSON.stringify({ runtimeRunId: runId, runtimeStarted: true })}::jsonb,
          output_snapshot=${JSON.stringify(safe)}::jsonb,
          started_at=CASE WHEN ${safe.startedAtMs}::bigint IS NULL THEN started_at ELSE to_timestamp(${safe.startedAtMs}::double precision/1000) END,
          ended_at=CASE WHEN ${safe.endedAtMs}::bigint IS NULL THEN ended_at ELSE to_timestamp(${safe.endedAtMs}::double precision/1000) END
        WHERE id=${experimentId}::uuid`;
      const sessionUpdated = await tx.$executeRaw`
        UPDATE public.control_sessions SET state=${mapped.session},
          metadata=metadata || ${JSON.stringify({ runtimeRunId: runId, runtimeStarted: true })}::jsonb,
          started_at=CASE WHEN ${safe.startedAtMs}::bigint IS NULL THEN started_at ELSE to_timestamp(${safe.startedAtMs}::double precision/1000) END,
          ended_at=CASE WHEN ${mapped.terminal} THEN COALESCE(ended_at,now()) ELSE ended_at END
        WHERE id=${sessionId}::uuid`;
      if (experimentUpdated === 0 || sessionUpdated === 0) throw new Error("physical_execution_transition_target_missing");
      const eventType = requestedEvent ?? (safe.state === "pending" ? "runtime_submitted" : safe.state);
      await tx.$executeRaw`
        INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data)
        SELECT ${experimentId}::uuid,COALESCE(MAX(event_index),-1)+1,${eventType},${JSON.stringify({ runtimeRunId: runId, ...safe })}::jsonb
        FROM public.learning_experiment_events
        WHERE experiment_id=${experimentId}::uuid
          AND NOT EXISTS (SELECT 1 FROM public.learning_experiment_events prior WHERE prior.experiment_id=${experimentId}::uuid AND prior.event_type=${eventType})
        ON CONFLICT (experiment_id,event_index) DO NOTHING`;

      if (mapped.experiment === "succeeded") {
        await this.handlePhysicalExperimentCompletion(tx, experimentId);
      }
    });
  }

  private async handlePhysicalExperimentCompletion(tx: Pick<PrismaService, "$queryRaw" | "$executeRaw">, experimentId: string) {
    const rows = await tx.$queryRaw<Array<{
      learner_user_id: string;
      execution_mode: string;
      program_version_id: string | null;
      course_id: string | null;
      l5_lesson_id: string | null;
    }>>`
      SELECT
        e.learner_user_id::text,
        e.execution_mode,
        e.input_snapshot->>'programVersionId' AS program_version_id,
        COALESCE(l.course_id::text, enrolled.course_id::text) AS course_id,
        COALESCE(l5.id::text, (SELECT l5_alt.id::text FROM public.learning_lessons l5_alt WHERE l5_alt.course_id = COALESCE(l.course_id, enrolled.course_id) AND l5_alt.ordinal = 5)) AS l5_lesson_id
      FROM public.learning_experiments e
      LEFT JOIN public.learning_submissions s ON s.id = e.submission_id
      LEFT JOIN public.learning_assignments a ON a.id = s.assignment_id
      LEFT JOIN public.learning_lessons l ON l.id = a.lesson_id
      LEFT JOIN public.learning_lessons l5 ON l5.course_id = l.course_id AND l5.ordinal = 5
      LEFT JOIN LATERAL (
        SELECT en.course_id FROM public.learning_enrollments en
        WHERE en.learner_user_id = e.learner_user_id AND en.status = 'active'
        ORDER BY en.enrolled_at DESC LIMIT 1
      ) enrolled ON true
      WHERE e.id = ${experimentId}::uuid
      LIMIT 1`;

    const row = rows?.[0];
    if (!row) return;

    if (row.execution_mode !== "real_robot") return;

    const versionId = row.program_version_id;
    if (!versionId) return;

    const qualification = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT se.id
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments schematic ON schematic.id = se.experiment_id
        AND schematic.status = 'succeeded' AND schematic.execution_mode = 'schematic'
      JOIN public.learning_lessons l ON l.ordinal = 4
      JOIN public.learning_assignments la ON la.lesson_id = l.id
      JOIN public.learning_submissions sub ON sub.id = se.submission_id AND sub.assignment_id = la.id AND sub.status = 'submitted'
      WHERE se.program_version_id = ${versionId}::uuid
        AND se.requested_by_user_id = ${row.learner_user_id}::uuid
        AND se.verdict = 'passed'
      LIMIT 1`;

    if (!qualification?.[0]) return;

    const l5Id = row.l5_lesson_id;
    if (l5Id) {
      if (this.progression) {
        await this.progression.completeLesson(tx as never, row.learner_user_id, l5Id);
      } else {
        await tx.$queryRaw`
          INSERT INTO public.learning_lesson_progress(learner_user_id, lesson_id, status, progress_percent, started_at, completed_at, updated_at)
          VALUES(${row.learner_user_id}::uuid, ${l5Id}::uuid, 'completed', 100, now(), now(), now())
          ON CONFLICT (learner_user_id, lesson_id) DO UPDATE SET
            status = 'completed', progress_percent = 100,
            started_at = COALESCE(learning_lesson_progress.started_at, now()),
            completed_at = COALESCE(learning_lesson_progress.completed_at, now()),
            updated_at = now()`;
      }
    }
  }

  private executionDto(execution: ExecutionRecord, snapshot: RuntimeSnapshot) {
    const state = typeof snapshot.state === "string" ? snapshot.state : execution.status;
    return {
      id: execution.experiment_id, status: state,
      robot: { id: execution.robot_id, name: execution.robot_name, model: execution.robot_model, serial: execution.robot_serial },
      programVersion: { id: execution.program_version_id },
      startedAt: typeof snapshot.startedAtMs === "number" ? new Date(snapshot.startedAtMs).toISOString() : null,
      endedAt: typeof snapshot.endedAtMs === "number" ? new Date(snapshot.endedAtMs).toISOString() : null,
      error: this.safeRuntimeError(snapshot.errorCode),
    };
  }

  private isTerminalRuntimeState(state: string) {
    return ["succeeded", "failed", "cancelled", "stopped", "preflight_failed", "timed_out", "completed"].includes(state);
  }

  private safeRuntimeError(code: unknown) {
    if (code === "checkik_motion_not_authorized" || code === "safety_stop_active") return "Robot safety stop is active. Operator intervention is required.";
    if (code === "runtime_run_lost") return "Robot execution state was lost after a runtime restart. The program was not replayed.";
    if (code === "runtime_execution_timeout") return "Robot execution exceeded its safe time limit and was stopped.";
    return typeof code === "string" && code ? "Robot execution failed safely." : null;
  }

  private businessConflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}
