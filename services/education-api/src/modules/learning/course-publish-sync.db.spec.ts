import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningService } from './learning.service';
import { createClassroom, createDb, createStudent, createWorld, describeDb, enrollmentRows, joinClassroom, type Db, type Student, type World } from './db-test-support';

/**
 * Real-PostgreSQL tests for "publish course + enroll existing classroom members".
 * Semantics under test: one all-or-nothing transaction. A failure on any classroom aborts the publication and every
 * enrollment written so far; publishing (or the dedicated retry endpoint) again is idempotent.
 */
describeDb('real PostgreSQL course publication and enrollment synchronization', () => {
  const db: Db = createDb();
  let healthy: EnrollmentDeliveryService;
  const scope = { isSystemAdministrator: () => true } as never;
  const sysUser = {} as never;
  beforeAll(async () => { await db.$connect(); healthy = new EnrollmentDeliveryService(db as never); });
  afterAll(async () => { await db.$disconnect(); });

  const learning = (enrollments: EnrollmentDeliveryService) => new LearningService(db as never, scope, undefined, enrollments);

  /** Fails when the synchronization reaches the n-th classroom (ascending id), after earlier classrooms already wrote. */
  class FailingAt extends EnrollmentDeliveryService {
    constructor(private readonly failingClassroomId: string) { super(db as never); }
    override async synchronizeIfDeliverableIn(tx: never, classroomId: string) {
      if (classroomId === this.failingClassroomId) throw new Error(`injected failure while synchronizing ${classroomId}`);
      return super.synchronizeIfDeliverableIn(tx, classroomId);
    }
  }

  /** A draft, deliverable global course with three classrooms of the same school, two students each. */
  async function draftCourseWithClassrooms(options: { courseStatus?: string } = {}) {
    const x = await createWorld(db, { courseStatus: options.courseStatus ?? 'draft' });
    const rooms = [x.room, await createClassroom(db, x.org.id, x.offering.id, `b-${x.suffix}`), await createClassroom(db, x.org.id, x.offering.id, `c-${x.suffix}`)]
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const students: Student[] = [];
    for (const room of rooms) for (let i = 0; i < 2; i += 1) { const s = await createStudent(db, x); await joinClassroom(db, s, room.id); students.push(s); }
    return { x, rooms, students };
  }
  const courseStatus = async (x: World) => (await db.learning_courses.findUniqueOrThrow({ where: { id: x.course.id } })).status;
  const totalEnrollments = (x: World) => db.learning_enrollments.count({ where: { course_id: x.course.id } });
  const activeEnrollments = (x: World) => db.learning_enrollments.count({ where: { course_id: x.course.id, status: 'active' } });
  const progressRows = (x: World) => db.learning_lesson_progress.count({ where: { lesson_id: x.lesson.id } });

  it('publishes and enrolls every active member of every active classroom in one step', async () => {
    const { x, students } = await draftCourseWithClassrooms();
    const result = await learning(healthy).publishCourse(sysUser, x.course.id);
    expect(result).toMatchObject({ status: 'published', enrollmentSync: { classrooms: 3, enrolled: 6 } });
    expect(await courseStatus(x)).toBe('published');
    expect(await activeEnrollments(x)).toBe(6);
    expect(await progressRows(x)).toBe(6);
    for (const s of students) expect((await enrollmentRows(db, x.course.id, s.user.id)).map((r) => r.status)).toEqual(['active']);
  });

  it('a failure on a later classroom aborts everything: the course stays draft and nobody is enrolled, not even earlier classrooms', async () => {
    const { x, rooms } = await draftCourseWithClassrooms();
    const failing = new FailingAt(rooms[1].id); // the second classroom in lock/visit order
    await expect(learning(failing).publishCourse(sysUser, x.course.id)).rejects.toThrow(/injected failure/);
    expect(await courseStatus(x)).toBe('draft');
    expect(await totalEnrollments(x)).toBe(0);
    expect(await progressRows(x)).toBe(0);
  });

  it('retry after the failure succeeds, is complete, and publishing again changes nothing (idempotent)', async () => {
    const { x, rooms } = await draftCourseWithClassrooms();
    await expect(learning(new FailingAt(rooms[2].id)).publishCourse(sysUser, x.course.id)).rejects.toThrow(/injected failure/);
    expect(await courseStatus(x)).toBe('draft');

    const retry = await learning(healthy).publishCourse(sysUser, x.course.id);
    expect(retry).toMatchObject({ status: 'published', enrollmentSync: { classrooms: 3, enrolled: 6 } });
    const afterRetry = await db.learning_enrollments.findMany({ where: { course_id: x.course.id }, select: { id: true, status: true }, orderBy: { id: 'asc' } });
    expect(afterRetry).toHaveLength(6);

    const again = await learning(healthy).publishCourse(sysUser, x.course.id);
    expect(again.enrollmentSync).toEqual({ classrooms: 3, enrolled: 6 });
    expect(await db.learning_enrollments.findMany({ where: { course_id: x.course.id }, select: { id: true, status: true }, orderBy: { id: 'asc' } })).toEqual(afterRetry);
    expect(await progressRows(x)).toBe(6);
  });

  it('the dedicated retry endpoint is all-or-nothing and idempotent for an already published course', async () => {
    const { x, rooms } = await draftCourseWithClassrooms({ courseStatus: 'published' }); // published, but nobody was synchronized yet
    expect(await totalEnrollments(x)).toBe(0);
    await expect(learning(new FailingAt(rooms[1].id)).syncCourseEnrollments(sysUser, x.course.id)).rejects.toThrow(/injected failure/);
    expect(await totalEnrollments(x)).toBe(0); // the first classroom was rolled back too

    await expect(learning(healthy).syncCourseEnrollments(sysUser, x.course.id)).resolves.toEqual({ classrooms: 3, enrolled: 6 });
    await expect(learning(healthy).syncCourseEnrollments(sysUser, x.course.id)).resolves.toEqual({ classrooms: 3, enrolled: 6 });
    expect(await totalEnrollments(x)).toBe(6);
    expect(await progressRows(x)).toBe(6);
  });

  it('the retry endpoint refuses a draft course', async () => {
    const { x } = await draftCourseWithClassrooms();
    await expect(learning(healthy).syncCourseEnrollments(sysUser, x.course.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await totalEnrollments(x)).toBe(0);
  });

  it('does not enroll through an inactive offering or an archived classroom, and publication still succeeds', async () => {
    const { x, rooms } = await draftCourseWithClassrooms();
    await db.learning_classrooms.update({ where: { id: rooms[0].id }, data: { status: 'archived' } });
    const draftOffering = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: x.org.id, code: `d-${x.suffix}`, status: 'draft' } });
    await db.learning_classrooms.update({ where: { id: rooms[1].id }, data: { offering_id: draftOffering.id } });
    await expect(learning(healthy).publishCourse(sysUser, x.course.id)).resolves.toMatchObject({ status: 'published', enrollmentSync: { classrooms: 1, enrolled: 2 } });
    expect(await activeEnrollments(x)).toBe(2);
    expect(await db.learning_enrollments.count({ where: { classroom_id: { in: [rooms[0].id, rooms[1].id] } } })).toBe(0);
  });

  it('refuses a course whose lesson has no published activity: status unchanged, nothing enrolled', async () => {
    const x = await createWorld(db, { courseStatus: 'draft', deliverable: false });
    const s = await createStudent(db, x); await joinClassroom(db, s, x.room.id);
    await expect(learning(healthy).publishCourse(sysUser, x.course.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await courseStatus(x)).toBe('draft');
    expect(await totalEnrollments(x)).toBe(0);
  });

  it('keeps a completed enrollment completed when the course is published or re-synchronized', async () => {
    const { x, students } = await draftCourseWithClassrooms();
    await learning(healthy).publishCourse(sysUser, x.course.id);
    const done = students[0];
    await db.learning_enrollments.updateMany({ where: { course_id: x.course.id, learner_user_id: done.user.id }, data: { status: 'completed', completed_at: new Date() } });
    await learning(healthy).publishCourse(sysUser, x.course.id);
    await learning(healthy).syncCourseEnrollments(sysUser, x.course.id);
    expect((await enrollmentRows(db, x.course.id, done.user.id)).map((r) => r.status)).toEqual(['completed']);
  });

  it('two simultaneous publications and retries serialize without deadlock or duplicate rows', async () => {
    const { x } = await draftCourseWithClassrooms();
    const results = await Promise.allSettled([
      learning(healthy).publishCourse(sysUser, x.course.id),
      learning(healthy).publishCourse(sysUser, x.course.id),
      learning(healthy).syncCourseEnrollments(sysUser, x.course.id).catch((error) => { if (!(error instanceof ConflictException)) throw error; }),
      healthy.synchronizeCourse(x.course.id),
    ]);
    expect(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
    expect(await totalEnrollments(x)).toBe(6);
    expect(await progressRows(x)).toBe(6);
  });
  describe('transaction timeout, rollback and retry', () => {
    /** The same Prisma client, but every transaction expires after 400 ms (the production policy is 30 s). */
    const withTimeout = (timeout: number) => new Proxy(db, {
      get: (target, property) => property === '$transaction'
        ? (work: never, options: object) => target.$transaction(work, { ...options, timeout })
        : (target as never as Record<string | symbol, unknown>)[property],
    }) as unknown as Db;
    /** Slow enough to exceed the shortened timeout after the first classroom has already written. */
    class SlowAfterFirst extends EnrollmentDeliveryService {
      override async synchronizeIfDeliverableIn(tx: never, classroomId: string) {
        const rows = await super.synchronizeIfDeliverableIn(tx, classroomId);
        await (tx as { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> }).$queryRaw`SELECT pg_sleep(1.2)`;
        return rows;
      }
    }

    it('publishing that exceeds the transaction timeout is rolled back as a whole and reported as a retryable 503', async () => {
      const { x } = await draftCourseWithClassrooms();
      const slowDb = withTimeout(400);
      const slow = new SlowAfterFirst(slowDb as never);
      await expect(new LearningService(slowDb as never, scope, undefined, slow).publishCourse(sysUser, x.course.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(await courseStatus(x)).toBe('draft');
      expect(await totalEnrollments(x)).toBe(0);
      expect(await progressRows(x)).toBe(0);
      // no lock is left behind: a normal retry succeeds immediately and completely
      await expect(learning(healthy).publishCourse(sysUser, x.course.id)).resolves.toMatchObject({ status: 'published', enrollmentSync: { classrooms: 3, enrolled: 6 } });
    });

    it('the retry endpoint times out the same way, leaves a published course untouched, and a later retry is idempotent', async () => {
      const { x } = await draftCourseWithClassrooms({ courseStatus: 'published' });
      const slowDb = withTimeout(400);
      const slow = new SlowAfterFirst(slowDb as never);
      await expect(new LearningService(slowDb as never, scope, undefined, slow).syncCourseEnrollments(sysUser, x.course.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(await courseStatus(x)).toBe('published');
      expect(await totalEnrollments(x)).toBe(0);
      await expect(learning(healthy).syncCourseEnrollments(sysUser, x.course.id)).resolves.toEqual({ classrooms: 3, enrolled: 6 });
      await expect(learning(healthy).syncCourseEnrollments(sysUser, x.course.id)).resolves.toEqual({ classrooms: 3, enrolled: 6 });
      expect(await totalEnrollments(x)).toBe(6);
    });
  });

  describe('high fan-out', () => {
    const CLASSROOMS = 12;
    const STUDENTS_PER_CLASSROOM = 6;

    async function largeDraftCourse() {
      const x = await createWorld(db, { courseStatus: 'draft' });
      const rooms = [x.room];
      for (let i = 1; i < CLASSROOMS; i += 1) rooms.push(await createClassroom(db, x.org.id, x.offering.id, `f${i}-${x.suffix}`));
      const students: Student[] = [];
      for (const room of rooms) for (let i = 0; i < STUDENTS_PER_CLASSROOM; i += 1) { const s = await createStudent(db, x); await joinClassroom(db, s, room.id); students.push(s); }
      return { x, rooms, students };
    }

    it('publishes 12 classrooms / 72 students well inside the 30 s policy, completely and idempotently', async () => {
      const { x } = await largeDraftCourse();
      const started = Date.now();
      await expect(learning(healthy).publishCourse(sysUser, x.course.id)).resolves.toMatchObject({ status: 'published', enrollmentSync: { classrooms: CLASSROOMS, enrolled: CLASSROOMS * STUDENTS_PER_CLASSROOM } });
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(await activeEnrollments(x)).toBe(CLASSROOMS * STUDENTS_PER_CLASSROOM);
      await expect(learning(healthy).syncCourseEnrollments(sysUser, x.course.id)).resolves.toEqual({ classrooms: CLASSROOMS, enrolled: CLASSROOMS * STUDENTS_PER_CLASSROOM });
      expect(await totalEnrollments(x)).toBe(CLASSROOMS * STUDENTS_PER_CLASSROOM);
      expect(await progressRows(x)).toBe(CLASSROOMS * STUDENTS_PER_CLASSROOM);
    });

    it('publish, retries and single-classroom synchronizations racing on all classrooms finish without deadlock or duplicates', async () => {
      const { x, rooms } = await largeDraftCourse();
      const results = await Promise.allSettled([
        learning(healthy).publishCourse(sysUser, x.course.id),
        learning(healthy).publishCourse(sysUser, x.course.id),
        healthy.synchronizeCourse(x.course.id),
        ...rooms.map((room) => healthy.synchronizeIfDeliverable(room.id)),
        ...rooms.slice(0, 6).map((room) => healthy.synchronizeClassroom(room.id).catch((error) => { if (error.constructor?.name !== 'NotFoundException') throw error; })),
      ]);
      expect(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
      expect(await courseStatus(x)).toBe('published');
      expect(await totalEnrollments(x)).toBe(CLASSROOMS * STUDENTS_PER_CLASSROOM);
      expect(await progressRows(x)).toBe(CLASSROOMS * STUDENTS_PER_CLASSROOM);
    });
  });
});
