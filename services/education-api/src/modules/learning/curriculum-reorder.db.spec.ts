import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CurriculumService } from './curriculum.service';
import { LearningService } from './learning.service';

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
const enabled = requested && isolatedIdentity;
const describeDb = enabled ? describe : describe.skip;

describeDb('real PostgreSQL curriculum reordering', () => {
  const db = new PrismaClient({ datasources: { db: { url: configuredUrl } } });
  const administrator = { vistaUserId: '00000000-0000-4000-8000-000000000001', status: 'active', systemPermissions: ['org.manage'], memberships: [] };
  const learning = new LearningService(db as never, { isSystemAdministrator: () => true } as never);
  const curriculum = new CurriculumService(db as never, { coursePath: jest.fn() } as never);

  beforeAll(async () => db.$connect());
  afterAll(async () => db.$disconnect());

  async function fixture() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const course = await db.learning_courses.create({ data: { title: `reorder ${suffix}`, status: 'draft' } });
    const lessons = await Promise.all([1, 2, 3].map((ordinal) => db.learning_lessons.create({ data: { course_id: course.id, title: `Lesson ${ordinal}`, ordinal } })));
    const sections = await Promise.all([1, 2, 3].map((ordinal) => db.learning_sections.create({ data: { lesson_id: lessons[0].id, title: `Section ${ordinal}`, ordinal } })));
    const activities = await Promise.all([1, 2, 3].map((ordinal) => db.learning_activities.create({ data: { section_id: sections[0].id, title: `Activity ${ordinal}`, type: 'reading', ordinal, content_ref: { kind: 'lesson_content', key: 'summary' } } })));
    const foreignSection = await db.learning_sections.create({ data: { lesson_id: lessons[1].id, title: 'Foreign section', ordinal: 1 } });
    const foreignActivity = await db.learning_activities.create({ data: { section_id: sections[1].id, title: 'Foreign activity', type: 'reading', ordinal: 1, content_ref: { kind: 'lesson_content', key: 'summary' } } });
    return { suffix, course, lessons, sections, activities, foreignSection, foreignActivity };
  }

  async function ordinals(parent: 'course' | 'lesson' | 'section', id: string) {
    if (parent === 'course') return (await db.learning_lessons.findMany({ where: { course_id: id }, orderBy: { ordinal: 'asc' }, select: { id: true } })).map((row) => row.id);
    if (parent === 'lesson') return (await db.learning_sections.findMany({ where: { lesson_id: id }, orderBy: { ordinal: 'asc' }, select: { id: true } })).map((row) => row.id);
    return (await db.learning_activities.findMany({ where: { section_id: id }, orderBy: { ordinal: 'asc' }, select: { id: true } })).map((row) => row.id);
  }

  it('persists successful lesson, section, and activity reorders', async () => {
    const x = await fixture();
    await learning.reorderCourseLessons(administrator as never, x.course.id, [...x.lessons].reverse().map((row) => row.id));
    await curriculum.reorderSections(administrator as never, x.lessons[0].id, [...x.sections].reverse().map((row) => row.id));
    await curriculum.reorderActivities(administrator as never, x.sections[0].id, [...x.activities].reverse().map((row) => row.id));
    await expect(ordinals('course', x.course.id)).resolves.toEqual([...x.lessons].reverse().map((row) => row.id));
    await expect(ordinals('lesson', x.lessons[0].id)).resolves.toEqual([...x.sections].reverse().map((row) => row.id));
    await expect(ordinals('section', x.sections[0].id)).resolves.toEqual([...x.activities].reverse().map((row) => row.id));
  });

  it('rejects duplicate, missing, and foreign-parent IDs without changing persisted order', async () => {
    const x = await fixture();
    const original = await ordinals('lesson', x.lessons[0].id);
    await expect(curriculum.reorderSections(administrator as never, x.lessons[0].id, [x.sections[0].id, x.sections[0].id, x.sections[2].id])).rejects.toBeInstanceOf(BadRequestException);
    await expect(curriculum.reorderSections(administrator as never, x.lessons[0].id, x.sections.slice(0, 2).map((row) => row.id))).rejects.toBeInstanceOf(BadRequestException);
    await expect(curriculum.reorderSections(administrator as never, x.lessons[0].id, [...x.sections.map((row) => row.id), x.foreignSection.id])).rejects.toBeInstanceOf(BadRequestException);
    await expect(ordinals('lesson', x.lessons[0].id)).resolves.toEqual(original);
    await expect(curriculum.reorderActivities(administrator as never, x.sections[0].id, [...x.activities.map((row) => row.id), x.foreignActivity.id])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('serializes concurrent requests and rolls back a failed transaction', async () => {
    const x = await fixture();
    const forward = x.activities.map((row) => row.id);
    const reverse = [...forward].reverse();
    await expect(Promise.all([
      curriculum.reorderActivities(administrator as never, x.sections[0].id, reverse),
      curriculum.reorderActivities(administrator as never, x.sections[0].id, forward),
    ])).resolves.toHaveLength(2);
    const concurrentResult = await ordinals('section', x.sections[0].id);
    expect([forward, reverse]).toContainEqual(concurrentResult);
    const before = await ordinals('section', x.sections[0].id);
    await expect(db.$transaction(async (tx) => {
      await tx.learning_activities.update({ where: { id: x.activities[0].id }, data: { ordinal: 99 } });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    await expect(ordinals('section', x.sections[0].id)).resolves.toEqual(before);
  });

  it('rejects reordering after published-course learner delivery begins', async () => {
    const x = await fixture();
    const org = await db.organizations.create({ data: { name: `org ${x.suffix}`, type: 'institution', segment: 'education' } });
    const role = await db.roles.create({ data: { code: `student-${x.suffix}`, name: 'Student', scope: 'organization' } });
    const learner = await db.users.create({ data: { full_name: 'Reorder learner', signup_method: 'admin_created', status: 'active' } });
    const membership = await db.memberships.create({ data: { user_id: learner.id, organization_id: org.id, role_id: role.id, status: 'active' } });
    const offering = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: org.id, code: `offer-${x.suffix}`, status: 'active' } });
    const classroom = await db.learning_classrooms.create({ data: { organization_id: org.id, offering_id: offering.id, name: 'Reorder', code: `room-${x.suffix}` } });
    await db.learning_classroom_members.create({ data: { classroom_id: classroom.id, user_id: learner.id, membership_id: membership.id, classroom_role: 'student', status: 'active' } });
    await db.learning_enrollments.create({ data: { course_id: x.course.id, learner_user_id: learner.id, classroom_id: classroom.id, offering_id: offering.id } });
    await db.learning_courses.update({ where: { id: x.course.id }, data: { status: 'published' } });
    await expect(curriculum.reorderSections(administrator as never, x.lessons[0].id, [...x.sections].reverse().map((row) => row.id))).rejects.toBeInstanceOf(ConflictException);
  });
});
