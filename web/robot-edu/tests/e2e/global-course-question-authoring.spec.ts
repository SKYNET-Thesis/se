import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface Fixture {
  courseId: string;
  lessonId: string;
  users: Record<string, { userId: string; authUserId: string }>;
}

const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const run = Date.now().toString(36).toUpperCase();

async function signIn(page: Page, authUserId: string) {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`);
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
  await page.reload();
  return session.access_token as string;
}

async function api(page: Page, token: string, method: string, path: string, data?: unknown) {
  const response = await page.request.fetch(`${apiBase}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(data === undefined ? {} : { data }),
  });
  const text = await response.text();
  return { status: response.status(), body: text ? JSON.parse(text) : null };
}

test('System Admin authors and imports questions in a Global Course; school authors remain scoped', async ({ page }) => {
  test.setTimeout(120_000);
  const adminToken = await signIn(page, fixture.users.admin.authUserId);
  await page.goto(`/admin/courses/${fixture.courseId}?tab=curriculum`);
  await expect(page.getByRole('heading', { name: /VISTA Phase 2\.4\.3 canonical course/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Curriculum' }).click();

  const outline = page.getByRole('complementary', { name: 'Course outline panel' });
  await outline.getByText('Safety quiz', { exact: true }).click();
  const workspace = page.getByRole('main', { name: 'Content workspace' });
  await workspace.getByRole('button', { name: 'Questions' }).click();
  await expect(workspace.getByRole('button', { name: 'New question' })).toBeVisible();

  const objectiveResponse = await api(page, adminToken, 'GET', `/author/question-bank/lessons/${fixture.lessonId}/objectives`);
  expect(objectiveResponse.status).toBe(200);
  expect(objectiveResponse.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.any(String), code: 'E2E-243-OBJ' })]));

  await workspace.getByRole('button', { name: 'New question' }).click();
  let dialog = page.getByRole('dialog', { name: 'New question' });
  const questionText = `Can the System Admin author globally ${run}?`;
  await dialog.getByLabel('Question text').fill(questionText);
  await dialog.getByLabel('Option 1').fill('Yes, within the global course');
  await dialog.getByLabel('Option 2').fill('No, only a school can');
  await dialog.getByLabel('Correct answer 1').check();
  await dialog.getByLabel('Explanation').fill('System Admins can author global course content.');
  await dialog.getByLabel('New learning outcome', { exact: true }).fill('Manage globally reusable questions.');
  await dialog.getByRole('button', { name: 'Save and publish question' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(workspace.getByText(questionText, { exact: true })).toBeVisible();

  await workspace.getByRole('button', { name: 'Import questions' }).click();
  dialog = page.getByRole('dialog', { name: 'Import questions' });
  const csv = [
    'code,type,difficulty,cognitive_level,stem,option_a,option_b,option_c,correct,points,explanation',
    `GLOBAL-UI-IMPORT-${run},single_choice,easy,understand,Can imported questions be global ${run}?,Yes,No,,A,2,They inherit the course scope.`,
  ].join('\n');
  await dialog.getByLabel('Question file').setInputFiles({ name: 'global.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByRole('status')).toContainText('1 valid');
  await dialog.getByLabel('New Learning Outcome').fill('Import globally reusable questions.');
  await dialog.getByRole('button', { name: 'Import 1 valid question' }).click();
  await expect(dialog.getByRole('status')).toContainText('Imported 1 question.');
  expect((await api(page, adminToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${fixture.lessonId}/questions`)).status).toBe(200);

  for (const role of ['schoolAdmin', 'instructor']) {
    const session = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[role].authUserId}`).then((response) => response.json());
    expect((await api(page, session.access_token, 'GET', `/author/question-bank/lessons/${fixture.lessonId}/objectives`)).status).toBe(404);
    expect((await api(page, session.access_token, 'POST', `/author/question-bank/quiz-authoring/lessons/${fixture.lessonId}/questions`, {
      content: { type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem: 'Unauthorized?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answerKey: ['a'], explanation: 'No.' },
      newObjective: 'Unauthorized objective.',
    })).status).toBe(404);
  }
});
