import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { IotCommandService } from "./iot-command.service";
import { LearningScopeService } from "./learning-scope.service";
import { PhysicalExecutionService, TERMINAL_CONTROL_SESSION_STATES } from "./physical-execution.service";

/**
 * Classroom Lab Session: a supervised, bounded, classroom-level EXCLUSIVE reservation of one allocated robot.
 *
 * Two independent exclusivity layers (never collapsed):
 *   A. classroom_lab_sessions: at most one open (active | terminating | quarantined) row per robot, enforced by a partial UNIQUE index.
 *   B. control_sessions: at most one unfinished individual control owner per robot, enforced by the existing prepare() under the same advisory lock.
 * Both layers take pg_advisory_xact_lock(hashtextextended(robot, 0)), the key prepare() uses, so Start Lab Session, a student Run and End/expiry serialize.
 *
 * Reserving a robot never arms hardware and never sends a command. A reservation is released only after the robot has no unfinished control
 * session; if a stop cannot be confirmed the session stays `quarantined` and the robot stays blocked (there is no force unlock).
 */
export type LabSessionState = "active" | "terminating" | "quarantined" | "released";
export type EndedByRole = "instructor" | "school_admin" | "system" | "expiry";
const OPEN = ["active", "terminating", "quarantined"] as const;

export interface LabSessionRow {
  id: string; organization_id: string; classroom_id: string; robot_id: string; instructor_user_id: string;
  state: LabSessionState; started_at: Date; expires_at: Date; extension_count: number; terminating_at: Date | null; ended_at: Date | null;
  end_reason: string | null; ended_by_role: string | null;
}

export interface LabSessionConfig { defaultMinutes: number; maxTotalMinutes: number; maxExtensionMinutes: number }
export const labSessionConfig = (env: NodeJS.ProcessEnv = process.env): LabSessionConfig => {
  const read = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key]);
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  };
  const maxTotalMinutes = read("VISTA_LAB_SESSION_MAX_TOTAL_MINUTES", 480, 15, 1440);
  return { defaultMinutes: Math.min(read("VISTA_LAB_SESSION_DEFAULT_MINUTES", 120, 5, 480), maxTotalMinutes), maxTotalMinutes, maxExtensionMinutes: read("VISTA_LAB_SESSION_MAX_EXTENSION_MINUTES", 60, 5, 240) };
};

export const labSessionError = (status: "conflict" | "not_found" | "bad_request" | "forbidden", code: string, message: string) => {
  const body = { code, message };
  if (status === "conflict") return new ConflictException(body);
  if (status === "forbidden") return new ForbiddenException(body);
  if (status === "bad_request") return new BadRequestException(body);
  return new NotFoundException(body);
};

@Injectable()
export class LabSessionService {
  private readonly config = labSessionConfig();
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: LearningScopeService,
    private readonly physical: PhysicalExecutionService,
    @Optional() private readonly iot?: IotCommandService,
  ) {}

  // ---------------------------------------------------------------- authorization

  /** Instructor of this classroom (classroom teacher role, active membership, lab-session permission). TAs and School Admins do not start sessions. */
  private async classroomForInstructor(user: AuthenticatedUser, classroomId: string): Promise<{ organization_id: string }> {
    const rows = await this.prisma.$queryRaw<Array<{ organization_id: string }>>`
      SELECT c.organization_id FROM public.learning_classrooms c
      JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active' AND cm.classroom_role='teacher'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=cm.user_id AND m.organization_id=c.organization_id AND m.status='active'
      WHERE c.id=${classroomId}::uuid AND c.status='active'
        AND EXISTS (SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=m.role_id AND p.code='education.lab_session.manage')
      LIMIT 1`;
    if (!rows[0]) throw labSessionError("not_found", "CLASSROOM_NOT_FOUND", "Classroom was not found.");
    return rows[0];
  }

  private async schoolAdminOrganization(user: AuthenticatedUser, organizationId: string) {
    const membership = user.memberships.find((item) => item.organizationId === organizationId && item.status === "active");
    if (!membership || !membership.permissions.includes("education.classroom.resource.allocate")) {
      throw labSessionError("not_found", "LAB_SESSION_NOT_FOUND", "Lab Session was not found.");
    }
  }

  private async loadForUpdate(tx: Pick<PrismaService, "$queryRaw">, sessionId: string): Promise<LabSessionRow | null> {
    const rows = await tx.$queryRaw<LabSessionRow[]>`SELECT * FROM public.classroom_lab_sessions WHERE id=${sessionId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  private async sessionRobot(sessionId: string): Promise<{ robot_id: string; classroom_id: string; organization_id: string }> {
    const rows = await this.prisma.$queryRaw<Array<{ robot_id: string; classroom_id: string; organization_id: string }>>`
      SELECT robot_id,classroom_id,organization_id FROM public.classroom_lab_sessions WHERE id=${sessionId}::uuid`;
    if (!rows[0]) throw labSessionError("not_found", "LAB_SESSION_NOT_FOUND", "Lab Session was not found.");
    return rows[0];
  }

  private lock(tx: Pick<PrismaService, "$executeRaw">, robotId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${robotId}::text, 0))`;
  }

  // ---------------------------------------------------------------- start / extend

  async start(user: AuthenticatedUser, classroomId: string, dto: { robotId: string; durationMinutes?: number }) {
    const classroom = await this.classroomForInstructor(user, classroomId);
    const minutes = dto.durationMinutes ?? this.config.defaultMinutes;
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > this.config.maxTotalMinutes) {
      throw labSessionError("bad_request", "LAB_SESSION_DURATION_INVALID", `Duration must be between 5 and ${this.config.maxTotalMinutes} minutes.`);
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, dto.robotId);
        // Everything is re-read under the robot lock: allocation, entitlement, status and any competing reservation or controller.
        const eligible = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT r.id FROM public.robots r
          JOIN public.learning_classroom_robot_allocations al ON al.robot_id=r.id AND al.classroom_id=${classroomId}::uuid
          JOIN public.org_entitlements e ON e.robot_id=r.id AND e.organization_id=${classroom.organization_id}::uuid AND e.resource_type='robot'
            AND e.valid_from<=now() AND (e.valid_to IS NULL OR e.valid_to>now())
          WHERE r.id=${dto.robotId}::uuid AND r.status='available' LIMIT 1`;
        if (!eligible[0]) throw labSessionError("conflict", "ROBOT_NOT_AVAILABLE_FOR_CLASSROOM", "This robot is not allocated, entitled and available for this classroom.");
        const open = await tx.$queryRaw<LabSessionRow[]>`SELECT * FROM public.classroom_lab_sessions WHERE robot_id=${dto.robotId}::uuid AND state IN ('active','terminating','quarantined') FOR UPDATE`;
        if (open[0]) {
          if (open[0].classroom_id === classroomId && open[0].state === "active") return open[0];            // idempotent retry by this classroom
          throw labSessionError("conflict", "ROBOT_RESERVED_BY_ANOTHER_CLASSROOM", open[0].classroom_id === classroomId
            ? "This classroom's Lab Session for the robot is ending. Wait until it is released." : "This robot is reserved by another classroom right now.");
        }
        if (await this.physical.hasActiveControlSession(dto.robotId)) {
          throw labSessionError("conflict", "ROBOT_IN_USE", "The robot still has an unfinished control session. Try again when it has been released.");
        }
        const inserted = await tx.$queryRaw<LabSessionRow[]>`
          INSERT INTO public.classroom_lab_sessions(organization_id,classroom_id,robot_id,instructor_user_id,state,started_at,expires_at)
          VALUES(${classroom.organization_id}::uuid,${classroomId}::uuid,${dto.robotId}::uuid,${user.vistaUserId}::uuid,'active',now(),now()+(${minutes}::int * interval '1 minute'))
          RETURNING *`;
        return inserted[0] as LabSessionRow;
      });
      return this.dto(row);
    } catch (error) {
      // Defence in depth: the partial unique index is the final arbiter if two transactions ever reach the INSERT together.
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2010") && /ux_classroom_lab_sessions_one_open_per_robot|23505/.test(`${error.message}${JSON.stringify(error.meta ?? {})}`)) {
        throw labSessionError("conflict", "ROBOT_RESERVED_BY_ANOTHER_CLASSROOM", "This robot is reserved by another classroom right now.");
      }
      throw error;
    }
  }

  async extend(user: AuthenticatedUser, sessionId: string, dto: { minutes: number }) {
    const target = await this.sessionRobot(sessionId);
    await this.classroomForInstructor(user, target.classroom_id);
    if (!Number.isInteger(dto.minutes) || dto.minutes < 5 || dto.minutes > this.config.maxExtensionMinutes) {
      throw labSessionError("bad_request", "LAB_SESSION_EXTENSION_INVALID", `An extension must be between 5 and ${this.config.maxExtensionMinutes} minutes.`);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, target.robot_id);
      const session = await this.loadForUpdate(tx, sessionId);
      if (!session) throw labSessionError("not_found", "LAB_SESSION_NOT_FOUND", "Lab Session was not found.");
      // Expiry is judged on database time. An expired or ending session is never revived: the robot may already be in controlled termination.
      const stillValid = await tx.$queryRaw<Array<{ ok: boolean; total_minutes: number }>>`
        SELECT (state='active' AND expires_at>now()) AS ok,
          EXTRACT(EPOCH FROM (expires_at + (${dto.minutes}::int * interval '1 minute') - started_at))::int/60 AS total_minutes
        FROM public.classroom_lab_sessions WHERE id=${sessionId}::uuid`;
      if (!stillValid[0]?.ok) throw labSessionError("conflict", "LAB_SESSION_NOT_ACTIVE", "Only an active, unexpired Lab Session can be extended.");
      if (stillValid[0].total_minutes > this.config.maxTotalMinutes) throw labSessionError("conflict", "LAB_SESSION_MAX_DURATION", `A Lab Session cannot exceed ${this.config.maxTotalMinutes} minutes in total.`);
      const updated = await tx.$queryRaw<LabSessionRow[]>`
        UPDATE public.classroom_lab_sessions SET expires_at=expires_at+(${dto.minutes}::int * interval '1 minute'),extension_count=extension_count+1
        WHERE id=${sessionId}::uuid AND state='active' RETURNING *`;
      return updated[0] as LabSessionRow;
    });
    return this.dto(row);
  }

  // ---------------------------------------------------------------- end / force end / expiry

  async end(user: AuthenticatedUser, sessionId: string) {
    const target = await this.sessionRobot(sessionId);
    await this.classroomForInstructor(user, target.classroom_id);
    return this.terminate(sessionId, { userId: user.vistaUserId, role: "instructor", reason: "ended_by_instructor" });
  }

  async forceEnd(user: AuthenticatedUser, sessionId: string, dto: { reason: string; confirm: boolean }) {
    const target = await this.sessionRobot(sessionId).catch(() => { throw labSessionError("not_found", "LAB_SESSION_NOT_FOUND", "Lab Session was not found."); });
    await this.schoolAdminOrganization(user, target.organization_id);
    const reason = typeof dto.reason === "string" ? dto.reason.trim() : "";
    if (dto.confirm !== true || reason.length < 5 || reason.length > 500) {
      throw labSessionError("bad_request", "LAB_SESSION_FORCE_END_REASON_REQUIRED", "Confirmation and a reason of 5 to 500 characters are required.");
    }
    return this.terminate(sessionId, { userId: user.vistaUserId, role: "school_admin", reason: `force_end: ${reason}` });
  }

  /** Idempotent controlled termination shared by Instructor End, School Admin Force End, expiry and recovery. */
  async terminate(sessionId: string, actor: { userId: string | null; role: EndedByRole; reason: string }) {
    const target = await this.sessionRobot(sessionId);
    // 1. Stop accepting new executions immediately: active -> terminating. Already-ending/released sessions are left as they are (idempotent).
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, target.robot_id);
      const session = await this.loadForUpdate(tx, sessionId);
      if (!session || session.state !== "active") return;
      await tx.$executeRaw`
        UPDATE public.classroom_lab_sessions SET state='terminating',terminating_at=now(),ended_by_user_id=${actor.userId}::uuid,ended_by_role=${actor.role},end_reason=${actor.reason}
        WHERE id=${sessionId}::uuid AND state='active'`;
    });
    // 2. Ask the runtime to stop an unfinished control session, if any. Runtime unavailable or unconfirmed => quarantined (robot stays blocked).
    const stop = await this.physical.requestRobotStop(target.robot_id);
    if (stop.active && stop.runtimeUnavailable) {
      await this.prisma.$executeRaw`UPDATE public.classroom_lab_sessions SET state='quarantined' WHERE id=${sessionId}::uuid AND state IN ('terminating','quarantined')`;
    }
    // 3. Release only when the individual control session is verifiably finished.
    return this.finalize(sessionId);
  }

  /** Releases a terminating/quarantined session iff the robot has no unfinished control session. Safe to call repeatedly. */
  async finalize(sessionId: string) {
    const target = await this.sessionRobot(sessionId);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, target.robot_id);
      const session = await this.loadForUpdate(tx, sessionId);
      if (!session) throw labSessionError("not_found", "LAB_SESSION_NOT_FOUND", "Lab Session was not found.");
      if (session.state === "released" || session.state === "active") return session;
      const unfinished = await this.physical.hasActiveControlSession(target.robot_id);
      if (unfinished) return session;
      const released = await tx.$queryRaw<LabSessionRow[]>`
        UPDATE public.classroom_lab_sessions SET state='released',ended_at=now() WHERE id=${sessionId}::uuid AND state IN ('terminating','quarantined') RETURNING *`;
      return released[0] ?? session;
    });
    return { ...this.dto(row), recovery: row.state === "quarantined" ? "The runtime could not confirm the stop. The robot stays blocked until the run finishes or the runtime reports it stopped; retry End Lab Session." : row.state === "terminating" ? "Waiting for the active student run to finish." : null };
  }

  /** Expiry and recovery sweep: expired active sessions go to controlled termination; ending sessions are retried. Never transfers ownership unsafely. */
  async reconcile(): Promise<{ expired: number; retried: number }> {
    const due = await this.prisma.$queryRaw<Array<{ id: string; state: LabSessionState; expired: boolean }>>`
      SELECT id,state,(state='active' AND expires_at<=now()) AS expired FROM public.classroom_lab_sessions
      WHERE state IN ('terminating','quarantined') OR (state='active' AND expires_at<=now()) ORDER BY started_at LIMIT 50`;
    let expired = 0; let retried = 0;
    for (const item of due) {
      if (item.expired) { expired += 1; await this.terminate(item.id, { userId: null, role: "expiry", reason: "expired" }); }
      else { retried += 1; await this.terminate(item.id, { userId: null, role: "system", reason: "recovery_retry" }); }
    }
    return { expired, retried };
  }

  // ---------------------------------------------------------------- read models

  /** Sessions of a classroom for the Instructor / School Admin of that classroom. */
  async classroomSessions(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomPermission(user, classroomId, ["education.lab_session.manage"]).catch(async () => {
      const room = await this.prisma.$queryRaw<Array<{ organization_id: string }>>`SELECT organization_id FROM public.learning_classrooms WHERE id=${classroomId}::uuid`;
      if (!room[0]) throw labSessionError("not_found", "CLASSROOM_NOT_FOUND", "Classroom was not found.");
      await this.schoolAdminOrganization(user, room[0].organization_id).catch(() => { throw labSessionError("not_found", "CLASSROOM_NOT_FOUND", "Classroom was not found."); });
    });
    await this.reconcileClassroom(classroomId);
    const rows = await this.prisma.$queryRaw<Array<LabSessionRow & { robot_name: string; robot_serial: string; instructor_name: string | null }>>`
      SELECT s.*,r.name AS robot_name,r.serial_no AS robot_serial,u.full_name AS instructor_name
      FROM public.classroom_lab_sessions s JOIN public.robots r ON r.id=s.robot_id LEFT JOIN public.users u ON u.id=s.instructor_user_id
      WHERE s.classroom_id=${classroomId}::uuid AND (s.state IN ('active','terminating','quarantined') OR s.ended_at>now()-interval '24 hours')
      ORDER BY s.started_at DESC LIMIT 50`;
    return rows.map((row) => ({ ...this.dto(row), robot: { id: row.robot_id, name: row.robot_name, serialNo: row.robot_serial }, instructorName: row.instructor_name }));
  }

  /**
   * Robots allocated to a classroom with a status derived from authoritative data only. Connectivity (Device Shadow), reservation, control ownership
   * and operational/safety state are separate fields; a connected robot is not necessarily available.
   */
  async classroomRobots(user: AuthenticatedUser, classroomId: string) {
    const room = await this.prisma.$queryRaw<Array<{ organization_id: string }>>`SELECT organization_id FROM public.learning_classrooms WHERE id=${classroomId}::uuid`;
    if (!room[0]) throw labSessionError("not_found", "CLASSROOM_NOT_FOUND", "Classroom was not found.");
    await this.scope.assertClassroomAccess(user, classroomId);
    await this.reconcileClassroom(classroomId);
    const rows = await this.prisma.$queryRaw<Array<{
      robot_id: string; name: string; serial_no: string; model_name: string; robot_status: string; entitled: boolean;
      mine_id: string | null; mine_state: string | null; mine_expires: Date | null; other_open: boolean; controller_active: boolean;
    }>>`
      SELECT r.id AS robot_id,r.name,r.serial_no,r.model_name,r.status AS robot_status,
        EXISTS (SELECT 1 FROM public.org_entitlements e WHERE e.robot_id=r.id AND e.organization_id=${room[0].organization_id}::uuid AND e.resource_type='robot'
          AND e.valid_from<=now() AND (e.valid_to IS NULL OR e.valid_to>now())) AS entitled,
        mine.id AS mine_id,mine.state AS mine_state,mine.expires_at AS mine_expires,
        EXISTS (SELECT 1 FROM public.classroom_lab_sessions o WHERE o.robot_id=r.id AND o.classroom_id<>${classroomId}::uuid AND o.state IN ('active','terminating','quarantined')) AS other_open,
        EXISTS (SELECT 1 FROM public.control_sessions cs WHERE cs.robot_id=r.id AND cs.ended_at IS NULL
          AND cs.state NOT IN (${Prisma.join(TERMINAL_CONTROL_SESSION_STATES)})) AS controller_active
      FROM public.learning_classroom_robot_allocations al JOIN public.robots r ON r.id=al.robot_id
      LEFT JOIN public.classroom_lab_sessions mine ON mine.robot_id=r.id AND mine.classroom_id=${classroomId}::uuid AND mine.state IN ('active','terminating','quarantined')
      WHERE al.classroom_id=${classroomId}::uuid ORDER BY al.created_at,r.name`;
    return Promise.all(rows.map(async (row) => {
      const connectivity = await this.connectivity(row.robot_id);
      const reservation = row.mine_id ? "this_classroom" : row.other_open ? "other_classroom" : "none";
      let status: string;
      if (!row.entitled || row.robot_status !== "available") status = "unavailable";
      else if (row.mine_state === "terminating" || row.mine_state === "quarantined") status = row.mine_state === "quarantined" ? "safety_blocked" : "ending_session";
      else if (reservation === "other_classroom") status = "reserved_by_another_classroom";
      else if (reservation === "this_classroom") status = row.controller_active ? "in_use" : "reserved_for_this_classroom";
      else if (connectivity === "offline") status = "offline";
      else status = "available";
      return {
        robotId: row.robot_id, name: row.name, serialNo: row.serial_no, modelName: row.model_name, operationalStatus: row.robot_status, entitled: row.entitled,
        reservation, labSessionId: row.mine_id, labSessionState: row.mine_state, expiresAt: row.mine_expires, controllerActive: reservation === "other_classroom" ? null : row.controller_active,
        connectivity, status,
      };
    }));
  }

  private async connectivity(robotId: string): Promise<"online" | "offline" | "unknown"> {
    if (!this.iot?.enabled?.()) return "unknown";
    try {
      const shadow = await this.iot.readShadow(robotId);
      if (!shadow) return "offline";
      const age = Date.now() - Number(shadow.reportedAtMs);
      return shadow.connection === "connected" && Number.isFinite(age) && age >= -5000 && age <= this.iot.shadowMaxAgeMs() ? "online" : "offline";
    } catch { return "unknown"; }
  }

  private async reconcileClassroom(classroomId: string) {
    const due = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.classroom_lab_sessions WHERE classroom_id=${classroomId}::uuid AND (state IN ('terminating','quarantined') OR (state='active' AND expires_at<=now()))`;
    for (const item of due) { try { await this.terminate(item.id, { userId: null, role: "expiry", reason: "expired" }); } catch { /* surfaced by the next read */ } }
  }

  private dto(row: LabSessionRow) {
    return {
      id: row.id, classroomId: row.classroom_id, robotId: row.robot_id, state: row.state, startedAt: row.started_at, expiresAt: row.expires_at,
      extensionCount: row.extension_count, endedAt: row.ended_at, endReason: row.state === "released" || row.state !== "active" ? row.end_reason : null, endedByRole: row.ended_by_role,
    };
  }
}
