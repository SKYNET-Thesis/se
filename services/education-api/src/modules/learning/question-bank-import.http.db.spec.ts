import { createHash } from 'node:crypto';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { QuestionBankController } from './question-bank.controller';
import { QuestionBankService } from './question-bank.service';
import { ProgressionService } from './progression.service';
import { gradeQuestionBankQuiz } from './question-bank-quiz.snapshot';
import { buildXlsx, toCsv } from './question-import';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { createDb, createSystemAdmin, createWorld, describeDb, schoolAdminUser, type Db } from './db-test-support';

const H = ['code', 'type', 'difficulty', 'cognitive_level', 'stem', 'option_a', 'option_b', 'option_c', 'correct', 'points', 'explanation'];
const row = (stem: string, correct = 'A', points = '') => ['', 'single_choice', 'easy', 'remember', stem, 'yes', 'no', '', correct, points, 'because'];

describeDb('Question Bank import over real HTTP multipart + real PostgreSQL', () => {
  const db: Db = createDb();
  let app: INestApplication; let admin: AuthenticatedUser; let outsider: AuthenticatedUser; let progression: ProgressionService;
  const tokens = new Map<string, AuthenticatedUser>();
  class TokenGuard implements CanActivate {
    canActivate(ctx: ExecutionContext) { const r = ctx.switchToHttp().getRequest(); const u = tokens.get(String(r.headers.authorization ?? '').replace('Bearer ', '')); if (!u) return false; r.user = u; return true; }
  }
  beforeAll(async () => {
    await db.$connect();
    admin = await createSystemAdmin(db); tokens.set('admin', admin);
    const other = await createWorld(db); outsider = schoolAdminUser(other.org.id); tokens.set('outsider', outsider);
    const bank = new QuestionBankService(db as never);
    progression = new ProgressionService(db as never, {} as never);
    const module = await Test.createTestingModule({ controllers: [QuestionBankController], providers: [{ provide: QuestionBankService, useValue: bank }] }).overrideGuard(SupabaseAuthGuard).useValue(new TokenGuard()).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true })); await app.init();
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); });

  async function school() {
    const x = await createWorld(db);
    const course = await db.learning_courses.create({ data: { title: `S ${x.suffix}`, status: 'draft', organization_id: x.org.id } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'L1', ordinal: 1 } });
    return { ...x, course, lesson };
  }
  const base = (lessonId: string) => `/api/v1/author/question-bank/quiz-authoring/lessons/${lessonId}`;
  const csv = (rows: string[][]) => Buffer.from(toCsv([H, ...rows]));
  const count = (lessonId: string) => db.learning_questions.count({ where: { lesson_id: lessonId } });

  it('previews CSV and XLSX over multipart without writing, then commits only valid non-duplicate rows', async () => {
    const x = await school();
    const file = csv([row('Q one'), row('Q two', 'B', '2'), row('q  ONE'), row('Bad', 'Z')]);
    const p = await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import/preview`).set('Authorization', 'Bearer admin').attach('file', file, 'q.csv').expect(201);
    expect(p.body).toMatchObject({ total: 4, valid: 2, invalid: 1, duplicates: 1 });
    expect(await count(x.lesson.id)).toBe(0);
    const px = await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import/preview`).set('Authorization', 'Bearer admin').attach('file', buildXlsx([H, row('X1'), row('X2')]), 'q.xlsx').expect(201);
    expect(px.body).toMatchObject({ total: 2, valid: 2 });
    expect(await count(x.lesson.id)).toBe(0);

    const c = await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import`).set('Authorization', 'Bearer admin').field('newObjective', 'Outcome').field('confirm', 'true').field('publish', 'true').field('expectedSha256', sha(file)).attach('file', file, 'q.csv').expect(201);
    expect(c.body).toMatchObject({ created: 2, failed: 0, invalid: 1, duplicates: 1 });
    expect(c.body.results.map((r: { rowNumber: number; points?: number }) => [r.rowNumber, r.points])).toEqual([[2, 1], [3, 2]]);
    expect(await count(x.lesson.id)).toBe(2);
    const cx = await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import`).set('Authorization', 'Bearer admin').field('newObjective', 'Second').field('confirm', 'true').field('publish', 'true').field('expectedSha256', sha(buildXlsx([H, row('X1'), row('X2')]))).attach('file', buildXlsx([H, row('X1'), row('X2')]), 'q.xlsx').expect(201);
    expect(cx.body.created).toBe(2);
    expect(await count(x.lesson.id)).toBe(4);
  });

  it('rejects missing, unsupported, malformed and oversized files and unauthenticated or unauthorized callers', async () => {
    const x = await school();
    const url = `${base(x.lesson.id)}/import/preview`; const auth = { Authorization: 'Bearer admin' };
    await request(app.getHttpServer()).post(url).set(auth).expect(400);
    await request(app.getHttpServer()).post(url).set(auth).attach('file', Buffer.from('a'), 'q.pdf').expect(400);
    await request(app.getHttpServer()).post(url).set(auth).attach('file', csv([row('Q')]), { filename: 'q.csv', contentType: 'application/pdf' }).expect(400).expect((r) => expect(r.body.message).toMatch(/Unsupported file type/));
    await request(app.getHttpServer()).post(url).set(auth).attach('file', csv([row('Q')]), { filename: 'q.csv', contentType: 'image/png' }).expect(400);
    await request(app.getHttpServer()).post(url).set(auth).attach('file', Buffer.from('a'), 'q.csv').expect(400); // no header row/columns
    await request(app.getHttpServer()).post(url).set(auth).attach('file', Buffer.from('not a zip'), 'q.xlsx').expect(400);
    await request(app.getHttpServer()).post(url).set(auth).attach('file', Buffer.from('a,"b'), 'q.csv').expect(400);
    await request(app.getHttpServer()).post(url).set(auth).attach('file', Buffer.alloc(1024 * 1024 + 10, 'a'), 'q.csv').expect(413);
    await request(app.getHttpServer()).post(url).attach('file', csv([row('Q')]), 'q.csv').expect(403);
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer nobody').attach('file', csv([row('Q')]), 'q.csv').expect(403);
    expect(await count(x.lesson.id)).toBe(0);
  });

  it('denies cross-school preview and import (404) and writes nothing', async () => {
    const x = await school();
    const file = csv([row('Q')]);
    await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import/preview`).set('Authorization', 'Bearer outsider').attach('file', file, 'q.csv').expect(404);
    await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import`).set('Authorization', 'Bearer outsider').field('newObjective', 'o').field('confirm', 'true').field('expectedSha256', sha(file)).attach('file', file, 'q.csv').expect(404);
    expect(await count(x.lesson.id)).toBe(0);
  });

  it('serves CSV and XLSX templates that import cleanly', async () => {
    const x = await school();
    const csvRes = await request(app.getHttpServer()).get('/api/v1/author/question-bank/quiz-authoring/import-template?format=csv').set('Authorization', 'Bearer admin').buffer().parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(csvRes.headers['content-disposition']).toContain('question-bank-template.csv');
    const xlsx = await request(app.getHttpServer()).get('/api/v1/author/question-bank/quiz-authoring/import-template?format=xlsx').set('Authorization', 'Bearer admin').buffer().parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    for (const [body, name] of [[csvRes.body, 'q.csv'], [xlsx.body, 'q.xlsx']] as const) {
      const r = await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import/preview`).set('Authorization', 'Bearer admin').attach('file', body, name).expect(201);
      expect(r.body).toMatchObject({ total: 3, valid: 3 });
    }
    await request(app.getHttpServer()).get('/api/v1/author/question-bank/quiz-authoring/import-template?format=pdf').set('Authorization', 'Bearer admin').expect(400);
  });

  it('weighted quiz: A=3 pts wrong, B=1 pt right → 1/4 = 25%, and the issued snapshot is immune to later bank/quiz edits', async () => {
    const x = await school();
    const c = await request(app.getHttpServer()).post(`${base(x.lesson.id)}/import`).set('Authorization', 'Bearer admin').field('newObjective', 'Outcome').field('confirm', 'true').field('publish', 'true').field('expectedSha256', sha(csv([row('Question A', 'A', '3'), row('Question B', 'A', '1')])))
      .attach('file', csv([row('Question A', 'A', '3'), row('Question B', 'A', '1')]), 'q.csv').expect(201);
    const bank = new QuestionBankService(db as never);
    const quiz = await bank.createQuizAssignment(admin, x.lesson.id, 'Weighted', 'go', 50);
    const [a, b] = c.body.results as Array<{ versionId: string; points: number }>;
    await bank.addToAssignment(admin, quiz.id, { questionVersionId: a.versionId, ordinal: 1, points: a.points } as never);
    await bank.addToAssignment(admin, quiz.id, { questionVersionId: b.versionId, ordinal: 2, points: b.points } as never);
    const { publicSnapshot, privateSnapshot } = await progression.prepareQuestionBankQuiz(db as never, quiz.id, x.lesson.id, x.org.id, 50);
    const answers = [{ questionId: a.versionId, optionId: 'b' }, { questionId: b.versionId, optionId: 'a' }]; // A wrong, B right
    const graded = gradeQuestionBankQuiz(publicSnapshot, privateSnapshot, quiz.id, x.lesson.id, { answers } as never);
    expect(graded).toMatchObject({ earnedPoints: 1, possiblePoints: 4, score: 25, passed: false });
    expect(graded.feedback.map((f) => [f.correct, f.earnedPoints, f.possiblePoints])).toEqual([[false, 0, 3], [true, 1, 1]]);
    // plain correct-count (1 of 2 = 50%) would have wrongly passed a 50% threshold
    // later bank edits and quiz point changes do not alter grading of the already issued snapshot
    await db.learning_assignment_question_versions.updateMany({ where: { assignment_id: quiz.id, question_version_id: a.versionId }, data: { points: 1 } });
    await db.learning_question_versions.update({ where: { id: a.versionId }, data: { stem: 'Edited later' } }).catch(() => undefined);
    expect(gradeQuestionBankQuiz(publicSnapshot, privateSnapshot, quiz.id, x.lesson.id, { answers } as never)).toMatchObject({ score: 25, possiblePoints: 4 });
    // a freshly issued quiz reflects the new weights instead (points are quiz-specific)
    const fresh = await progression.prepareQuestionBankQuiz(db as never, quiz.id, x.lesson.id, x.org.id, 50);
    expect(gradeQuestionBankQuiz(fresh.publicSnapshot, fresh.privateSnapshot, quiz.id, x.lesson.id, { answers } as never)).toMatchObject({ score: 50 });
    // question-bank content carries no points
    expect(await db.learning_question_versions.findUnique({ where: { id: a.versionId } })).not.toHaveProperty('points');
  });
});
