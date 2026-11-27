import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/** Visual-review capture of deep pages (quiz, assignment, rubric scoring, builder, question bank, import, media). Not an assertion suite. */
const dir = process.env.VISTA_SHOT_DIR ?? '/tmp/vista-shots-deep';
mkdirSync(dir, { recursive: true });
const fixture = await loadFixture();
const f = fixture as unknown as { courseId: string; lessonId: string; quizActivityId: string; readingActivityId: string; classroomId: string; programDeliveryId: string };
const sizes = [[1440, 900], [390, 844]] as const;
let submissionId = '';
async function shoot(page: Page, id: string) {
  for (const [w, h] of sizes) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(700); await page.screenshot({ path: path.join(dir, `${id}-${w}.png`) }); }
}
const go = async (page: Page, url: string) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1800); };

test('student: quiz, assignment, result', async ({ page }) => {
  test.setTimeout(300_000);
  const token = await signIn(page, fixture, 'student');
  const attempt = await call(page, token, 'POST', `/classroom-assignments/${f.programDeliveryId}/attempts`);
  const attemptId = (attempt.body as { id: string }).id;
  const program = await call(page, token, 'POST', `/me/attempts/${attemptId}/program`, { title: 'Capture', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'home', arm: 'left' }] } });
  const version = await call(page, token, 'POST', `/me/programs/${(program.body as { id: string }).id}/versions`, { changeSummary: 'capture' });
  const sub = await call(page, token, 'POST', `/me/attempts/${attemptId}/submission`, { programVersionId: (version.body as { id: string }).id });
  submissionId = (sub.body as { id?: string }).id ?? '';
  await go(page, `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.quizActivityId}`); await shoot(page, 'student-quiz');
  await go(page, `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.readingActivityId}`); await shoot(page, 'student-reading');
  await go(page, `/my-learning/${f.programDeliveryId}`); await shoot(page, 'student-assignment-detail');
});

test('instructor: submission review with rubric scoring, then released student result', async ({ page }) => {
  test.setTimeout(300_000);
  const token = await signIn(page, fixture, 'instructor');
  if (!submissionId) { const list = await call(page, token, 'GET', `/classrooms/${f.classroomId}/submissions`); submissionId = ((list.body as Array<{ id: string }>)[0] ?? { id: '' }).id; }
  await go(page, `/teacher/classes/${f.classroomId}/submissions/${submissionId}`); await shoot(page, 'instructor-submission-review');
  await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTo(0, m.scrollHeight); }); await page.waitForTimeout(500); await shoot(page, 'instructor-grading-panel');
  const first = page.getByLabel(/^Score for /).first();
  if (await first.count()) { await first.fill('2'); await page.waitForTimeout(300); await shoot(page, 'instructor-rubric-partial'); }
  await go(page, `/teacher/submissions`); await shoot(page, 'instructor-submissions-list');
});

test('admin: course builder, quiz builder, question bank, import wizard, media', async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, fixture, 'admin');
  await go(page, `/admin/courses/${f.courseId}?tab=curriculum`); await shoot(page, 'builder-curriculum');
  const quizNode = page.getByText('Safety quiz').first();
  if (await quizNode.count()) { await quizNode.click(); await page.waitForTimeout(1500); await shoot(page, 'builder-quiz-builder'); }
  await page.getByText('Questions', { exact: true }).first().click().catch(() => undefined); await page.waitForTimeout(1200); await shoot(page, 'builder-quiz-questions');
  const importBtn = page.getByRole('button', { name: 'Import questions' }).first();
  if (await importBtn.count()) { await importBtn.click(); await page.waitForTimeout(800); await shoot(page, 'builder-import-wizard'); await page.keyboard.press('Escape'); }
  await go(page, `/admin/courses/${f.courseId}?tab=media`); await shoot(page, 'builder-media-library');
  await go(page, `/admin/courses/${f.courseId}?tab=details`); await shoot(page, 'builder-details');
  await go(page, `/admin/courses/${f.courseId}?tab=settings`); await shoot(page, 'builder-settings');
});
