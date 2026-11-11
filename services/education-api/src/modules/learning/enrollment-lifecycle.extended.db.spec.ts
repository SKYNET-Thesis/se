import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EducationAdminService } from '../education-admin/education-admin.service';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';

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

describeDb('real PostgreSQL classroom enrollment lifecycle (extended)', () => {
  const db = new PrismaClient({ datasources: { db: { url: configuredUrl } } });
  let enrollments: EnrollmentDeliveryService;
  let admin: EducationAdminService;
  beforeAll(async () => {
    await db.$connect();
    enrollments = new EnrollmentDeliveryService(db as never);
    admin = new EducationAdminService(db as never, { isSystemAdministrator: () => false } as never, {} as never, {} as never, enrollments);
  });
  afterAll(async () => { await db.$disconnect(); });

  type World = Awaited<ReturnType<typeof world>>;

  async function world(options: { courseStatus?: string; offeringStatus?: string } = {}) {
    const suffix = randomUUID().slice(0, 8);
    const org = await db.organizations.create({ data: { name: `ext ${suffix}`, type: 'institution', segment: 'education' } });
    const role = await db.roles.create({ data: { code: `student-${suffix}`, name: 'Student', scope: 'organization' } });
    const course = await db.learning_courses.create({ data: { title: `Course ${suffix}`, status: options.courseStatus ?? 'published' } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'L1', ordinal: 1 } });
    const offering = await db.learning_course_offerings.create({ data: { course_id: course.id, organization_id: org.id, code: `o-${suffix}`, status: options.offeringStatus ?? 'active' } });
    const room = await classroom(org.id, offering.id, `a-${suffix}`);
    return { suffix, org, role, course, lesson, offering, room };
  }
  const classroom = (organizationId: string, offeringId: string, code: string) =>
    db.learning_classrooms.create({ data: { organization_id: organizationId, offering_id: offeringId, name: code, code } });
  async function student(x: World) {
    const user = await db.users.create({ data: { full_name: 'Learner', signup_method: 'admin_created', status: 'active' } });
    const membership = await db.memberships.create({ data: { user_id: user.id, organization_id: x.org.id, role_id: x.role.id, status: 'active' } });
    return { user, membership };
  }
  const join = (x: World, s: Awaited<ReturnType<typeof student>>, roomId = x.room.id) =>
    db.learning_classroom_members.upsert({
      where: { classroom_id_user_id: { classroom_id: roomId, user_id: s.user.id } },
      create: { classroom_id: roomId, user_id: s.user.id, membership_id: s.membership.id, classroom_role: 'student', status: 'active' },
      update: { status: 'active', left_at: null },
    });
  const rows = (courseId: string, userId: string) => db.learning_enrollments.findMany({ where: { course_id: courseId, learner_user_id: userId }, orderBy: { enrolled_at: 'asc' } });
  const schoolAdmin = (organizationId: string) => ({
    authUserId: 'a', vistaUserId: randomUUID(), email: 'a@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
    memberships: [{ id: 'm', organizationId, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.manage', 'education.classroom.members.manage'] }],
  }) as never;

  /** Learning history that lifecycle changes must never delete or alter. */
  async function recordHistory(x: World, userId: string) {
    await db.learning_lesson_progress.updateMany({ where: { learner_user_id: userId, lesson_id: x.lesson.id }, data: { status: 'completed', progress_percent: 100 } });
    const assignment = await db.learning_assignments.create({ data: { lesson_id: x.lesson.id, title: 'Quiz', instructions: '', constraints: { kind: 'knowledge_check', passPercent: 80 } } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: assignment.id, status: 'published' } });
    const attempt = await db.learning_assignment_attempts.create({ data: { classroom_assignment_id: delivery.id, learner_user_id: userId, attempt_number: 1, status: 'evaluated', score: 90, result_snapshot: { passed: true } } });
    return { attemptId: attempt.id };
  }
  async function history(x: World, userId: string) {
    const progress = await db.learning_lesson_progress.findMany({ where: { learner_user_id: userId, lesson_id: x.lesson.id }, select: { status: true, progress_percent: true } });
    const attempts = await db.learning_assignment_attempts.findMany({ where: { learner_user_id: userId }, select: { id: true, status: true, score: true } });
    return JSON.parse(JSON.stringify({ progress, attempts }));
  }

  it('1 student added to a published course is enrolled once with initialized progress, idempotently', async () => {
    const x = await world(); const s = await student(x); await join(x, s);
    await enrollments.synchronizeClassroom(x.room.id);
    await enrollments.synchronizeClassroom(x.room.id);
    const found = await rows(x.course.id, s.user.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ status: 'active', classroom_id: x.room.id, offering_id: x.offering.id });
    expect(await db.learning_lesson_progress.count({ where: { learner_user_id: s.user.id, lesson_id: x.lesson.id } })).toBe(1);
  });

  it('2 student added before publication gets no enrollment but stays a member', async () => {
    const x = await world({ courseStatus: 'draft' }); const s = await student(x); await join(x, s);
    await expect(enrollments.synchronizeIfDeliverable(x.room.id)).resolves.toBeNull();
    expect(await rows(x.course.id, s.user.id)).toHaveLength(0);
    expect((await db.learning_classroom_members.findFirstOrThrow({ where: { classroom_id: x.room.id, user_id: s.user.id } })).status).toBe('active');
  });

  it('3 publishing after membership enrolls eligible members, but not through an inactive offering', async () => {
    const x = await world({ courseStatus: 'draft' }); const s = await student(x); await join(x, s);
    const inactive = await world({ courseStatus: 'draft', offeringStatus: 'draft' }); const t = await student(inactive); await join(inactive, t);
    await db.learning_courses.updateMany({ where: { id: { in: [x.course.id, inactive.course.id] } }, data: { status: 'published' } });
    await enrollments.synchronizeCourse(x.course.id);
    await enrollments.synchronizeCourse(inactive.course.id);
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['active']);
    expect(await rows(inactive.course.id, t.user.id)).toHaveLength(0);
  });

  it('4 archive revokes access, keeps history, and an archived classroom cannot be re-enrolled', async () => {
    const x = await world(); const s = await student(x); await join(x, s); await enrollments.synchronizeClassroom(x.room.id);
    await recordHistory(x, s.user.id); const before = await history(x, s.user.id);
    await expect(admin.archiveClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id)).resolves.toMatchObject({ status: 'archived', releasedEnrollments: 1 });
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['revoked']);
    expect(await history(x, s.user.id)).toEqual(before);
    await expect(enrollments.synchronizeClassroom(x.room.id)).rejects.toBeInstanceOf(NotFoundException);
    await admin.archiveClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id); // idempotent
  });

  it('5 reactivation restores access without duplicate enrollments or progress', async () => {
    const x = await world(); const s = await student(x); await join(x, s); await enrollments.synchronizeClassroom(x.room.id);
    await recordHistory(x, s.user.id);
    await admin.archiveClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id);
    const before = await history(x, s.user.id);
    await expect(admin.reactivateClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id)).resolves.toMatchObject({ status: 'active', restoredEnrollments: 1 });
    await admin.reactivateClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id); // idempotent
    const found = await rows(x.course.id, s.user.id);
    expect(found).toHaveLength(1);
    expect(found[0].status).toBe('active');
    expect(await history(x, s.user.id)).toEqual(before);
  });

  it('6 changing the offering moves access to the new offering and revokes the previous course', async () => {
    const x = await world(); const s = await student(x); await join(x, s); await enrollments.synchronizeClassroom(x.room.id);
    await recordHistory(x, s.user.id); const before = await history(x, s.user.id);

    const sameCourse = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: x.org.id, code: `o2-${x.suffix}`, status: 'active' } });
    await admin.changeClassroomOffering(schoolAdmin(x.org.id), x.org.id, x.room.id, sameCourse.id);
    let found = await rows(x.course.id, s.user.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ status: 'active', offering_id: sameCourse.id });

    const otherCourse = await db.learning_courses.create({ data: { title: `Other ${x.suffix}`, status: 'published' } });
    const otherLesson = await db.learning_lessons.create({ data: { course_id: otherCourse.id, title: 'O1', ordinal: 1 } });
    const otherOffering = await db.learning_course_offerings.create({ data: { course_id: otherCourse.id, organization_id: x.org.id, code: `o3-${x.suffix}`, status: 'active' } });
    await admin.changeClassroomOffering(schoolAdmin(x.org.id), x.org.id, x.room.id, otherOffering.id);
    found = await rows(x.course.id, s.user.id);
    expect(found.map((r) => r.status)).toEqual(['revoked']);
    expect((await rows(otherCourse.id, s.user.id)).map((r) => r.status)).toEqual(['active']);
    expect(await db.learning_lesson_progress.count({ where: { learner_user_id: s.user.id, lesson_id: otherLesson.id } })).toBe(1);
    expect(await history(x, s.user.id)).toEqual(before);
    expect((await db.learning_classrooms.findUniqueOrThrow({ where: { id: x.room.id } })).offering_id).toBe(otherOffering.id);
  });

  it('7 removing a student revokes only that student and keeps their history', async () => {
    const x = await world(); const s = await student(x); const other = await student(x);
    await join(x, s); await join(x, other); await enrollments.synchronizeClassroom(x.room.id);
    await recordHistory(x, s.user.id); const before = await history(x, s.user.id);
    await expect(admin.removeClassroomStudent(schoolAdmin(x.org.id), x.org.id, x.room.id, s.user.id)).resolves.toMatchObject({ removed: true });
    expect((await db.learning_classroom_members.findFirstOrThrow({ where: { classroom_id: x.room.id, user_id: s.user.id } })).status).toBe('removed');
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['revoked']);
    expect((await rows(x.course.id, other.user.id)).map((r) => r.status)).toEqual(['active']);
    expect(await history(x, s.user.id)).toEqual(before);
    await expect(admin.removeClassroomStudent(schoolAdmin(x.org.id), x.org.id, x.room.id, s.user.id)).rejects.toBeInstanceOf(NotFoundException);
    // rejoin restores access on the same row
    await join(x, s); await enrollments.synchronizeClassroom(x.room.id);
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['active']);
  });

  it('8 a student in two classrooms of the same course keeps access granted by the other classroom', async () => {
    const x = await world(); const s = await student(x);
    const second = await classroom(x.org.id, x.offering.id, `b-${x.suffix}`);
    await join(x, s); await join(x, s, second.id);
    await enrollments.synchronizeClassroom(x.room.id); await enrollments.synchronizeClassroom(second.id);
    expect(await rows(x.course.id, s.user.id)).toHaveLength(2);

    await admin.removeClassroomStudent(schoolAdmin(x.org.id), x.org.id, x.room.id, s.user.id);
    const byRoom = Object.fromEntries((await rows(x.course.id, s.user.id)).map((r) => [r.classroom_id, r.status]));
    expect(byRoom).toEqual({ [x.room.id]: 'revoked', [second.id]: 'active' });

    await admin.archiveClassroom(schoolAdmin(x.org.id), x.org.id, second.id);
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status).sort()).toEqual(['revoked', 'revoked']);
  });

  it('9 concurrent synchronization, membership changes and revocation neither deadlock nor duplicate', async () => {
    const x = await world(); const students = await Promise.all(Array.from({ length: 6 }, () => student(x)));
    await Promise.all(students.map((s) => join(x, s)));
    await Promise.all([
      ...Array.from({ length: 8 }, () => enrollments.synchronizeClassroom(x.room.id)),
      ...Array.from({ length: 4 }, () => enrollments.synchronizeIfDeliverable(x.room.id)),
      enrollments.synchronizeCourse(x.course.id),
    ]);
    for (const s of students) expect(await rows(x.course.id, s.user.id)).toHaveLength(1);

    // racing revoke against sync must finish without errors and leave exactly one row per learner
    await Promise.all(students.flatMap((s) => [
      enrollments.revokeClassroomEnrollment(x.room.id, s.user.id),
      enrollments.synchronizeClassroom(x.room.id),
      enrollments.revokeClassroomEnrollment(x.room.id, s.user.id),
    ]));
    for (const s of students) {
      const found = await rows(x.course.id, s.user.id);
      expect(found).toHaveLength(1);
      expect(['active', 'revoked']).toContain(found[0].status);
    }
    // parallel admin lifecycle calls on the same classroom stay consistent
    await Promise.all([
      admin.archiveClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id),
      admin.archiveClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id),
    ]);
    await admin.reactivateClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id);
    for (const s of students) expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['active']);
  });

  it('10 a completed enrollment is never downgraded by synchronization or revoked access history', async () => {
    const x = await world(); const s = await student(x); await join(x, s); await enrollments.synchronizeClassroom(x.room.id);
    await db.learning_enrollments.updateMany({ where: { course_id: x.course.id, learner_user_id: s.user.id }, data: { status: 'completed', completed_at: new Date() } });
    await enrollments.synchronizeClassroom(x.room.id);
    await admin.archiveClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id);
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['completed']);
  });

  it('11 administrators of another organization cannot change a classroom or its enrollments', async () => {
    const x = await world(); const outsider = await world(); const s = await student(x); await join(x, s); await enrollments.synchronizeClassroom(x.room.id);
    const foreign = schoolAdmin(outsider.org.id);
    await expect(admin.archiveClassroom(foreign, x.org.id, x.room.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(admin.archiveClassroom(foreign, outsider.org.id, x.room.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(admin.removeClassroomStudent(foreign, outsider.org.id, x.room.id, s.user.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(admin.changeClassroomOffering(schoolAdmin(x.org.id), x.org.id, x.room.id, outsider.offering.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await db.learning_classrooms.findUniqueOrThrow({ where: { id: x.room.id } })).status).toBe('active');
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['active']);
  });

  it('12 a failed lifecycle transaction rolls back every change', async () => {
    const x = await world(); const s = await student(x); await join(x, s); await enrollments.synchronizeClassroom(x.room.id);
    const failing = new EducationAdminService(db as never, { isSystemAdministrator: () => false } as never, {} as never, {} as never, {
      lockClassroomIn: (tx: never, id: string) => enrollments.lockClassroomIn(tx, id), releaseIn: async () => { throw new Error('forced failure'); }, synchronizeIfDeliverableIn: async () => null,
    } as never);
    await expect(failing.archiveClassroom(schoolAdmin(x.org.id), x.org.id, x.room.id)).rejects.toThrow('forced failure');
    expect((await db.learning_classrooms.findUniqueOrThrow({ where: { id: x.room.id } })).status).toBe('active');
    expect((await rows(x.course.id, s.user.id)).map((r) => r.status)).toEqual(['active']);
  });
});
