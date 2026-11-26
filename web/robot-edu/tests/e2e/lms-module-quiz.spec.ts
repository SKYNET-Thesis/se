import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { SO101_CURRICULUM } from '../../../../services/education-api/src/scripts/so101-curriculum.data';
import { call, deliverCourse, loadFixture, signIn } from './helpers/academic';

/** Module-end quiz journey on the seeded SO-101 curriculum (20 weighted questions per module): delivery, locked next module, fail, retake, pass, unlock, history. */
const COURSE = SO101_CURRICULUM[0]; const MODULE = COURSE.modules[0];
const run = Date.now().toString(36).toUpperCase();

test('Module-end quiz: weights are shown before submission, scoring and pass threshold apply, retake unlocks the next module', async ({ page }) => {
  test.setTimeout(300_000);
  const fixture = await loadFixture();
  const classroomName = `Foundations quiz ${run}`;
  const classroomId = await deliverCourse(page, fixture, COURSE.title, classroomName, ['Phase 2.4.3 Test Student', 'Phase 2.4.3 Test Instructor']);

  const admin = await signIn(page, fixture, 'admin'); // the seeded curriculum is global: a System Administrator reads it
  const courses = await call(page, admin, 'GET', `/courses?page=1&pageSize=20&q=${encodeURIComponent(COURSE.title)}`);
  const course = (courses.body.items as Array<{ id: string; title: string }>).filter((c) => c.title === COURSE.title)[0];
  const lessons = (await call(page, admin, 'GET', `/courses/${course.id}/lessons`)).body as Array<{ id: string; title: string; prerequisiteLessonIds: string[] }>;
  expect(lessons.map((l) => l.title)).toEqual(COURSE.modules.map((m) => m.title));           // three modules, quiz at the end of each
  expect(lessons[1].prerequisiteLessonIds).toEqual([lessons[0].id]);                           // progression: module 2 needs module 1
  const quizId = (await call(page, admin, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessons[0].id}/assignment`)).body.id as string;

  await signIn(page, fixture, 'instructor');
  await page.goto('/teacher/quizzes');
  await page.getByRole('combobox', { name: 'Classroom' }).selectOption({ label: classroomName });
  await page.getByLabel('Published canonical quiz').selectOption(quizId);
  await page.getByLabel(/Maximum attempts|Attempt limit/i).fill('3');
  const delivered = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/classrooms/${classroomId}/quiz-deliveries`));
  await page.getByRole('button', { name: 'Save quiz as draft' }).click();
  const delivery = await (await delivered).json() as { id: string; assignment_id: string };
  const published = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/classrooms/${classroomId}/assignments/${delivery.assignment_id}/publish`));
  await page.getByRole('button', { name: 'Publish to learners' }).click();
  await page.getByRole('dialog', { name: 'Publish this quiz to students?' }).getByRole('button', { name: 'Publish to students' }).click();
  expect((await published).ok()).toBeTruthy();

  const student = await signIn(page, fixture, 'student');
  const pathOf = async () => (await call(page, student, 'GET', `/me/courses/${course.id}/path`)).body as { lessons: Array<{ status: string }> };
  // On a fresh stack module 2 is locked behind module 1; when earlier runs already unlocked it for this student only the quiz mechanics are asserted.
  const fresh = (await pathOf()).lessons[1].status === 'locked';
  if (fresh) expect((await call(page, student, 'GET', `/lessons/${lessons[1].id}`)).status).toBe(409);

  // complete the two readings of module 1 (real activity completion endpoint)
  const sections = await call(page, student, 'GET', `/lessons/${lessons[0].id}/sections`);
  expect(sections.status).toBe(200);
  const activities = ((Array.isArray(sections.body) ? sections.body : sections.body.sections) as Array<{ activities?: Array<{ id: string; type: string }> }>).flatMap((section) => section.activities ?? []);
  const readings = activities.filter((a) => a.type === 'reading');
  expect(readings.length).toBe(2);
  for (const reading of readings) expect([200, 201]).toContain((await call(page, student, 'POST', `/me/activities/${reading.id}/complete`, {})).status);

  const answerAll = async (mode: 'wrong' | 'right') => {
    for (const q of MODULE.quiz.questions) {
      const group = page.locator('fieldset').filter({ hasText: q.stem }).first();
      await expect(group).toBeVisible();
      await expect(group.getByTestId(/question-points|quiz-question-points/).first()).toBeVisible();   // weight shown before submission
      const chosen = mode === 'right' ? q.options.filter((o) => q.answer.includes(o.id)) : [q.options.find((o) => !q.answer.includes(o.id))!];
      for (const option of chosen) await group.getByText(option.text, { exact: true }).click();
    }
  };
  const total = MODULE.quiz.questions.reduce((sum, q) => sum + q.weight, 0);
  const submit = async () => { await page.getByRole('button', { name: 'Submit quiz' }).click(); await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click(); };

  const typeLabel: Record<string, string> = { single_choice: 'Single Choice', multiple_choice: 'Multiple Choice', true_false: 'True/False' };
  const count = (pick: (q: typeof MODULE.quiz.questions[number]) => string) => MODULE.quiz.questions.reduce<Record<string, number>>((m, q) => ({ ...m, [pick(q)]: (m[pick(q)] ?? 0) + 1 }), {});
  const shotDir = process.env.VISTA_E2E_SCREENSHOT_DIR;
  if (shotDir) await mkdir(shotDir, { recursive: true });
  const attemptIdOf = () => page.url().match(/practice\/([0-9a-f-]{36})/)![1];

  // attempt 1: every answer wrong => not passed
  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: /^(Start|Continue) attempt$/ }).click();
  await expect(page).toHaveURL(/\/practice\//);
  await expect(page.getByTestId('quiz-total-points')).toContainText(`Total: ${total} points`);
  await answerAll('wrong');
  await submit();
  await expect(page.getByRole('heading', { name: 'Not passed yet' })).toBeVisible();
  await expect(page.getByText(/Required: 70%/)).toBeVisible();
  const attempt1 = attemptIdOf();
  const dash1 = page.getByRole('region', { name: 'Quiz performance' });
  await expect(dash1).toBeVisible();
  await expect(dash1.getByTestId('quiz-pass-fail')).toHaveText('FAIL');
  await expect(dash1.getByTestId('quiz-weighted-score')).toHaveText('0%');
  await expect(dash1.getByTestId('quiz-rating')).toHaveText('Needs Review');
  await expect(dash1.getByTestId('quiz-points-summary')).toContainText(`0 of ${total} points earned`);
  await expect(dash1.getByTestId('quiz-counts')).toContainText(`0 correct · ${MODULE.quiz.questions.length} incorrect · 0 unanswered`);
  for (const [type, n] of Object.entries(count((q) => q.type))) await expect(dash1.getByTestId('quiz-type-analytics')).toContainText(`${typeLabel[type]}0/${n} correct · accuracy 0%`);
  for (const absent of Object.keys(typeLabel).filter((t) => !(t in count((q) => q.type)))) await expect(dash1.getByTestId('quiz-type-analytics')).not.toContainText(typeLabel[absent]);
  for (const [difficulty, n] of Object.entries(count((q) => q.difficulty))) await expect(dash1.getByTestId('quiz-difficulty-analytics')).toContainText(`${difficulty[0].toUpperCase()}${difficulty.slice(1)}0/${n} correct · 0%`);
  await expect(dash1.getByTestId('quiz-objective-analytics')).toBeVisible();
  const recs = dash1.getByTestId('quiz-recommendation');
  expect(await recs.count()).toBeGreaterThan(0); expect(await recs.count()).toBeLessThanOrEqual(5);
  await expect(recs.first()).toContainText('priority');
  const reviewHref = await recs.first().getByRole('link', { name: /^Review Lesson/ }).getAttribute('href');
  expect(reviewHref).toMatch(/^\/courses\/[0-9a-f-]{36}\/lessons\/[0-9a-f-]{36}/);
  if (shotDir) { await page.setViewportSize({ width: 1100, height: 2800 }); await dash1.scrollIntoViewIfNeeded(); await dash1.screenshot({ path: `${shotDir}/quiz-result-fail.png` }); await page.setViewportSize({ width: 1280, height: 720 }); }
  // the API is owner-scoped, discloses no answer key and the result is the one recorded at grading
  const apiResult = await call(page, student, 'GET', `/me/attempts/${attempt1}/quiz-result`);
  expect(apiResult.status).toBe(200);
  expect(JSON.stringify(apiResult.body)).not.toMatch(/answerKey|answer_key/);
  expect(apiResult.body).toMatchObject({ passed: false, passPercent: 70, earnedPoints: 0, possiblePoints: total });
  const otherStudent = await signIn(page, fixture, 'otherStudent');
  expect([403, 404]).toContain((await call(page, otherStudent, 'GET', `/me/attempts/${attempt1}/quiz-result`)).status);
  const instructorToken = await signIn(page, fixture, 'instructor');
  expect([403, 404]).toContain((await call(page, instructorToken, 'GET', `/me/attempts/${attempt1}/quiz-result`)).status);
  await signIn(page, fixture, 'student');
  await page.goto(`/practice/${attempt1}`);
  await expect(dash1).toBeVisible(); // a past attempt shows the same analysis when reopened (history preserved)
  // Review Lesson navigates to real, accessible learning content
  await recs.first().getByRole('link', { name: /^Review Lesson/ }).click();
  await expect(page).toHaveURL(new RegExp(reviewHref!.replace(/[/]/g, '\\/')));
  await expect(page.getByText(/not found|unavailable/i)).toHaveCount(0);
  if (fresh) expect((await pathOf()).lessons[1].status).toBe('locked');

  // attempt 2: every answer right => passed, module 1 completed, module 2 unlocked
  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: 'Start a new attempt' }).click();
  await answerAll('right');
  await submit();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  await expect(page.getByTestId('quiz-earned-points')).toContainText(`${total}`);
  const dash2 = page.getByRole('region', { name: 'Quiz performance' });
  await expect(dash2.getByTestId('quiz-pass-fail')).toHaveText('PASS');
  await expect(dash2.getByTestId('quiz-weighted-score')).toHaveText('100%');
  await expect(dash2.getByTestId('quiz-rating')).toHaveText('Excellent');
  await expect(dash2.getByTestId('quiz-counts')).toContainText(`${MODULE.quiz.questions.length} correct · 0 incorrect · 0 unanswered`);
  await expect(dash2.getByTestId('quiz-recommendations')).toContainText('no review is suggested');
  await expect(dash2.getByTestId('quiz-recommendation')).toHaveCount(0);
  if (shotDir) { await page.setViewportSize({ width: 1100, height: 2800 }); await dash2.screenshot({ path: `${shotDir}/quiz-result-pass.png` }); await page.setViewportSize({ width: 1280, height: 720 }); }
  const after = await pathOf();
  expect(after.lessons[0].status).toBe('completed'); expect(after.lessons[1].status).not.toBe('locked');
  expect((await call(page, student, 'GET', `/lessons/${lessons[1].id}`)).status).toBe(200);

  // attempt history lists both attempts with their results
  await page.goto(`/my-learning/${delivery.id}`);
  const attempts = (await call(page, student, 'GET', '/me/attempts')).body as Array<{ classroom_assignment_id: string; status: string }>;
  expect(attempts.filter((a) => a.classroom_assignment_id === delivery.id).length).toBe(2);
  await expect(page.getByText('Attempt 1').first()).toBeVisible(); await expect(page.getByText('Attempt 2').first()).toBeVisible();
});
