import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { QuestionBankService } from './question-bank.service';
import { createDb, createSystemAdmin, createWorld, describeDb, type Db } from './db-test-support';

const content = (stem: string) => ({ type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answerKey: ['a'], explanation: 'Because A.' });

/** Real PostgreSQL: once the parent course is archived every Question Bank / quiz mutation is refused, reads keep working. */
describeDb('real PostgreSQL archived-course freeze for Question Bank and quiz assignments', () => {
  const db: Db = createDb();
  let bank: QuestionBankService;
  let admin: AuthenticatedUser;
  beforeAll(async () => { await db.$connect(); bank = new QuestionBankService(db as never); admin = await createSystemAdmin(db); });
  afterAll(async () => { await db.$disconnect(); });

  /** A global course with: a published question linked to a quiz assignment, plus a draft and an in-review version. */
  async function seededCourse() {
    const x = await createWorld(db);
    const objective = await db.learning_objectives.create({ data: { lesson_id: x.lesson.id, code: `O-${x.suffix}`, description: 'Objective' } });
    const question = await bank.createQuestion(admin, { courseId: x.course.id, lessonId: x.lesson.id, code: 'Q-1' } as never);
    const published = await bank.createVersion(admin, question.id, content('Published?') as never);
    await bank.mapObjectives(admin, published.id, { objectiveIds: [objective.id] } as never);
    await bank.submitReview(admin, published.id);
    await bank.publish(admin, published.id);
    const quiz = await bank.createQuizAssignment(admin, x.lesson.id, 'Quiz', 'Instructions', 80);
    await bank.addToAssignment(admin, quiz.id, { questionVersionId: published.id, ordinal: 1, points: 1 } as never);
    const second = await bank.createQuestion(admin, { courseId: x.course.id, lessonId: x.lesson.id, code: 'Q-2' } as never);
    const draft = await bank.createVersion(admin, second.id, content('Draft?') as never);
    const third = await bank.createQuestion(admin, { courseId: x.course.id, lessonId: x.lesson.id, code: 'Q-3' } as never);
    const inReview = await bank.createVersion(admin, third.id, content('In review?') as never);
    await bank.mapObjectives(admin, inReview.id, { objectiveIds: [objective.id] } as never);
    await bank.submitReview(admin, inReview.id);
    return { x, objective, question, published, quiz, second, draft, inReview };
  }
  const snapshotOf = async (quizId: string, lessonId: string) => JSON.stringify({
    links: await db.learning_assignment_question_versions.findMany({ where: { assignment_id: quizId }, orderBy: { ordinal: 'asc' } }),
    assignment: await db.learning_assignments.findUniqueOrThrow({ where: { id: quizId } }),
    versions: await db.learning_question_versions.findMany({ where: { question: { lesson_id: lessonId } }, orderBy: { id: 'asc' }, select: { id: true, status: true, stem: true, updated_at: true } }),
    questions: await db.learning_questions.count({ where: { lesson_id: lessonId } }),
  });

  it('rejects every mutation for an archived course and changes no row', async () => {
    const f = await seededCourse();
    await db.learning_courses.update({ where: { id: f.x.course.id }, data: { status: 'archived' } });
    const before = await snapshotOf(f.quiz.id, f.x.lesson.id);
    const extra = await db.learning_questions.findFirstOrThrow({ where: { code: 'Q-2', lesson_id: f.x.lesson.id } });

    const attempts: Array<[string, () => Promise<unknown>]> = [
      ['create question', () => bank.createQuestion(admin, { courseId: f.x.course.id, lessonId: f.x.lesson.id, code: 'Q-9' } as never)],
      ['create version', () => bank.createVersion(admin, extra.id, content('New version') as never)],
      ['edit draft', () => bank.updateDraft(admin, f.draft.id, { stem: 'Edited' })],
      ['map objectives', () => bank.mapObjectives(admin, f.draft.id, { objectiveIds: [f.objective.id] } as never)],
      ['submit review', () => bank.submitReview(admin, f.draft.id)],
      ['publish version', () => bank.publish(admin, f.inReview.id)],
      ['archive version', () => bank.archive(admin, f.published.id)],
      ['reconfigure quiz', () => bank.updateQuizAssignment(admin, f.x.lesson.id, f.quiz.id, 'Changed', 'Changed', 50)],
      ['add quiz question', () => bank.addToAssignment(admin, f.quiz.id, { questionVersionId: f.published.id, ordinal: 2, points: 1 } as never)],
      ['remove quiz question', () => bank.removeFromAssignment(admin, f.quiz.id, f.published.id)],
      ['reorder quiz questions', () => bank.reorderAssignment(admin, f.quiz.id, { orderedVersionIds: [f.published.id] } as never)],
    ];
    for (const [name, attempt] of attempts) {
      await expect(attempt().then(() => `${name}: accepted`, (error) => error)).resolves.toBeInstanceOf(ConflictException);
    }
    expect(await snapshotOf(f.quiz.id, f.x.lesson.id)).toBe(before);
  });

  it('refuses to create the quiz assignment of an archived course', async () => {
    const x = await createWorld(db);
    await db.learning_courses.update({ where: { id: x.course.id }, data: { status: 'archived' } });
    await expect(bank.createQuizAssignment(admin, x.lesson.id, 'Quiz', 'Instructions', 80)).rejects.toBeInstanceOf(ConflictException);
    expect(await db.learning_assignments.count({ where: { lesson_id: x.lesson.id } })).toBe(0);
  });

  it('keeps reads and history available for an archived course', async () => {
    const f = await seededCourse();
    await db.learning_courses.update({ where: { id: f.x.course.id }, data: { status: 'archived' } });
    const authoring = await bank.quizAuthoringAssignment(admin, f.x.lesson.id);
    expect(authoring?.questions.map((q) => q.versionId)).toEqual([f.published.id]);
    await expect(bank.assignmentQuestions(admin, f.quiz.id)).resolves.toMatchObject({ items: [expect.objectContaining({ question_version_id: f.published.id })] });
    await expect(bank.history(admin, f.question.id)).resolves.toBeDefined();
  });

  it('works normally again for a course that is not archived (published/draft courses keep their existing guards)', async () => {
    const f = await seededCourse();
    await expect(bank.updateQuizAssignment(admin, f.x.lesson.id, f.quiz.id, 'Renamed quiz', 'Instructions', 70)).resolves.toMatchObject({ title: 'Renamed quiz' });
    await db.learning_courses.update({ where: { id: f.x.course.id }, data: { status: 'published' } });
    await expect(bank.updateDraft(admin, f.draft.id, { stem: 'Edited while published' })).resolves.toMatchObject({ stem: 'Edited while published' });
  });
});
