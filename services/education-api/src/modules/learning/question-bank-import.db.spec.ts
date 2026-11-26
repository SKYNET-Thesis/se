import { createHash } from 'node:crypto';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QuestionBankService } from './question-bank.service';
import { buildXlsx, templateTable, toCsv } from './question-import';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { createDb, createSystemAdmin, createWorld, describeDb, schoolAdminUser, type Db } from './db-test-support';

const H = ['code', 'type', 'difficulty', 'cognitive_level', 'stem', 'option_a', 'option_b', 'option_c', 'correct', 'points', 'explanation'];

describeDb('real PostgreSQL Question Bank CSV/XLSX import', () => {
  const db: Db = createDb();
  let bank: QuestionBankService;
  let admin: AuthenticatedUser;
  beforeAll(async () => { await db.$connect(); bank = new QuestionBankService(db as never); admin = await createSystemAdmin(db); });
  afterAll(async () => { await db.$disconnect(); });

  async function school() {
    const x = await createWorld(db);
    const course = await db.learning_courses.create({ data: { title: `S ${x.suffix}`, status: 'draft', organization_id: x.org.id } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'L1', ordinal: 1 } });
    return { ...x, course, lesson };
  }
  const csv = (rows: string[][]) => Buffer.from(toCsv([H, ...rows]));

  it('previews without writing, then imports valid rows, skips duplicates and reports row errors', async () => {
    const x = await school();
    const file = csv([
      ['', 'single_choice', 'easy', 'remember', 'What is 1+1?', '2', '3', '', 'A', '3', 'Basic.'],
      ['', 'multiple_choice', 'easy', 'remember', 'Pick primes', '2', '4', '3', 'A;C', '1', 'Primes.'],
      ['', 'single_choice', 'easy', 'remember', 'what is  1+1?', '2', '3', '', 'A', '', 'dup in file'],
      ['', 'single_choice', 'easy', 'remember', 'Broken', '2', '3', '', 'D', '', 'bad key'],
    ]);
    const preview = await bank.importPreview(admin, x.lesson.id, 'q.csv', file);
    expect(preview).toMatchObject({ total: 4, valid: 2, invalid: 1, duplicates: 1 });
    expect(preview.items[3].errors[0]).toMatch(/does not exist/);
    expect(await db.learning_questions.count({ where: { lesson_id: x.lesson.id } })).toBe(0);

    const done = await bank.importCommit(admin, x.lesson.id, 'q.csv', file, { newObjective: 'Arithmetic', publish: true, confirm: true, expectedSha256: sha(file) });
    expect(done).toMatchObject({ created: 2, failed: 0 });
    const versions = await db.learning_question_versions.findMany({ where: { question: { is: { lesson_id: x.lesson.id } } }, include: { objectives: true } });
    expect(versions).toHaveLength(2);
    expect(versions.every((v) => v.status === 'published' && v.objectives.length === 1)).toBe(true);
    expect(versions.find((v) => v.stem === 'Pick primes')?.answer_key).toEqual(['a', 'c']);

    // re-import is now fully duplicate-detected against the bank
    const again = await bank.importPreview(admin, x.lesson.id, 'q.csv', file);
    expect(again.duplicates).toBe(3);
    expect(again.items[0].duplicateOf).toMatchObject({ existingCode: expect.any(String) });
  });

  it('imports XLSX and the imported questions feed a weighted quiz', async () => {
    const x = await school();
    const table = [H, ['', 'single_choice', 'easy', 'remember', 'Heavy?', 'y', 'n', '', 'A', '3', 'e'], ['', 'single_choice', 'easy', 'remember', 'Light?', 'y', 'n', '', 'A', '1', 'e']];
    const out = await bank.importCommit(admin, x.lesson.id, 'q.xlsx', buildXlsx(table), { newObjective: 'Obj', publish: true, confirm: true, expectedSha256: sha(buildXlsx(table)) });
    expect(out.created).toBe(2);
    const quiz = await bank.createQuizAssignment(admin, x.lesson.id, 'Weighted', 'go', 50);
    for (const [i, r] of out.results.entries()) await bank.addToAssignment(admin, quiz.id, { questionVersionId: r.versionId!, ordinal: i + 1, points: r.points } as never);
    const built = await bank.quizAuthoringAssignment(admin, x.lesson.id);
    expect(built?.questions.map((q) => Number(q.points))).toEqual([3, 1]);
  });

  it('denies import to users without authoring rights in the owning school and never writes', async () => {
    const x = await school();
    const other = await createWorld(db);
    const outsider = schoolAdminUser(other.org.id);
    const file = csv([['', 'single_choice', 'easy', 'remember', 'Q', 'a', 'b', '', 'A', '', 'e']]);
    await expect(bank.importPreview(outsider, x.lesson.id, 'q.csv', file)).rejects.toBeInstanceOf(NotFoundException);
    await expect(bank.importCommit(outsider, x.lesson.id, 'q.csv', file, { newObjective: 'o', publish: true, confirm: true, expectedSha256: sha(file) })).rejects.toBeInstanceOf(NotFoundException);
    expect(await db.learning_questions.count({ where: { lesson_id: x.lesson.id } })).toBe(0);
  });

  it('refuses an unauthorized caller before revealing request-validation errors (no confirm, no hash)', async () => {
    const x = await school();
    const outsider = schoolAdminUser((await createWorld(db)).org.id);
    const file = csv([['', 'single_choice', 'easy', 'remember', 'Q', 'a', 'b', '', 'A', '', 'e']]);
    await expect(bank.importCommit(outsider, x.lesson.id, 'q.csv', file, { newObjective: 'o', publish: false })).rejects.toBeInstanceOf(NotFoundException);
    expect(await db.learning_questions.count({ where: { lesson_id: x.lesson.id } })).toBe(0);
  });

  it('imports global-course lessons for a system administrator and requires a learning outcome', async () => {
    const g = await createWorld(db);
    const file = Buffer.from(toCsv(templateTable()));
    await expect(bank.importPreview(admin, g.lesson.id, 't.csv', file)).resolves.toMatchObject({ total: 3, valid: 3 });
    const imported = await bank.importCommit(admin, g.lesson.id, 't.csv', file, { newObjective: 'Global question outcome.', publish: true, confirm: true, expectedSha256: sha(file) });
    expect(imported).toMatchObject({ created: 3, failed: 0 });
    const globalQuestions = await db.learning_questions.findMany({ where: { lesson_id: g.lesson.id } });
    expect(globalQuestions).toHaveLength(3);
    expect(globalQuestions.every((question) => question.organization_id === null)).toBe(true);
    const x = await school();
    await expect(bank.importCommit(admin, x.lesson.id, 't.csv', file, { publish: true, confirm: true, expectedSha256: sha(file) })).rejects.toThrow(/Learning Outcome/);
  });

  describe('mapping, draft default, hash binding and idempotency', () => {
    const HM = [...H, 'course', 'lesson', 'learning_section', 'topic', 'learning_objective'];
    const mrow = (stem: string, extra: Partial<Record<'course' | 'lesson' | 'section' | 'topic' | 'objective' | 'difficulty' | 'points', string>> = {}) =>
      ['', 'single_choice', extra.difficulty ?? 'medium', 'remember', stem, 'Yes', 'No', '', 'A', extra.points ?? '', 'Because.', extra.course ?? '', extra.lesson ?? '', extra.section ?? '', extra.topic ?? '', extra.objective ?? ''];
    const file = (rows: string[][]) => Buffer.from(toCsv([HM, ...rows]));

    it('resolves course/lesson/section/objective against the selected lesson and excludes rows that name something else', async () => {
      const x = await school();
      await db.learning_sections.create({ data: { lesson_id: x.lesson.id, title: 'Safety basics', ordinal: 1, status: 'draft' } });
      await db.learning_objectives.create({ data: { lesson_id: x.lesson.id, code: 'LO-1', description: 'Stay safe', ordinal: 1 } });
      const f = file([
        mrow('Ok by title', { course: x.course.title, lesson: 'L1', section: 'Safety basics', objective: 'LO-1', topic: 'Safety' }),
        mrow('Ok by ordinal', { lesson: '1' }),
        mrow('Wrong lesson', { lesson: '7' }),
        mrow('Wrong course', { course: 'Another course' }),
        mrow('Unknown section', { section: 'Nope' }),
        mrow('Unknown objective', { objective: 'LO-99' }),
      ]);
      const preview = await bank.importPreview(admin, x.lesson.id, 'm.csv', f);
      expect(preview.items.map((i) => i.status)).toEqual(['valid', 'valid', 'invalid', 'invalid', 'invalid', 'invalid']);
      expect(preview.items[2].errors[0]).toMatch(/lesson "7" does not match/);
      expect(preview.items[3].errors[0]).toMatch(/course "Another course" does not match/);
      expect(preview.items[4].errors[0]).toMatch(/learning_section "Nope" does not exist/);
      expect(preview.items[5].errors[0]).toMatch(/learning_objective "LO-99"/);
      expect(preview.items[0]).toMatchObject({ objectiveResolved: true, topic: 'Safety', learningSection: 'Safety basics' });
      expect(preview.fileSha256).toBe(sha(f));
    });

    it('shows difficulty default points and keeps explicit points', async () => {
      const x = await school();
      const preview = await bank.importPreview(admin, x.lesson.id, 'p.csv', file([mrow('E', { difficulty: 'easy' }), mrow('M', { difficulty: 'medium' }), mrow('H', { difficulty: 'hard' }), mrow('X', { difficulty: 'hard', points: '7' })]));
      expect(preview.items.map((i) => [i.points, i.pointsSource])).toEqual([[1, 'default'], [2, 'default'], [3, 'default'], [7, 'file']]);
    });

    it('requires explicit confirmation and the previewed file hash, and writes nothing otherwise', async () => {
      const x = await school();
      const f = file([mrow('Needs confirm')]);
      await expect(bank.importCommit(admin, x.lesson.id, 'c.csv', f, { newObjective: 'o', publish: false, expectedSha256: sha(f) })).rejects.toBeInstanceOf(BadRequestException);
      await expect(bank.importCommit(admin, x.lesson.id, 'c.csv', f, { newObjective: 'o', publish: false, confirm: true })).rejects.toBeInstanceOf(ConflictException);
      await expect(bank.importCommit(admin, x.lesson.id, 'c.csv', f, { newObjective: 'o', publish: false, confirm: true, expectedSha256: sha(file([mrow('Different file')])) })).rejects.toBeInstanceOf(ConflictException);
      expect(await db.learning_questions.count({ where: { lesson_id: x.lesson.id } })).toBe(0);
    });

    it('imports as DRAFT by default, records topic and audit reference, preserves history and is idempotent', async () => {
      const x = await school();
      await db.learning_objectives.create({ data: { lesson_id: x.lesson.id, code: 'LO-1', description: 'Stay safe', ordinal: 1 } });
      const f = file([mrow('Idempotent question one', { objective: 'LO-1', topic: 'Safety' }), mrow('Idempotent question two', { objective: 'LO-1' })]);
      const opts = { publish: false, confirm: true, expectedSha256: sha(f) };
      const first = await bank.importCommit(admin, x.lesson.id, 'i.csv', f, opts);
      expect(first).toMatchObject({ created: 2, failed: 0 });
      const versions = await db.learning_question_versions.findMany({ where: { question: { is: { lesson_id: x.lesson.id } } }, include: { question: true, objectives: true }, orderBy: { created_at: 'asc' } });
      expect(versions.map((v) => v.status)).toEqual(['draft', 'draft']);
      expect(versions.every((v) => v.objectives.length === 1)).toBe(true);
      expect(versions[0].question.domain).toBe('Safety');
      expect(versions[0].source_reference).toMatch(/^import:[0-9A-F]{8}:row2$/);
      const again = await bank.importCommit(admin, x.lesson.id, 'i.csv', f, opts);
      expect(again).toMatchObject({ created: 0, failed: 0, duplicates: 2 });
      expect(await db.learning_questions.count({ where: { lesson_id: x.lesson.id } })).toBe(2);
    });

    it('treats the same explicit code with the same question as already imported (duplicate), but a reused code with a different question stays an error', async () => {
      const x = await school();
      const withCode = (code: string, stem: string) => { const r = mrow(stem); r[0] = code; return r; };
      const f = file([withCode('EXT-1', 'Explicit code question one'), withCode('EXT-2', 'Explicit code question two')]);
      const opts = { newObjective: 'Outcome', publish: false, confirm: true, expectedSha256: sha(f) };
      expect(await bank.importCommit(admin, x.lesson.id, 'e.csv', f, opts)).toMatchObject({ created: 2 });
      const again = await bank.importPreview(admin, x.lesson.id, 'e.csv', f);
      expect(again).toMatchObject({ valid: 0, invalid: 0, duplicates: 2 });
      const conflict = await bank.importPreview(admin, x.lesson.id, 'e2.csv', file([withCode('EXT-1', 'A different question reusing the code')]));
      expect(conflict.items[0]).toMatchObject({ status: 'invalid' });
      expect(conflict.items[0].errors[0]).toMatch(/code already exists/);
    });

    it('imports true_false rows and adding a question to a quiz defaults points from difficulty', async () => {
      const x = await school();
      const tf = Buffer.from(toCsv([['type', 'difficulty', 'stem', 'correct', 'explanation'], ['true_false', 'hard', 'Stops must be cleared first', 'true', 'Safety.']]));
      const out = await bank.importCommit(admin, x.lesson.id, 'tf.csv', tf, { newObjective: 'TF outcome', publish: true, confirm: true, expectedSha256: sha(tf) });
      expect(out).toMatchObject({ created: 1 });
      const version = await db.learning_question_versions.findFirstOrThrow({ where: { question: { is: { lesson_id: x.lesson.id } } } });
      expect(version).toMatchObject({ type: 'true_false', status: 'published' });
      expect(version.options).toEqual([{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }]);
      const quiz = await bank.createQuizAssignment(admin, x.lesson.id, 'Defaults', 'go', 50);
      const added = await bank.addToAssignment(admin, quiz.id, { questionVersionId: version.id, ordinal: 1 });
      expect(Number(added.points)).toBe(3);
    });
  });
});
