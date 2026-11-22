import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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

// Real, decodable files (tests/e2e/fixtures/media): a 96x64 PNG, a one-page PDF, minimal DOCX/PPTX packages and a 2 s H.264/AAC MP4.
const fixtureDir = new URL('./fixtures/media/', import.meta.url);
const load = (name: string) => readFile(new URL(name, fixtureDir));
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const MIME: Record<string, string> = { 'safety-guide.pdf': 'application/pdf', 'lab-notes.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'motion-slides.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'robot-demo.mp4': 'video/mp4', 'emergency-stop.png': 'image/png' };
const ATTACHMENTS = ['safety-guide.pdf', 'lab-notes.docx', 'motion-slides.pptx']; // readings attach documents; video belongs to a Video activity

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

  // upload and attach PDF, DOCX and PPTX through the Learning Media library (real browser -> presigned POST -> local S3)
  for (const name of ATTACHMENTS) {
    await workspace.locator('button[aria-label="Attach Document"]').click();
    const lib = page.getByRole('dialog', { name: 'Learning Media Library' });
    await lib.locator('input[type="file"]').setInputFiles({ name, mimeType: MIME[name], buffer: await load(name) });
    await expect(lib.getByText(name).first()).toBeVisible();
    await lib.getByRole('button', { name: 'Use file' }).first().click();
    await expect(workspace.getByLabel('Attached learning media').getByText(name)).toBeVisible();
  }

  // upload and insert a real PNG
  await workspace.getByRole('button', { name: 'Insert Image' }).click();
  let library = page.getByRole('dialog', { name: 'Learning Media Library' });
  await library.locator('input[type="file"]').setInputFiles({ name: 'emergency-stop.png', mimeType: 'image/png', buffer: await load('emergency-stop.png') });
  await expect(library.getByText('emergency-stop.png').first()).toBeVisible();
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
  // a Video activity: upload the MP4 through the UI and preview it in the library before using it
  await page.getByRole('button', { name: 'Quick Add Video' }).first().click();
  const addVideo = page.getByRole('dialog', { name: 'Add activity' });
  await addVideo.getByRole('textbox').fill('Demo video');
  await addVideo.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(addVideo).not.toBeVisible();
  await page.getByRole('button', { name: 'Select Video from Library' }).click();
  const videoLib = page.getByRole('dialog', { name: 'Learning Media Library' });
  await videoLib.locator('input[type="file"]').setInputFiles({ name: 'robot-demo.mp4', mimeType: 'video/mp4', buffer: await load('robot-demo.mp4') });
  await expect(videoLib.getByText('robot-demo.mp4').first()).toBeVisible();
  await videoLib.getByRole('button', { name: 'Preview robot-demo.mp4' }).click();
  const instructorVideo = page.locator('video').last();
  await expect(instructorVideo).toBeVisible();
  await expect.poll(() => instructorVideo.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  expect(await instructorVideo.evaluate((el: HTMLVideoElement) => `${el.videoWidth}x${el.videoHeight}`)).toBe('160x90');
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click(); // close the preview, keep the library open
  await page.getByRole('dialog', { name: 'Learning Media Library' }).getByRole('button', { name: 'Use file' }).first().click();
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  const media = (await api(page, instructorToken, 'GET', `/admin/courses/${courseId}/media`)).body as Array<{ id: string; original_filename: string; status: string }>;
  expect(media.map((m) => m.original_filename).sort()).toEqual([...ATTACHMENTS, 'emergency-stop.png', 'robot-demo.mp4'].sort());
  expect(media.every((m) => m.status === 'ready' || m.status === 'uploaded')).toBe(true);

  // publish section, activity, course
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  await page.getByRole('button', { name: /^Safe robot motion/ }).first().click();
  await page.getByRole('button', { name: 'Read and check', exact: true }).click();
  await page.getByRole('button', { name: 'Publish Read and check' }).click();
  await expect(page.getByText('Lesson published.')).toBeVisible();
  await page.getByRole('button', { name: /^Publish Safety reading/ }).click();
  await expect(page.getByText('Activity published.')).toBeVisible();
  await page.getByRole('button', { name: /^Publish Demo video/ }).click();
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
  await expect(page).toHaveURL(/\/school\/classrooms\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Classroom details' })).toBeVisible();
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
  const activityId = sections[0].activities.find((a) => a.title === 'Safety reading')!.id;
  const videoActivityId = sections[0].activities.find((a) => a.title === 'Demo video')!.id;
  await page.goto(`/courses/${courseId}/lessons/${lessonId}/activities/${activityId}`);
  await expect(page.getByText(text)).toBeVisible();
  for (const name of ATTACHMENTS) await expect(page.getByRole('link', { name })).toBeVisible();
  const image = page.getByRole('img', { name: 'Emergency stop diagram' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => `${el.naturalWidth}x${el.naturalHeight}`)).toBe('96x64');
  // every file the student can open is byte-identical to what the instructor uploaded
  const ids: Record<string, string> = {};
  for (const name of [...ATTACHMENTS, 'emergency-stop.png', 'robot-demo.mp4']) {
    const id = media.find((m) => m.original_filename === name)!.id; ids[name] = id;
    const owner = name === 'robot-demo.mp4' ? videoActivityId : activityId;
    const signed = await api(page, studentToken, 'GET', `/activities/${owner}/media/${id}/url`);
    expect(signed.status, name).toBe(200);
    const file = await page.request.get(signed.body.url);
    expect(file.status(), name).toBe(200);
    expect(sha(await file.body()), `${name} bytes`).toBe(sha(await load(name)));
  }
  // real playback in the Video activity: the MP4 is served to the enrolled student, decodes and its clock advances
  await page.goto(`/courses/${courseId}/lessons/${lessonId}/activities/${videoActivityId}`);
  const video = page.locator('video').first();
  await expect(video).toBeVisible();
  await video.evaluate(async (el: HTMLVideoElement) => { el.muted = true; await el.play(); });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.2);
  expect(await video.evaluate((el: HTMLVideoElement) => `${el.videoWidth}x${el.videoHeight}`)).toBe('160x90');
  await page.screenshot({ path: `${process.env.VISTA_ACCEPTANCE_DIR ?? '/tmp'}/student-lesson-with-real-media.png`, fullPage: false }).catch(() => undefined);
  // P1: a required video can be completed by the learner; the backend records it and it survives a reload
  await page.getByRole('button', { name: /Mark as Completed/ }).click();
  await expect(page.getByText('Completed', { exact: false }).first()).toBeVisible();
  const progressRows = ((await api(page, studentToken, 'GET', `/me/courses/${courseId}/activity-progress`)).body as { activities: Array<{ activityId?: string; activity_id?: string; status?: string }> }).activities;
  expect(progressRows.find((row) => (row.activityId ?? row.activity_id) === videoActivityId)?.status).toBe('completed');
  await page.reload();
  await expect(page.locator('video').first()).toBeVisible();
  expect(((await api(page, studentToken, 'GET', `/me/courses/${courseId}/activity-progress`)).body as { activities: Array<{ activityId?: string; activity_id?: string; status?: string }> }).activities.find((row) => (row.activityId ?? row.activity_id) === videoActivityId)?.status).toBe('completed');
  const pdfId = ids['safety-guide.pdf'];
  // a file attached to one activity is not served through a different activity of the same course
  expect((await api(page, studentToken, 'GET', `/activities/${activityId}/media/${ids['robot-demo.mp4']}/url`)).status).toBe(404);

  // authorization: another school's student, and any user for a media file the activity does not reference, get nothing
  const otherStudent = (await session(page, fixture.users.otherStudent.authUserId)).access_token;
  expect((await api(page, otherStudent, 'GET', `/activities/${activityId}/media/${pdfId}/url`)).status).toBe(404);
  expect((await api(page, studentToken, 'GET', `/activities/${activityId}/media/${crypto.randomUUID()}/url`)).status).toBe(404);
  expect((await api(page, studentToken, 'GET', `/admin/courses/${courseId}/media`)).status).toBe(404);

  // a really missing object (deleted straight from the disposable bucket, outside the app) degrades gracefully: text stays, the image explains itself
  const sdkPath = process.env.VISTA_E2E_S3_SDK;
  if (sdkPath && process.env.VISTA_E2E_S3_ENDPOINT) {
    const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import(sdkPath);
    const s3 = new S3Client({ region: 'us-east-1', endpoint: process.env.VISTA_E2E_S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.VISTA_E2E_S3_KEY!, secretAccessKey: process.env.VISTA_E2E_S3_SECRET! } });
    const pngBytes = (await load('emergency-stop.png')).length;
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: process.env.VISTA_E2E_S3_BUCKET! }));
    const key = (listed.Contents ?? []).find((o: { Size: number; Key: string }) => o.Size === pngBytes && o.Key.includes(courseId))?.Key ?? (listed.Contents ?? []).find((o: { Size: number }) => o.Size === pngBytes)?.Key;
    expect(key, 'uploaded PNG object found in the local bucket').toBeTruthy();
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.VISTA_E2E_S3_BUCKET!, Key: key }));
    await page.goto(`/courses/${courseId}/lessons/${lessonId}/activities/${activityId}`);
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'This image could not be displayed: Emergency stop diagram' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'safety-guide.pdf' })).toBeVisible();
  }

  // an unavailable attachment is reported accurately and never hides the lesson text (media URL requests fail in the browser)
  await page.route(/\/activities\/[^/]+\/media\/[^/]+\/url/, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Learning media was not found."}' }));
  await page.goto(`/courses/${courseId}/lessons/${lessonId}/activities/${activityId}`);
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /attached files? (is|are) unavailable/ })).toBeVisible();
  expect(errors).toEqual([]);
});
