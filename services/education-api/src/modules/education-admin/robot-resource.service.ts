import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LabSessionSchemaProbe } from "../learning/lab-session-schema";
import { LabSessionService } from "../learning/lab-session.service";
import { LearningScopeService } from "../learning/learning-scope.service";
import { CreateRobotResourceDto, GrantRobotEntitlementDto, UpdateRobotResourceDto } from "./dto/robot-resource.dto";

/**
 * System Administrator management of LOGICAL Robot Resources and organization entitlements, on the existing `robots` and `org_entitlements` tables.
 * Registering a resource creates no AWS infrastructure, certificate or credential, and never marks anything connected or ready: runtime connectivity is
 * observed from the Device Shadow in the classroom views, and device commissioning is a separate, owner-approved operation.
 * Resources are retired (status), never deleted; entitlements are ended (valid_to), never deleted, so allocations, experiments and evidence stay intact.
 */
@Injectable()
export class RobotResourceService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly labSessions: LabSessionService, private readonly labSchema?: LabSessionSchemaProbe) {}

  private labReady() { return this.labSchema ? this.labSchema.isReady() : Promise.resolve(true); }

  private requireSystemAdministrator(user: AuthenticatedUser) {
    if (!this.scope.isSystemAdministrator(user)) throw new NotFoundException("Robot resource was not found.");
  }

  async list(user: AuthenticatedUser) {
    this.requireSystemAdministrator(user);
    const open = (await this.labReady())
      ? Prisma.sql`(SELECT COUNT(*)::int FROM public.classroom_lab_sessions s WHERE s.robot_id=r.id AND s.state IN ('active','terminating','quarantined'))`
      : Prisma.sql`0`;
    return this.prisma.$queryRaw`
      SELECT r.id,r.serial_no AS "serialNo",r.name,r.model_name AS "modelName",r.firmware_version AS "firmwareVersion",r.status,r.owner_organization_id AS "ownerOrganizationId",
        r.notes,r.created_at AS "createdAt",
        (SELECT COUNT(*)::int FROM public.org_entitlements e WHERE e.robot_id=r.id AND e.resource_type='robot' AND e.valid_from<=now() AND (e.valid_to IS NULL OR e.valid_to>now())) AS "activeEntitlements",
        (SELECT COUNT(*)::int FROM public.learning_classroom_robot_allocations a WHERE a.robot_id=r.id) AS "allocations",
        ${open} AS "openLabSessions",
        false AS "commissioned"
      FROM public.robots r ORDER BY r.name,r.serial_no`;
  }

  async detail(user: AuthenticatedUser, robotId: string) {
    this.requireSystemAdministrator(user);
    const robots = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id,serial_no AS "serialNo",name,model_name AS "modelName",firmware_version AS "firmwareVersion",status,owner_organization_id AS "ownerOrganizationId",notes,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM public.robots WHERE id=${robotId}::uuid`;
    if (!robots[0]) throw new NotFoundException("Robot resource was not found.");
    const [entitlements, allocations, sessions] = await Promise.all([
      this.prisma.$queryRaw`SELECT e.id,e.organization_id AS "organizationId",o.name AS "organizationName",e.valid_from AS "validFrom",e.valid_to AS "validTo",
          (e.valid_from<=now() AND (e.valid_to IS NULL OR e.valid_to>now())) AS active
        FROM public.org_entitlements e JOIN public.organizations o ON o.id=e.organization_id WHERE e.robot_id=${robotId}::uuid AND e.resource_type='robot' ORDER BY e.valid_from DESC`,
      this.prisma.$queryRaw`SELECT a.id,a.classroom_id AS "classroomId",c.name AS "classroomName",c.organization_id AS "organizationId",o.name AS "organizationName",a.created_at AS "createdAt"
        FROM public.learning_classroom_robot_allocations a JOIN public.learning_classrooms c ON c.id=a.classroom_id JOIN public.organizations o ON o.id=c.organization_id WHERE a.robot_id=${robotId}::uuid ORDER BY a.created_at DESC`,
      (await this.labReady()) ? this.prisma.$queryRaw`SELECT s.id,s.classroom_id AS "classroomId",s.state,s.expires_at AS "expiresAt" FROM public.classroom_lab_sessions s WHERE s.robot_id=${robotId}::uuid AND s.state IN ('active','terminating','quarantined')` : Promise.resolve([]),
    ]);
    return { ...robots[0], commissioned: false, connectivity: "not_reported", entitlements, allocations, openLabSessions: sessions };
  }

  async create(user: AuthenticatedUser, dto: CreateRobotResourceDto) {
    this.requireSystemAdministrator(user);
    if (dto.ownerOrganizationId) {
      const owner = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.organizations WHERE id=${dto.ownerOrganizationId}::uuid`;
      if (!owner[0]) throw new NotFoundException("Organization was not found.");
    }
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO public.robots(serial_no,name,model_name,firmware_version,status,owner_organization_id,notes)
        VALUES(${dto.serialNo.trim()},${dto.name.trim()},${dto.modelName?.trim() || "SO-101"},${dto.firmwareVersion?.trim() || null},'available',${dto.ownerOrganizationId ?? null}::uuid,${dto.notes?.trim() || null})
        RETURNING id`;
      return this.detail(user, rows[0]!.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2010") && /23505|robots_serial_no_key/.test(`${error.message}${JSON.stringify(error.meta ?? {})}`)) {
        throw new ConflictException({ code: "ROBOT_SERIAL_EXISTS", message: "A robot resource with this serial number already exists." });
      }
      throw error;
    }
  }

  async update(user: AuthenticatedUser, robotId: string, dto: UpdateRobotResourceDto) {
    this.requireSystemAdministrator(user);
    const current = await this.prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM public.robots WHERE id=${robotId}::uuid`;
    if (!current[0]) throw new NotFoundException("Robot resource was not found.");
    await this.prisma.$executeRaw`
      UPDATE public.robots SET name=COALESCE(${dto.name?.trim() ?? null},name),model_name=COALESCE(${dto.modelName?.trim() ?? null},model_name),
        firmware_version=COALESCE(${dto.firmwareVersion?.trim() ?? null},firmware_version),notes=COALESCE(${dto.notes?.trim() ?? null},notes),
        status=COALESCE(${dto.status ?? null},status),updated_at=now() WHERE id=${robotId}::uuid`;
    // A robot taken out of service ends its open reservations through the same controlled termination as an Instructor End.
    if (dto.status && dto.status !== "available") await this.terminateOpenSessions({ robotId }, `robot_${dto.status}`);
    return this.detail(user, robotId);
  }

  async grantEntitlement(user: AuthenticatedUser, robotId: string, dto: GrantRobotEntitlementDto) {
    this.requireSystemAdministrator(user);
    if (dto.validTo && !(Date.parse(dto.validTo) > Date.now())) throw new ConflictException({ code: "ENTITLEMENT_VALIDITY_INVALID", message: "validTo must be in the future." });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${robotId}::text, 2))`;
      const robot = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.robots WHERE id=${robotId}::uuid`;
      const org = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.organizations WHERE id=${dto.organizationId}::uuid`;
      if (!robot[0] || !org[0]) throw new NotFoundException("Robot resource or organization was not found.");
      const active = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM public.org_entitlements WHERE robot_id=${robotId}::uuid AND organization_id=${dto.organizationId}::uuid AND resource_type='robot'
          AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now()) LIMIT 1`;
      if (active[0]) throw new ConflictException({ code: "ENTITLEMENT_EXISTS", message: "This organization already holds an active entitlement for this robot." });
      const rows = await tx.$queryRaw<Array<{ id: string; valid_from: Date; valid_to: Date | null }>>`
        INSERT INTO public.org_entitlements(organization_id,resource_type,robot_id,valid_from,valid_to,created_by)
        VALUES(${dto.organizationId}::uuid,'robot',${robotId}::uuid,now(),${dto.validTo ?? null}::timestamptz,${user.vistaUserId}::uuid) RETURNING id,valid_from,valid_to`;
      return { id: rows[0]!.id, organizationId: dto.organizationId, robotId, validFrom: rows[0]!.valid_from, validTo: rows[0]!.valid_to };
    });
  }

  async revokeEntitlement(user: AuthenticatedUser, robotId: string, entitlementId: string) {
    this.requireSystemAdministrator(user);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; organization_id: string }>>`
      UPDATE public.org_entitlements SET valid_to=now() WHERE id=${entitlementId}::uuid AND robot_id=${robotId}::uuid AND resource_type='robot'
        AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now()) RETURNING id,organization_id`;
    if (!rows[0]) throw new NotFoundException("Active entitlement was not found.");
    // New executions are blocked by the ended entitlement at once. An open reservation of that organization ends through controlled termination.
    await this.terminateOpenSessions({ robotId, organizationId: rows[0].organization_id }, "entitlement_revoked");
    return { revoked: true, entitlementId, organizationId: rows[0].organization_id };
  }

  private async terminateOpenSessions(filter: { robotId: string; organizationId?: string }, reason: string) {
    if (!(await this.labReady())) return;
    const open = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.classroom_lab_sessions WHERE robot_id=${filter.robotId}::uuid AND state IN ('active','terminating','quarantined')
        AND (${filter.organizationId ?? null}::uuid IS NULL OR organization_id=${filter.organizationId ?? null}::uuid)`;
    for (const session of open) await this.labSessions.terminate(session.id, { userId: null, role: "system", reason });
  }
}
