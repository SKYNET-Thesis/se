import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { createDb, createSystemAdmin, createWorld, describeDb, type Db } from '../learning/db-test-support';
import { LabSessionService } from '../learning/lab-session.service';
import { LearningScopeService } from '../learning/learning-scope.service';
import { RobotResourceService } from './robot-resource.service';

/** Real PostgreSQL: System Administrator Robot Resource and entitlement management (needs staged migration S on the disposable database). */
describeDb('real PostgreSQL System Administrator robot resources', () => {
  jest.setTimeout(60_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let robots: RobotResourceService; let labs: LabSessionService;
  const stop = { calls: 0 };
  const physical = { hasActiveControlSession: async () => false, requestRobotStop: async () => { stop.calls += 1; return { active: false, stopRequested: false, runtimeUnavailable: false }; } };
  let sysadmin: never;
  const schoolAdmin = (organizationId: string) => ({ authUserId: 'a', vistaUserId: randomUUID(), email: 'a@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [{ id: 'm', organizationId, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.resource.allocate'] }] }) as never;

  beforeAll(async () => {
    await db.$connect();
    sysadmin = await createSystemAdmin(db) as never;
    const scope = new LearningScopeService(db as never);
    labs = new LabSessionService(db as never, scope, physical as never);
    robots = new RobotResourceService(db as never, scope, labs);
  });
  afterAll(async () => { await db.$disconnect(); });

  it('registers a logical resource, rejects duplicates and non-administrators, and never reports it ready or connected', async () => {
    const serialNo = `SR-${randomUUID().slice(0, 8)}`;
    const created = await robots.create(sysadmin, { serialNo, name: 'Resource One' }) as unknown as Record<string, unknown>;
    expect(created).toMatchObject({ serialNo, name: 'Resource One', modelName: 'SO-101', status: 'available', commissioned: false, connectivity: 'not_reported' });
    await expect(robots.create(sysadmin, { serialNo, name: 'Dup' })).rejects.toMatchObject({ response: { code: 'ROBOT_SERIAL_EXISTS' } });
    const world = await createWorld(db);
    await expect(robots.create(schoolAdmin(world.org.id), { serialNo: `SR-${randomUUID().slice(0, 8)}`, name: 'Nope' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(robots.list(schoolAdmin(world.org.id))).rejects.toBeInstanceOf(NotFoundException);
    expect((await robots.list(sysadmin) as unknown as Array<{ serialNo: string; commissioned: boolean }>).find((item) => item.serialNo === serialNo)?.commissioned).toBe(false);
  });

  it('grants, de-duplicates and revokes entitlements; revocation ends the organization\'s open Lab Session through controlled termination', async () => {
    const world = await createWorld(db);
    const robot = await robots.create(sysadmin, { serialNo: `SR-${randomUUID().slice(0, 8)}`, name: 'Entitled' }) as unknown as { id: string };
    const granted = await robots.grantEntitlement(sysadmin, robot.id, { organizationId: world.org.id });
    await expect(robots.grantEntitlement(sysadmin, robot.id, { organizationId: world.org.id })).rejects.toBeInstanceOf(ConflictException);
    await expect(robots.grantEntitlement(sysadmin, robot.id, { organizationId: world.org.id, validTo: new Date(Date.now() - 1000).toISOString() })).rejects.toMatchObject({ response: { code: 'ENTITLEMENT_VALIDITY_INVALID' } });
    // an open reservation of that organization
    const creator = await db.users.create({ data: { full_name: 'x', signup_method: 'admin_created', status: 'active' } });
    await db.learning_classroom_robot_allocations.create({ data: { classroom_id: world.room.id, robot_id: robot.id, created_by_user_id: creator.id } });
    await db.$executeRaw`INSERT INTO public.classroom_lab_sessions(organization_id,classroom_id,robot_id,instructor_user_id,expires_at) VALUES(${world.org.id}::uuid,${world.room.id}::uuid,${robot.id}::uuid,${creator.id}::uuid,now()+interval '1 hour')`;
    await expect(robots.revokeEntitlement(schoolAdmin(world.org.id), robot.id, granted.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(robots.revokeEntitlement(sysadmin, robot.id, granted.id)).resolves.toMatchObject({ revoked: true });
    const rows = await db.$queryRaw<Array<{ state: string; ended_by_role: string; end_reason: string }>>`SELECT state,ended_by_role,end_reason FROM public.classroom_lab_sessions WHERE robot_id=${robot.id}::uuid`;
    expect(rows[0]).toMatchObject({ state: 'released', ended_by_role: 'system', end_reason: 'entitlement_revoked' });
    await expect(robots.revokeEntitlement(sysadmin, robot.id, granted.id)).rejects.toBeInstanceOf(NotFoundException);   // already ended
    // history is preserved: the allocation row and the ended entitlement are still there
    expect(await db.learning_classroom_robot_allocations.count({ where: { robot_id: robot.id } })).toBe(1);
    expect(await db.org_entitlements.count({ where: { robot_id: robot.id } })).toBe(1);
  });

  it('retires a resource instead of deleting it and terminates its open reservations', async () => {
    const world = await createWorld(db);
    const robot = await robots.create(sysadmin, { serialNo: `SR-${randomUUID().slice(0, 8)}`, name: 'Retire me' }) as unknown as { id: string };
    await robots.grantEntitlement(sysadmin, robot.id, { organizationId: world.org.id });
    const creator = await db.users.create({ data: { full_name: 'x', signup_method: 'admin_created', status: 'active' } });
    await db.$executeRaw`INSERT INTO public.classroom_lab_sessions(organization_id,classroom_id,robot_id,instructor_user_id,expires_at) VALUES(${world.org.id}::uuid,${world.room.id}::uuid,${robot.id}::uuid,${creator.id}::uuid,now()+interval '1 hour')`;
    const updated = await robots.update(sysadmin, robot.id, { status: 'retired', name: 'Retired' }) as unknown as { status: string; name: string; openLabSessions: unknown[] };
    expect(updated).toMatchObject({ status: 'retired', name: 'Retired' });
    expect(updated.openLabSessions).toHaveLength(0);
  });
});
