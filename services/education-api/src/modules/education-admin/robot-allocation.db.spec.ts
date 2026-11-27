import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { createDb, createWorld, describeDb, type Db } from '../learning/db-test-support';
import { LearningScopeService } from '../learning/learning-scope.service';
import { LearningService } from '../learning/learning.service';
import { ProgressionService } from '../learning/progression.service';
import { EducationAdminService } from './education-admin.service';

describeDb('real PostgreSQL WF-01 classroom robot allocation', () => {
  jest.setTimeout(30_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let scope: LearningScopeService;
  let educationAdmin: EducationAdminService;
  let learning: LearningService;

  beforeAll(async () => {
    await db.$connect();
    scope = new LearningScopeService(db as never);
    educationAdmin = new EducationAdminService(db as never, scope, {} as never, {} as never, {} as never);
    learning = new LearningService(db as never, scope, new ProgressionService(db as never, scope));
  });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture() {
    const x = await createWorld(db);
    const teacherRole = await db.roles.create({ data: { code: `wf01-teacher-${x.suffix}`, name: 'WF-01 teacher', scope: 'organization' } });
    const deliveryPermission = await db.permissions.upsert({ where: { code: 'learning.delivery.manage' }, create: { code: 'learning.delivery.manage' }, update: {} });
    await db.role_permissions.create({ data: { role_id: teacherRole.id, permission_id: deliveryPermission.id } });
    const teacher = await db.users.create({ data: { full_name: 'WF-01 teacher', signup_method: 'admin_created', status: 'active' } });
    const teacherMembership = await db.memberships.create({ data: { user_id: teacher.id, organization_id: x.org.id, role_id: teacherRole.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: x.room.id, user_id: teacher.id, membership_id: teacherMembership.id, classroom_role: 'teacher', status: 'active' } });
    const schoolAdminRow = await db.users.create({ data: { full_name: 'WF-01 admin', signup_method: 'admin_created', status: 'active' } });
    const schoolAdmin = { authUserId: 'a', vistaUserId: schoolAdminRow.id, email: 'a@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: 'm', organizationId: x.org.id, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.resource.allocate'] }] } as never;
    return { x, teacher, teacherUser: { authUserId: 'a', vistaUserId: teacher.id, email: 't@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [] } as never, schoolAdmin };
  }

  async function robot(orgId: string, status = 'available', suffix = randomUUID().slice(0, 8)) {
    const item = await db.robots.create({ data: { name: `WF-01 ${suffix}`, serial_no: `WF01-${suffix}`, model_name: 'SO-101', status } });
    const entitlement = await db.org_entitlements.create({ data: { organization_id: orgId, resource_type: 'robot', robot_id: item.id } });
    return { item, entitlement };
  }

  it('lists only available robots with current organization entitlements', async () => {
    const f = await fixture();
    const entitled = await robot(f.x.org.id, 'available');
    const maintenance = await robot(f.x.org.id, 'maintenance');
    const expired = await robot(f.x.org.id, 'available');
    await db.org_entitlements.update({ where: { id: expired.entitlement.id }, data: { valid_from: new Date(Date.now() - 120_000), valid_to: new Date(Date.now() - 60_000) } });

    const listed = await educationAdmin.eligibleRobots(f.schoolAdmin, f.x.room.id) as Array<{ id: string }>;
    expect(listed.map((item) => item.id)).toEqual([entitled.item.id]);
    expect(listed.some((item) => item.id === maintenance.item.id || item.id === expired.item.id)).toBe(false);
  });

  it('allocates several robots (many-to-many), rejects a duplicate, removes one, and the instructor sees only current valid allocations', async () => {
    const f = await fixture();
    const first = await robot(f.x.org.id);
    const replacement = await robot(f.x.org.id);
    await educationAdmin.allocateRobot(f.schoolAdmin, f.x.room.id, { robotId: first.item.id } as never);
    await expect(learning.classroom(f.teacherUser, f.x.room.id)).resolves.toMatchObject({ allocated_robot: { id: first.item.id } });

    await educationAdmin.allocateRobot(f.schoolAdmin, f.x.room.id, { robotId: replacement.item.id } as never);
    await expect(db.learning_classroom_robot_allocations.count({ where: { classroom_id: f.x.room.id } })).resolves.toBe(2);
    const both = await learning.classroom(f.teacherUser, f.x.room.id) as unknown as { allocated_robots: Array<{ id: string }> };
    expect(both.allocated_robots.map((item) => item.id)).toEqual([first.item.id, replacement.item.id]);
    await expect(educationAdmin.allocateRobot(f.schoolAdmin, f.x.room.id, { robotId: replacement.item.id } as never)).rejects.toBeInstanceOf(ConflictException);
    await educationAdmin.removeRobotAllocation(f.schoolAdmin, f.x.room.id, first.item.id);
    await expect(db.learning_classroom_robot_allocations.count({ where: { classroom_id: f.x.room.id } })).resolves.toBe(1);
    await expect(learning.classroom(f.teacherUser, f.x.room.id)).resolves.toMatchObject({ allocated_robot: { id: replacement.item.id } });
    await expect(educationAdmin.removeRobotAllocation(f.schoolAdmin, f.x.room.id, first.item.id)).rejects.toBeInstanceOf(NotFoundException);

    await db.org_entitlements.update({ where: { id: replacement.entitlement.id }, data: { valid_from: new Date(Date.now() - 120_000), valid_to: new Date(Date.now() - 60_000) } });
    await expect(learning.classroom(f.teacherUser, f.x.room.id)).resolves.toMatchObject({ allocated_robot: null });
    await expect(educationAdmin.eligibleRobots(f.schoolAdmin, f.x.room.id)).resolves.not.toContainEqual(expect.objectContaining({ id: replacement.item.id }));
    await expect(educationAdmin.allocateRobot(f.schoolAdmin, f.x.room.id, { robotId: replacement.item.id } as never)).rejects.toBeInstanceOf(NotFoundException);

    await db.org_entitlements.delete({ where: { id: first.entitlement.id } });
    await expect(learning.classroom(f.teacherUser, f.x.room.id)).resolves.toMatchObject({ allocated_robot: null });
    await expect(educationAdmin.eligibleRobots(f.schoolAdmin, f.x.room.id)).resolves.not.toContainEqual(expect.objectContaining({ id: first.item.id }));
    await expect(educationAdmin.allocateRobot(f.schoolAdmin, f.x.room.id, { robotId: first.item.id } as never)).rejects.toBeInstanceOf(NotFoundException);

    await db.robots.update({ where: { id: replacement.item.id }, data: { status: 'retired' } });
    await expect(learning.classroom(f.teacherUser, f.x.room.id)).resolves.toMatchObject({ allocated_robot: null });
  });

  it('rejects unauthorized, cross-organization and unavailable resource allocations', async () => {
    const f = await fixture();
    const foreignWorld = await createWorld(db);
    const available = await robot(f.x.org.id);
    const unavailable = await robot(f.x.org.id, 'retired');
    const foreign = await robot(foreignWorld.org.id);
    const noPermission = { authUserId: 'a', vistaUserId: randomUUID(), email: 'a@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [{ id: 'm', organizationId: f.x.org.id, roleCode: 'school_admin', status: 'active', permissions: [] }] } as never;
    await expect(educationAdmin.allocateRobot(noPermission, f.x.room.id, { robotId: available.item.id } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(educationAdmin.allocateRobot(f.schoolAdmin, foreignWorld.room.id, { robotId: available.item.id } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(educationAdmin.allocateRobot(f.schoolAdmin, f.x.room.id, { robotId: foreign.item.id } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(educationAdmin.allocateRobot(f.schoolAdmin, f.x.room.id, { robotId: unavailable.item.id } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let an instructor inspect a classroom outside their membership scope', async () => {
    const f = await fixture();
    const other = await createWorld(db);
    await expect(learning.classroom(f.teacherUser, other.room.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
