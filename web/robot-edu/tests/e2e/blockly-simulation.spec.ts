import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dragFromFlyout, waitForBlocklyReady, workspaceBlocks } from './helpers/blockly';

/**
 * Blockly → ProgramVersion → simulation/evaluation → submission → instructor review → released result, driven through the
 * real browser UI against the real Education API and PostgreSQL. Simulation here is the browser SO-101 preview plus the
 * server-side symbolic evaluator; it is NOT physical robot execution.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { classroomId: string; users: Record<string, { authUserId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const session = async (page: Page, who: string) => (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json();
async function signIn(page: Page, who: string) {
  const s = await session(page, who);
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
  return s.access_token as string;
}

async function blockBox(page: Page, text: RegExp) {
  const rects = await workspaceBlocks(page).evaluateAll((els, source) => els.filter((el) => new RegExp(source).test(el.textContent ?? '')).map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), text.source);
  expect(rects.length, `block ${text}`).toBeGreaterThan(0);
  return rects.sort((a, b) => a.width * a.height - b.width * b.height)[0];
}

test('Student builds a Blockly program in the browser, validates, runs and evaluates it in simulation, submits; instructor reviews; student sees the released result', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1600, height: 1300 });
  // 0. instructor creates and publishes a Blockly assignment bound to the seeded Course 1 "Reach Target A" challenge (automatic grading)
  const teacher = { Authorization: `Bearer ${(await session(page, 'instructor')).access_token}` };
  const options = await (await page.request.get(`${apiBase}/classrooms/${fixture.classroomId}/delivery-options`, { headers: teacher })).json() as Array<{ lesson_id: string; title: string; challenges: Array<{ id: string; title: string }> }>;
  const option = options.find((o) => o.challenges.some((c) => c.title === 'Reach Target A'));
  expect(option, `delivery options: ${JSON.stringify(options.map((o) => o.title))}`).toBeTruthy();
  const title = `Reach Target A (Blockly) ${Date.now()}`;
  const created = await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments`, { headers: teacher, data: { lessonId: option!.lesson_id, challengeId: option!.challenges.find((c) => c.title === 'Reach Target A')!.id, title, instructions: 'Home the left arm, move it to Target A and wait.' } });
  expect(created.status(), await created.text()).toBe(201);
  const { assignment_id: assignmentId } = await created.json() as { assignment_id: string };
  const rubric = await page.request.put(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${assignmentId}/rubric`, { headers: teacher, data: { criteria: [{ title: 'Correct sequence', maxPoints: 6 }, { title: 'Safe, tidy program', maxPoints: 4 }] } });
  expect(rubric.ok(), await rubric.text()).toBeTruthy();
  const publish = await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${assignmentId}/publish`, { headers: teacher });
  expect(publish.ok()).toBeTruthy();
  const delivery = await publish.json() as { id: string };
  const token = await signIn(page, 'student');
  const started = await page.request.post(`${apiBase}/classroom-assignments/${delivery.id}/attempts`, { headers: { Authorization: `Bearer ${token}` } });
  expect([200, 201]).toContain(started.status());
  const attempt = await started.json() as { id: string };
  await page.goto(`/practice/${attempt.id}`);
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
  await waitForBlocklyReady(page);

  // 1-3 build the program with real drag-and-drop: start → use left arm { home → move to Target A → wait }
  await dragFromFlyout(page, 'Program', /when\s*program\s*starts/, { x: 760, y: 560 });
  await expect(workspaceBlocks(page)).toHaveCount(1);
  const start = (await workspaceBlocks(page).first().boundingBox())!;
  await dragFromFlyout(page, 'Program', /use\s*left\s*arm/, { x: start.x + 16, y: start.y + start.height + 22 });
  await expect(workspaceBlocks(page)).toHaveCount(2);
  const arm = (await workspaceBlocks(page).nth(1).boundingBox())!;
  await dragFromFlyout(page, 'Movement', /home/i, { x: arm.x + 32, y: arm.y + 62 });
  const home = await blockBox(page, /home/);
  await dragFromFlyout(page, 'Movement', /move\s*to/i, { x: home.x + 8, y: home.y + home.height + 18 });
  await expect(workspaceBlocks(page)).toHaveCount(4);
  const move = await blockBox(page, /move\s*to/);
  await dragFromFlyout(page, 'Timing', /wait/i, { x: move.x + 8, y: move.y + move.height + 18 });
  await expect(workspaceBlocks(page)).toHaveCount(5);
  // Target A = (240, 220, 120): edit the number fields of the move block in the real editor
  const setField = async (current: string, next: string) => {
    const field = page.locator('svg.blocklySvg > g.blocklyWorkspace .blocklyEditableField text', { hasText: new RegExp(`^${current}$`) }).first();
    await field.click(); const input = page.locator('.blocklyHtmlInput'); await input.fill(next); await input.press('Enter');
  };
  await setField('300', '240'); await setField('200', '220');
  // 4-5 validate and persist: Run & evaluate saves a ProgramVersion and asks the server to evaluate it
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/valid and ready for server evaluation/i)).toBeVisible();
  const versionSaved = page.waitForResponse((r) => /\/me\/programs\/[^/]+\/versions$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save version' }).click();
  expect((await versionSaved).status()).toBe(201);
  const evaluated = page.waitForResponse((r) => /evaluate-symbolic$/.test(r.url()) && r.request().method() === 'POST', { timeout: 40_000 });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  const ev = await evaluated; expect(ev.status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Simulation Passed' })).toBeVisible();
  const evaluation = await ev.json() as { id: string; verdict: string; experimentId: string; programVersionId: string };
  expect(evaluation.verdict).toBe('passed');

  // 6-7 final submission binds the evaluated, immutable ProgramVersion and locks the attempt
  const bearer = { Authorization: `Bearer ${token}` };
  await page.getByRole('button', { name: 'Submit assignment' }).click();
  const confirm = page.getByRole('dialog');
  const submitted = page.waitForResponse((r) => /\/me\/attempts\/[^/]+\/submission$/.test(r.url()) && r.request().method() === 'POST');
  await confirm.getByRole('button', { name: /Submit/ }).last().click();
  const submissionResponse = await submitted; expect(submissionResponse.status()).toBe(201);
  const submission = await submissionResponse.json() as { id: string; status: string; program_version_id?: string };
  expect(submission.status).toBe('submitted');
  const evidence = await (await page.request.get(`${apiBase}/me/experiments/${evaluation.experimentId}`, { headers: bearer })).json() as { execution_mode?: string; status?: string };
  expect(evidence.execution_mode).toBe('schematic'); // simulation evidence, never physical
  // the attempt is final: a second submission is refused by the server
  const again = await page.request.post(`${apiBase}/me/attempts/${attempt.id}/submission`, { headers: bearer, data: { programVersionId: evaluation.programVersionId } });
  expect([409, 422, 400]).toContain(again.status());
  // the graded result is not visible before the instructor releases it
  expect(await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: bearer })).json()).toMatchObject({ released: false });

  // 8-10 instructor reviews the persisted program and simulation evidence, assesses and releases
  const teacherPage = await browser.newPage(); await teacherPage.setViewportSize({ width: 1400, height: 1200 });
  await teacherPage.goto('/'); await signIn(teacherPage, 'instructor');
  await teacherPage.goto(`/teacher/classes/${fixture.classroomId}/submissions/${submission.id}`);
  await expect(teacherPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(teacherPage.getByText(/Symbolic evaluation/i).first()).toBeVisible();
  const reviewText = (await teacherPage.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(reviewText).toMatch(/Symbolic evaluation/i);
  await expect(teacherPage.getByText(/learning preview target matches/i)).toBeVisible();
  await expect(teacherPage.getByText('Schematic evaluation')).toBeVisible();
  await expect(teacherPage.getByText('Not released to student')).toBeVisible();
  await teacherPage.getByLabel(/Points \/ 6/).fill('6'); await teacherPage.getByLabel(/Points \/ 4/).fill('3');
  await teacherPage.getByPlaceholder('Overall assessment feedback').fill('Target A reached with a clean sequence.');
  await teacherPage.getByRole('button', { name: 'Save assessment' }).click();
  await expect(teacherPage.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  expect(await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: bearer })).json()).toMatchObject({ released: false });
  await teacherPage.getByPlaceholder('Feedback for this student').fill('Well done: the simulation passed.');
  await teacherPage.getByRole('button', { name: 'Send feedback' }).click();
  await expect(teacherPage.getByText('Well done: the simulation passed.').first()).toBeVisible();
  await teacherPage.getByRole('button', { name: 'Release grade & feedback' }).click();
  const releaseDialog = teacherPage.getByRole('dialog').last();
  if (await releaseDialog.isVisible().catch(() => false)) await releaseDialog.getByRole('button', { name: /Release/ }).click();
  await expect(teacherPage.getByText('Not released to student')).toHaveCount(0);

  // 11 the student sees the released result; a classmate-equivalent outsider does not
  const grading = await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: bearer })).json() as { released: boolean; assessment: { overallFeedback: string; scores: Array<{ awardedPoints: number }> } };
  expect(grading.released).toBe(true);
  expect(grading.assessment.overallFeedback).toBe('Target A reached with a clean sequence.');
  expect(grading.assessment.scores.map((x) => x.awardedPoints).sort()).toEqual([3, 6]);
  const peerToken = (await session(page, 'peer')).access_token as string;
  expect([403, 404]).toContain((await page.request.get(`${apiBase}/me/submissions/${submission.id}`, { headers: { Authorization: `Bearer ${peerToken}` } })).status());
  const foreignTeacher = (await session(page, 'foreignTeacher')).access_token as string;
  expect([403, 404]).toContain((await page.request.get(`${apiBase}/submissions/${submission.id}`, { headers: { Authorization: `Bearer ${foreignTeacher}` } })).status());
  await page.goto(`/my-learning/${delivery.id}`);
  await expect(page.getByText('Graded').first()).toBeVisible();
});
