import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

/**
 * Phase 1F visual audit helper. Opt-in (VISTA_VISUAL_AUDIT=1): captures full-page screenshots of the main LMS screens at
 * four widths and records horizontal overflow. It asserts nothing about taste; a human or reviewer looks at the images.
 */
interface Fixture { courseId: string; lessonId: string; readingActivityId: string; classroomId: string; programDeliveryId: string; users: Record<string, { authUserId: string }> }
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE ?? '';
const outDir = process.env.VISTA_VISUAL_AUDIT_DIR ?? '/tmp/vista-1f-shots';
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
test.skip(process.env.VISTA_VISUAL_AUDIT !== '1', 'visual audit is opt-in');
const fixture = process.env.VISTA_VISUAL_AUDIT === '1' ? (JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture) : ({} as Fixture);

const widths = (process.env.VISTA_VISUAL_AUDIT_WIDTHS ?? '1440,1024,768,390').split(',').map(Number);
const only = process.env.VISTA_VISUAL_AUDIT_ONLY?.split(',');
/** Ids that are not in the fixture are resolved at run time (see resolveIds); a screen whose id cannot be resolved is reported as skipped, never faked. */
interface Ids { submissionId?: string; quizDeliveryId?: string }
const screens: Array<[string, string, (f: Fixture, ids: Ids) => string]> = [
  ['student', 'student-my-learning', () => '/my-learning'],
  ['student', 'student-courses', () => '/courses'],
  ['student', 'student-course', (f) => `/courses/${f.courseId}`],
  ['student', 'student-lesson', (f) => `/courses/${f.courseId}/lessons/${f.lessonId}`],
  ['student', 'student-activity', (f) => `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.readingActivityId}`],
  ['student', 'student-quiz', (f) => `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${(f as unknown as { quizActivityId: string }).quizActivityId}`],
  ['instructor', 'teacher-assignment-edit', (f) => `/teacher/assignments/${f.classroomId}/${(f as unknown as { programAssignmentId: string }).programAssignmentId}/edit`],
  ['instructor', 'teacher-submission-review', (f, ids) => (ids.submissionId ? `/teacher/classes/${f.classroomId}/submissions/${ids.submissionId}` : '')],
  ['student', 'student-quiz-delivery', (_f, ids) => (ids.quizDeliveryId ? `/my-learning/${ids.quizDeliveryId}` : '')],
  ['student', 'student-assignment', (f) => `/my-learning/${f.programDeliveryId}`],
  ['instructor', 'teacher-overview', () => '/teacher'],
  ['instructor', 'teacher-classes', () => '/teacher/classes'],
  ['instructor', 'teacher-class', (f) => `/teacher/classes/${f.classroomId}`],
  ['instructor', 'teacher-assignments', () => '/teacher/assignments'],
  ['instructor', 'teacher-assignment-new', () => '/teacher/assignments/new'],
  ['instructor', 'course-list', () => '/admin/courses'],
  ['instructor', 'course-builder', (f) => `/admin/courses/${f.courseId}`],
  ['student', 'student-media-activity', (f) => `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${(f as unknown as { videoActivityId: string }).videoActivityId}`],
];

const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const tokenOf = async (page: Page, who: string) => ((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json()) as { access_token: string }).access_token;
const api = async (page: Page, token: string, method: string, path: string, data?: unknown) => {
  const r = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status(), body };
};
/** Resolves ids from THIS database: an existing submission (or a new one made through the student API) and a published quiz delivery. */
async function resolveIds(page: Page): Promise<Ids> {
  const f = fixture as unknown as Fixture & { canonicalQuizAssignmentId: string };
  const [teacher, student] = [await tokenOf(page, 'instructor'), await tokenOf(page, 'student')];
  const ids: Ids = {};
  const listed = (await api(page, teacher, 'GET', `/classrooms/${f.classroomId}/submissions`)).body as Array<{ id: string }>;
  ids.submissionId = Array.isArray(listed) ? listed[0]?.id : undefined;
  if (!ids.submissionId) {
    const attempt = await api(page, student, 'POST', `/classroom-assignments/${f.programDeliveryId}/attempts`);
    if (attempt.status < 300) {
      const program = (await api(page, student, 'POST', `/me/attempts/${attempt.body.id}/program`, { title: 'P', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] } })).body;
      const version = (await api(page, student, 'POST', `/me/programs/${program.id}/versions`, { changeSummary: 'audit' })).body;
      ids.submissionId = (await api(page, student, 'POST', `/me/attempts/${attempt.body.id}/submission`, { programVersionId: version.id })).body?.id;
    }
  }
  const delivery = await api(page, teacher, 'POST', `/classrooms/${f.classroomId}/quiz-deliveries`, { canonicalAssignmentId: f.canonicalQuizAssignmentId });
  if (delivery.status < 300) { await api(page, teacher, 'POST', `/classrooms/${f.classroomId}/assignments/${delivery.body.assignment_id}/publish`); ids.quizDeliveryId = delivery.body.id; }
  else {
    const rows = (await api(page, teacher, 'GET', `/classrooms/${f.classroomId}/assignments`)).body as Array<{ id: string; assignment_id: string }>;
    const existing = Array.isArray(rows) ? rows.find((row) => row.assignment_id === f.canonicalQuizAssignmentId) : undefined;
    ids.quizDeliveryId = existing?.id;
  }
  return ids;
}

async function signIn(page: Page, who: string) {
  const value = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json();
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
}

test('capture LMS screens at 1440/1024/768/390', async ({ page }) => {
  test.setTimeout(600_000);
  await mkdir(outDir, { recursive: true });
  const report: Array<{ screen: string; width: number; overflowPx: number; culprits?: string[] }> = [];
  let current = '';
  const ids = await resolveIds(page);
  for (const [who, name, url] of screens) {
    if (only && !only.some((o) => name.includes(o))) continue;
    if (current !== who) { await signIn(page, who); current = who; }
    if (!url(fixture, ids)) { report.push({ screen: name, width: 0, overflowPx: 0, culprits: ['SKIPPED: id could not be resolved in this database'] } as never); continue; }
    for (const width of widths) {
      await page.setViewportSize({ width, height: 2400 });
      await page.goto(url(fixture, ids));
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => !/^Loading/.test(document.body.innerText.trim()), null, { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const culprits = overflowPx > 0 ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}px: ${(el.textContent ?? '').slice(0, 40)}`)) : [];
      report.push({ screen: name, width, overflowPx, culprits } as never);
      await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: false });
    }
  }
  await writeFile(`${outDir}/overflow.json`, JSON.stringify(report, null, 2));
});

test('capture course builder tabs and editors (interactive states)', async ({ page }) => {
  test.setTimeout(600_000);
  await mkdir(outDir, { recursive: true });
  await signIn(page, 'instructor');
  // The course is authored through the real Course Builder UI in THIS database (no ids carried over from any other database).
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.goto('/admin/courses');
  await page.getByRole('button', { name: 'Create Course' }).click();
  await page.getByRole('textbox', { name: 'Course Title' }).fill(`Visual audit course ${Date.now().toString(36)}`);
  await page.getByRole('textbox', { name: /^Description/ }).fill('Course authored by the visual audit.');
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/);
  const courseUrl = new URL(page.url()).pathname;
  const addVia = async (opener: () => Promise<void>, dialogName: string, text: string) => {
    await opener();
    const dialog = page.getByRole('dialog', { name: dialogName });
    await dialog.getByRole('textbox').fill(text);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  };
  await addVia(() => page.getByRole('button', { name: 'Add module' }).click(), 'Add module', 'First module');
  await addVia(() => page.getByRole('button', { name: /Add Lesson/ }).first().click(), 'Add lesson', 'Gate lesson');
  await addVia(() => page.getByRole('button', { name: 'Quick Add Quiz' }).first().click(), 'Add activity', 'Gate quiz');
  await addVia(() => page.getByRole('button', { name: 'Add', exact: true }).first().click(), 'Add module', 'Second module');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 2000 });
    const open = async () => { await page.goto(courseUrl); await page.getByRole('tab', { name: /Curriculum/ }).click().catch(() => undefined); await page.waitForTimeout(800); };
    await open();
    await page.getByText('Gate quiz').first().click().catch(() => undefined); await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/builder-quiz-editor-${width}.png` });
    await open();
    await page.getByRole('button', { name: /Module 2: Second module/ }).first().click().catch(() => undefined); await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/builder-module-editor-${width}.png` });
    for (const [tab, file] of [[/Structure & Publishing/, 'publishing'], [/Media Library/, 'media-library'], [/Course Details/, 'details'], [/^Settings/, 'settings']] as const) {
      await open();
      await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(800);
      await page.screenshot({ path: `${outDir}/builder-${file}-${width}.png` });
    }
  }
});
