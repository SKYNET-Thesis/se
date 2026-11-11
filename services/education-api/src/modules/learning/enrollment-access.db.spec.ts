import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningScopeService } from './learning-scope.service';

// Same isolation guard as the other PostgreSQL suites: only the dedicated disposable loopback target.
const requested = process.env.RUN_POSTGRES_INTEGRATION === '1';
const configuredUrl = process.env.VISTA_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const parsedUrl = configuredUrl ? new URL(configuredUrl) : undefined;
const isolatedIdentity = Boolean(
  parsedUrl &&
  ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname) &&
  parsedUrl.port === '55432' &&
  parsedUrl.pathname === '/vista_test_course_builder' &&
  parsedUrl.username === 'vista_test' &&
  process.env.VISTA_DATABASE_PROJECT_REF === 'vista-course-builder-test' &&
  !process.env.SUPABASE_URL,
);
if (requested && !isolatedIdentity) {
  throw new Error('PostgreSQL integration tests require the dedicated vista_test_course_builder target on loopback port 55432.');
}
const describeDb = requested && isolatedIdentity ? describe : describe.skip;

describeDb('real PostgreSQL enrollment-gated student access', () => {
  const db = (requested && isolatedIdentity ? new PrismaClient({ datasources: { db: { url: configuredUrl } } }) : undefined) as unknown as PrismaClient;
  let enrollments: EnrollmentDeliveryService;
  let scope: LearningScopeService;
  beforeAll(async () => {
    await db.$connect();
    enrollments = new EnrollmentDeliveryService(db as never);
    scope = new LearningScopeService(db as never);
  });
  afterAll(async () => { await db.$disconnect(); });

  async function world() {
    const s = randomUUID().slice(0, 8);
    const org = await db.organizations.create({ data: { name: `acc ${s}`, type: 'institution', segment: 'education' } });
    const role = await db.roles.create({ data: { code: `student-${s}`, name: 'Student', scope: 'organization' } });
    const course = await db.learning_courses.create({ data: { title: `C ${s}`, status: 'published' } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'L1', ordinal: 1 } });
    const offering = await db.learning_course_offerings.create({ data: { course_id: course.id, organization_id: org.id, code: `o-${s}`, status: 'active' } });
    const room = await db.learning_classrooms.create({ data: { organization_id: org.id, offering_id: offering.id, name: 'A', code: `a-${s}` } });
    return { org, role, course, lesson, offering, room };
  }
  type World = Awaited<ReturnType<typeof world>>;
  async function enrolledStudent(x: World) {
    const u = await db.users.create({ data: { full_name: 'L', signup_method: 'admin_created', status: 'active' } });
    const m = await db.memberships.create({ data: { user_id: u.id, organization_id: x.org.id, role_id: x.role.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: x.room.id, user_id: u.id, membership_id: m.id, classroom_role: 'student', status: 'active' } });
    await enrollments.synchronizeClassroom(x.room.id);
    const user = { authUserId: 'a', vistaUserId: u.id, email: 'x@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: m.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    return { u, user };
  }
  const write = (user: never, roomId: string) => scope.assertStudentClassroomAccess(user, roomId, { requireActiveEnrollment: true });
  const read = (user: never, roomId: string) => scope.assertStudentClassroomAccess(user, roomId);

  it('active enrollment allows writes; revocation blocks writes but keeps membership-based history reads', async () => {
    const x = await world(); const { u, user } = await enrolledStudent(x);
    await expect(write(user, x.room.id)).resolves.toBeUndefined();
    await enrollments.revokeClassroomEnrollment(x.room.id, u.id);
    await expect(write(user, x.room.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(read(user, x.room.id)).resolves.toBeUndefined();
  });

  it('re-enrolling restores write access and repeated revocation is idempotent', async () => {
    const x = await world(); const { u, user } = await enrolledStudent(x);
    await enrollments.revokeClassroomEnrollment(x.room.id, u.id);
    expect(await enrollments.revokeClassroomEnrollment(x.room.id, u.id)).toHaveLength(0);
    await enrollments.synchronizeClassroom(x.room.id);
    await expect(write(user, x.room.id)).resolves.toBeUndefined();
  });

  it('an archived classroom or inactive offering blocks writes even with an active membership', async () => {
    const x = await world(); const { user } = await enrolledStudent(x);
    await db.learning_course_offerings.update({ where: { id: x.offering.id }, data: { status: 'draft' } });
    await expect(write(user, x.room.id)).rejects.toBeInstanceOf(NotFoundException);
    await db.learning_course_offerings.update({ where: { id: x.offering.id }, data: { status: 'active' } });
    await db.learning_classrooms.update({ where: { id: x.room.id }, data: { status: 'archived' } });
    await expect(write(user, x.room.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("another student's enrollment never grants access", async () => {
    const x = await world(); const a = await enrolledStudent(x);
    const b = await enrolledStudent(x);
    await enrollments.revokeClassroomEnrollment(x.room.id, a.u.id);
    await expect(write(a.user, x.room.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(write(b.user, x.room.id)).resolves.toBeUndefined();
  });

  it('a stale enrollment of a previous offering does not grant access after the classroom moves', async () => {
    const x = await world(); const { user } = await enrolledStudent(x);
    const next = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: x.org.id, code: `n-${randomUUID().slice(0, 8)}`, status: 'active' } });
    await db.learning_classrooms.update({ where: { id: x.room.id }, data: { offering_id: next.id } });
    await expect(write(user, x.room.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('concurrent enrollment and revocation settle on one row without errors', async () => {
    const x = await world(); const { u } = await enrolledStudent(x);
    await Promise.all([
      enrollments.synchronizeClassroom(x.room.id), enrollments.revokeClassroomEnrollment(x.room.id, u.id),
      enrollments.synchronizeClassroom(x.room.id), enrollments.revokeClassroomEnrollment(x.room.id, u.id),
    ]);
    const rows = await db.learning_enrollments.findMany({ where: { learner_user_id: u.id, classroom_id: x.room.id } });
    expect(rows).toHaveLength(1);
    expect(['active', 'revoked']).toContain(rows[0].status);
  });
});
