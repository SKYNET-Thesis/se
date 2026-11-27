import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { createDb, createStudent, createWorld, describeDb, joinClassroom, type Db } from './db-test-support';
import { EducationAdminService } from '../education-admin/education-admin.service';
import { LabSessionSchemaProbe } from './lab-session-schema';
import { LabSessionService } from './lab-session.service';
import { LearningScopeService } from './learning-scope.service';
import { PhysicalExecutionService } from './physical-execution.service';

/**
 * Release compatibility of staged migration S. This file is meant to run twice against disposable databases: once WITHOUT S ("old schema") and once WITH S
 * ("new schema"). Combinations covered here:
 *   new API + old schema, new API + new schema, old API SQL + old schema, old API SQL + new schema (intentionally blocked), rollback after many-to-many.
 */
describeDb('real PostgreSQL migration S release compatibility', () => {
  jest.setTimeout(60_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let probe: LabSessionSchemaProbe; let ready = false;
  let admin: EducationAdminService; let physical: PhysicalExecutionService; let labs: LabSessionService; let scope: LearningScopeService;

  beforeAll(async () => {
    await db.$connect();
    adminUserId = (await db.users.create({ data: { full_name: 'school admin', signup_method: 'admin_created', status: 'active' } })).id;
    scope = new LearningScopeService(db as never);
    probe = new LabSessionSchemaProbe(db as never);
    ready = await probe.isReady();
    admin = new EducationAdminService(db as never, scope, {} as never, {} as never, {} as never, undefined, probe);
    physical = new PhysicalExecutionService(db as never, {} as never, undefined, undefined, undefined, undefined, probe);
    labs = new LabSessionService(db as never, scope, physical, undefined, probe);
  });
  afterAll(async () => { await db.$disconnect(); });

  let adminUserId = '';
  const schoolAdmin = (organizationId: string) => ({ authUserId: 'a', vistaUserId: adminUserId, email: 'a@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [{ id: 'm', organizationId, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.resource.allocate'] }] }) as never;
  const robot = async (orgId: string) => {
    const suffix = randomUUID().slice(0, 8);
    const item = await db.robots.create({ data: { name: `Compat ${suffix}`, serial_no: `CMP-${suffix}`, model_name: 'SO-101' } });
    await db.org_entitlements.create({ data: { organization_id: orgId, resource_type: 'robot', robot_id: item.id } });
    return item;
  };

  /** classroom + student + published assignment + attempt, enough for the authoritative scope query. */
  async function attemptWorld() {
    const x = await createWorld(db);
    const permission = await db.permissions.upsert({ where: { code: 'learning.experiment.execute' }, create: { code: 'learning.experiment.execute' }, update: {} });
    const studentRole = await db.roles.upsert({ where: { code: 'student' }, create: { code: 'student', name: 'Student', scope: 'organization' }, update: {} });
    await db.role_permissions.upsert({ where: { role_id_permission_id: { role_id: studentRole.id, permission_id: permission.id } }, create: { role_id: studentRole.id, permission_id: permission.id }, update: {} });
    const student = await createStudent(db, { org: x.org, role: studentRole }); await joinClassroom(db, student, x.room.id);
    const author = await db.users.create({ data: { full_name: 'author', signup_method: 'admin_created', status: 'active' } });
    const assignment = await db.learning_assignments.create({ data: { lesson_id: x.lesson.id, title: 'A' } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: assignment.id, status: 'published', published_by: author.id } });
    const program = await db.learning_programs.create({ data: { owner_user_id: student.user.id, assignment_id: assignment.id, title: 'P', robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } } });
    const attempt = await db.learning_assignment_attempts.create({ data: { classroom_assignment_id: delivery.id, learner_user_id: student.user.id, program_id: program.id, attempt_number: 1, status: 'submitted', submitted_at: new Date(), program_snapshot: {} } });
    const user = { authUserId: 'a', vistaUserId: student.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [] } as never;
    return { x, attempt, user };
  }
  const scopeOf = (w: Awaited<ReturnType<typeof attemptWorld>>) => (physical as unknown as { resolveScope: (d: unknown, u: unknown, a: string) => Promise<Record<string, unknown>> }).resolveScope(db, w.user, w.attempt.id);
  const allocate = async (classroomId: string, robotId: string) => {
    const creator = await db.users.create({ data: { full_name: 'allocator', signup_method: 'admin_created', status: 'active' } });
    await db.learning_classroom_robot_allocations.create({ data: { classroom_id: classroomId, robot_id: robotId, created_by_user_id: creator.id } });
  };

  it('new API: the authoritative scope resolves the classroom robot on either schema and applies the reservation gate only when S is installed', async () => {
    const w = await attemptWorld();
    const r = await robot(w.x.org.id);
    await allocate(w.x.room.id, r.id);
    const scopeRow = await scopeOf(w);
    expect(scopeRow.robot_id).toBe(r.id);
    expect(scopeRow.lab_session_id ?? null).toBeNull();
    expect(scopeRow.lab_gate).toBe(ready);                         // legacy transition: false (no gate); with S: true (a reservation is required)
    if (ready) {
      const instructorUser = await db.users.create({ data: { full_name: 'inst', signup_method: 'admin_created', status: 'active' } });
      await db.$executeRaw`INSERT INTO public.classroom_lab_sessions(organization_id,classroom_id,robot_id,instructor_user_id,expires_at) VALUES(${w.x.org.id}::uuid,${w.x.room.id}::uuid,${r.id}::uuid,${instructorUser.id}::uuid,now()+interval '1 hour')`;
      expect((await scopeOf(w)).lab_session_id).toBeTruthy();
    }
  });

  it('new API: allocation works on both schemas; a second robot per classroom needs S; Lab Session endpoints answer 503 until S', async () => {
    const x = await createWorld(db);
    const a = await robot(x.org.id); const b = await robot(x.org.id);
    await admin.allocateRobot(schoolAdmin(x.org.id), x.room.id, { robotId: a.id } as never);
    await expect(admin.allocateRobot(schoolAdmin(x.org.id), x.room.id, { robotId: a.id } as never)).rejects.toMatchObject({ response: { code: 'ROBOT_ALREADY_ALLOCATED' } });
    if (ready) {
      await expect(admin.allocateRobot(schoolAdmin(x.org.id), x.room.id, { robotId: b.id } as never)).resolves.toBeDefined();
      expect(await db.learning_classroom_robot_allocations.count({ where: { classroom_id: x.room.id } })).toBe(2);
    } else {
      await expect(admin.allocateRobot(schoolAdmin(x.org.id), x.room.id, { robotId: b.id } as never)).rejects.toMatchObject({ response: { code: 'MULTI_ROBOT_ALLOCATION_NOT_ENABLED' } });
      expect(await db.learning_classroom_robot_allocations.count({ where: { classroom_id: x.room.id } })).toBe(1);
      await expect(labs.classroomRobots(schoolAdmin(x.org.id), x.room.id)).rejects.toMatchObject({ response: { code: 'LAB_SESSION_SCHEMA_NOT_READY' } });
      await expect(admin.removeRobotAllocation(schoolAdmin(x.org.id), x.room.id, a.id)).resolves.toMatchObject({ removed: true });   // no Lab Session table to consult
    }
  });

  it('old API SQL: the deployed upsert ON CONFLICT (classroom_id) works on the old schema and is blocked (42P10) on the new schema', async () => {
    const x = await createWorld(db);
    const a = await robot(x.org.id);
    const creator = await db.users.create({ data: { full_name: 'old api', signup_method: 'admin_created', status: 'active' } });
    const oldUpsert = () => db.$queryRaw`INSERT INTO public.learning_classroom_robot_allocations(classroom_id,robot_id,created_by_user_id) VALUES(${x.room.id}::uuid,${a.id}::uuid,${creator.id}::uuid) ON CONFLICT (classroom_id) DO UPDATE SET robot_id=EXCLUDED.robot_id RETURNING id`;
    if (ready) await expect(oldUpsert()).rejects.toThrow(/42P10|no unique or exclusion constraint/);
    else await expect(oldUpsert()).resolves.toBeDefined();
  });

  it('rollback to the old uniqueness is refused once many-to-many data exists, and nothing is deleted (new schema only)', async () => {
    if (!ready) return;
    const x = await createWorld(db);
    const a = await robot(x.org.id); const b = await robot(x.org.id);
    await allocate(x.room.id, a.id); await allocate(x.room.id, b.id);
    const instructorUser = await db.users.create({ data: { full_name: 'inst', signup_method: 'admin_created', status: 'active' } });
    await db.$executeRaw`INSERT INTO public.classroom_lab_sessions(organization_id,classroom_id,robot_id,instructor_user_id,expires_at,state,ended_at,ended_by_role) VALUES(${x.org.id}::uuid,${x.room.id}::uuid,${a.id}::uuid,${instructorUser.id}::uuid,now()+interval '1 hour','released',now(),'instructor')`;
    const rollback = db.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE public.learning_classroom_robot_allocations ADD CONSTRAINT learning_classroom_robot_allocations_classroom_id_key UNIQUE (classroom_id)`;
      throw new Error('SENTINEL: the rollback statement unexpectedly succeeded');
    });
    await expect(rollback).rejects.toThrow(/23505|could not create unique index|duplicate key/);
    expect(await db.learning_classroom_robot_allocations.count({ where: { classroom_id: x.room.id } })).toBe(2);
    const history = await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM public.classroom_lab_sessions WHERE classroom_id=${x.room.id}::uuid`;
    expect(history[0]?.n).toBe(1);
  });

  it('a duplicate pair is never accepted on either schema', async () => {
    const x = await createWorld(db);
    const a = await robot(x.org.id);
    await allocate(x.room.id, a.id);
    await expect(allocate(x.room.id, a.id)).rejects.toThrow();
    expect(ConflictException).toBeDefined();
  });
});
