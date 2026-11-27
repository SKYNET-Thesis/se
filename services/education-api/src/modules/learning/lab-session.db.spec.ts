import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { createClassroom, createDb, createWorld, describeDb, type Db } from './db-test-support';
import { LabSessionService } from './lab-session.service';
import { LearningScopeService } from './learning-scope.service';
import { EducationAdminService } from '../education-admin/education-admin.service';

/**
 * Real PostgreSQL proof of the Classroom Lab Session guarantees (needs staged migration S on the disposable database):
 * Layer A (one open reservation per robot, partial unique index + robot advisory lock), idempotency, controlled termination, expiry, recovery.
 */
describeDb('real PostgreSQL Classroom Lab Session', () => {
  jest.setTimeout(60_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  const control = { active: false, runtimeUnavailable: false, stops: 0 };
  const physical = {
    hasActiveControlSession: async () => control.active,
    edgeStopUnconfirmed: async () => false,
    requestRobotStop: async () => { control.stops += 1; return { active: control.active, stopRequested: !control.runtimeUnavailable, runtimeUnavailable: control.active && control.runtimeUnavailable }; },
  };
  let service: LabSessionService;
  let admin: EducationAdminService;

  beforeAll(async () => {
    await db.$connect();
    const scope = new LearningScopeService(db as never);
    service = new LabSessionService(db as never, scope, physical as never);
    admin = new EducationAdminService(db as never, scope, {} as never, {} as never, {} as never);
  });
  afterAll(async () => { await db.$disconnect(); });
  beforeEach(() => { control.active = false; control.runtimeUnavailable = false; control.stops = 0; });

  const user = (id: string, memberships: unknown[] = []) => ({ authUserId: 'a', vistaUserId: id, email: 'x@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships }) as never;

  async function instructor(x: Awaited<ReturnType<typeof createWorld>>, classroomId: string) {
    const permission = await db.permissions.upsert({ where: { code: 'education.lab_session.manage' }, create: { code: 'education.lab_session.manage' }, update: {} });
    const role = await db.roles.create({ data: { code: `lab-instructor-${randomUUID().slice(0, 8)}`, name: 'Lab instructor', scope: 'organization' } });
    await db.role_permissions.create({ data: { role_id: role.id, permission_id: permission.id } });
    const row = await db.users.create({ data: { full_name: 'Lab instructor', signup_method: 'admin_created', status: 'active' } });
    const membership = await db.memberships.create({ data: { user_id: row.id, organization_id: x.org.id, role_id: role.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: classroomId, user_id: row.id, membership_id: membership.id, classroom_role: 'teacher', status: 'active' } });
    return user(row.id);
  }

  async function robot(orgIds: string[]) {
    const suffix = randomUUID().slice(0, 8);
    const item = await db.robots.create({ data: { name: `Lab ${suffix}`, serial_no: `LAB-${suffix}`, model_name: 'SO-101' } });
    for (const orgId of orgIds) await db.org_entitlements.create({ data: { organization_id: orgId, resource_type: 'robot', robot_id: item.id } });
    return item;
  }
  const allocate = async (classroomId: string, robotId: string) => {
    const creator = await db.users.create({ data: { full_name: 'allocator', signup_method: 'admin_created', status: 'active' } });
    await db.learning_classroom_robot_allocations.create({ data: { classroom_id: classroomId, robot_id: robotId, created_by_user_id: creator.id } });
  };
  const open = (robotId: string) => db.$queryRaw<Array<{ id: string; state: string; classroom_id: string }>>`SELECT id,state,classroom_id FROM public.classroom_lab_sessions WHERE robot_id=${robotId}::uuid AND state IN ('active','terminating','quarantined')`;

  /** Two classrooms of one organization sharing Robot A, plus Classroom 2 also holding Robot B. */
  async function world() {
    const x = await createWorld(db);
    const room2 = await createClassroom(db, x.org.id, x.offering.id, `b-${x.suffix}`);
    const robotA = await robot([x.org.id]); const robotB = await robot([x.org.id]);
    await allocate(x.room.id, robotA.id); await allocate(room2.id, robotA.id); await allocate(room2.id, robotB.id);
    return { x, room1: x.room, room2, robotA, robotB, teacher1: await instructor(x, x.room.id), teacher2: await instructor(x, room2.id) };
  }

  it('reserves a robot for one classroom, refuses the other, is idempotent, and survives a fresh service instance (restart)', async () => {
    const w = await world();
    const first = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id });
    expect(first.state).toBe('active');
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_RESERVED_BY_ANOTHER_CLASSROOM' } });
    await expect(service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id })).resolves.toMatchObject({ id: first.id });   // retry is idempotent
    const restarted = new LabSessionService(db as never, new LearningScopeService(db as never), physical as never);
    expect((await restarted.classroomSessions(w.teacher1, w.room1.id)).map((item) => item.id)).toContain(first.id);
    // Robot B is a different resource: Classroom 2 can reserve it independently.
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotB.id })).resolves.toMatchObject({ state: 'active' });
    expect(await open(w.robotA.id)).toHaveLength(1);
  });

  it('serializes simultaneous Start requests from two classrooms: exactly one wins, never two open rows', async () => {
    for (let round = 0; round < 5; round += 1) {
      const w = await world();
      const results = await Promise.allSettled([
        service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id }),
        service.start(w.teacher2, w.room2.id, { robotId: w.robotA.id }),
      ]);
      expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
      expect(await open(w.robotA.id)).toHaveLength(1);
    }
  });

  it('enforces authorization, entitlement, allocation and robot status when starting', async () => {
    const w = await world();
    const outsider = await robot([w.x.org.id]);                       // entitled but not allocated to classroom 1
    await expect(service.start(w.teacher1, w.room1.id, { robotId: outsider.id })).rejects.toMatchObject({ response: { code: 'ROBOT_NOT_AVAILABLE_FOR_CLASSROOM' } });
    await expect(service.start(w.teacher1, w.room2.id, { robotId: w.robotA.id })).rejects.toBeInstanceOf(NotFoundException);   // not their classroom
    await expect(service.start(user(randomUUID()), w.room1.id, { robotId: w.robotA.id })).rejects.toBeInstanceOf(NotFoundException);
    await db.$executeRaw`UPDATE public.org_entitlements SET valid_to=now()-interval '1 minute',valid_from=now()-interval '2 minutes' WHERE robot_id=${w.robotB.id}::uuid`;
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotB.id })).rejects.toMatchObject({ response: { code: 'ROBOT_NOT_AVAILABLE_FOR_CLASSROOM' } });
    await db.robots.update({ where: { id: w.robotA.id }, data: { status: 'maintenance' } });
    await expect(service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_NOT_AVAILABLE_FOR_CLASSROOM' } });
    expect(await open(w.robotA.id)).toHaveLength(0);
  });

  it('refuses to reserve a robot that still has an unfinished control session', async () => {
    const w = await world();
    control.active = true;
    await expect(service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_IN_USE' } });
  });

  it('extends within limits using database time and never revives an expired or ending session', async () => {
    const w = await world();
    const session = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id, durationMinutes: 30 });
    const extended = await service.extend(w.teacher1, session.id, { minutes: 30 });
    expect(extended.extensionCount).toBe(1);
    expect(new Date(extended.expiresAt).getTime() - new Date(session.expiresAt).getTime()).toBe(30 * 60_000);
    await expect(service.extend(w.teacher1, session.id, { minutes: 4 })).rejects.toMatchObject({ response: { code: 'LAB_SESSION_EXTENSION_INVALID' } });
    await expect(service.extend(w.teacher2, session.id, { minutes: 30 })).rejects.toBeInstanceOf(NotFoundException);   // other classroom's instructor
    await db.$executeRaw`UPDATE public.classroom_lab_sessions SET expires_at=now()-interval '1 second',started_at=now()-interval '1 hour' WHERE id=${session.id}::uuid`;
    await expect(service.extend(w.teacher1, session.id, { minutes: 30 })).rejects.toMatchObject({ response: { code: 'LAB_SESSION_NOT_ACTIVE' } });
  });

  it('ends a session safely: waits for the active control session, releases only afterwards, then another classroom can reserve', async () => {
    const w = await world();
    const session = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id });
    await expect(service.end(w.teacher2, session.id)).rejects.toBeInstanceOf(NotFoundException);   // unauthorized instructor
    control.active = true;                                                                           // a student run is in progress
    const ending = await service.end(w.teacher1, session.id);
    expect(ending.state).toBe('terminating');                                                        // NOT released while the controller is active
    expect(control.stops).toBe(1);
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_RESERVED_BY_ANOTHER_CLASSROOM' } });
    await expect(service.end(w.teacher1, session.id)).resolves.toMatchObject({ state: 'terminating' });   // idempotent retry
    control.active = false;                                                                          // the run reached a terminal state
    const released = await service.end(w.teacher1, session.id);
    expect(released.state).toBe('released');
    expect(await open(w.robotA.id)).toHaveLength(0);
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotA.id })).resolves.toMatchObject({ state: 'active' });
    // The previous classroom no longer holds a reservation, so a new one is needed (and is refused while classroom 2 holds it).
    await expect(service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_RESERVED_BY_ANOTHER_CLASSROOM' } });
  });

  it('quarantines when the runtime cannot confirm the stop, and never releases or transfers the robot', async () => {
    const w = await world();
    const session = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id });
    control.active = true; control.runtimeUnavailable = true;
    const result = await service.end(w.teacher1, session.id);
    expect(result.state).toBe('quarantined');
    expect(result.recovery).toMatch(/could not confirm/i);
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_RESERVED_BY_ANOTHER_CLASSROOM' } });
    control.active = false; control.runtimeUnavailable = false;                                      // recovery: the run finished
    expect((await service.reconcile()).retried).toBeGreaterThanOrEqual(1);
    expect(await open(w.robotA.id)).toHaveLength(0);
  });

  it('expiry moves to controlled termination, blocks new students, and does not release while a controller may be active', async () => {
    const w = await world();
    const session = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id, durationMinutes: 5 });
    await db.$executeRaw`UPDATE public.classroom_lab_sessions SET expires_at=now()-interval '1 second',started_at=now()-interval '10 minutes' WHERE id=${session.id}::uuid`;
    control.active = true;
    await service.reconcile();
    const [row] = await open(w.robotA.id);
    expect(row?.state).toBe('terminating');
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_RESERVED_BY_ANOTHER_CLASSROOM' } });
    control.active = false;
    await service.reconcile();
    expect(await open(w.robotA.id)).toHaveLength(0);
    const history = await db.$queryRaw<Array<{ ended_by_role: string; end_reason: string }>>`SELECT ended_by_role,end_reason FROM public.classroom_lab_sessions WHERE id=${session.id}::uuid`;
    expect(history[0]).toMatchObject({ ended_by_role: 'expiry', end_reason: 'expired' });
  });

  it('School Admin Force End needs confirmation, a reason and their own organization, and uses the same safe termination', async () => {
    const w = await world();
    const session = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id });
    const persisted = await db.users.create({ data: { full_name: 'School admin', signup_method: 'admin_created', status: 'active' } });
    const adminOf = (organizationId: string) => user(persisted.id, [{ id: 'm', organizationId, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.resource.allocate'] }]);
    const foreign = await createWorld(db);
    await expect(service.forceEnd(adminOf(foreign.org.id), session.id, { reason: 'abandoned session', confirm: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.forceEnd(adminOf(w.x.org.id), session.id, { reason: '', confirm: true })).rejects.toMatchObject({ response: { code: 'LAB_SESSION_FORCE_END_REASON_REQUIRED' } });
    await expect(service.forceEnd(adminOf(w.x.org.id), session.id, { reason: 'abandoned session', confirm: false })).rejects.toMatchObject({ response: { code: 'LAB_SESSION_FORCE_END_REASON_REQUIRED' } });
    control.active = true;
    expect((await service.forceEnd(adminOf(w.x.org.id), session.id, { reason: 'abandoned session', confirm: true })).state).toBe('terminating');   // never bypasses an unresolved controller
    control.active = false;
    expect((await service.forceEnd(adminOf(w.x.org.id), session.id, { reason: 'abandoned session', confirm: true })).state).toBe('released');
    const audit = await db.$queryRaw<Array<{ ended_by_role: string; end_reason: string }>>`SELECT ended_by_role,end_reason FROM public.classroom_lab_sessions WHERE id=${session.id}::uuid`;
    expect(audit[0]).toMatchObject({ ended_by_role: 'school_admin' }); expect(audit[0]?.end_reason).toContain('abandoned session');
  });

  it('keeps the reservation while allocation removal is refused, and derives per-classroom robot status without leaking the other classroom', async () => {
    const w = await world();
    const schoolAdmin = user(randomUUID(), [{ id: 'm', organizationId: w.x.org.id, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.resource.allocate'] }]);
    const session = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id });
    await expect(admin.removeRobotAllocation(schoolAdmin, w.room1.id, w.robotA.id)).rejects.toMatchObject({ response: { code: 'LAB_SESSION_OPEN' } });
    const mine = (await service.classroomRobots(w.teacher1, w.room1.id)).find((item) => item.robotId === w.robotA.id);
    expect(mine).toMatchObject({ reservation: 'this_classroom', status: 'reserved_for_this_classroom', labSessionId: session.id });
    const theirs = (await service.classroomRobots(w.teacher2, w.room2.id)).find((item) => item.robotId === w.robotA.id);
    expect(theirs).toMatchObject({ reservation: 'other_classroom', status: 'reserved_by_another_classroom', labSessionId: null, controllerActive: null });
    expect(JSON.stringify(theirs)).not.toContain(w.room1.id);
    await expect(service.end(w.teacher1, session.id)).resolves.toMatchObject({ state: 'released' });
    await expect(admin.removeRobotAllocation(schoolAdmin, w.room1.id, w.robotA.id)).resolves.toMatchObject({ removed: true });
  });

  it('allows the same robot in several classrooms and several robots in one classroom, but never a duplicate pair', async () => {
    const w = await world();
    const count = await db.learning_classroom_robot_allocations.count({ where: { classroom_id: w.room2.id } });
    expect(count).toBe(2);
    await expect(allocate(w.room2.id, w.robotA.id)).rejects.toThrow();
  });

  it('Stop Execution stops only the current run: the reservation stays active, only the session\'s instructor may use it, and an ended session refuses it', async () => {
    const w = await world();
    const session = await service.start(w.teacher1, w.room1.id, { robotId: w.robotA.id });
    await expect(service.stopExecution(w.teacher2, session.id)).rejects.toBeInstanceOf(NotFoundException);
    control.active = true;
    await expect(service.stopExecution(w.teacher1, session.id)).resolves.toMatchObject({ controlActive: true, stopRequested: true });
    expect(control.stops).toBe(1);
    expect((await open(w.robotA.id))[0]?.state).toBe('active');                                      // reservation preserved
    await expect(service.start(w.teacher2, w.room2.id, { robotId: w.robotA.id })).rejects.toMatchObject({ response: { code: 'ROBOT_RESERVED_BY_ANOTHER_CLASSROOM' } });
    control.active = false;
    await expect(service.stopExecution(w.teacher1, session.id)).resolves.toMatchObject({ controlActive: false });
    await service.end(w.teacher1, session.id);
    await expect(service.stopExecution(w.teacher1, session.id)).rejects.toMatchObject({ response: { code: 'LAB_SESSION_NOT_ACTIVE' } });
  });
});
