import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { CurriculumService } from './curriculum.service';
import { LearningService } from './learning.service';
import { LearningScopeService } from './learning-scope.service';
import { ProgressionService } from './progression.service';
import { QuestionBankService } from './question-bank.service';
import { createClassroom, createDb, createSystemAdmin, describeDb, type Db } from './db-test-support';

const instructions = 'Home the arm, move to Target A, then wait.';
const blocks = ['arm.select', 'home', 'preview.move_xyz', 'wait'];

describeDb('real PostgreSQL Programming Assignment authoring', () => {
  // Created in beforeAll so the suite is a clean skip (not a constructor error) when no disposable database is configured.
  let db: Db;
  let learning: LearningService;
  let curriculum: CurriculumService;
  let questions: QuestionBankService;
  let admin: AuthenticatedUser;

  beforeAll(async () => {
    db = createDb();
    const scope = new LearningScopeService(db as never);
    const progression = new ProgressionService(db as never, scope as never);
    learning = new LearningService(db as never, scope as never, progression as never);
    curriculum = new CurriculumService(db as never, progression as never);
    questions = new QuestionBankService(db as never);
    await db.$connect();
    admin = await createSystemAdmin(db);
  });
  afterAll(async () => { await db?.$disconnect(); });

  /** Global course > module > lesson with a draft guided_practice activity (what Course Builder creates). */
  async function fixture(label: string, type = 'guided_practice') {
    const course = await learning.createGlobalCourse(admin as never, { title: `${label} ${crypto.randomUUID()}` });
    const module_ = await learning.createCourseLesson(admin as never, course.id, { title: 'Module', content: { summary: '' } });
    const section = await curriculum.createSection(admin as never, module_.id, { title: 'Lesson', ordinal: 1 });
    const activity = await curriculum.createActivity(admin as never, section.id, { title: 'Program the arm', type, ordinal: 1, contentRef: { kind: 'none' } });
    return { course, module: module_, section, activity };
  }
  const save = (activityId: string, over: Partial<{ title: string; instructions: string; allowedBlocks: string[] }> = {}, user: AuthenticatedUser = admin) =>
    curriculum.saveProgrammingAssignment(user as never, activityId, { title: 'Reach Target A', instructions, allowedBlocks: blocks, ...over });
  const rows = (lessonId: string) => db.learning_assignments.findMany({ where: { lesson_id: lessonId } });

  it('creates a non-quiz template in the activity lesson and links it to the guided_practice activity', async () => {
    const f = await fixture('Create');
    expect(await curriculum.programmingAssignment(admin as never, f.activity.id)).toBeNull();
    const saved = await save(f.activity.id);
    expect(saved).toMatchObject({ lessonId: f.module.id, title: 'Reach Target A', instructions, allowedBlocks: blocks, challengeId: null, kind: 'symbolic_program' });
    const stored = await rows(f.module.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: saved.id, challenge_id: null, constraints: { kind: 'symbolic_program' }, allowed_blocks: blocks });
    const activity = await db.learning_activities.findUniqueOrThrow({ where: { id: f.activity.id } });
    expect(activity.content_ref).toEqual({ kind: 'assignment', id: saved.id });
    expect(activity.type).toBe('guided_practice');
  });

  it('edits the same template in place and keeps the configuration after a reload', async () => {
    const f = await fixture('Edit');
    const first = await save(f.activity.id);
    const second = await save(f.activity.id, { title: 'Reach Target B', instructions: 'New text', allowedBlocks: ['arm.select', 'home', 'gripper.open', 'gripper.close'] });
    expect(second.id).toBe(first.id);
    expect(await rows(f.module.id)).toHaveLength(1);
    const reloaded = await curriculum.programmingAssignment(admin as never, f.activity.id);
    expect(reloaded).toEqual({ ...second, title: 'Reach Target B', instructions: 'New text', allowedBlocks: ['arm.select', 'home', 'gripper.open', 'gripper.close'] });
    const tree = await curriculum.authorSections(admin as never, f.module.id);
    expect(tree[0].learning_activities[0].content_ref).toEqual({ kind: 'assignment', id: first.id });
  });

  it('publishes a guided_practice activity backed by a valid programming template', async () => {
    const f = await fixture('Publish');
    await expect(curriculum.setActivityStatus(admin as never, f.activity.id, 'published')).rejects.toBeInstanceOf(ConflictException);
    await save(f.activity.id);
    await curriculum.setSectionStatus(admin as never, f.section.id, 'published');
    const published = await curriculum.setActivityStatus(admin as never, f.activity.id, 'published');
    expect(published.status).toBe('published');
  });

  it('rejects a quiz assignment on a guided_practice activity (link and publish)', async () => {
    const f = await fixture('QuizOnProgram');
    const quiz = await questions.createQuizAssignment(admin as never, f.module.id, 'Quiz', '', 70);
    await expect(curriculum.updateActivity(admin as never, f.activity.id, { contentRef: { kind: 'assignment', id: quiz.id } })).rejects.toBeInstanceOf(BadRequestException);
    // a bad link that already exists (older data) is still caught when the activity is published
    await db.learning_activities.update({ where: { id: f.activity.id }, data: { content_ref: { kind: 'assignment', id: quiz.id } } });
    await curriculum.setSectionStatus(admin as never, f.section.id, 'published');
    await expect(curriculum.setActivityStatus(admin as never, f.activity.id, 'published')).rejects.toBeInstanceOf(BadRequestException);
    // and the programming editor refuses to rewrite a quiz template
    await expect(save(f.activity.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await db.learning_assignments.findUniqueOrThrow({ where: { id: quiz.id } })).constraints).toMatchObject({ kind: 'knowledge_check' });
  });

  it('rejects a programming assignment on a knowledge_check activity and a type change that would mismatch', async () => {
    const own = await fixture('Own');
    const template = await save(own.activity.id);
    const quizActivity = await curriculum.createActivity(admin as never, (await curriculum.createSection(admin as never, own.module.id, { title: 'Quiz lesson', ordinal: 2 })).id,
      { title: 'Quiz', type: 'knowledge_check', ordinal: 1, contentRef: { kind: 'none' } });
    await expect(curriculum.updateActivity(admin as never, quizActivity.id, { contentRef: { kind: 'assignment', id: template.id } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(curriculum.createActivity(admin as never, own.section.id, { title: 'Quiz 2', type: 'knowledge_check', ordinal: 2, contentRef: { kind: 'assignment', id: template.id } })).rejects.toBeInstanceOf(BadRequestException);
    // changing the type of a linked guided_practice activity to a quiz is refused instead of leaving a mismatch
    await expect(curriculum.updateActivity(admin as never, own.activity.id, { type: 'knowledge_check' })).rejects.toBeInstanceOf(BadRequestException);
    expect((await db.learning_activities.findUniqueOrThrow({ where: { id: own.activity.id } })).type).toBe('guided_practice');
  });

  it('keeps the quiz link working for knowledge_check activities', async () => {
    const f = await fixture('QuizStillWorks', 'knowledge_check');
    const quiz = await questions.createQuizAssignment(admin as never, f.module.id, 'Quiz', '', 70);
    const linked = await curriculum.updateActivity(admin as never, f.activity.id, { contentRef: { kind: 'assignment', id: quiz.id } });
    expect(linked.content_ref).toEqual({ kind: 'assignment', id: quiz.id });
  });

  it('rejects an assignment that belongs to another course or lesson', async () => {
    const a = await fixture('CourseA');
    const b = await fixture('CourseB');
    const foreign = await save(b.activity.id);
    await expect(curriculum.updateActivity(admin as never, a.activity.id, { contentRef: { kind: 'assignment', id: foreign.id } })).rejects.toThrow('Referenced assignment must belong to the activity lesson.');
    await expect(curriculum.createActivity(admin as never, a.section.id, { title: 'X', type: 'guided_practice', ordinal: 2, contentRef: { kind: 'assignment', id: foreign.id } })).rejects.toBeInstanceOf(BadRequestException);
    // a second module of the SAME course is also a different lesson scope
    const sibling = await learning.createCourseLesson(admin as never, a.course.id, { title: 'Module 2', content: { summary: '' } });
    const siblingSection = await curriculum.createSection(admin as never, sibling.id, { title: 'Lesson', ordinal: 1 });
    const siblingActivity = await curriculum.createActivity(admin as never, siblingSection.id, { title: 'Other', type: 'guided_practice', ordinal: 1, contentRef: { kind: 'none' } });
    const own = await save(a.activity.id);
    await expect(curriculum.updateActivity(admin as never, siblingActivity.id, { contentRef: { kind: 'assignment', id: own.id } })).rejects.toBeInstanceOf(BadRequestException);
    expect((await db.learning_activities.findUniqueOrThrow({ where: { id: siblingActivity.id } })).content_ref).toEqual({ kind: 'none' });
    expect((await db.learning_activities.findUniqueOrThrow({ where: { id: a.activity.id } })).content_ref).toEqual({ kind: 'assignment', id: own.id });
  });

  it('rejects unauthorized authoring (no permission, other organization, anonymous-like)', async () => {
    const f = await fixture('Authz');
    const organization = await db.organizations.create({ data: { name: `Authz ${crypto.randomUUID()}`, type: 'institution', segment: 'education' } });
    const teacher = { authUserId: 't', vistaUserId: crypto.randomUUID(), email: 't@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: 'm', organizationId: organization.id, roleCode: 'teacher', status: 'active', permissions: ['learning.delivery.manage'] }] } as unknown as AuthenticatedUser;
    const student = { ...teacher, memberships: [], systemPermissions: ['learning.work.write'] } as unknown as AuthenticatedUser;
    const disabled = { ...admin, status: 'disabled' } as unknown as AuthenticatedUser;
    for (const user of [teacher, student, disabled]) {
      await expect(save(f.activity.id, {}, user)).rejects.toBeInstanceOf(NotFoundException);
      await expect(curriculum.programmingAssignment(user as never, f.activity.id)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await rows(f.module.id)).toHaveLength(0);
    expect((await db.learning_activities.findUniqueOrThrow({ where: { id: f.activity.id } })).content_ref).toEqual({ kind: 'none' });
  });

  it('validates the configuration and the activity type', async () => {
    const f = await fixture('Validate');
    for (const bad of [{ title: '   ' }, { title: 'x'.repeat(201) }, { allowedBlocks: [] }, { allowedBlocks: ['home', 'home'] }, { allowedBlocks: ['course2.ai'] }, { instructions: 'x'.repeat(10_001) }]) {
      await expect(save(f.activity.id, bad)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(await rows(f.module.id)).toHaveLength(0);
    const reading = await curriculum.createActivity(admin as never, f.section.id, { title: 'Read', type: 'reading', ordinal: 2, contentRef: { kind: 'lesson_content', key: 'summary' } });
    await expect(save(reading.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to edit a template that was already delivered to a classroom, and a frozen archived course', async () => {
    const f = await fixture('Delivered');
    const template = await save(f.activity.id);
    const organization = await db.organizations.create({ data: { name: `Delivered ${crypto.randomUUID()}`, type: 'institution', segment: 'education' } });
    const offering = await db.learning_course_offerings.create({ data: { course_id: f.course.id, organization_id: organization.id, code: `o-${crypto.randomUUID().slice(0, 8)}`, status: 'active' } });
    const room = await createClassroom(db, organization.id, offering.id, `c-${crypto.randomUUID().slice(0, 8)}`);
    await db.learning_classroom_assignments.create({ data: { classroom_id: room.id, assignment_id: template.id, status: 'draft' } });
    expect((await save(f.activity.id, { title: 'Draft delivery is still editable' })).title).toBe('Draft delivery is still editable');
    await db.learning_classroom_assignments.updateMany({ where: { assignment_id: template.id }, data: { status: 'published' } });
    await expect(save(f.activity.id, { title: 'Too late' })).rejects.toBeInstanceOf(ConflictException);
    expect((await curriculum.programmingAssignment(admin as never, f.activity.id))?.title).toBe('Draft delivery is still editable');
    const archived = await fixture('Archived');
    await db.learning_courses.update({ where: { id: archived.course.id }, data: { status: 'archived' } });
    await expect(save(archived.activity.id)).rejects.toBeInstanceOf(ConflictException);
  });
});
