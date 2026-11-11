import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CurriculumService } from './curriculum.service';
import { LearningMediaService } from './learning-media.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { ProgressionService } from './progression.service';
import { QuestionBankService } from './question-bank.service';

const requested = process.env.RUN_POSTGRES_INTEGRATION === '1';
const configuredUrl = process.env.VISTA_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const parsedUrl = configuredUrl ? new URL(configuredUrl) : undefined;
const isolatedIdentity = Boolean(
  parsedUrl && ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname) &&
  parsedUrl.port === '55432' && parsedUrl.pathname === '/vista_test_course_builder' &&
  parsedUrl.username === 'vista_test' &&
  process.env.VISTA_DATABASE_PROJECT_REF === 'vista-course-builder-test' && !process.env.SUPABASE_URL,
);
if (requested && !isolatedIdentity) {
  throw new Error('Course Builder PostgreSQL tests require vista_test_course_builder on loopback port 55432.');
}

const describeDb = requested && isolatedIdentity ? describe : describe.skip;
const adminId = '00000000-0000-4000-8000-000000000001';
const admin = { vistaUserId: adminId, status: 'active', systemPermissions: ['org.manage'], memberships: [] };

describeDb('real PostgreSQL Course Builder persistence scenarios A-F', () => {
  const db = new PrismaClient({ datasources: { db: { url: configuredUrl } } });
  const scope = new LearningScopeService(db as never);
  const progression = new ProgressionService(db as never, scope as never);
  const learning = new LearningService(db as never, scope as never, progression as never);
  const curriculum = new CurriculumService(db as never, progression as never);
  const questions = new QuestionBankService(db as never);

  beforeAll(async () => {
    await db.$connect();
    await db.users.upsert({
      where: { id: adminId },
      create: { id: adminId, full_name: 'Course Builder integration publisher', signup_method: 'admin_created', status: 'active' },
      update: { status: 'active' },
    });
    const identity = await db.$queryRaw<Array<{ version: string; database: string; current_user: string }>>`
      SELECT version() AS version,current_database() AS database,current_user`;
    expect(identity[0].version).toContain('PostgreSQL 17');
    expect(identity[0].database).toBe('vista_test_course_builder');
    expect(identity[0].current_user).toBe('vista_test');
  });
  afterAll(async () => { await db.$disconnect(); });

  async function globalFixture(label: string) {
    const suffix = crypto.randomUUID();
    const author = await db.users.create({ data: { full_name: `${label} author`, signup_method: 'admin_created', status: 'active' } });
    const user = { ...admin, vistaUserId: author.id };
    const course = await learning.createGlobalCourse(user as never, { title: `${label} ${suffix}` });
    const lesson = await learning.createCourseLesson(user as never, course.id, { title: 'Foundations', content: { summary: 'Initial' } });
    return { suffix, author, user, course, lesson };
  }

  async function organizationQuizFixture(label: string, publishActivity = true) {
    const suffix = crypto.randomUUID();
    const author = await db.users.create({ data: { full_name: `${label} author`, signup_method: 'admin_created', status: 'active' } });
    const organization = await db.organizations.create({ data: { name: `${label} ${suffix}`, type: 'institution', segment: 'education' } });
    const course = await db.learning_courses.create({ data: { title: `${label} course ${suffix}`, organization_id: organization.id, status: 'draft', created_by: author.id } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'Quiz lesson', ordinal: 1 } });
    const objective = await db.learning_objectives.create({ data: { lesson_id: lesson.id, code: `OUT-${suffix}`, description: 'Identify the correct answer', ordinal: 1 } });
    const authorUser = { ...admin, vistaUserId: author.id };
    const question = await questions.createQuestion(authorUser as never, { organizationId: organization.id, courseId: course.id, lessonId: lesson.id, code: `Q-${suffix}` });
    const version = await questions.createVersion(authorUser as never, question.id, {
      type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'remember', stem: 'Which option is correct?',
      options: [{ id: 'a', text: 'Correct' }, { id: 'b', text: 'Incorrect' }], answerKey: ['a'], explanation: 'Option A is correct.',
    });
    await questions.mapObjectives(authorUser as never, version.id, { objectiveIds: [objective.id] });
    await questions.submitReview(authorUser as never, version.id);
    await questions.publish(admin as never, version.id);
    const assignment = await questions.createQuizAssignment(authorUser as never, lesson.id, 'Canonical quiz', 'Choose the correct option.', 100);
    await questions.addToAssignment(authorUser as never, assignment.id, { questionVersionId: version.id, ordinal: 1, points: 1 });
    const section = await curriculum.createSection(admin as never, lesson.id, { title: 'Quiz section', ordinal: 1 });
    const activity = await curriculum.createActivity(admin as never, section.id, {
      title: 'Knowledge check', type: 'knowledge_check', ordinal: 1,
      contentRef: { kind: 'assignment', id: assignment.id },
    });
    if (publishActivity) {
      await curriculum.setSectionStatus(admin as never, section.id, 'published');
      await curriculum.setActivityStatus(admin as never, activity.id, 'published');
    }
    return { suffix, author, organization, course, lesson, objective, question, version, assignment, section, activity };
  }

  async function classroomFixture(x: Awaited<ReturnType<typeof organizationQuizFixture>>, label: string) {
    const offering = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: x.organization.id, code: `${label}-${x.suffix}`, status: 'active' } });
    return db.learning_classrooms.create({ data: { organization_id: x.organization.id, offering_id: offering.id, name: label, code: `${label}-${x.suffix}` } });
  }

  it('A: creates, reloads, parents, and reorders course curriculum rows', async () => {
    const x = await globalFixture('course-builder');
    const secondLesson = await learning.createCourseLesson(x.user as never, x.course.id, { title: 'Practice' });
    const section1 = await curriculum.createSection(admin as never, x.lesson.id, { title: 'Read', ordinal: 1 });
    const section2 = await curriculum.createSection(admin as never, x.lesson.id, { title: 'Build', ordinal: 2 });
    const activity1 = await curriculum.createActivity(admin as never, section1.id, { title: 'Intro', type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'intro' }, content: { version: 1, blocks: [{ type: 'paragraph', text: 'Persisted JSON' }] } });
    const activity2 = await curriculum.createActivity(admin as never, section1.id, { title: 'Notes', type: 'reading', ordinal: 2, contentRef: { kind: 'lesson_content', key: 'notes' }, content: { version: 1, blocks: [{ type: 'heading', text: 'Next' }] } });
    await learning.reorderCourseLessons(x.user as never, x.course.id, [secondLesson.id, x.lesson.id]);
    await curriculum.reorderSections(admin as never, x.lesson.id, [section2.id, section1.id]);
    await curriculum.reorderActivities(admin as never, section1.id, [activity2.id, activity1.id]);
    const loaded = await db.$queryRaw<Array<{ id: string; content: unknown }>>`SELECT id,content FROM public.learning_activities WHERE section_id=${section1.id}::uuid ORDER BY ordinal`;
    expect((await db.learning_lessons.findMany({ where: { course_id: x.course.id }, orderBy: { ordinal: 'asc' } })).map((r) => r.id)).toEqual([secondLesson.id, x.lesson.id]);
    expect((await db.learning_sections.findMany({ where: { lesson_id: x.lesson.id }, orderBy: { ordinal: 'asc' } })).map((r) => r.id)).toEqual([section2.id, section1.id]);
    expect(loaded.map((r) => r.id)).toEqual([activity2.id, activity1.id]);
    expect(loaded[1].content).toEqual({ version: 1, blocks: [{ type: 'paragraph', text: 'Persisted JSON' }] });
    expect((await db.learning_sections.findUniqueOrThrow({ where: { id: section1.id } })).lesson_id).toBe(x.lesson.id);
    expect((await db.learning_activities.findUniqueOrThrow({ where: { id: activity1.id } })).section_id).toBe(section1.id);
    expect((await db.learning_activities.findUniqueOrThrow({ where: { id: activity2.id } })).section_id).toBe(section1.id);
  });

  it('B: persists reading JSON and ready same-course media, and blocks incomplete media publication', async () => {
    const x = await globalFixture('reading-media');
    const storage = {
      createUpload: jest.fn(async (key: string, mediaId: string) => ({ key, mediaId, uploadUrl: 'test-double' })),
      head: jest.fn(async (key: string) => {
        const [media] = await db.$queryRaw<Array<{ size_bytes: number; mime_type: string; id: string }>>`SELECT size_bytes::int,mime_type,id FROM public.learning_media_assets WHERE object_key=${key}`;
        return { contentLength: media.size_bytes, contentType: media.mime_type, mediaId: media.id };
      }),
    };
    const media = new LearningMediaService(db as never, scope as never, storage as never);
    const curriculumWithMedia = new CurriculumService(db as never, progression as never, media);
    const created = await media.createUpload(x.user as never, x.course.id, { filename: 'guide.pdf', contentType: 'application/pdf', sizeBytes: 128 });
    expect(created.media).toMatchObject({ status: 'pending', course_id: x.course.id });
    const [storedAsset] = await db.$queryRaw<Array<{ created_by: string }>>`SELECT created_by FROM public.learning_media_assets WHERE id=${created.media.id as string}::uuid`;
    expect(storedAsset.created_by).toBe(x.author.id);
    await media.completeUpload(x.user as never, created.media.id as string);
    const section = await curriculumWithMedia.createSection(admin as never, x.lesson.id, { title: 'Reading', ordinal: 1 });
    const reading = await curriculumWithMedia.createActivity(admin as never, section.id, {
      title: 'Course guide', type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'guide' },
      content: { version: 1, mediaIds: [created.media.id], blocks: [{ type: 'paragraph', text: 'Read this guide.' }] },
    });
    await media.assertActivityMediaReady(x.course.id, 'reading', reading.content);
    await curriculumWithMedia.setSectionStatus(admin as never, section.id, 'published');
    await curriculumWithMedia.setActivityStatus(admin as never, reading.id, 'published');
    const [storedReading] = await db.$queryRaw<Array<{ content: Record<string, unknown> }>>`SELECT content FROM public.learning_activities WHERE id=${reading.id}::uuid`;
    expect(storedReading.content).toMatchObject({ mediaIds: [created.media.id] });
    const pending = await media.createUpload(x.user as never, x.course.id, { filename: 'pending.pdf', contentType: 'application/pdf', sizeBytes: 16 });
    await expect(media.assertActivityMediaReady(x.course.id, 'reading', { version: 1, mediaIds: [pending.media.id], blocks: [{ type: 'paragraph', text: 'Incomplete' }] })).rejects.toBeInstanceOf(ConflictException);
    await expect(media.assertActivityMediaReady(crypto.randomUUID(), 'reading', reading.content)).rejects.toBeInstanceOf(ConflictException);
  });

  it('C: persists and publishes a canonical quiz with stable ordered question references', async () => {
    const x = await organizationQuizFixture('canonical', false);
    const secondQuestion = await questions.createQuestion(admin as never, {
      organizationId: x.organization.id, courseId: x.course.id, lessonId: x.lesson.id, code: `Q2-${x.suffix}`,
    });
    const secondVersion = await questions.createVersion(admin as never, secondQuestion.id, {
      type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'remember', stem: 'Which option is also correct?',
      options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }], answerKey: ['yes'], explanation: 'Yes is correct.',
    });
    await questions.mapObjectives(admin as never, secondVersion.id, { objectiveIds: [x.objective.id] });
    await questions.submitReview(admin as never, secondVersion.id);
    await questions.publish(admin as never, secondVersion.id);
    await questions.addToAssignment(admin as never, x.assignment.id, { questionVersionId: secondVersion.id, ordinal: 2, points: 1 });
    await curriculum.setSectionStatus(admin as never, x.section.id, 'published');
    await curriculum.setActivityStatus(admin as never, x.activity.id, 'published');
    const loaded = await questions.assignmentQuestions(admin as never, x.assignment.id);
    expect(loaded.items.map((row) => row.question_version_id)).toEqual([x.version.id, secondVersion.id]);
    expect(loaded.items.map((row) => row.question_id)).toEqual([x.question.id, secondQuestion.id]);
    expect((await db.learning_question_versions.findUniqueOrThrow({ where: { id: x.version.id } })).status).toBe('published');
    expect(await db.learning_activities.findUniqueOrThrow({ where: { id: x.activity.id } })).toMatchObject({
      status: 'published', content_ref: { kind: 'assignment', id: x.assignment.id },
    });
    await expect(questions.addToAssignment(admin as never, x.assignment.id, { questionVersionId: x.version.id, ordinal: 3, points: 1 })).rejects.toBeInstanceOf(ConflictException);
    await expect(questions.createQuizAssignment(admin as never, x.lesson.id, 'Duplicate quiz', '', 80)).rejects.toBeInstanceOf(ConflictException);
  });

  it('D: reuses a canonical quiz for isolated classroom deliveries and rejects unauthorized access', async () => {
    const x = await organizationQuizFixture('delivery');
    await db.learning_courses.update({ where: { id: x.course.id }, data: { status: 'published' } });
    const classroomA = await classroomFixture(x, 'Class A');
    const classroomB = await classroomFixture(x, 'Class B');
    const first = await learning.createQuizDelivery(admin as never, classroomA.id, { canonicalAssignmentId: x.assignment.id });
    expect(first.status).toBe('draft');
    await learning.publishAssignment(admin as never, classroomA.id, x.assignment.id);
    const second = await learning.createQuizDelivery(admin as never, classroomB.id, { canonicalAssignmentId: x.assignment.id });
    expect(second.assignment_id).toBe(x.assignment.id);
    expect(second.classroom_id).toBe(classroomB.id);
    await expect(learning.createQuizDelivery(admin as never, classroomA.id, { canonicalAssignmentId: x.assignment.id })).rejects.toBeInstanceOf(ConflictException);
    const outsider = { vistaUserId: x.author.id, status: 'active', systemPermissions: [], memberships: [] };
    await expect(learning.createQuizDelivery(outsider as never, classroomB.id, { canonicalAssignmentId: x.assignment.id })).rejects.toBeInstanceOf(NotFoundException);
    expect(await db.learning_classroom_assignments.count({ where: { assignment_id: x.assignment.id } })).toBe(2);
  });

  it('E: issues immutable public/private snapshots, grades a student attempt, and isolates classroom access', async () => {
    const x = await organizationQuizFixture('attempt');
    await db.learning_courses.update({ where: { id: x.course.id }, data: { status: 'published' } });
    const classroom = await classroomFixture(x, 'Learners');
    const otherClassroom = await classroomFixture(x, 'Other');
    const delivery = await learning.createQuizDelivery(admin as never, classroom.id, { canonicalAssignmentId: x.assignment.id });
    await learning.publishAssignment(admin as never, classroom.id, x.assignment.id);
    const otherDelivery = await learning.createQuizDelivery(admin as never, otherClassroom.id, { canonicalAssignmentId: x.assignment.id });
    await learning.publishAssignment(admin as never, otherClassroom.id, x.assignment.id);
    const student = await db.users.create({ data: { full_name: 'Integration learner', signup_method: 'admin_created', status: 'active' } });
    const role = await db.roles.create({ data: { code: `student-${x.suffix}`, name: 'Student', scope: 'organization' } });
    const membership = await db.memberships.create({ data: { user_id: student.id, organization_id: x.organization.id, role_id: role.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: classroom.id, user_id: student.id, membership_id: membership.id, classroom_role: 'student', status: 'active' } });
    await db.learning_enrollments.create({ data: { course_id: x.course.id, learner_user_id: student.id, classroom_id: classroom.id, offering_id: classroom.offering_id } });
    const learner = { vistaUserId: student.id, status: 'active', systemPermissions: [], memberships: [{ id: membership.id, organizationId: x.organization.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] };
    const attempt = await learning.startAttempt(learner as never, delivery.id as string);
    const publicQuiz = (attempt as { quiz: { questions: Array<Record<string, unknown>> } }).quiz;
    expect(JSON.stringify(publicQuiz)).not.toContain('answerKey');
    expect(JSON.stringify(publicQuiz)).not.toContain('explanation');
    const privateRow = await db.$queryRaw<Array<{ grading_snapshot: Record<string, unknown> }>>`SELECT grading_snapshot FROM public.learning_quiz_attempt_grading WHERE attempt_id=${(attempt as { id: string }).id}::uuid`;
    expect(privateRow[0].grading_snapshot).toBeDefined();
    expect(JSON.stringify(privateRow[0].grading_snapshot)).toContain('answerKey');
    await expect(db.$executeRaw`UPDATE public.learning_assignment_attempts SET workspace_snapshot='{}'::jsonb WHERE id=${(attempt as { id: string }).id}::uuid`).rejects.toThrow(/immutable/i);
    const result = await progression.submitKnowledgeCheck(learner as never, (attempt as { id: string }).id, { answers: [{ questionId: x.version.id, optionId: 'a' }] });
    expect(result).toMatchObject({ passed: true, score: 100 });
    expect(await learning.myAttempts(learner as never)).toEqual(expect.arrayContaining([expect.objectContaining({ id: (attempt as { id: string }).id, status: 'evaluated' })]));
    await expect(learning.startAttempt({ ...learner, memberships: [] } as never, otherDelivery.id as string)).rejects.toBeInstanceOf(NotFoundException);
    await expect(learning.myAttempt({ ...learner, vistaUserId: x.author.id } as never, (attempt as { id: string }).id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('F: enforces media course and creator ownership and refuses missing uploaded objects', async () => {
    const x = await globalFixture('media-ownership');
    const other = await globalFixture('media-other-course');
    const creator = await db.users.create({ data: { full_name: 'Media creator', signup_method: 'admin_created', status: 'active' } });
    const storage = { createUpload: jest.fn(async () => ({ uploadUrl: 'test-double' })), head: jest.fn(async () => null) };
    const media = new LearningMediaService(db as never, scope as never, storage as never);
    const pending = await media.createUpload(x.user as never, x.course.id, { filename: 'asset.pdf', contentType: 'application/pdf', sizeBytes: 10 });
    await expect(media.completeUpload({ ...x.user, vistaUserId: creator.id } as never, pending.media.id as string)).rejects.toBeInstanceOf(NotFoundException);
    await expect(media.assertActivityMediaReady(other.course.id, 'reading', { version: 1, mediaIds: [pending.media.id], blocks: [{ type: 'paragraph', text: 'Cross course' }] })).rejects.toBeInstanceOf(ConflictException);
    await expect(media.completeUpload(x.user as never, pending.media.id as string)).rejects.toThrow(/not present/i);
    const [stored] = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM public.learning_media_assets WHERE id=${pending.media.id as string}::uuid`;
    expect(stored.status).toBe('pending');
  });
});
