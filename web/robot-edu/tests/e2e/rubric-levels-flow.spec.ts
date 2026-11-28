import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { call, signIn, loadFixture } from './helpers/academic';

/**
 * Rubric levels end to end in the real browser (REQUIRES staged migration T on the disposable DB): template authoring -> student preview of the level descriptors ->
 * submission -> instructor level scoring with a PARTIAL draft -> release refused until every criterion is graded (explicit level 0 counts) -> release ->
 * student result and Gradebook agree (31/36 = 86.11 %, attempt.score untouched).
 */
const fixture = await loadFixture();
const f = fixture as unknown as { classroomId: string; programAssignmentId: string; programDeliveryId: string };

test('rubric levels: template, descriptors, partial draft, release gate, student result, Gradebook', async ({ page, browser }) => {
  test.setTimeout(240_000);
  // 1. instructor applies the Blockly template in the real assignment editor and saves
  const teacherToken = await signIn(page, fixture, 'instructor');
  await page.goto(`/teacher/assignments/${f.classroomId}/${f.programAssignmentId}/edit`);
  await page.getByLabel('Apply rubric template').selectOption('blockly');
  await expect(page.getByLabel('Criterion 1 title')).toHaveValue('Program correctness');
  await expect(page.getByText('Total: 36 points')).toBeVisible();
  await page.getByRole('button', { name: 'Save rubric' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rubric saved.' })).toBeVisible();
  const saved = await call(page, teacherToken, 'GET', `/classrooms/${f.classroomId}/assignments/${f.programAssignmentId}/rubric`);
  const criteria = saved.body.criteria as Array<{ id: string; title: string; maxPoints: number; descriptors: string[] | null }>;
  expect(criteria.map((c) => c.maxPoints)).toEqual([12, 8, 4, 8, 4]);
  expect(criteria[0].descriptors?.[0]).toBe('All required logic works');

  // 2. student: sees the level descriptors before submitting, then submits
  const studentPage = await browser.newPage();
  const studentToken = await signIn(studentPage, fixture, 'student');
  await studentPage.goto(`/my-learning/${f.programDeliveryId}`);
  await expect(studentPage.getByRole('group', { name: /Achievement levels for Program correctness/ }).or(studentPage.getByLabel(/Achievement levels for Program correctness/))).toBeVisible();
  await expect(studentPage.getByText('All required logic works')).toBeVisible();
  const attempt = await call(studentPage, studentToken, 'POST', `/classroom-assignments/${f.programDeliveryId}/attempts`);
  const attemptId = (attempt.body as { id: string }).id;
  const program = await call(studentPage, studentToken, 'POST', `/me/attempts/${attemptId}/program`, { title: 'Levels', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'home', arm: 'left' }] } });
  const version = await call(studentPage, studentToken, 'POST', `/me/programs/${(program.body as { id: string }).id}/versions`, { changeSummary: 'levels' });
  const submitted = await call(studentPage, studentToken, 'POST', `/me/attempts/${attemptId}/submission`, { programVersionId: (version.body as { id: string }).id });
  const submissionId = (submitted.body as { id: string }).id;

  // 3. instructor scores by level in the real review page: PARTIAL draft (3 of 5), release refused
  await page.goto(`/teacher/classes/${f.classroomId}/submissions/${submissionId}`);
  const pick = async (n: number, level: string) => page.getByRole('group', { name: new RegExp(`Achievement level for ${criteria[n].title}`) }).getByLabel(new RegExp(`^${level} —`)).check();
  await pick(0, '4'); await pick(1, '3'); await pick(2, '3');
  await expect(page.getByTestId('live-rubric-summary')).toContainText('21 / 36');
  await expect(page.getByTestId('live-rubric-summary')).toContainText('2 criterion not graded');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect.poll(async () => ((await call(page, teacherToken, 'GET', `/submissions/${submissionId}/assessment`)).body.scores as unknown[] | undefined)?.length).toBe(3);   // partial draft saved
  const refused = await call(page, teacherToken, 'POST', `/submissions/${submissionId}/release`);
  expect(refused.status).toBe(409); expect(refused.body.code).toBe('RUBRIC_INCOMPLETE');
  expect((await call(studentPage, studentToken, 'GET', `/me/attempts/${attemptId}/grading`)).body.released).toBe(false);   // drafts stay private

  // 4. complete the rubric (levels 4 and 2) and release; the Blockly example 4,3,3,4,2 = 31/36
  await pick(3, '4'); await pick(4, '2');
  await expect(page.getByTestId('live-rubric-summary')).toContainText('31 / 36');
  await expect(page.getByTestId('live-rubric-summary')).toContainText('86.11%');
  await expect(page.getByTestId('live-rubric-summary')).toContainText('8.61/10');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect.poll(async () => ((await call(page, teacherToken, 'GET', `/submissions/${submissionId}/assessment`)).body.scores as unknown[] | undefined)?.length).toBe(5);
  const released = await call(page, teacherToken, 'POST', `/submissions/${submissionId}/release`);
  expect(released.status).toBeLessThan(300);

  // 5. student result, API summary and Gradebook agree; attempt.score untouched; released grade locked
  const grading = (await call(studentPage, studentToken, 'GET', `/me/attempts/${attemptId}/grading`)).body;
  expect(grading.released).toBe(true); expect(grading.score).toBeNull();
  expect(grading.summary).toMatchObject({ awarded: 31, max: 36, percentage: 86.11, scoreOutOf10: 8.61, rating: 'Good', complete: true });
  expect(grading.assessment.scores.map((s: { level: number }) => s.level)).toEqual([4, 3, 3, 4, 2]);
  const book = (await call(page, teacherToken, 'GET', `/classrooms/${f.classroomId}/gradebook`)).body as Array<{ attemptId: string; percentage: number; graded: string }>;
  expect(book.find((r) => r.attemptId === attemptId)).toMatchObject({ percentage: 86.11, graded: 'complete' });
  expect((await call(page, teacherToken, 'POST', `/submissions/${submissionId}/assessment`, { scores: [{ criterionId: criteria[0].id, level: 1 }] })).status).toBe(409);   // GRADE_RELEASED
  await studentPage.goto('/assignments'); await studentPage.getByText('Completed').first().click();
  await expect(studentPage.getByText(/31 \/ 36|86\.11/).first()).toBeVisible();
  await page.goto(`/teacher/classes/${f.classroomId}`);
  await expect(page.getByRole('region', { name: 'Gradebook' }).or(page.getByLabel('Gradebook'))).toContainText('31 / 36 · 86.11% · 8.61/10');
  await page.screenshot({ path: `${process.env.VISTA_E2E_SCREENSHOT_DIR ?? '/tmp'}/rubric-levels-gradebook.png`, fullPage: true });
});
