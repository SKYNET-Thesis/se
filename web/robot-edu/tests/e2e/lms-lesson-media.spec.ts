import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Phase 1E: lesson text and Learning Media authored in the browser reach the student (real local S3-compatible storage).
 * Real browser, real Education API, real authorization, isolated PostgreSQL. No LMS response is mocked.
 */
interface Fixture {
  schoolId: string; otherSchoolId: string; classroomId: string; offeringId: string;
  users: Record<string, { userId: string; authUserId: string }>;
}
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const run = Date.now().toString(36);

async function session(page: Page, authUserId: string) {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as { access_token: string };
}
async function signIn(page: Page, authUserId: string) {
  const value = await session(page, authUserId);
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
  await page.reload();
  return value.access_token;
}
async function api(page: Page, token: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, data?: unknown) {
  const response = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  return { status: response.status(), body: text ? JSON.parse(text) : null };
}

/** Builds a canonical curriculum (module → lesson → reading activity) through the real Course Builder UI. */
async function authorReadingCourse(page: Page, title: string) {
  await page.goto('/admin/courses');
  await page.getByRole('button', { name: 'Create Course' }).click();
  await page.getByRole('textbox', { name: 'Course Title' }).fill(title);
  await page.getByRole('textbox', { name: /^Description/ }).fill('Learners practise safe robot operation.');
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/);
  const courseId = page.url().match(/courses\/([0-9a-f-]{36})/)![1];
  const addVia = async (opener: () => Promise<void>, dialogName: string, text: string) => {
    await opener();
    const dialog = page.getByRole('dialog', { name: dialogName });
    await dialog.getByRole('textbox').fill(text);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  };
  await addVia(() => page.getByRole('button', { name: 'Add module' }).click(), 'Add module', 'Safe robot motion');
  await addVia(() => page.getByRole('button', { name: /Add Lesson/ }).first().click(), 'Add lesson', 'Read and check');
  await addVia(() => page.getByRole('button', { name: 'Quick Add Reading' }).first().click(), 'Add activity', 'Safety reading');
  await expect(page.getByRole('heading', { name: 'Safety reading', level: 2 })).toBeVisible();
  return courseId;
}


test.describe.configure({ mode: 'serial' });

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

test('Lesson text and attached media authored in the UI are what the enrolled student sees; others are denied', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = `Lesson Content Course ${run}`;
  const text = `Always check the emergency stop first (${run}).`;
  const instructorToken = await signIn(page, fixture.users.instructor.authUserId);
  const courseId = await authorReadingCourse(page, title);

  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  await workspace.getByRole('button', { name: '+ Add Paragraph' }).click();
  await workspace.locator('textarea').last().fill(text);

  // upload and attach a PDF through the Learning Media library (real browser -> presigned POST -> local S3)
  await workspace.locator('button[aria-label="Attach Document"]').click();
  let library = page.getByRole('dialog', { name: 'Learning Media Library' });
  await library.locator('input[type="file"]').setInputFiles({ name: 'safety-guide.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(library.getByText('safety-guide.pdf').first()).toBeVisible();
  await library.getByRole('button', { name: 'Use file' }).first().click();
  await expect(workspace.getByLabel('Attached learning media').getByText('safety-guide.pdf')).toBeVisible();

  // upload and insert an image
  await workspace.getByRole('button', { name: 'Insert Image' }).click();
  library = page.getByRole('dialog', { name: 'Learning Media Library' });
  await library.locator('input[type="file"]').setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: PNG });
  await expect(library.getByText('diagram.png').first()).toBeVisible();
  await library.getByRole('button', { name: 'Use file' }).first().click();
  await workspace.getByLabel(/^Image alternative text/).first().fill('Emergency stop diagram');

  // an unsupported file is refused in the browser with a readable error and nothing is stored
  await workspace.locator('button[aria-label="Attach Document"]').click();
  library = page.getByRole('dialog', { name: 'Learning Media Library' });
  await library.locator('input[type="file"]').setInputFiles({ name: 'run.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ....') });
  await expect(library.getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');

  await workspace.getByRole('button', { name: 'Save Draft' }).click();
  await expect(workspace.getByText('Saved', { exact: true }).first()).toBeVisible();
  const media = (await api(page, instructorToken, 'GET', `/admin/courses/${courseId}/media`)).body as Array<{ id: string; original_filename: string; status: string }>;
  expect(media.map((m) => m.original_filename).sort()).toEqual(['diagram.png', 'safety-guide.pdf']);

  // publish section, activity, course
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  await page.getByRole('button', { name: /^Safe robot motion/ }).first().click();
  await page.getByRole('button', { name: 'Read and check', exact: true }).click();
  await page.getByRole('button', { name: 'Publish Read and check' }).click();
  await expect(page.getByText('Section published.')).toBeVisible();
  await page.getByRole('button', { name: /^Publish Safety reading/ }).click();
  await expect(page.getByText('Activity published.')).toBeVisible();
  await page.getByRole('button', { name: 'Review & Publish' }).click();
  await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
  await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();

  // deliver to the student
  await signIn(page, fixture.users.schoolAdmin.authUserId);
  const className = `LC ${run}`;
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(className);
  await create.getByLabel('Classroom code').fill(`LC-${run}`.toUpperCase());
  await create.getByLabel('Published course').selectOption({ label: title });
  await create.getByLabel('School offering code').fill(`OFF-LC-${run}`.toUpperCase());
  await create.getByRole('button', { name: 'Create classroom' }).click();
  await expect(create).not.toBeVisible();
  await page.getByRole('button', { name: className }).click();
  await page.getByRole('button', { name: 'Add member' }).click();
  const member = page.getByRole('dialog', { name: 'Add classroom member' });
  await member.getByLabel('Search eligible members').fill('Phase 2.4.3 Test Student');
  await member.getByRole('radio', { name: /Phase 2.4.3 Test Student/ }).check();
  await member.getByRole('button', { name: 'Add member' }).click();
  await expect(member).not.toBeVisible();

  // the student sees the authored text, the inline image and the downloadable attachment
  const studentToken = await signIn(page, fixture.users.student.authUserId);
  const lessonId = (await api(page, studentToken, 'GET', `/courses/${courseId}/lessons`)).body[0].id as string;
  const { sections } = (await api(page, studentToken, 'GET', `/lessons/${lessonId}/sections`)).body as { sections: Array<{ activities: Array<{ id: string; title: string }> }> };
  const activityId = sections[0].activities[0].id;
  await page.goto(`/courses/${courseId}/lessons/${lessonId}/activities/${activityId}`);
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByText('safety-guide.pdf').first()).toBeVisible();
  const image = page.getByRole('img', { name: 'Emergency stop diagram' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const pdfId = media.find((m) => m.original_filename === 'safety-guide.pdf')!.id;
  const signed = await api(page, studentToken, 'GET', `/activities/${activityId}/media/${pdfId}/url`);
  expect(signed.status).toBe(200);
  const file = await page.request.get(signed.body.url);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(0, 5).toString()).toBe('%PDF-');

  // authorization: another school's student, and any user for a media file the activity does not reference, get nothing
  const otherStudent = (await session(page, fixture.users.otherStudent.authUserId)).access_token;
  expect((await api(page, otherStudent, 'GET', `/activities/${activityId}/media/${pdfId}/url`)).status).toBe(404);
  expect((await api(page, studentToken, 'GET', `/activities/${activityId}/media/${crypto.randomUUID()}/url`)).status).toBe(404);
  expect((await api(page, studentToken, 'GET', `/admin/courses/${courseId}/media`)).status).toBe(404);
  expect(errors).toEqual([]);
});
