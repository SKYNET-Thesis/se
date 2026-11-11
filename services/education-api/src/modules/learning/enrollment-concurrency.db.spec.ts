import { ConflictException, NotFoundException } from '@nestjs/common';
import { EducationAdminService } from '../education-admin/education-admin.service';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningService } from './learning.service';
import {
  createClassroom, createDb, createStudent, createWorld, deferred, describeDb, enrollmentRows, isPending, joinClassroom, schoolAdminUser,
  type Db, type Student, type World,
} from './db-test-support';

/**
 * Real-PostgreSQL concurrency tests for the classroom enrollment lifecycle.
 *
 * Interleavings are forced, not hoped for: one operation is paused after it did its writes but before its transaction
 * commits (it then holds the classroom lock), a competing operation is started, and the test asserts that the competitor
 * is blocked until the first one commits and that the final state is the one the first commit implies.
 */
describeDb('real PostgreSQL enrollment concurrency', () => {
  const db: Db = createDb();
  let enrollments: EnrollmentDeliveryService;
  const scope = { isSystemAdministrator: () => true } as never;
  const sysUser = {} as never; // authorization is stubbed by the scope above; these suites test data consistency
  beforeAll(async () => { await db.$connect(); enrollments = new EnrollmentDeliveryService(db as never); admin = adminWith(enrollments); });
  afterAll(async () => { await db.$disconnect(); });

  /** Wraps one EnrollmentDeliveryService method so the calling transaction pauses right after it ran. */
  function gated(method: 'releaseIn' | 'synchronizeCourseIn' | 'synchronizeIfDeliverableIn') {
    const entered = deferred();
    const gate = deferred();
    const proxy = Object.create(enrollments) as Record<string, unknown>;
    const original = (enrollments[method] as (...args: unknown[]) => Promise<unknown>).bind(enrollments);
    proxy[method] = async (...args: unknown[]) => { const result = await original(...args); entered.resolve(); await gate.promise; return result; };
    return { proxy: proxy as unknown as EnrollmentDeliveryService, entered, gate };
  }
  const adminWith = (service: EnrollmentDeliveryService) => new EducationAdminService(db as never, scope, {} as never, {} as never, service);
  const learningWith = (service: EnrollmentDeliveryService) => new LearningService(db as never, scope, undefined, service);
  let admin: EducationAdminService;

  const setup = async (options: Parameters<typeof createWorld>[1] = {}) => {
    const x = await createWorld(db, options);
    const manager = schoolAdminUser(x.org.id);
    return { x, manager };
  };
  const enrolled = async (x: World, count = 1) => {
    const students: Student[] = [];
    for (let i = 0; i < count; i += 1) { const s = await createStudent(db, x); await joinClassroom(db, s, x.room.id); students.push(s); }
    return students;
  };
  const status = async (x: World, s: Student, classroomId = x.room.id) => (await enrollmentRows(db, x.course.id, s.user.id)).filter((r) => r.classroom_id === classroomId).map((r) => r.status);

  it('archive vs synchronization: a student can never be enrolled into a classroom that is being archived', async () => {
    const { x, manager } = await setup();
    const [s] = await enrolled(x);
    const held = gated('releaseIn');
    const archive = adminWith(held.proxy).archiveClassroom(manager, x.org.id, x.room.id);
    await held.entered.promise; // classroom row is locked and archived, uncommitted
    const sync = enrollments.synchronizeClassroom(x.room.id);
    const syncOutcome = sync.then(() => 'enrolled', (error) => error);
    expect(await isPending(sync)).toBe(true); // blocked on the classroom lock, not racing past it
    held.gate.resolve();
    await archive;
    expect(await syncOutcome).toBeInstanceOf(NotFoundException); // it now sees the committed 'archived' status
    expect(await status(x, s)).toEqual([]);
    expect((await db.learning_classrooms.findUniqueOrThrow({ where: { id: x.room.id } })).status).toBe('archived');
  });

  it('removal vs synchronization: a removed student is not re-activated by a synchronization that started earlier', async () => {
    const { x, manager } = await setup();
    const [s, other] = await enrolled(x, 2);
    await enrollments.synchronizeClassroom(x.room.id);
    const held = gated('releaseIn');
    const removal = adminWith(held.proxy).removeClassroomStudent(manager, x.org.id, x.room.id, s.user.id);
    await held.entered.promise;
    const sync = enrollments.synchronizeClassroom(x.room.id);
    expect(await isPending(sync)).toBe(true);
    held.gate.resolve();
    await removal;
    await sync;
    expect(await status(x, s)).toEqual(['revoked']);
    expect(await status(x, other)).toEqual(['active']);
    expect((await db.learning_classroom_members.findFirstOrThrow({ where: { classroom_id: x.room.id, user_id: s.user.id } })).status).toBe('removed');
  });

  it('offering change vs synchronization: the final enrollment reflects the new offering only', async () => {
    const { x, manager } = await setup();
    const [s] = await enrolled(x);
    await enrollments.synchronizeClassroom(x.room.id);
    const next = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: x.org.id, code: `n-${x.suffix}`, status: 'active' } });
    const held = gated('releaseIn');
    const change = adminWith(held.proxy).changeClassroomOffering(manager, x.org.id, x.room.id, next.id);
    await held.entered.promise; // offering changed + enrollments released, uncommitted
    const sync = enrollments.synchronizeClassroom(x.room.id);
    expect(await isPending(sync)).toBe(true);
    held.gate.resolve();
    await change;
    await sync;
    const rows = await enrollmentRows(db, x.course.id, s.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'active', offering_id: next.id, classroom_id: x.room.id });
  });

  it('publish vs removal (both orders): neither deadlocks and the removed student never ends up enrolled', async () => {
    // publish holds the classroom lock first
    const first = await setup({ courseStatus: 'draft' });
    const [s1, keep1] = await enrolled(first.x, 2);
    const heldPublish = gated('synchronizeCourseIn');
    const publish = learningWith(heldPublish.proxy).publishCourse(sysUser, first.x.course.id);
    await heldPublish.entered.promise;
    const removal = admin.removeClassroomStudent(first.manager, first.x.org.id, first.x.room.id, s1.user.id);
    const removalOutcome = removal.then(() => 'ok', (error) => error);
    expect(await isPending(removal)).toBe(true);
    heldPublish.gate.resolve();
    await expect(publish).resolves.toMatchObject({ status: 'published', enrollmentSync: { classrooms: 1 } });
    expect(await removalOutcome).toBe('ok');
    expect(await status(first.x, s1)).toEqual(['revoked']);
    expect(await status(first.x, keep1)).toEqual(['active']);

    // removal holds the classroom lock first
    const second = await setup({ courseStatus: 'draft' });
    const [s2, keep2] = await enrolled(second.x, 2);
    const heldRemoval = gated('releaseIn');
    const removal2 = adminWith(heldRemoval.proxy).removeClassroomStudent(second.manager, second.x.org.id, second.x.room.id, s2.user.id).catch((e) => e);
    // draft course: nothing to release yet, but the member row is updated and the lock is held
    await heldRemoval.entered.promise;
    const publish2 = learningWith(enrollments).publishCourse(sysUser, second.x.course.id);
    expect(await isPending(publish2)).toBe(true);
    heldRemoval.gate.resolve();
    await removal2;
    await expect(publish2).resolves.toMatchObject({ status: 'published' });
    expect(await status(second.x, s2)).toEqual([]); // removed before publication: never enrolled
    expect(await status(second.x, keep2)).toEqual(['active']);
  });

  it('classroom isolation: archiving or removing in one classroom never revokes the enrollment of another classroom', async () => {
    const { x, manager } = await setup();
    const roomB = await createClassroom(db, x.org.id, x.offering.id, `b-${x.suffix}`);
    const s = await createStudent(db, x);
    await joinClassroom(db, s, x.room.id); await joinClassroom(db, s, roomB.id);
    await Promise.all([enrollments.synchronizeClassroom(x.room.id), enrollments.synchronizeClassroom(roomB.id)]);
    await Promise.all([
      admin.removeClassroomStudent(manager, x.org.id, x.room.id, s.user.id),
      admin.archiveClassroom(manager, x.org.id, x.room.id).catch(() => undefined),
      enrollments.synchronizeClassroom(roomB.id),
      enrollments.revokeClassroomEnrollment(x.room.id, s.user.id),
    ].map((p) => p.catch((error) => { if (!(error instanceof NotFoundException || error instanceof ConflictException)) throw error; })));
    expect(await status(x, s, x.room.id)).toEqual(['revoked']);
    expect(await status(x, s, roomB.id)).toEqual(['active']);
  });

  it('a completed enrollment is never downgraded by concurrent synchronization, archive or release', async () => {
    const { x, manager } = await setup();
    const [s] = await enrolled(x);
    await enrollments.synchronizeClassroom(x.room.id);
    await db.learning_enrollments.updateMany({ where: { course_id: x.course.id, learner_user_id: s.user.id }, data: { status: 'completed', completed_at: new Date() } });
    await Promise.all([
      enrollments.synchronizeClassroom(x.room.id).catch(() => undefined),
      admin.archiveClassroom(manager, x.org.id, x.room.id),
      enrollments.revokeClassroomEnrollment(x.room.id, s.user.id),
      enrollments.synchronizeCourse(x.course.id),
    ]);
    expect(await status(x, s)).toEqual(['completed']);
  });

  it('parallel synchronization of the same classroom and course is idempotent and deadlock free', async () => {
    const { x } = await setup();
    const students = await enrolled(x, 6);
    await Promise.all([
      ...Array.from({ length: 8 }, () => enrollments.synchronizeClassroom(x.room.id)),
      ...Array.from({ length: 4 }, () => enrollments.synchronizeCourse(x.course.id)),
      ...Array.from({ length: 4 }, () => enrollments.synchronizeIfDeliverable(x.room.id)),
    ]);
    for (const s of students) expect(await status(x, s)).toEqual(['active']);
    expect(await db.learning_lesson_progress.count({ where: { lesson_id: x.lesson.id } })).toBe(6);
  });

  it('randomized mixed lifecycle operations finish without deadlocks and never leave unauthorized active access', async () => {
    const { x, manager } = await setup();
    const roomB = await createClassroom(db, x.org.id, x.offering.id, `r-${x.suffix}`);
    const second = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: x.org.id, code: `r2-${x.suffix}`, status: 'active' } });
    const rooms = [x.room.id, roomB.id];
    const students = await enrolled(x, 4);
    for (const s of students) await joinClassroom(db, s, roomB.id);
    const publisher = learningWith(enrollments);
    const studentRole = (await db.roles.findFirst({ where: { code: 'student' } })) ?? (await db.roles.create({ data: { code: 'student', name: 'Student', scope: 'organization' } }));
    const eligible = await Promise.all(students.map(async (s) => { await db.memberships.update({ where: { id: s.membership.id }, data: { role_id: studentRole.id } }); return s; }));
    const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
    const operations: Array<() => Promise<unknown>> = [
      () => enrollments.synchronizeClassroom(pick(rooms)),
      () => enrollments.synchronizeCourse(x.course.id),
      () => publisher.publishCourse(sysUser, x.course.id),
      () => admin.archiveClassroom(manager, x.org.id, pick(rooms)),
      () => admin.reactivateClassroom(manager, x.org.id, pick(rooms)),
      () => admin.changeClassroomOffering(manager, x.org.id, pick(rooms), pick([x.offering.id, second.id])),
      () => admin.removeClassroomStudent(manager, x.org.id, pick(rooms), pick(eligible).user.id),
      () => admin.upsertClassroomMember(manager, x.org.id, pick(rooms), { userId: pick(eligible).user.id } as never),
      () => enrollments.revokeClassroomEnrollment(pick(rooms), pick(eligible).user.id),
    ];
    const unexpected: unknown[] = [];
    for (let round = 0; round < 14; round += 1) {
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => pick(operations)()));
      for (const result of results) {
        if (result.status === 'rejected' && !(result.reason instanceof NotFoundException || result.reason instanceof ConflictException)) unexpected.push(result.reason);
      }
      const violations = await db.$queryRaw<Array<{ kind: string; enrollment_id: string }>>`
        SELECT 'archived-classroom' AS kind, e.id AS enrollment_id FROM public.learning_enrollments e
          JOIN public.learning_classrooms c ON c.id=e.classroom_id WHERE e.status='active' AND c.status<>'active' AND c.organization_id=${x.org.id}::uuid
        UNION ALL
        SELECT 'inactive-member', e.id FROM public.learning_enrollments e
          JOIN public.learning_classrooms c ON c.id=e.classroom_id
          LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=e.classroom_id AND cm.user_id=e.learner_user_id
          WHERE e.status='active' AND c.organization_id=${x.org.id}::uuid AND (cm.id IS NULL OR cm.status<>'active')
        UNION ALL
        SELECT 'stale-offering', e.id FROM public.learning_enrollments e
          JOIN public.learning_classrooms c ON c.id=e.classroom_id
          WHERE e.status='active' AND c.organization_id=${x.org.id}::uuid AND e.offering_id IS DISTINCT FROM c.offering_id`;
      expect(violations).toEqual([]);
    }
    expect(unexpected.map(String)).toEqual([]); // no deadlock / serialization / constraint errors
  });
});
