import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";

const AUDIENCE = "vista-digital-twin-viewer";
const TTL_SECONDS = 60;

interface TelemetryScopeRow { organization_id: string; robot_id: string; }
interface AttemptScopeRow { organization_id: string; classroom_id: string; assignment_id: string; robot_id: string; }
interface AvailableRobotRow {
  id: string;
  name: string;
  model_name: string;
  status: string;
  allocation_status: "allocated" | "not_allocated";
  viewer_access: boolean;
}

@Injectable()
export class DigitalTwinScopeService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async issueViewerScope(user: AuthenticatedUser, robotId: string) {
    const allowed = user.status === "active" && user.memberships.some((membership) =>
      membership.status === "active" && membership.permissions.includes("learning.experiment.execute"),
    );
    if (!allowed) throw new ForbiddenException("Digital Twin telemetry is not available for this account.");

    const scopes = await this.prisma.$queryRaw<TelemetryScopeRow[]>`
      SELECT c.organization_id, allocation.robot_id
      FROM public.learning_classroom_robot_allocations allocation
      JOIN public.learning_classrooms c ON c.id=allocation.classroom_id AND c.status='active'
      JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id
        AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=${user.vistaUserId}::uuid
        AND m.organization_id=c.organization_id AND m.status='active'
      JOIN public.roles role ON role.id=m.role_id
      WHERE allocation.robot_id=${robotId}::uuid
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          JOIN public.permissions permission ON permission.id=rp.permission_id
          WHERE rp.role_id=role.id AND permission.code='learning.experiment.execute'
        )
        AND EXISTS (
          SELECT 1 FROM public.org_entitlements entitlement
          WHERE entitlement.organization_id=c.organization_id AND entitlement.robot_id=allocation.robot_id
            AND entitlement.resource_type='robot' AND entitlement.valid_from<=now()
            AND (entitlement.valid_to IS NULL OR entitlement.valid_to>now())
        )
      LIMIT 1`;
    const scope = scopes[0];
    if (!scope) throw new ForbiddenException("Digital Twin telemetry is not available for this robot.");

    const secret = this.config.get<string>("DIGITAL_TWIN_SCOPE_SECRET")?.trim();
    if (!secret) throw new ServiceUnavailableException("Digital Twin scope broker is not configured.");
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const payload = { aud: AUDIENCE, exp, jti: randomUUID(), kind: "viewer", org: scope.organization_id, robots: [scope.robot_id], sub: user.vistaUserId };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return { token: `v1.${encoded}.${signature}`, expiresAt: new Date(exp * 1000).toISOString(), organizationId: scope.organization_id, robotId: scope.robot_id };
  }

  /**
   * Attempt-bound viewer scope. One server-side authorization path proves, in a single query: the JWT subject owns the attempt, the
   * attempt is in progress, its delivery is published and open, the classroom and school are active, the student's membership is
   * active and permitted, and the robot is allocated to THAT classroom with a currently valid entitlement. The Twin then filters
   * telemetry by the attempt claim, so a robot-wide stream can never leak another attempt's frames.
   */
  async issueAttemptViewerScope(user: AuthenticatedUser, attemptId: string, robotId: string, labSessionId?: string) {
    const rows = await this.prisma.$queryRaw<AttemptScopeRow[]>`
      SELECT c.organization_id, c.id AS classroom_id, ca.assignment_id, allocation.robot_id
      FROM public.learning_assignment_attempts at
      JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id AND ca.status='published'
        AND (ca.close_at IS NULL OR ca.close_at>now())
      JOIN public.learning_classrooms c ON c.id=ca.classroom_id AND c.status='active'
      JOIN public.organizations o ON o.id=c.organization_id AND o.status='active'
      JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id AND cm.user_id=at.learner_user_id AND cm.status='active'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=at.learner_user_id
        AND m.organization_id=c.organization_id AND m.status='active'
      JOIN public.learning_classroom_robot_allocations allocation ON allocation.classroom_id=c.id AND allocation.robot_id=${robotId}::uuid
      WHERE at.id=${attemptId}::uuid AND at.learner_user_id=${user.vistaUserId}::uuid
        AND (at.status='in_progress' OR EXISTS (
          -- WF-03 runs only after the submission, when the attempt is no longer in progress: the owner of a recent real-robot run
          -- of THIS attempt may still watch it (still bound to this one attempt; never to another attempt).
          SELECT 1 FROM public.learning_experiments run
          WHERE run.learner_user_id=at.learner_user_id AND run.execution_mode='real_robot'
            AND run.input_snapshot->>'attemptId'=at.id::text AND run.created_at > now() - interval '30 minutes'))
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp JOIN public.permissions permission ON permission.id=rp.permission_id
          WHERE rp.role_id=m.role_id AND permission.code='learning.experiment.execute')
        AND EXISTS (
          SELECT 1 FROM public.org_entitlements entitlement
          WHERE entitlement.organization_id=c.organization_id AND entitlement.robot_id=allocation.robot_id
            AND entitlement.resource_type='robot' AND entitlement.valid_from<=now()
            AND (entitlement.valid_to IS NULL OR entitlement.valid_to>now()))
      LIMIT 1`;
    const scope = rows[0];
    // 404 for every failure mode: the response must not reveal whether the attempt exists, belongs to someone else, or is closed.
    if (user.status !== "active" || !scope) throw new NotFoundException("Digital Twin telemetry is not available for this attempt.");
    const secret = this.config.get<string>("DIGITAL_TWIN_SCOPE_SECRET")?.trim();
    if (!secret) throw new ServiceUnavailableException("Digital Twin scope broker is not configured.");
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const payload = {
      aud: AUDIENCE, exp, jti: randomUUID(), kind: "viewer", org: scope.organization_id, robots: [scope.robot_id], sub: user.vistaUserId,
      attempt_id: attemptId, assignment_id: scope.assignment_id, classroom_id: scope.classroom_id, ...(labSessionId ? { lab_session_id: labSessionId } : {}),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return { token: `v1.${encoded}.${signature}`, expiresAt: new Date(exp * 1000).toISOString(), organizationId: scope.organization_id, classroomId: scope.classroom_id,
      assignmentId: scope.assignment_id, attemptId, robotId: scope.robot_id, ...(labSessionId ? { labSessionId } : {}) };
  }

  async availableRobots(user: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<AvailableRobotRow[]>`
      SELECT DISTINCT r.id,r.name,r.model_name,r.status,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.learning_classroom_robot_allocations allocation
          JOIN public.learning_classrooms c ON c.id=allocation.classroom_id AND c.status='active'
          JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id
            AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active'
          JOIN public.memberships membership ON membership.id=cm.membership_id
            AND membership.user_id=${user.vistaUserId}::uuid
            AND membership.organization_id=c.organization_id AND membership.status='active'
          WHERE allocation.robot_id=r.id
        ) THEN 'allocated' ELSE 'not_allocated' END AS allocation_status,
        EXISTS (
          SELECT 1 FROM public.learning_classroom_robot_allocations allocation
          JOIN public.learning_classrooms c ON c.id=allocation.classroom_id AND c.status='active'
          JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id
            AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active'
          JOIN public.memberships membership ON membership.id=cm.membership_id
            AND membership.user_id=${user.vistaUserId}::uuid
            AND membership.organization_id=c.organization_id AND membership.status='active'
          JOIN public.roles role ON role.id=membership.role_id
          WHERE allocation.robot_id=r.id
            AND EXISTS (
              SELECT 1 FROM public.role_permissions rp
              JOIN public.permissions permission ON permission.id=rp.permission_id
              WHERE rp.role_id=role.id AND permission.code='learning.experiment.execute'
            )
        ) AND ${user.status === "active" && user.memberships.some((membership) => membership.status === "active" && membership.permissions.includes("learning.experiment.execute"))}
          AS viewer_access
      FROM public.robots r
      JOIN public.org_entitlements entitlement ON entitlement.robot_id=r.id
        AND entitlement.resource_type='robot' AND entitlement.valid_from<=now()
        AND (entitlement.valid_to IS NULL OR entitlement.valid_to>now())
      JOIN public.memberships visible_membership ON visible_membership.organization_id=entitlement.organization_id
        AND visible_membership.user_id=${user.vistaUserId}::uuid AND visible_membership.status='active'
      WHERE r.model_name='SO-101'
      ORDER BY r.name,r.id`;
    return rows.map((row) => ({
      id: row.id, name: row.name, modelName: row.model_name, status: row.status,
      allocationStatus: row.allocation_status, viewerAccess: row.viewer_access ? "authorized" : "unavailable",
    }));
  }
}
