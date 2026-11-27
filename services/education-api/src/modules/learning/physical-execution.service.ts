import { ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { ProgressionService } from "./progression.service";
import { RobotRuntimeClient, RuntimeSnapshot } from "./robot-runtime.client";
import { IotCommandService, IotPublishDefiniteFailureError } from "./iot-command.service";
import { classifyExecution, satisfiesPhysicalPractical } from "./execution-provenance";
import { DigitalTwinTelemetryClient } from "./digital-twin-telemetry.client";
import { ExperimentEvidenceService } from "./experiment-evidence.service";

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
  | "LAB_SESSION_NOT_ACTIVE"
  | "ROBOT_RESERVED_BY_ANOTHER_CLASSROOM"
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
  /** The open (active, unexpired) Classroom Lab Session of this classroom for `robot_id`; execution requires it. */
  lab_session_id?: string | null;
  /** True when ANOTHER classroom holds an open reservation of `robot_id`. Never says which classroom. */
  reserved_by_other?: boolean;
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
  /** The attempt this experiment belongs to (from the immutable input snapshot); Twin telemetry is published and viewed per attempt. */
  attempt_id?: string | null;
  runtime_started?: boolean;
  /** The runtime's own statement of what drives the robot (for example `fake_follower`); null when it did not say. Never inferred. */
  runtime_mode?: string | null;
  organization_id: string;
}

@Injectable()
export class PhysicalExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: RobotRuntimeClient,
    @Optional() private readonly progression?: ProgressionService,
    @Optional() private readonly iot?: IotCommandService,
    @Optional() private readonly digitalTwin?: DigitalTwinTelemetryClient,
    @Optional() private readonly evidence?: ExperimentEvidenceService,
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
    let runtimeMode: string | null = null;
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
            runtimeMode = typeof checkikSnap.mode === "string" ? checkikSnap.mode : null;
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
      runtimeMode,
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
    // Everything up to the runtime dispatch is a pre-flight. If it refuses (e-stop, controller down, not qualified, ...) the reservation that prepare() just
    // made is closed, so a rejected start never leaves an active session that blocks the robot for everyone else.
    let preflight: { scope: PhysicalScope & { robot_id: string; program_version_id: string }; runtimeMode: string | null; runId: string; runRequest: { runId: string; robotId: string; programVersionId: string; profile: string; program: unknown } };
    try {
      preflight = await (async () => {
      const scope = await this.resolveScope(this.prisma, user, attemptId);
      this.assertEligible(scope);
      if (this.iot?.enabled() && !this.iot.simulationStartEnabled() && !this.iot.physicalStartEnabled()) {
        throw this.businessConflict("LOCAL_FAKE_RUNTIME_REQUIRED", "WF-03 execution is available only through the configured local fake-follower runtime.");
      }
      if (!prepared.id || !scope.robot_id || !scope.program_version_id) {
        throw this.businessConflict("PHYSICAL_EXECUTION_NOT_ELIGIBLE", "Physical execution is not available.");
      }

      if (this.progression) {
        const qualified = await this.progression.resolveQualifiedL4ProgramVersion(user);
        if (!qualified || qualified.verdict !== "passed" || qualified.qualifiedProgramVersionId !== scope.program_version_id) {
          throw this.businessConflict("PROGRAM_VERSION_NOT_QUALIFIED", "The program version is not qualified by an authoritative simulation PASS.");
        }
      }

      // Simulation-only IoT mode: the preflight is the Edge's Device Shadow, never a loopback runtime. Anything that is not a fresh, connected,
      // non-stopped MOCK_RUNTIME with the hardware driver disabled is refused, so this path cannot start a physical robot.
      let shadowRuntimeMode: string | null = null;
      let physicalCommissioning = false;
      if (this.iot?.enabled()) {
        let shadow: Awaited<ReturnType<IotCommandService["readShadow"]>>;
        try { shadow = await this.iot.readShadow(scope.robot_id!); } catch { throw this.businessConflict("ROBOT_RUNTIME_UNAVAILABLE", "Robot execution service is unavailable."); }
        if (!shadow || shadow.connection !== "connected") throw this.businessConflict("ROBOT_RUNTIME_UNAVAILABLE", "Robot execution service is unavailable.");
        const age = Date.now() - Number(shadow.reportedAtMs ?? 0);
        if (!Number.isFinite(age) || age < -5000 || age > this.iot.shadowMaxAgeMs()) throw this.businessConflict("ROBOT_RUNTIME_UNAVAILABLE", "Robot runtime state is stale.");
        if (shadow.stopped === true) throw this.businessConflict("ROBOT_RUNTIME_STOPPED", "Robot runtime is stopped.");
        if (this.iot.physicalStartEnabled()) {
          // Supervised physical commissioning: every condition below is required; none of them is sufficient alone, and the Edge keeps its own authority.
          let policy: ReturnType<IotCommandService["physicalCommissioningPolicy"]>;
          try { policy = this.iot.physicalCommissioningPolicy(); } catch { throw this.businessConflict("PHYSICAL_COMMISSIONING_NOT_CONFIGURED", "Physical commissioning is not configured."); }
          if (Date.now() > policy.untilMs) throw this.businessConflict("PHYSICAL_COMMISSIONING_CLOSED", "The physical commissioning window is closed.");
          if (!scope.robot_id || scope.robot_id.toLowerCase() !== policy.robotId) throw this.businessConflict("PHYSICAL_COMMISSIONING_ROBOT_NOT_APPROVED", "This robot is not approved for physical commissioning.");
          if (!policy.userIds.has(String(user.vistaUserId).toLowerCase())) throw this.businessConflict("PHYSICAL_COMMISSIONING_USER_NOT_AUTHORIZED", "This user is not authorized for physical commissioning.");
          const mode = typeof shadow.adapterMode === "string" ? shadow.adapterMode.trim() : "";
          if (shadow.hardwareEnabled !== true || shadow.armed !== true || shadow.calibrationReady !== true || (shadow.fault ?? null) !== null) throw this.businessConflict("ROBOT_NOT_READY", "Robot is not in a ready state for motion.");
          if (!mode || /(fake|mock)/i.test(mode) || shadow.runtimeKind === "MOCK_RUNTIME" || !policy.runtimeModes.has(mode)) throw this.businessConflict("PHYSICAL_RUNTIME_NOT_DECLARED", "The robot runtime is not a declared physical runtime.");
          shadowRuntimeMode = mode;
          physicalCommissioning = true;
        } else {
          if (shadow.hardwareEnabled !== false || shadow.runtimeKind !== "MOCK_RUNTIME") throw this.businessConflict("LOCAL_FAKE_RUNTIME_REQUIRED", "WF-03 execution is available only through a simulation runtime with hardware disabled.");
          shadowRuntimeMode = "fake_follower";
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

      // Provenance: record what the runtime SAYS it is driving. A fake-follower deployment must never be mistaken for a physical robot in evidence.
      const runtimeMode = shadowRuntimeMode ?? (typeof checkikSnap.mode === "string" ? checkikSnap.mode : null);
      if (runtimeMode !== "fake_follower" && !physicalCommissioning) {
        throw this.businessConflict("LOCAL_FAKE_RUNTIME_REQUIRED", "WF-03 execution is available only through the configured local fake-follower runtime.");
      }
      const runId = `wf03-${prepared.id}`;
      const runRequest = {
        runId,
        robotId: scope.robot_id,
        programVersionId: scope.program_version_id,
        profile: "lesson",
        program: scope.robot_program,
      };
        return { scope: scope as PhysicalScope & { robot_id: string; program_version_id: string }, runtimeMode, runId, runRequest };
      })();
    } catch (error) {
      if (prepared.id) await this.abandonPrepared(prepared.id, prepared.controlSession.id, error).catch(() => undefined);
      throw error;
    }
    const { scope, runtimeMode, runId, runRequest } = preflight;
    if (!prepared.id) throw this.businessConflict("PHYSICAL_EXECUTION_NOT_ELIGIBLE", "Physical execution is not available.");   // narrowing only: the pre-flight already refused this
    const snapshot = this.iot?.enabled()
      ? await this.publishIotLifecycle(prepared.id, prepared.controlSession.id, scope.robot_id, runRequest)
      : await this.runtime.createRun(scope.robot_id, runRequest);
    try {
      await this.persistRuntimeSnapshot(prepared.id, prepared.controlSession.id, runId, snapshot, undefined, { runtimeAdapterMode: runtimeMode });
    } catch {
      try { await this.runtime.cancelRun(scope.robot_id, runId); } catch { /* reconciliation remains required */ }
      throw this.businessConflict("EXECUTION_PERSISTENCE_FAILED", "Robot execution state could not be persisted safely.");
    }
    return this.executionDto({
      experiment_id: prepared.id, control_session_id: prepared.controlSession.id,
      organization_id: scope.organization_id,
      robot_id: scope.robot_id, robot_name: scope.robot_name ?? "Robot", robot_model: scope.robot_model ?? "",
      robot_serial: scope.robot_serial ?? "", program_version_id: scope.program_version_id,
      status: prepared.status ?? "pending", run_id: runId, runtime_mode: runtimeMode, attempt_id: attemptId,
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
      const state = row?.state === "acknowledged" ? "queued" : row?.state === "executing" ? "running" : row?.state === "completed" ? "succeeded" : row?.state === "failed" || row?.state === "timed_out" || row?.state === "publish_failed" || row?.state === "reconciliation_required" ? "failed" : "queued";
      return this.executionDto(execution, { state, startedAtMs: row?.acknowledged_at?.getTime(), endedAtMs: row?.completed_at?.getTime(), errorCode: row?.error_code ?? undefined });
    }
    const runId = execution.run_id ?? `wf03-${execution.experiment_id}`;
    let snapshot: RuntimeSnapshot;
    try {
      snapshot = await this.runtime.getRun(execution.robot_id, runId);
    } catch (error) {
      const code = error instanceof ConflictException ? (error.getResponse() as { code?: string }).code : null;
      if (code === "ROBOT_RUNTIME_UNAVAILABLE") {
        await this.recordRuntimeUnavailable(execution.experiment_id, execution.control_session_id, runId, "status");
        throw error;
      }
      if (code === "ROBOT_RUNTIME_RUN_NOT_FOUND" && !execution.runtime_started) return this.executionDto(execution, { state: execution.status });
      snapshot = { state: "failed", errorCode: "runtime_run_lost" };
    }
    await this.persistRuntimeSnapshot(execution.experiment_id, execution.control_session_id, runId, snapshot);
    const twinTelemetry = snapshot.telemetry && this.digitalTwin
      ? await this.digitalTwin.publish({ organizationId: execution.organization_id, robotId: execution.robot_id, experimentId, attemptId: execution.attempt_id, telemetry: snapshot.telemetry })
      : { status: "unavailable" as const };
    const evidence = snapshot.state === "succeeded" && snapshot.telemetry && this.evidence
      ? await this.evidence.persistTelemetry(experimentId, snapshot.telemetry)
      : { availability: "unavailable" as const };
    return { ...this.executionDto(execution, snapshot), digitalTwinTelemetry: twinTelemetry.status, evidence: evidence.availability };
  }

  async stop(user: AuthenticatedUser, experimentId: string) {
    this.requireStudentCapability(user);
    const execution = await this.execution(user, experimentId);
    if (this.isTerminalRuntimeState(execution.status)) {
      return this.executionDto(execution, { state: execution.status });
    }
    const runId = execution.run_id ?? `wf03-${execution.experiment_id}`;
    let snapshot: RuntimeSnapshot;
    try {
      snapshot = await this.runtime.cancelRun(execution.robot_id, runId);
    } catch (error) {
      const code = error instanceof ConflictException ? (error.getResponse() as { code?: string }).code : null;
      if (code === "ROBOT_RUNTIME_UNAVAILABLE") {
        await this.recordRuntimeUnavailable(execution.experiment_id, execution.control_session_id, runId, "stop");
      }
      throw error;
    }
    await this.persistRuntimeSnapshot(execution.experiment_id, execution.control_session_id, runId, snapshot, "stop_requested");
    return this.executionDto(execution, snapshot);
  }

  /**
   * Controlled termination support for the Classroom Lab Session. Asks the runtime to cancel the run of the robot's current control session, if any,
   * and reports whether the robot still has an unfinished control session. It never forces a release: the session ends only when the runtime's own
   * terminal state is persisted, so a robot that cannot confirm a stop stays blocked.
   */
  async requestRobotStop(robotId: string): Promise<{ active: boolean; stopRequested: boolean; runtimeUnavailable: boolean }> {
    const active = await this.activeSession(this.prisma, robotId);
    if (!active) return { active: false, stopRequested: false, runtimeUnavailable: false };
    if (!active.experiment_id || this.isTerminalRuntimeState(active.experiment_status ?? "")) return { active: true, stopRequested: false, runtimeUnavailable: false };
    const rows = await this.prisma.$queryRaw<Array<{ run_id: string | null }>>`
      SELECT COALESCE(e.input_snapshot->>'runtimeRunId',cs.metadata->>'runtimeRunId') AS run_id
      FROM public.learning_experiments e JOIN public.control_sessions cs ON cs.id=e.control_session_id
      WHERE e.id=${active.experiment_id}::uuid LIMIT 1`;
    const runId = rows[0]?.run_id ?? `wf03-${active.experiment_id}`;
    try {
      const snapshot = await this.runtime.cancelRun(robotId, runId);
      await this.persistRuntimeSnapshot(active.experiment_id, active.control_session_id, runId, snapshot, "lab_session_stop_requested");
      return { active: Boolean(await this.activeSession(this.prisma, robotId)), stopRequested: true, runtimeUnavailable: false };
    } catch {
      return { active: true, stopRequested: false, runtimeUnavailable: true };
    }
  }

  /** True while the robot has an unfinished individual control session (Layer B), independent of any reservation. */
  async hasActiveControlSession(robotId: string): Promise<boolean> {
    return Boolean(await this.activeSession(this.prisma, robotId));
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
        allocation.robot_id,allocation.lab_session_id,allocation.reserved_by_other,r.name AS robot_name,r.model_name AS robot_model,r.serial_no AS robot_serial,
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
      LEFT JOIN LATERAL (
        -- A classroom may hold several robots. The robot used for execution is the one this classroom has an open Lab Session for; without one,
        -- prefer a robot that is not reserved elsewhere so the reason shown to the student is accurate.
        SELECT al.robot_id,lab.id AS lab_session_id,
          EXISTS (SELECT 1 FROM public.classroom_lab_sessions other WHERE other.robot_id=al.robot_id AND other.classroom_id<>c.id
            AND other.state IN ('active','terminating','quarantined')) AS reserved_by_other
        FROM public.learning_classroom_robot_allocations al
        LEFT JOIN public.classroom_lab_sessions lab ON lab.robot_id=al.robot_id AND lab.classroom_id=c.id AND lab.state='active' AND lab.expires_at>now()
        WHERE al.classroom_id=c.id
        ORDER BY (lab.id IS NOT NULL) DESC,
          EXISTS (SELECT 1 FROM public.classroom_lab_sessions other WHERE other.robot_id=al.robot_id AND other.classroom_id<>c.id
            AND other.state IN ('active','terminating','quarantined')) ASC,
          al.created_at ASC,al.robot_id ASC
        LIMIT 1
      ) allocation ON true
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
    // Classroom Lab Session: allocation grants eligibility only. Exclusive use needs an open reservation held by THIS classroom.
    if (!scope.lab_session_id) {
      return scope.reserved_by_other
        ? { code: "ROBOT_RESERVED_BY_ANOTHER_CLASSROOM", message: "This Robot is reserved by another classroom right now." }
        : { code: "LAB_SESSION_NOT_ACTIVE", message: "Your instructor has not started a Robot Lab Session for this classroom." };
    }
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

  /** Closes a reservation that never reached the runtime. Terminal states, so activeSession() no longer sees it; the reason is recorded as an event. */
  private async abandonPrepared(experimentId: string, sessionId: string, error: unknown) {
    const code = error instanceof ConflictException ? ((error.getResponse() as { code?: string }).code ?? "preflight_rejected") : "preflight_rejected";
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE public.learning_experiments SET status='failed',ended_at=COALESCE(ended_at,now()) WHERE id=${experimentId}::uuid AND status='pending' AND COALESCE((input_snapshot->>'runtimeStarted')::boolean,false)=false`;
      await tx.$executeRaw`UPDATE public.control_sessions SET state='preflight_failed',ended_at=COALESCE(ended_at,now()),metadata=metadata || ${JSON.stringify({ preflightRejected: code })}::jsonb WHERE id=${sessionId}::uuid AND ended_at IS NULL AND state='created'`;
      await tx.$executeRaw`
        INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data)
        SELECT ${experimentId}::uuid,COALESCE(MAX(event_index),-1)+1,'physical_preflight_rejected',${JSON.stringify({ code })}::jsonb
        FROM public.learning_experiment_events WHERE experiment_id=${experimentId}::uuid
        ON CONFLICT (experiment_id,event_index) DO NOTHING`;
    });
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
      SELECT e.id AS experiment_id,e.control_session_id,cs.robot_id,cs.organization_id,r.name AS robot_name,
        r.model_name AS robot_model,r.serial_no AS robot_serial,
        e.input_snapshot->>'programVersionId' AS program_version_id,e.input_snapshot->>'attemptId' AS attempt_id,e.status,
        COALESCE(e.input_snapshot->>'runtimeRunId',cs.metadata->>'runtimeRunId') AS run_id,
        COALESCE((e.input_snapshot->>'runtimeStarted')::boolean,(cs.metadata->>'runtimeStarted')::boolean,false) AS runtime_started,
        COALESCE(e.input_snapshot->>'runtimeAdapterMode',cs.metadata->>'runtimeAdapterMode') AS runtime_mode
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
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${robotId}::text, 1))`;
      const existing = await tx.$queryRaw<Array<{ state: string }>>`
        SELECT state FROM public.iot_command_lifecycles
        WHERE experiment_id=${experimentId}::uuid
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
      if (existing[0]) return false;
      await tx.$executeRaw`
        INSERT INTO public.iot_command_lifecycles(command_id,experiment_id,control_session_id,robot_id,state,issued_at,expires_at,last_sequence,command_payload)
        VALUES(${command.commandId}::uuid,${experimentId}::uuid,${sessionId}::uuid,${robotId}::uuid,'pending_publish',
          to_timestamp(${command.issuedAtMs}::double precision/1000),to_timestamp(${command.expiresAtMs}::double precision/1000),-1,${JSON.stringify(command.payload)}::jsonb)`;
      return true;
    });
    // A concurrent start already owns a durable dispatch intent for this
    // experiment.  Never create another physical command for that run.
    if (!created) return { state: "queued", events: [{ type: "iot_command_already_dispatched" }] };
    const claimed = await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`
      UPDATE public.iot_command_lifecycles SET state='publishing',publish_attempts=publish_attempts+1,publish_owner=${owner},publish_started_at=now(),publish_lease_until=now()+interval '30 seconds',updated_at=now()
      WHERE command_id=${command.commandId}::uuid AND state='pending_publish'`));
    if (claimed !== 1) throw new Error("iot publish intent claim lost");
    try { await this.iot.publishRunCommand(command); }
    catch (error) {
      const state = error instanceof IotPublishDefiniteFailureError ? "publish_failed" : "reconciliation_required";
      const publishError = state === "publish_failed" ? "publish_failed" : "publish_outcome_unknown";
      await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`
        UPDATE public.iot_command_lifecycles SET state=${state},publish_lease_until=NULL,publish_error=${publishError},updated_at=now()
        WHERE command_id=${command.commandId}::uuid AND state='publishing' AND publish_owner=${owner}`));
      throw error;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE public.iot_command_lifecycles SET state='queued',publish_lease_until=NULL,updated_at=now()
          WHERE command_id=${command.commandId}::uuid AND state='publishing' AND publish_owner=${owner}`;
        return { state: "queued", events: [{ type: "iot_command_published", commandId: command.commandId }] };
      });
    } catch (error) {
      // The edge may have received the command even though our post-publish
      // commit failed.  It is never safe to recover/replay this command.
      try { await this.markIotPublishUnknown(command.commandId, owner); } catch { /* retain original persistence error */ }
      throw error;
    }
  }

  private async markIotPublishUnknown(commandId: string, owner: string) {
    await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`
      UPDATE public.iot_command_lifecycles
      SET state='reconciliation_required',publish_lease_until=NULL,publish_error='publish_outcome_unknown',updated_at=now()
      WHERE command_id=${commandId}::uuid AND state='publishing' AND publish_owner=${owner}`));
  }

  private async persistRuntimeSnapshot(experimentId: string, sessionId: string, runId: string, snapshot: RuntimeSnapshot, requestedEvent?: string, provenance: Record<string, unknown> = {}) {
    const mapped = this.state(snapshot);
    const safe = {
      state: typeof snapshot.state === "string" ? snapshot.state : "failed",
      errorCode: typeof snapshot.errorCode === "string" ? snapshot.errorCode : null,
      startedAtMs: typeof snapshot.startedAtMs === "number" ? snapshot.startedAtMs : null,
      endedAtMs: typeof snapshot.endedAtMs === "number" ? snapshot.endedAtMs : null,
      events: Array.isArray(snapshot.events) ? snapshot.events : [],
      telemetry: snapshot.telemetry && typeof snapshot.telemetry === "object" ? snapshot.telemetry : null,
    };
    await this.prisma.$transaction(async (tx) => {
      const experimentUpdated = await tx.$executeRaw`
        UPDATE public.learning_experiments SET status=${mapped.experiment},
          input_snapshot=input_snapshot || ${JSON.stringify({ runtimeRunId: runId, runtimeStarted: true, ...provenance })}::jsonb,
          output_snapshot=${JSON.stringify(safe)}::jsonb,
          started_at=CASE WHEN ${safe.startedAtMs}::bigint IS NULL THEN started_at ELSE to_timestamp(${safe.startedAtMs}::double precision/1000) END,
          ended_at=CASE WHEN ${safe.endedAtMs}::bigint IS NULL THEN ended_at ELSE to_timestamp(${safe.endedAtMs}::double precision/1000) END
        WHERE id=${experimentId}::uuid`;
      const sessionUpdated = await tx.$executeRaw`
        UPDATE public.control_sessions SET state=${mapped.session},
          metadata=metadata || ${JSON.stringify({ runtimeRunId: runId, runtimeStarted: true, ...provenance })}::jsonb,
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

  /** A lost runtime is evidence of an unconfirmed stop, never evidence of a terminal stop. Keep ownership held. */
  private async recordRuntimeUnavailable(experimentId: string, sessionId: string, runId: string, operation: "status" | "stop") {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE public.learning_experiments
        SET input_snapshot=input_snapshot || ${JSON.stringify({ runtimeUnavailable: true, stopConfirmed: false })}::jsonb
        WHERE id=${experimentId}::uuid AND ended_at IS NULL`;
      await tx.$executeRaw`
        UPDATE public.control_sessions
        SET metadata=metadata || ${JSON.stringify({ runtimeUnavailable: true, stopConfirmed: false })}::jsonb
        WHERE id=${sessionId}::uuid AND ended_at IS NULL`;
      await tx.$executeRaw`
        INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data)
        SELECT ${experimentId}::uuid,COALESCE(MAX(event_index),-1)+1,'runtime_unavailable',
          ${JSON.stringify({ runtimeRunId: runId, operation, stopConfirmed: false })}::jsonb
        FROM public.learning_experiment_events
        WHERE experiment_id=${experimentId}::uuid
          AND NOT EXISTS (SELECT 1 FROM public.learning_experiment_events WHERE experiment_id=${experimentId}::uuid AND event_type='runtime_unavailable')
        ON CONFLICT (experiment_id,event_index) DO NOTHING`;
    });
  }

  private async handlePhysicalExperimentCompletion(tx: Pick<PrismaService, "$queryRaw" | "$executeRaw">, experimentId: string) {
    const rows = await tx.$queryRaw<Array<{
      learner_user_id: string;
      execution_mode: string;
      runtime_mode: string | null;
      program_version_id: string | null;
      course_id: string | null;
      l5_lesson_id: string | null;
    }>>`
      SELECT
        e.learner_user_id::text,
        e.execution_mode,
        e.input_snapshot->>'runtimeAdapterMode' AS runtime_mode,
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

    // A physical practical is satisfied ONLY by a verified physical execution. Provenance comes from what the server persisted when the run started
    // (never from the browser). A mock, fake or unverified runtime still records its result, but it does not complete the lesson.
    const provenance = classifyExecution({ executionMode: row.execution_mode, runtimeMode: row.runtime_mode });
    if (!satisfiesPhysicalPractical(provenance)) {
      await tx.$executeRaw`
        INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data)
        SELECT ${experimentId}::uuid,COALESCE(MAX(event_index),-1)+1,'physical_completion_withheld',${JSON.stringify({ provenance })}::jsonb
        FROM public.learning_experiment_events WHERE experiment_id=${experimentId}::uuid
        ON CONFLICT (experiment_id,event_index) DO NOTHING`;
      return;
    }

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
    const telemetry = snapshot.telemetry && typeof snapshot.telemetry === "object"
      ? snapshot.telemetry as Record<string, unknown>
      : undefined;
    return {
      id: execution.experiment_id, status: state,
      robot: { id: execution.robot_id, name: execution.robot_name, model: execution.robot_model, serial: execution.robot_serial },
      programVersion: { id: execution.program_version_id },
      runtime: { mode: execution.runtime_mode ?? null, provenance: classifyExecution({ executionMode: "real_robot", runtimeMode: execution.runtime_mode }), physical: classifyExecution({ executionMode: "real_robot", runtimeMode: execution.runtime_mode }) === "PHYSICAL_ROBOT" },
      startedAt: typeof snapshot.startedAtMs === "number" ? new Date(snapshot.startedAtMs).toISOString() : null,
      endedAt: typeof snapshot.endedAtMs === "number" ? new Date(snapshot.endedAtMs).toISOString() : null,
      error: this.safeRuntimeError(snapshot.errorCode),
      simulationTelemetry: telemetry?.source_mode === "SIMULATION" && telemetry.robot_id === execution.robot_id
        ? { sourceMode: "SIMULATION", measuredAt: telemetry.measured_at, sequence: telemetry.sequence, connection: telemetry.connection, measured: telemetry.measured }
        : null,
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
