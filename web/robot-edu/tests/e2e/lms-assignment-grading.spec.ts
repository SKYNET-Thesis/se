import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Phase 1C journey against the real API (runtime DB role) and real browser UI:
 * instructor creates an assignment, configures rubric and schedule, publishes; a student submits; the instructor
 * grades, releases, withdraws the release with a reason and re-releases a corrected grade; unauthorized and
 * cross-school callers are denied. Grades stay invisible to the student except while released.
 */
interface Fixture { lessonId: string; classroomId: string; otherClassroomId: string; users: Record<string, { userId: string; authUserId: string }> }
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function session(page: Page, authUserId: string) {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as { access_token: string };
}
const bearer = async (page: Page, who: string) => ({ Authorization: `Bearer ${(await session(page, fixture.users[who].authUserId)).access_token}` });
async function signIn(page: Page, who: string) {
  const value = await session(page, fixture.users[who].authUserId);
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
  await page.reload();
}

test('Journey: instructor builds an assignment with rubric and schedule; student submits; grade, release, audited correction and re-release', async ({ page }) => {
  const teacher = await bearer(page, 'instructor'); const student = await bearer(page, 'student');
  const title = `Phase 1C assignment ${Date.now()}`;

  // 1. instructor creates the draft assignment (API) and configures it in the real UI
  const created = await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments`, { headers: teacher, data: { lessonId: fixture.lessonId, title, instructions: 'Move the object.' } });
  expect(created.status()).toBe(201);
  const { assignment_id: assignmentId } = await created.json() as { assignment_id: string };

  await signIn(page, 'instructor');
  await page.goto(`/teacher/assignments/${fixture.classroomId}/${assignmentId}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit draft' })).toBeVisible();
  const panel = page.getByLabel('Rubric editor');
  await expect(panel.getByLabel('Criterion 1 title')).toBeVisible();
  // replace the inherited rubric with two criteria worth 6 + 4
  while (await panel.getByRole('button', { name: 'Remove' }).count()) await panel.getByRole('button', { name: 'Remove' }).first().click();
  await panel.getByRole('button', { name: 'Add criterion' }).click();
  await panel.getByLabel('Criterion 1 title').fill('Sequence'); await panel.getByLabel('Criterion 1 max points').fill('6');
  await panel.getByRole('button', { name: 'Add criterion' }).click();
  await panel.getByLabel('Criterion 2 title').fill('Safety'); await panel.getByLabel('Criterion 2 max points').fill('4');
  await expect(panel.getByText('Total: 10 points')).toBeVisible();
  await panel.getByRole('button', { name: 'Save rubric' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Rubric saved.' })).toBeVisible();
  const schedule = page.getByLabel('Delivery schedule');
  await schedule.getByLabel('Max attempts').fill('2');
  await schedule.getByRole('button', { name: 'Save schedule' }).click();
  await expect(schedule.getByRole('status').filter({ hasText: 'Schedule saved.' })).toBeVisible();
  // invalid schedule is explained by the server
  await schedule.getByLabel('Due').fill('2030-01-02T10:00'); await schedule.getByLabel('Opens').fill('2030-01-03T10:00');
  await schedule.getByRole('button', { name: 'Save schedule' }).click();
  await expect(schedule.getByRole('status').filter({ hasText: /after the opening/ })).toBeVisible();
  await schedule.getByLabel('Opens').fill('');

  const rubric = await (await page.request.get(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${assignmentId}/rubric`, { headers: teacher })).json() as { criteria: Array<{ id: string; title: string }>; totalPoints: number };
  expect(rubric.criteria.map((c) => c.title)).toEqual(['Sequence', 'Safety']); expect(rubric.totalPoints).toBe(10);

  // 2. a draft is invisible/unstartable for the student; publish; unauthorized callers cannot configure
  const mine = await page.request.get(`${apiBase}/me/learning`, { headers: student });
  expect(JSON.stringify(await mine.json())).not.toContain(title);
  const publish = await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${assignmentId}/publish`, { headers: teacher });
  expect(publish.ok()).toBeTruthy();
  const delivery = await publish.json() as { id: string };
  const other = await bearer(page, 'otherSchoolAdmin');
  const body = { criteria: [{ title: 'X', maxPoints: 1 }] };
  for (const headers of [student, other]) {
    expect([403, 404]).toContain((await page.request.put(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${assignmentId}/rubric`, { headers, data: body })).status());
    expect([403, 404]).toContain((await page.request.patch(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${assignmentId}/schedule`, { headers, data: { maxAttempts: 9 } })).status());
  }
  expect([403, 404]).toContain((await page.request.put(`${apiBase}/classrooms/${fixture.otherClassroomId}/assignments/${assignmentId}/rubric`, { headers: teacher, data: body })).status());

  // 3. student opens and submits
  const attempt = await (await page.request.post(`${apiBase}/classroom-assignments/${delivery.id}/attempts`, { headers: student })).json() as { id: string };
  const program = await (await page.request.post(`${apiBase}/me/attempts/${attempt.id}/program`, { headers: student, data: { title: 'P', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] } } })).json() as { id: string };
  const version = await (await page.request.post(`${apiBase}/me/programs/${program.id}/versions`, { headers: student, data: { changeSummary: 'final' } })).json() as { id: string };
  const submission = await (await page.request.post(`${apiBase}/me/attempts/${attempt.id}/submission`, { headers: student, data: { programVersionId: version.id } })).json() as { id: string };

  // SRS WF-04: a reflection on a submission nobody has assessed yet is refused (and writes nothing)
  const early = await page.request.post(`${apiBase}/me/submissions/${submission.id}/reflections`, { headers: student, data: { promptKey: 'post_assessment', promptText: 'What would you change?', responseText: 'Too early.' } });
  expect(early.status()).toBe(409);
  expect(await early.json()).toMatchObject({ code: 'REFLECTION_NOT_UNLOCKED' });
  expect(await (await page.request.get(`${apiBase}/me/submissions/${submission.id}/reflections`, { headers: student })).json()).toEqual([]);

  // 4. instructor scores (partial credit) in the UI; the student sees nothing until release
  await page.goto(`/teacher/classes/${fixture.classroomId}/submissions/${submission.id}`);
  await page.getByLabel('Points / 6').fill('4.5'); await page.getByLabel('Points / 4').fill('4');
  await page.getByPlaceholder('Overall assessment feedback').fill('First grade.');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  expect(await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: student })).json()).toEqual({ attemptId: attempt.id, released: false });
  // a score above the criterion maximum is refused by the API
  const tooHigh = await page.request.post(`${apiBase}/submissions/${submission.id}/assessment`, { headers: teacher, data: { scores: [{ criterionId: rubric.criteria[0].id, awardedPoints: 7 }] } });
  expect(tooHigh.status()).toBe(400);

  // 5. release → student sees it; a released grade cannot be silently changed
  await page.getByRole('button', { name: 'Release grade & feedback' }).click();
  const confirm = page.getByRole('dialog').last();
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /Release/ }).click();
  await expect(page.getByText(/^Released /)).toBeVisible();
  expect(await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: student })).json()).toMatchObject({ released: true, assessment: { overallFeedback: 'First grade.' } });
  // the review screen itself shows the grade as locked: inputs and the save button are disabled until grading is reopened
  await expect(page.getByRole('status').filter({ hasText: 'released to the student and is locked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save assessment' })).toBeDisabled();
  await expect(page.getByPlaceholder('Overall assessment feedback')).toBeDisabled();
  const silent = await page.request.post(`${apiBase}/submissions/${submission.id}/assessment`, { headers: teacher, data: { scores: [{ criterionId: rubric.criteria[0].id, awardedPoints: 1 }] } });
  expect(silent.status()).toBe(409);
  expect((await silent.json() as { code?: string }).code).toBe('GRADE_RELEASED');
  expect((await page.request.put(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${assignmentId}/rubric`, { headers: teacher, data: body })).status()).toBe(409); // rubric locked once scored

  // 6. explicit, audited correction: only an instructor, with a reason
  expect([403, 404]).toContain((await page.request.post(`${apiBase}/attempts/${attempt.id}/grading/reopen`, { headers: student, data: { reason: 'I want a better grade' } })).status());
  expect([403, 404]).toContain((await page.request.post(`${apiBase}/attempts/${attempt.id}/grading/reopen`, { headers: other, data: { reason: 'cross-school attempt' } })).status());
  expect((await page.request.post(`${apiBase}/attempts/${attempt.id}/grading/reopen`, { headers: teacher, data: { reason: 'x' } })).status()).toBe(400);
  await page.getByRole('button', { name: 'Reopen grading' }).click();
  await page.getByLabel('Reason for withdrawing the released grade').fill('Mis-scored the Sequence criterion');
  await page.getByRole('button', { name: 'Withdraw release' }).click();
  await expect(page.getByText(/Release withdrawn/)).toBeVisible();
  expect(await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: student })).json()).toEqual({ attemptId: attempt.id, released: false });

  // 7. corrected grade, re-release, student sees the corrected one
  await page.reload();
  await page.getByLabel('Points / 6').fill('6');
  await page.getByPlaceholder('Overall assessment feedback').fill('Corrected grade.');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  await page.getByRole('button', { name: 'Release grade & feedback' }).click();
  const confirm2 = page.getByRole('dialog').last();
  if (await confirm2.isVisible().catch(() => false)) await confirm2.getByRole('button', { name: /Release/ }).click();
  await expect(page.getByText(/^Released /)).toBeVisible();
  const final = await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: student })).json() as { released: boolean; assessment: { overallFeedback: string; scores: Array<{ awardedPoints: number }> } };
  expect(final.released).toBe(true); expect(final.assessment.overallFeedback).toBe('Corrected grade.');
  expect(final.assessment.scores.map((s) => Number(s.awardedPoints)).sort()).toEqual([4, 6]);

  // 8. the student sees the released feedback in the UI
  await signIn(page, 'student');
  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: 'View details' }).first().click();
  await expect(page.getByText('Corrected grade.')).toBeVisible();

  // 9. WF-04: once feedback is released the student reflects in the same view; it is persisted against the submission and survives a reload
  const reflection = page.getByRole('region', { name: 'Your reflection' });
  await expect(reflection).toBeVisible();
  await reflection.getByRole('textbox').fill('I would check the Sequence criterion before the Safety one.');
  await reflection.getByRole('button', { name: 'Save reflection' }).click();
  await expect(reflection.getByText('I would check the Sequence criterion before the Safety one.')).toBeVisible();
  const saved = await (await page.request.get(`${apiBase}/me/submissions/${submission.id}/reflections`, { headers: student })).json() as Array<{ response_text: string }>;
  expect(saved.map((row) => row.response_text)).toEqual(['I would check the Sequence criterion before the Safety one.']);
  await page.reload();
  await page.getByRole('button', { name: 'View details' }).first().click();
  await expect(page.getByRole('region', { name: 'Your reflection' }).getByText('I would check the Sequence criterion before the Safety one.')).toBeVisible();
  // another student cannot read or write it
  const outsider = await bearer(page, 'otherStudent');
  expect([403, 404]).toContain((await page.request.get(`${apiBase}/me/submissions/${submission.id}/reflections`, { headers: outsider })).status());
});
