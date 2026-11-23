import { randomUUID } from 'node:crypto';
import { createDb, createClassroom, createStudent, createWorld, describeDb, joinClassroom, type Db } from './db-test-support';
import { prerequisiteProblems, publishedDependents } from './course-prerequisites';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningScopeService } from './learning-scope.service';
import { ProgressionService } from './progression.service';

/**
 * Real PostgreSQL: course-prerequisite enforcement policy (COURSE_PREREQUISITES_ENFORCED_FROM), grandfathering by the server-side enrolment
 * timestamp, reachability of prerequisites (no permanent deadlocks) and preservation of started or completed work.
 */
describeDb('course prerequisite enforcement (PostgreSQL)', () => {
  const db: Db = createDb();
  let enrollments: EnrollmentDeliveryService; let progression: ProgressionService;
  const saved = process.env.COURSE_PREREQUISITES_ENFORCED_FROM;
  beforeAll(async () => { await db.$connect(); enrollments = new EnrollmentDeliveryService(db as never); progression = new ProgressionService(db as never, new LearningScopeService(db as never)); });
  afterAll(async () => { if (saved === undefined) delete process.env.COURSE_PREREQUISITES_ENFORCED_FROM; else process.env.COURSE_PREREQUISITES_ENFORCED_FROM = saved; await db.$disconnect(); });
  const policy = (value: string | undefined) => { if (value === undefined) delete process.env.COURSE_PREREQUISITES_ENFORCED_FROM; else process.env.COURSE_PREREQUISITES_ENFORCED_FROM = value; };

  /** A school delivering a prerequisite course ("pre", 2 lessons) and a dependent course ("dep", 3 lessons), one student enrolled in "dep". */
  async function scenario(options: { preStatus?: string; preLessons?: number; offerPre?: boolean; enrollInPre?: boolean } = {}) {
    const x = await createWorld(db, { courseStatus: options.preStatus ?? 'published', deliverable: false });
    const preLessons = options.preLessons ?? 2;
    await db.learning_lessons.deleteMany({ where: { course_id: x.course.id, ordinal: { gt: preLessons } } });
    if (preLessons === 0) await db.learning_lessons.deleteMany({ where: { course_id: x.course.id } });
    else for (let ordinal = 2; ordinal <= preLessons; ordinal += 1) await db.learning_lessons.create({ data: { course_id: x.course.id, title: `P${ordinal}`, ordinal } });
    const dep = await db.learning_courses.create({ data: { title: `Dependent ${x.suffix}`, status: 'published', prerequisite_course_ids: [x.course.id] } });
    const depLessons = [] as Array<{ id: string }>;
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) depLessons.push(await db.learning_lessons.create({ data: { course_id: dep.id, title: `D${ordinal}`, ordinal } }));
    const depOffering = await db.learning_course_offerings.create({ data: { course_id: dep.id, organization_id: x.org.id, code: `d-${x.suffix}`, status: 'active' } });
    const depRoom = await createClassroom(db, x.org.id, depOffering.id, `d-${x.suffix}`);
    const student = await createStudent(db, x);
    await joinClassroom(db, student, depRoom.id);
    await enrollments.synchronizeClassroom(depRoom.id);
    if (options.enrollInPre) await joinClassroom(db, student, x.room.id), await enrollments.synchronizeClassroom(x.room.id);
    if (options.offerPre === false) await db.learning_course_offerings.update({ where: { id: x.offering.id }, data: { status: 'archived' } });
    const user = { authUserId: 'a', vistaUserId: student.user.id, email: 'x@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: student.membership.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    return { x, dep, depLessons, depRoom, student, user, preCourseId: x.course.id };
  }
  type Scenario = Awaited<ReturnType<typeof scenario>>;
  const statuses = async (s: Scenario) => (await progression.coursePath(s.user, s.dep.id)).lessons.map((lesson) => lesson.status);
  const completePrerequisite = async (s: Scenario) => {
    const lessons = await db.learning_lessons.findMany({ where: { course_id: s.preCourseId } });
    for (const lesson of lessons) await db.learning_lesson_progress.upsert({ where: { learner_user_id_lesson_id: { learner_user_id: s.student.user.id, lesson_id: lesson.id } }, create: { learner_user_id: s.student.user.id, lesson_id: lesson.id, status: 'completed', progress_percent: 100 }, update: { status: 'completed', progress_percent: 100 } });
  };
  const setLesson = (s: Scenario, lessonId: string, status: string) => db.learning_lesson_progress.upsert({ where: { learner_user_id_lesson_id: { learner_user_id: s.student.user.id, lesson_id: lessonId } }, create: { learner_user_id: s.student.user.id, lesson_id: lessonId, status, progress_percent: 0 }, update: { status } });

  it('is DISABLED when the setting is absent, empty, "disabled" or malformed: nobody is locked', async () => {
    const s = await scenario();
    for (const value of [undefined, '', 'disabled', 'not-a-date', '2026-12-01']) { policy(value); expect(await statuses(s)).not.toContain('locked'); }
  });

  it('"always" locks every unfinished lesson with the missing course named, and unlocks once the prerequisite is completed', async () => {
    policy('always');
    const s = await scenario();
    expect(await statuses(s)).toEqual(['locked', 'locked', 'locked']);
    const path = await progression.coursePath(s.user, s.dep.id);
    expect(path.course.unmetPrerequisites).toHaveLength(1);
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[0].id)).rejects.toMatchObject({ response: { code: 'COURSE_PREREQUISITE_NOT_COMPLETED' } });
    await completePrerequisite(s);
    expect(await statuses(s)).not.toContain('locked');
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[0].id)).resolves.toBeUndefined();
  });

  it('a cutoff grandfathers learners enrolled before it and enforces for enrolments at or after it (server-side enrolled_at)', async () => {
    const s = await scenario();
    const enrolledAt = (await db.learning_enrollments.findFirstOrThrow({ where: { course_id: s.dep.id, learner_user_id: s.student.user.id } })).enrolled_at;
    policy(new Date(enrolledAt.getTime() + 60_000).toISOString());       // cutoff after enrolment: grandfathered
    expect(await statuses(s)).not.toContain('locked');
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[0].id)).resolves.toBeUndefined();
    policy(new Date(enrolledAt.getTime() - 60_000).toISOString());       // cutoff before enrolment: enforced
    expect(await statuses(s)).toEqual(['locked', 'locked', 'locked']);
    policy(new Date(Date.now() + 86_400_000).toISOString());             // a future cutoff starts enforcement later
    expect(await statuses(s)).not.toContain('locked');
  });

  it('keeps completed and in-progress lessons reachable, and never blocks the final submission of started work', async () => {
    policy('always');
    const s = await scenario();
    await setLesson(s, s.depLessons[0].id, 'completed'); await setLesson(s, s.depLessons[1].id, 'in_progress');
    expect(await statuses(s)).toEqual(['completed', 'in_progress', 'locked']);
    // media / attempt start for started or completed lessons is allowed, a fresh lesson is not
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[0].id)).resolves.toBeUndefined();
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[1].id)).resolves.toBeUndefined();
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[2].id)).rejects.toMatchObject({ response: { code: 'COURSE_PREREQUISITE_NOT_COMPLETED' } });
    // a prerequisite added after the attempt started must not discard the work: submission checks skip the course rule
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[2].id, { courseLevel: false })).resolves.toBeUndefined();
  });

  it.each([
    ['a draft prerequisite', { preStatus: 'draft' }],
    ['a prerequisite without lessons', { preLessons: 0 }],
    ['a prerequisite the school does not offer and the learner is not enrolled in', { offerPre: false }],
  ])('ignores %s instead of locking the learner forever', async (_name, options) => {
    policy('always');
    const s = await scenario(options);
    expect(await statuses(s)).not.toContain('locked');
    await expect(progression.assertPrerequisites(db as never, s.student.user.id, s.depLessons[0].id)).resolves.toBeUndefined();
  });

  it('still enforces a prerequisite the learner is enrolled in even if the school stopped offering it', async () => {
    policy('always');
    const s = await scenario({ enrollInPre: true, offerPre: false });
    expect(await statuses(s)).toEqual(['locked', 'locked', 'locked']);
  });

  it('a missing prerequisite reference (deleted course) is ignored', async () => {
    policy('always');
    const s = await scenario();
    await db.learning_courses.update({ where: { id: s.dep.id }, data: { prerequisite_course_ids: [randomUUID()] } });
    expect(await statuses(s)).not.toContain('locked');
  });

  describe('authoring validation (impossible prerequisite configurations)', () => {
    it('reports missing, archived, cross-school, draft and lesson-less prerequisites; published ones pass', async () => {
      const x = await createWorld(db, { deliverable: false });
      const other = await db.organizations.create({ data: { name: `other ${x.suffix}`, type: 'institution', segment: 'education' } });
      const course = (title: string, data: Record<string, unknown>) => db.learning_courses.create({ data: { title, status: 'published', ...data } as never });
      const withLesson = async (courseId: string) => { await db.learning_lessons.create({ data: { course_id: courseId, title: 'L', ordinal: 1 } }); };
      const published = await course(`ok ${x.suffix}`, {}); await withLesson(published.id);
      const global = await course(`global ${x.suffix}`, {}); await withLesson(global.id);
      const own = await course(`own ${x.suffix}`, { organization_id: x.org.id }); await withLesson(own.id);
      const draft = await course(`draft ${x.suffix}`, { status: 'draft' }); await withLesson(draft.id);
      const archived = await course(`archived ${x.suffix}`, { status: 'archived' }); await withLesson(archived.id);
      const foreign = await course(`foreign ${x.suffix}`, { organization_id: other.id }); await withLesson(foreign.id);
      const empty = await course(`empty ${x.suffix}`, {});
      const ids = (...courses: Array<{ id: string }>) => courses.map((item) => item.id);
      for (const requirePublished of [false, true]) {
        expect(await prerequisiteProblems(db as never, ids(published, global, own), x.org.id, requirePublished)).toEqual([]);
        expect((await prerequisiteProblems(db as never, ids(archived), x.org.id, requirePublished)).join()).toMatch(/archived/);
        expect((await prerequisiteProblems(db as never, ids(foreign), x.org.id, requirePublished)).join()).toMatch(/another school/);
        expect((await prerequisiteProblems(db as never, [randomUUID()], x.org.id, requirePublished)).join()).toMatch(/no longer exists/);
      }
      expect(await prerequisiteProblems(db as never, ids(draft, empty), x.org.id, false)).toEqual([]);     // allowed while the dependent is a draft
      expect((await prerequisiteProblems(db as never, ids(draft), x.org.id, true)).join()).toMatch(/Publish the prerequisite/);
      expect((await prerequisiteProblems(db as never, ids(empty), x.org.id, true)).join()).toMatch(/has no lessons/);
    });

    it('lists published courses that depend on a course, ignoring drafts', async () => {
      const x = await createWorld(db, { deliverable: false });
      const publishedDependent = await db.learning_courses.create({ data: { title: `dep ${x.suffix}`, status: 'published', prerequisite_course_ids: [x.course.id] } });
      await db.learning_courses.create({ data: { title: `draft dep ${x.suffix}`, status: 'draft', prerequisite_course_ids: [x.course.id] } });
      expect((await publishedDependents(db as never, x.course.id)).map((item) => item.id)).toEqual([publishedDependent.id]);
    });
  });
});
