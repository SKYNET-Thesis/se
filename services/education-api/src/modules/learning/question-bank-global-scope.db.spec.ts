import { createHash } from 'node:crypto';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
import { BadRequestException, ConflictException } from '@nestjs/common';
import { QuestionBankService } from './question-bank.service';
import { toCsv } from './question-import';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { createDb, createSystemAdmin, createWorld, describeDb, type Db } from './db-test-support';

const content = (stem: string) => ({ type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answerKey: ['a'], explanation: 'Because A is the safe action.' });
const importFile = (code: string) => Buffer.from(toCsv([
  ['code', 'type', 'difficulty', 'cognitive_level', 'stem', 'option_a', 'option_b', 'option_c', 'correct', 'points', 'explanation'],
  [code, 'single_choice', 'easy', 'understand', 'Which is safe?', 'Stop', 'Go', '', 'A', '1', 'Stop first.'],
]));

describeDb('real PostgreSQL Question Bank scope: global and school-scoped questions (migration F)', () => {
  const db: Db = createDb();
  let bank: QuestionBankService;
  let admin: AuthenticatedUser;
  beforeAll(async () => {
    await db.$connect();
    bank = new QuestionBankService(db as never);
    admin = await createSystemAdmin(db);
    // The schema contract under test is migration F; fail loudly (not silently) if the disposable DB lacks it.
    const column = await db.$queryRaw<Array<{ is_nullable: string }>>`SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_questions' AND column_name='organization_id'`;
    if (column[0]?.is_nullable !== 'YES') throw new Error('Migration 20261111_f_global_question_scope.sql must be applied to the disposable test database first.');
  });
  afterAll(async () => { await db.$disconnect(); });

  async function globalContext() {
    const x = await createWorld(db);
    const objective = await db.learning_objectives.create({ data: { lesson_id: x.lesson.id, code: `O-${x.suffix}`, description: 'Objective' } });
    return { ...x, objective };
  }
  async function schoolContext() {
    const x = await createWorld(db);
    const course = await db.learning_courses.create({ data: { title: `School ${x.suffix}`, status: 'draft', organization_id: x.org.id } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'SL1', ordinal: 1 } });
    const objective = await db.learning_objectives.create({ data: { lesson_id: lesson.id, code: `SO-${x.suffix}`, description: 'Objective' } });
    return { ...x, schoolCourse: course, schoolLesson: lesson, objective };
  }

  async function schoolAuthor(organizationId: string, roleCode: 'school_admin' | 'instructor') {
    const role = await db.roles.create({ data: { code: `${roleCode}-${crypto.randomUUID()}`, name: roleCode, scope: 'organization' } });
    const permission = await db.permissions.upsert({ where: { code: 'learning.course.author' }, update: {}, create: { code: 'learning.course.author' } });
    await db.role_permissions.create({ data: { role_id: role.id, permission_id: permission.id } });
    const user = await db.users.create({ data: { full_name: roleCode, signup_method: 'admin_created', status: 'active' } });
    await db.memberships.create({ data: { user_id: user.id, organization_id: organizationId, role_id: role.id, status: 'active' } });
    return { authUserId: crypto.randomUUID(), vistaUserId: user.id, email: `${roleCode}@test`, status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [] } as unknown as AuthenticatedUser;
  }

  it('lets a System Admin create, edit, publish, import, and read objectives in a Global Course', async () => {
    const x = await globalContext();
    await expect(bank.lessonObjectives(admin, x.lesson.id)).resolves.toEqual([expect.objectContaining({ id: x.objective.id, code: x.objective.code })]);

    const authored = await bank.authorLessonQuestion(admin, x.lesson.id, { code: `GQ-AUTH-${x.suffix}`, content: content('Global authoring?'), newObjective: 'Global objective.' });
    expect(authored.status).toBe('published');
    expect(await db.learning_questions.findUnique({ where: { id: authored.questionId } })).toMatchObject({ organization_id: null, course_id: x.course.id, lesson_id: x.lesson.id });

    const draft = await bank.authorLessonQuestion(admin, x.lesson.id, { code: `GQ-EDIT-${x.suffix}`, content: content('Before edit?'), objectiveId: x.objective.id, publish: false });
    await expect(bank.updateDraft(admin, draft.versionId, { stem: 'After edit?' })).resolves.toMatchObject({ stem: 'After edit?' });
    await expect(bank.submitReview(admin, draft.versionId)).resolves.toMatchObject({ status: 'in_review' });
    await expect(bank.publish(admin, draft.versionId)).resolves.toMatchObject({ status: 'published' });

    const imported = await bank.importCommit(admin, x.lesson.id, 'global.csv', importFile(`GQ-IMPORT-${x.suffix}`), { objectiveId: x.objective.id, publish: true, confirm: true, expectedSha256: sha(importFile(`GQ-IMPORT-${x.suffix}`)) });
    expect(imported).toMatchObject({ total: 1, valid: 1, created: 1, failed: 0 });
    expect(await db.learning_questions.findFirst({ where: { code: `GQ-IMPORT-${x.suffix}`, course_id: x.course.id } })).toMatchObject({ organization_id: null, lesson_id: x.lesson.id });
  });

  it.each(['school_admin', 'instructor'] as const)('%s cannot create or modify questions in a Global Course', async (roleCode) => {
    const global = await globalContext();
    const school = await createWorld(db);
    const user = await schoolAuthor(school.org.id, roleCode);
    await expect(bank.lessonObjectives(user, global.lesson.id)).rejects.toThrow(/not found/i);
    await expect(bank.authorLessonQuestion(user, global.lesson.id, { code: `DENY-${global.suffix}`, content: content('Unauthorized?'), objectiveId: global.objective.id })).rejects.toThrow(/not found/i);
    const globalQuestion = await bank.createQuestion(admin, { courseId: global.course.id, lessonId: global.lesson.id, code: `PRIVATE-${global.suffix}` } as never);
    await expect(bank.createVersion(user, globalQuestion.id, content('Cannot edit?') as never)).rejects.toThrow(/not found/i);
    await expect(bank.importPreview(user, global.lesson.id, 'global.csv', importFile(`DENY-IMPORT-${global.suffix}`))).rejects.toThrow(/not found/i);
    expect(await db.learning_questions.count({ where: { lesson_id: global.lesson.id, code: { startsWith: 'DENY' } } })).toBe(0);
  });

  it('keeps cross-tenant question and lesson reads hidden from school authors', async () => {
    const global = await globalContext();
    const ownSchool = await schoolContext();
    const user = await schoolAuthor(ownSchool.org.id, 'school_admin');
    const globalQuestion = await bank.createQuestion(admin, { courseId: global.course.id, lessonId: global.lesson.id, code: `CROSS-${global.suffix}` } as never);
    await expect(bank.get(user, globalQuestion.id)).rejects.toThrow(/not found/i);
    await expect(bank.lessonObjectives(user, global.lesson.id)).rejects.toThrow(/not found/i);
  });

  it('creates a global question (organization NULL) and enforces per-course code uniqueness', async () => {
    const x = await globalContext();
    const created = await bank.createQuestion(admin, { courseId: x.course.id, lessonId: x.lesson.id, code: 'GQ-1' } as never);
    expect(created.organization_id).toBeNull();
    await expect(bank.createQuestion(admin, { courseId: x.course.id, lessonId: x.lesson.id, code: 'GQ-1' } as never)).rejects.toBeInstanceOf(ConflictException);
    // the same code in a different global course is a different identity
    const other = await globalContext();
    await expect(bank.createQuestion(admin, { courseId: other.course.id, lessonId: other.lesson.id, code: 'GQ-1' } as never)).resolves.toMatchObject({ organization_id: null });
  });

  it('runs the whole authoring chain for a global question: version, objective, review, publish, quiz assignment', async () => {
    const x = await globalContext();
    const question = await bank.createQuestion(admin, { courseId: x.course.id, lessonId: x.lesson.id, code: 'GQ-2' } as never);
    const version = await bank.createVersion(admin, question.id, content('Which is safe?') as never);
    await bank.mapObjectives(admin, version.id, { objectiveIds: [x.objective.id] } as never);
    await bank.submitReview(admin, version.id);
    await expect(bank.publish(admin, version.id)).resolves.toMatchObject({ status: 'published' });
    const quiz = await bank.createQuizAssignment(admin, x.lesson.id, 'Global quiz', 'Read carefully', 80);
    await expect(bank.addToAssignment(admin, quiz.id, { questionVersionId: version.id, ordinal: 1, points: 1 } as never)).resolves.toMatchObject({ question_version_id: version.id });
    const authoring = await bank.quizAuthoringAssignment(admin, x.lesson.id);
    expect(authoring?.questions.map((q) => q.versionId)).toEqual([version.id]);
  });

  it('keeps school-scoped questions scoped to their organization, with (organization, code) uniqueness', async () => {
    const x = await schoolContext();
    const created = await bank.createQuestion(admin, { organizationId: x.org.id, courseId: x.schoolCourse.id, lessonId: x.schoolLesson.id, code: 'SQ-1' } as never);
    expect(created.organization_id).toBe(x.org.id);
    await expect(bank.createQuestion(admin, { organizationId: x.org.id, courseId: x.schoolCourse.id, lessonId: x.schoolLesson.id, code: 'SQ-1' } as never)).rejects.toBeInstanceOf(ConflictException);
    const version = await bank.createVersion(admin, created.id, content('School question') as never);
    await bank.mapObjectives(admin, version.id, { objectiveIds: [x.objective.id] } as never);
    await bank.submitReview(admin, version.id);
    await expect(bank.publish(admin, version.id)).resolves.toMatchObject({ status: 'published' });
  });

  it('rejects scope mismatches at the service and, if the service is bypassed, at the database trigger', async () => {
    const g = await globalContext();
    const s = await schoolContext();
    // service level
    await expect(bank.createQuestion(admin, { organizationId: s.org.id, courseId: g.course.id, lessonId: g.lesson.id, code: 'X1' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(bank.createQuestion(admin, { courseId: s.schoolCourse.id, lessonId: s.schoolLesson.id, code: 'X2' } as never)).rejects.toBeInstanceOf(BadRequestException);
    // database level: NULL-safe comparison still rejects a global question on a school lesson and vice versa
    await expect(db.learning_questions.create({ data: { organization_id: null as never, code: 'X3', course_id: s.schoolCourse.id, lesson_id: s.schoolLesson.id, created_by: admin.vistaUserId } })).rejects.toThrow(/must match/);
    await expect(db.learning_questions.create({ data: { organization_id: s.org.id, code: 'X4', course_id: g.course.id, lesson_id: g.lesson.id, created_by: admin.vistaUserId } })).rejects.toThrow(/must match/);
  });

  it('rejects mapping an objective of another lesson to a global question version', async () => {
    const g = await globalContext();
    const foreign = await globalContext();
    const question = await bank.createQuestion(admin, { courseId: g.course.id, lessonId: g.lesson.id, code: 'GQ-3' } as never);
    const version = await bank.createVersion(admin, question.id, content('Scope check') as never);
    await expect(bank.mapObjectives(admin, version.id, { objectiveIds: [foreign.objective.id] } as never)).rejects.toBeInstanceOf(BadRequestException);
    // database level (service bypassed): the objective trigger compares organizations NULL-safely and lessons strictly
    await expect(db.learning_question_version_objectives.create({ data: { question_version_id: version.id, objective_id: foreign.objective.id } })).rejects.toThrow(/Question objective must belong/);
  });
});
