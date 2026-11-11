import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { QuestionBankService } from './question-bank.service';

const org = '11111111-1111-4111-8111-111111111111';
const course = '22222222-2222-4222-8222-222222222222';
const lesson = '33333333-3333-4333-8333-333333333333';
const question = '44444444-4444-4444-8444-444444444444';
const version = '55555555-5555-4555-8555-555555555555';
const objective = '66666666-6666-4666-8666-666666666666';
const assignment = '77777777-7777-4777-8777-777777777777';
const author = { vistaUserId: '88888888-8888-4888-8888-888888888888', status: 'active', systemPermissions: [], memberships: [] } as any;
const admin = { ...author, systemPermissions: ['org.manage'] };
const content = { type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem: 'Choose one', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answerKey: ['a'], explanation: 'Because A' };
const q = { id: question, organization_id: org, course_id: course, lesson_id: lesson };
const v = { id: version, question_id: question, version_number: 1, question: q, status: 'draft', type: content.type, difficulty: content.difficulty, cognitive_level: content.cognitiveLevel, stem: content.stem, options: content.options, answer_key: content.answerKey, explanation: content.explanation, source_reference: null };

describe('QuestionBankService', () => {
  let db: any;
  let service: QuestionBankService;
  beforeEach(() => {
    db = {
      $queryRaw: jest.fn().mockResolvedValue([]), $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(async (arg) => typeof arg === 'function' ? arg(db) : Promise.all(arg)),
      learning_lessons: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue({ content: {} }) },
      learning_questions: { findUnique: jest.fn().mockResolvedValue(q), create: jest.fn().mockResolvedValue(q), findMany: jest.fn().mockResolvedValue([q]), count: jest.fn().mockResolvedValue(1) },
      learning_question_versions: { findUnique: jest.fn().mockResolvedValue(v), findUniqueOrThrow: jest.fn().mockResolvedValue(v), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => data), findMany: jest.fn().mockResolvedValue([v]), count: jest.fn().mockResolvedValue(1), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockImplementation(async ({ data }) => data) },
      learning_objectives: { findMany: jest.fn().mockResolvedValue([{ id: objective }]) },
      learning_question_version_objectives: { count: jest.fn().mockResolvedValue(1), deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([{ objective_id: objective }]) },
      learning_assignments: { findUnique: jest.fn().mockResolvedValue({ id: assignment, lesson_id: lesson, learning_lessons: { course_id: course, learning_courses: { organization_id: org } } }) },
      learning_classroom_assignments: { findFirst: jest.fn().mockResolvedValue(null) },
      learning_assignment_question_versions: { create: jest.fn().mockImplementation(async ({ data }) => data), deleteMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([{ question_version_id: version }]), update: jest.fn() },
    };
    service = new QuestionBankService(db as PrismaService);
  });

  it('creates an organization-scoped question with a matching lesson', async () => {
    db.learning_lessons.findUnique.mockResolvedValue({ course_id: course, learning_courses: { organization_id: org } });
    await expect(service.createQuestion(admin, { organizationId: org, courseId: course, lessonId: lesson, code: 'Q-1' })).resolves.toEqual(q);
    expect(db.learning_questions.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organization_id: org, lesson_id: lesson, code: 'Q-1' }) });
  });
  it('creates a global-catalog question without an organization for a system administrator', async () => {
    const globalQuestion = { ...q, organization_id: null };
    db.learning_lessons.findUnique.mockResolvedValue({ course_id: course, learning_courses: { organization_id: null } });
    db.learning_questions.create.mockResolvedValue(globalQuestion);
    await expect(service.createQuestion(admin, { courseId: course, lessonId: lesson, code: 'GLOBAL-1' } as never)).resolves.toEqual(globalQuestion);
    expect(db.learning_questions.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organization_id: null, course_id: course, lesson_id: lesson }) });
  });
  it('rejects a duplicate organization code', async () => {
    db.learning_lessons.findUnique.mockResolvedValue({ course_id: course, learning_courses: { organization_id: org } });
    db.learning_questions.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }));
    await expect(service.createQuestion(admin, { organizationId: org, courseId: course, lessonId: lesson, code: 'Q-1' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('denies a learner and another organization', async () => {
    await expect(service.get(author, question)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.learning_questions.findUnique).toHaveBeenCalled();
  });
  it('creates only one lesson quiz draft and keeps it separate from classroom delivery', async () => {
    db.$queryRaw.mockResolvedValue([{ organization_id: org, legacy: false }]);
    db.learning_assignments.findMany = jest.fn().mockResolvedValue([]);
    db.learning_assignments.create = jest.fn().mockImplementation(async ({ data }) => ({ id: assignment, ...data }));
    const result = await service.createQuizAssignment(admin, lesson, 'Safety Quiz', 'Instructions', 75);
    expect(result).toMatchObject({ id: assignment, lesson_id: lesson, constraints: { kind: 'knowledge_check', passPercent: 75 } });
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.learning_classroom_assignments.findFirst).not.toHaveBeenCalled();
  });
  it('allows a system administrator to attach a published question to a global canonical quiz', async () => {
    db.learning_assignments.findUnique.mockResolvedValue({ id: assignment, lesson_id: lesson, challenge_id: null, constraints: { kind: 'knowledge_check' }, learning_lessons: { course_id: course, learning_courses: { organization_id: null } } });
    db.learning_question_versions.findUnique.mockResolvedValue({ ...v, status: 'published', question: { ...q, organization_id: null } });
    db.$queryRaw.mockResolvedValue([]);
    const result = await service.addToAssignment(admin, assignment, { questionVersionId: version, ordinal: 1, points: 1 });
    expect(result).toMatchObject({ assignment_id: assignment, question_version_id: version, ordinal: 1 });
  });
  it('rejects duplicate lesson quiz drafts', async () => {
    db.$queryRaw.mockResolvedValue([{ organization_id: org, legacy: false }]);
    db.learning_assignments.findMany = jest.fn().mockResolvedValue([{ id: assignment }]);
    await expect(service.createQuizAssignment(admin, lesson, 'Safety Quiz', '', 80)).rejects.toBeInstanceOf(ConflictException);
  });
  it('returns only published same-lesson authoring questions without answer keys', async () => {
    db.$queryRaw.mockResolvedValue([{ course_id: course, organization_id: org }]);
    db.learning_question_versions.findMany.mockResolvedValue([{ ...v, question: { ...q, code: 'SAFE-1' }, objectives: [{ objective: { id: objective, code: 'LO-1', description: 'Safety' } }] }]);
    db.learning_question_versions.count.mockResolvedValue(1);
    const result = await service.quizAuthoringQuestions(admin, lesson, 'safe', 'single_choice', 1, 20);
    expect(result.items[0]).toMatchObject({ id: version, questionId: question, code: 'SAFE-1', objectives: [{ id: objective, code: 'LO-1' }] });
    expect(result.items[0]).not.toHaveProperty('answer_key');
    expect(result.items[0]).not.toHaveProperty('answerKey');
    expect(db.learning_question_versions.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'published', objectives: { some: {} } }), skip: 0, take: 20 }));
  });
  it('creates sequential versions under a row lock', async () => {
    db.learning_question_versions.findFirst.mockResolvedValue({ version_number: 3 });
    const result = await service.createVersion(admin, question, content);
    expect(result.version_number).toBe(4);
    expect(db.$queryRaw).toHaveBeenCalled();
  });
  it('allocates distinct numbers for concurrent version requests', async () => {
    let next = 0;
    let tail = Promise.resolve();
    db.$transaction.mockImplementation((work: (tx: any) => Promise<any>) => {
      const result = tail.then(() => work(db));
      tail = result.then(() => undefined);
      return result;
    });
    db.learning_question_versions.findFirst.mockImplementation(async () => next ? { version_number: next } : null);
    db.learning_question_versions.create.mockImplementation(async ({ data }: any) => { next = data.version_number; return data; });
    const [first, second] = await Promise.all([service.createVersion(admin, question, content), service.createVersion(admin, question, content)]);
    expect([first.version_number, second.version_number]).toEqual([1, 2]);
    // two version-number allocations, each serialized by a FOR UPDATE lock on the question (status checks are separate reads)
    expect(db.$queryRaw.mock.calls.filter((call: unknown[]) => String((call[0] as TemplateStringsArray).join('?')).includes('FOR UPDATE'))).toHaveLength(2);
  });
  it.each([
    ['invalid type', { type: 'essay' }],
    ['missing answer', { answerKey: [] }],
    ['unknown answer', { answerKey: ['x'] }],
    ['duplicate option', { options: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] }],
    ['multiple choice with one answer', { type: 'multiple_choice' }],
    ['true false with wrong IDs', { type: 'true_false' }],
  ])('rejects %s', async (_label, override) => {
    await expect(service.createVersion(admin, question, { ...content, ...override })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts valid multiple choice and true false versions', async () => {
    await expect(service.createVersion(admin, question, { ...content, type: 'multiple_choice', answerKey: ['a', 'b'] })).resolves.toBeDefined();
    await expect(service.createVersion(admin, question, { ...content, type: 'true_false', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], answerKey: ['true'] })).resolves.toBeDefined();
  });
  it('rejects a cross-lesson outcome', async () => {
    db.learning_objectives.findMany.mockResolvedValue([]);
    await expect(service.mapObjectives(admin, version, { objectiveIds: [objective] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('updates a draft but preserves published versions', async () => {
    await expect(service.updateDraft(admin, version, { stem: 'Revised' })).resolves.toEqual(v);
    db.learning_question_versions.findUnique.mockResolvedValue({ ...v, status: 'published' });
    await expect(service.updateDraft(admin, version, { stem: 'Changed' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('submits a draft for review', async () => {
    await expect(service.submitReview(admin, version)).resolves.toEqual({ id: version, status: 'in_review' });
  });
  it('requires a system publisher and at least one LO', async () => {
    db.learning_question_versions.findUnique.mockResolvedValue({ ...v, status: 'in_review' });
    db.learning_question_versions.findUniqueOrThrow.mockResolvedValue({ status: 'in_review' });
    await expect(service.publish(author, version)).rejects.toBeInstanceOf(NotFoundException);
    db.learning_question_version_objectives.count.mockResolvedValue(0);
    await expect(service.publish(admin, version)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('publishes and archives without changing answer content', async () => {
    db.learning_question_versions.findUnique.mockResolvedValue({ ...v, status: 'in_review' });
    db.learning_question_versions.findUniqueOrThrow.mockResolvedValue({ status: 'in_review' });
    await expect(service.publish(admin, version)).resolves.toMatchObject({ status: 'published' });
    db.learning_question_versions.findUnique.mockResolvedValue({ ...v, status: 'published' });
    await expect(service.archive(admin, version)).resolves.toEqual({ id: version, status: 'archived' });
  });
  it('preserves version history', async () => {
    await expect(service.history(admin, question)).resolves.toEqual([v]);
  });
  it('pins only a published lesson-matching version with LO to a draft assignment', async () => {
    db.learning_question_versions.findUnique.mockResolvedValue({ ...v, status: 'published' });
    await expect(service.addToAssignment(admin, assignment, { questionVersionId: version, ordinal: 1, points: 2 })).resolves.toMatchObject({ question_version_id: version });
    db.learning_question_versions.findUnique.mockResolvedValue(v);
    await expect(service.addToAssignment(admin, assignment, { questionVersionId: version, ordinal: 1, points: 2 })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('reports Learning Outcome coverage for an assignment', async () => {
    db.learning_assignment_question_versions.findMany.mockResolvedValue([{ question_version_id: version, version: { objectives: [{ objective_id: objective }] } }]);
    db.learning_objectives.findMany.mockResolvedValue([{ id: objective }, { id: question }]);
    await expect(service.assignmentQuestions(admin, assignment)).resolves.toMatchObject({ coveredObjectiveIds: [objective], missingObjectiveIds: [question] });
  });
  it('locks assignment mappings after delivery', async () => {
    db.learning_classroom_assignments.findFirst.mockResolvedValue({ id: 'delivery' });
    await expect(service.removeFromAssignment(admin, assignment, version)).rejects.toBeInstanceOf(ConflictException);
  });
  it('keeps legacy Course 1 assignment untouched', async () => {
    db.learning_lessons.findFirst.mockResolvedValue({ content: { courseOverview: { label: 'Course 1' } } });
    await expect(service.addToAssignment(admin, assignment, { questionVersionId: version, ordinal: 1, points: 2 })).rejects.toBeInstanceOf(ConflictException);
  });
  describe('archived course freeze', () => {
    /** Course status lookups answer "archived"; the lesson/assignment ownership reads answer normally. */
    const archiveCourse = () => db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = String(strings.join('?'));
      if (sql.includes('SELECT status FROM public.learning_courses')) return [{ status: 'archived' }];
      if (sql.includes('AS legacy')) return [{ organization_id: org, legacy: false, course_id: course }];
      if (sql.includes('FROM public.learning_assignments a JOIN public.learning_lessons l')) return [{ course_id: course }];
      return [];
    });
    const writes = () => [
      db.learning_questions.create, db.learning_question_versions.create, db.learning_question_versions.updateMany,
      db.learning_assignment_question_versions.create, db.learning_assignment_question_versions.deleteMany,
      db.learning_assignments.create, db.learning_assignments.update, db.learning_question_version_objectives.createMany,
    ].filter(Boolean);

    it.each([
      ['create a question', () => service.createQuestion(admin, { organizationId: org, courseId: course, lessonId: lesson, code: 'Q-9' } as never)],
      ['create a version', () => service.createVersion(admin, question, content as never)],
      ['edit a draft', () => service.updateDraft(admin, version, { stem: 'Revised' })],
      ['map objectives', () => service.mapObjectives(admin, version, { objectiveIds: [objective] })],
      ['submit for review', () => service.submitReview(admin, version)],
      ['publish a version', () => service.publish(admin, version)],
      ['archive a version', () => service.archive(admin, version)],
      ['create the quiz assignment', () => service.createQuizAssignment(admin, lesson, 'Quiz', 'Instructions', 80)],
      ['reconfigure the quiz', () => service.updateQuizAssignment(admin, lesson, assignment, 'Quiz', 'Instructions', 80)],
      ['add a quiz question', () => service.addToAssignment(admin, assignment, { questionVersionId: version, ordinal: 1, points: 1 })],
      ['remove a quiz question', () => service.removeFromAssignment(admin, assignment, version)],
      ['reorder quiz questions', () => service.reorderAssignment(admin, assignment, { orderedVersionIds: [version] })],
    ])('rejects %s when the parent course is archived and writes nothing', async (_name, call) => {
      db.learning_lessons.findUnique.mockResolvedValue({ course_id: course, learning_courses: { organization_id: org } });
      db.learning_assignments.findUnique.mockResolvedValue({ id: assignment, lesson_id: lesson, constraints: { kind: 'knowledge_check' }, challenge_id: null, learning_lessons: { course_id: course, learning_courses: { organization_id: org } } });
      archiveCourse();
      await expect(call()).rejects.toThrow(/archived/);
      for (const write of writes()) expect(write).not.toHaveBeenCalled();
    });

    it('keeps reads available for an archived course (history and results stay readable)', async () => {
      archiveCourse();
      db.learning_assignment_question_versions.findMany.mockResolvedValue([{ version: { objectives: [] } }]);
      await expect(service.assignmentQuestions(admin, assignment)).resolves.toMatchObject({ items: [expect.anything()] });
    });
  });
});
