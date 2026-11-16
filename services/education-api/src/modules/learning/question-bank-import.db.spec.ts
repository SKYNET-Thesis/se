import { NotFoundException } from '@nestjs/common';
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

    const done = await bank.importCommit(admin, x.lesson.id, 'q.csv', file, { newObjective: 'Arithmetic', publish: true });
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
    const out = await bank.importCommit(admin, x.lesson.id, 'q.xlsx', buildXlsx(table), { newObjective: 'Obj', publish: true });
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
    await expect(bank.importCommit(outsider, x.lesson.id, 'q.csv', file, { newObjective: 'o', publish: true })).rejects.toBeInstanceOf(NotFoundException);
    expect(await db.learning_questions.count({ where: { lesson_id: x.lesson.id } })).toBe(0);
  });

  it('refuses global-course lessons and requires a learning outcome', async () => {
    const g = await createWorld(db);
    const file = Buffer.from(toCsv(templateTable()));
    await expect(bank.importPreview(admin, g.lesson.id, 't.csv', file)).rejects.toBeInstanceOf(NotFoundException);
    const x = await school();
    await expect(bank.importCommit(admin, x.lesson.id, 't.csv', file, { publish: true })).rejects.toThrow(/Learning Outcome/);
  });
});
