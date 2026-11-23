import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * The real `robot_lab` assignment type (not just the enum): an instructor configures it in the UI, it is persisted and
 * reopened, an enrolled student sees it and can start and resume an attempt, grading rules for the type hold, and
 * another school can neither read nor change it. Web-side contract only: no physical robot is involved.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as {
  classroomId: string; lessonId: string; users: Record<string, { authUserId: string }>;
};
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const run = Date.now().toString(36);

async function signIn(page: Page, who: string) {
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json() as { access_token: string };
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
  return s.access_token;
}
const call = async (page: Page, token: string, method: string, path: string, data?: unknown) => {
  const r = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status(), body };
};

test('Robot Lab assignment: configured in the UI, persisted, visible to the enrolled student who can start and resume, isolated per school', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const instructor = await signIn(page, 'instructor');
  const title = `Robot Lab ${run}`;
  const created = await call(page, instructor, 'POST', `/classrooms/${fixture.classroomId}/assignments`, { lessonId: fixture.lessonId, title, instructions: 'Run the guided pick-and-place on the allocated lab robot.' });
  expect(created.status).toBe(201);
  const assignmentId: string = created.body.assignment_id;
  expect((await call(page, instructor, 'PUT', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/rubric`, { criteria: [{ title: 'Safe operation', maxPoints: 50 }, { title: 'Result quality', maxPoints: 50 }] })).status).toBe(200);

  // UI: automatic grading is refused for a Robot Lab; manual grading is accepted
  await page.goto(`/teacher/assignments/${fixture.classroomId}/${assignmentId}/edit`);
  const academic = page.getByLabel('Academic settings');
  await expect(academic).toBeVisible();
  await academic.getByLabel('Assignment type').selectOption('robot_lab');
  await academic.getByLabel('Grading method').selectOption('automatic');
  await academic.getByRole('button', { name: 'Save academic settings' }).click();
  await expect(academic.getByRole('status')).toContainText(/manual|automatic/i);
  await academic.getByLabel('Grading method').selectOption('manual');
  await academic.getByLabel('Assignment difficulty').selectOption('ADVANCED');
  await academic.getByLabel('Pass score').fill('60');
  await academic.getByRole('button', { name: 'Save academic settings' }).click();
  await expect(academic.getByRole('status')).toContainText('Academic settings saved.');

  // persistence: backend row and reopened editor
  const stored = await call(page, instructor, 'GET', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/academic`);
  expect(stored.body).toMatchObject({ assignmentType: 'robot_lab', gradingMethod: 'manual', difficulty: 'ADVANCED', passScore: 60 });
  await page.reload();
  await expect(page.getByLabel('Academic settings').getByLabel('Assignment type')).toHaveValue('robot_lab');

  const published = await call(page, instructor, 'POST', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/publish`);
  expect(published.status).toBe(201);
  const deliveryId: string = published.body.id;

  // student: sees the Robot Lab type, then starts and resumes
  const student = await signIn(page, 'student');
  const detail = await call(page, student, 'GET', `/classroom-assignments/${deliveryId}`);
  expect(detail.body).toMatchObject({ assignment_type: 'robot_lab', grading_method: 'manual' });
  await page.goto(`/my-learning/${deliveryId}`);
  await expect(page.getByTestId('assignment-type')).toHaveText('Type: Robot Lab');
  const started = await call(page, student, 'POST', `/classroom-assignments/${deliveryId}/attempts`);
  expect([200, 201]).toContain(started.status);
  const again = await call(page, student, 'POST', `/classroom-assignments/${deliveryId}/attempts`);
  expect([200, 201]).toContain(again.status);
  expect(again.body.id).toBe(started.body.id);                                            // resume returns the open attempt, no duplicate
  const history = await call(page, student, 'GET', `/me/classroom-assignments/${deliveryId}/attempts`);
  expect((history.body as unknown[]).length).toBe(1);
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: /^Attempt 1/ })).toHaveCount(1);

  // another school: no read, no change; a student cannot reconfigure it
  const foreign = await signIn(page, 'otherSchoolAdmin');
  expect([403, 404]).toContain((await call(page, foreign, 'GET', `/classroom-assignments/${deliveryId}`)).status);
  expect([403, 404]).toContain((await call(page, foreign, 'PATCH', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/academic`, { assignmentType: 'quiz' })).status);
  const learner = await signIn(page, 'student');
  expect([403, 404]).toContain((await call(page, learner, 'PATCH', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/academic`, { assignmentType: 'quiz' })).status);
  expect((await call(page, instructor, 'GET', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/academic`)).body.assignmentType).toBe('robot_lab');
  expect(errors).toEqual([]);
});
