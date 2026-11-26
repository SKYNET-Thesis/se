import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';

/**
 * Education pilot import acceptance (opt-in: set VISTA_PILOT_DIR to the output of scripts/education/normalize_pilot.py).
 * Real browser + real Education API + isolated PostgreSQL. Nothing is mocked and nothing touches Production.
 *  1. API (same multipart endpoints the dialog uses): all 3 Vietnamese courses (180 rows) and the English demo course (60 rows):
 *     preview -> confirm bound to file hash -> drafts -> idempotent re-import -> unauthorized / cross-tenant denial.
 *  2. UI: English demo lesson 1 through the real Import dialog, with screenshots.
 */
const pilotDir = process.env.VISTA_PILOT_DIR;
test.skip(!pilotDir, 'VISTA_PILOT_DIR not set');
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as { users: Record<string, { userId: string; authUserId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const shotDir = process.env.VISTA_E2E_SCREENSHOT_DIR;
const run = Date.now().toString(36);
const EN_COURSE = 'SO-101 Foundations & Blockly (English demo)';

async function token(page: Page, user: string) {
  const r = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[user].authUserId}`);
  return (await r.json()).access_token as string;
}
async function signIn(page: Page, user: string) {
  const value = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[user].authUserId}`)).json();
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
  await page.reload();
  return value.access_token as string;
}
async function api(page: Page, tok: string, method: 'GET' | 'POST', path: string, data?: unknown) {
  const response = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${tok}` }, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  return { status: response.status(), body: text ? JSON.parse(text) : null };
}
async function upload(page: Page, tok: string, path: string, name: string, buffer: Buffer, fields: Record<string, string> = {}) {
  const response = await page.request.fetch(`${apiBase}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, multipart: { file: { name, mimeType: 'text/csv', buffer }, ...fields } });
  const text = await response.text();
  return { status: response.status(), body: text ? JSON.parse(text) : null };
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const base = (lessonId: string) => `/author/question-bank/quiz-authoring/lessons/${lessonId}`;

test.describe.configure({ mode: 'serial' });

test('pilot: 3 courses / 18 lessons / 180 Vietnamese questions and the 60-question English demo course import as drafts, idempotently, with authorization enforced', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  const admin = await token(page, 'admin');
  const files = (await readdir(pilotDir!)).filter((f) => /^(vi|en)_.*_lesson\d+\.csv$/.test(f)).sort();
  expect(files).toHaveLength(24);
  const lessons = new Map<string, string>(); // `${courseTitle}#${n}` -> lessonId
  const courseIds = new Map<string, string>();
  for (const f of files) {
    const rows = (await readFile(`${pilotDir}/${f}`, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const header = rows[0].split(',');
    expect(header.slice(-5)).toEqual(['course', 'lesson', 'learning_section', 'topic', 'learning_objective']);
  }
  // Curriculum structure for the isolated database (courses, lessons, one learning outcome per lesson), created through the real admin API.
  const structure = JSON.parse(await readFile(`${pilotDir}/normalization_report.json`, 'utf8'));
  expect(structure.totals).toMatchObject({ vi_rows: 180, en_rows: 60, excluded: 0 });
  const parse = parseCsvLine;
  function parseCsvLine(line: string): string[] { const out: string[] = []; let cur = ''; let q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }
  const meta = new Map<string, { course: string; topic: string; lesson: number }>();
  for (const f of files) {
    const lines = (await readFile(`${pilotDir}/${f}`, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const first = parse(lines[1]);
    meta.set(f, { course: first[15], lesson: Number(first[16]), topic: first[18] });
  }
  const courseKey = (f: string) => `${f.startsWith('en_') ? 'EN' : 'VI'}|${meta.get(f)!.course}`;
  for (const f of files) {
    const key = courseKey(f);
    if (!courseIds.has(key)) {
      const created = await api(page, admin, 'POST', '/admin/courses', { title: meta.get(f)!.course, description: `Pilot import acceptance ${run}` });
      expect(created.status).toBe(201);
      courseIds.set(key, created.body.id);
    }
  }
  // lessons in order, objective per lesson
  for (const f of files) {
    const m = meta.get(f)!; const key = `${courseKey(f)}#${m.lesson}`;
    if (lessons.has(key)) continue;
    const created = await api(page, admin, 'POST', `/admin/courses/${courseIds.get(courseKey(f))}/lessons`, { title: m.topic });
    expect(created.status).toBe(201);
    lessons.set(key, created.body.id);
  }
  // lesson ordinal follows creation order: files are sorted alphabetically (lesson1..lesson6), so ordinals match the file numbers
  for (const [key, id] of lessons) {
    const o = await api(page, admin, 'POST', `/author/question-bank/lessons/${id}/objectives`, { description: `Outcome for ${key}` });
    expect(o.status).toBe(201);
    expect(o.body.code).toBe('LO-1');
  }

  let created = 0;
  const evidence: Array<{ file: string; rows: number; created: number }> = [];
  for (const f of files) {
    const lessonId = lessons.get(`${courseKey(f)}#${meta.get(f)!.lesson}`)!;
    const buffer = await readFile(`${pilotDir}/${f}`);
    const preview = await upload(page, admin, `${base(lessonId)}/import/preview`, f, buffer);
    expect(preview.status, f).toBe(201);
    expect(preview.body, f).toMatchObject({ total: 10, valid: 10, invalid: 0, duplicates: 0, fileSha256: sha(buffer) });
    expect(preview.body.items.every((i: { pointsSource: string; points: number; difficulty: string }) => i.pointsSource === 'default' && i.points === ({ easy: 1, medium: 2, hard: 3 } as Record<string, number>)[i.difficulty])).toBe(true);
    // commit without confirmation / with the wrong hash is refused and writes nothing
    expect((await upload(page, admin, `${base(lessonId)}/import`, f, buffer, { expectedSha256: sha(buffer) })).status).toBe(400);
    expect((await upload(page, admin, `${base(lessonId)}/import`, f, buffer, { confirm: 'true', expectedSha256: 'a'.repeat(64) })).status).toBe(409);
    const done = await upload(page, admin, `${base(lessonId)}/import`, f, buffer, { confirm: 'true', expectedSha256: sha(buffer) });
    expect(done.status, f).toBe(201);
    expect(done.body, f).toMatchObject({ created: 10, failed: 0 });
    created += done.body.created;
    evidence.push({ file: f, rows: 10, created: done.body.created });
    const again = await upload(page, admin, `${base(lessonId)}/import`, f, buffer, { confirm: 'true', expectedSha256: sha(buffer) });
    expect(again.body, `${f} idempotent`).toMatchObject({ created: 0, duplicates: 10 });
  }
  expect(created).toBe(240);
  console.log('PILOT_EVIDENCE', JSON.stringify({ files: evidence.length, totalCreated: created, vi: evidence.filter((e) => e.file.startsWith('vi_')).reduce((a, e) => a + e.created, 0), en: evidence.filter((e) => e.file.startsWith('en_')).reduce((a, e) => a + e.created, 0) }));

  // imported questions are drafts (not visible to learners) and carry topic + audit reference
  const anyLesson = lessons.get(`EN|${EN_COURSE}#1`)!;
  const list = await api(page, admin, 'GET', `${base(anyLesson)}/questions`);
  expect(list.status).toBe(200);
  expect(list.body.total).toBe(0); // quiz-authoring lists published questions only; drafts stay out of quiz building until reviewed

  // authorization: a school instructor and a student cannot import into a global course; foreign-school admin neither
  const buffer = await readFile(`${pilotDir}/en_beginner_lesson1.csv`);
  for (const user of ['instructor', 'student', 'otherSchoolAdmin']) {
    const t = await token(page, user);
    const denied = await upload(page, t, `${base(anyLesson)}/import/preview`, 'x.csv', buffer);
    expect([403, 404], user).toContain(denied.status);
    const deniedCommit = await upload(page, t, `${base(anyLesson)}/import`, 'x.csv', buffer, { confirm: 'true', expectedSha256: sha(buffer) });
    expect([403, 404], user).toContain(deniedCommit.status);
  }
});

async function addVia(page: Page, opener: () => Promise<void>, dialogName: string, text: string) {
  await opener();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await dialog.getByRole('textbox').fill(text);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test('pilot UI: English demo lesson 1 through the real Import dialog (mapping, default points, draft, confirmation)', async ({ page }) => {
  test.setTimeout(240_000);
  if (shotDir) await mkdir(shotDir, { recursive: true });
  const instructor = await signIn(page, 'instructor');
  await page.goto('/admin/courses');
  await page.getByRole('button', { name: 'Create Course' }).click();
  await page.getByRole('textbox', { name: 'Course Title' }).fill(EN_COURSE);
  await page.getByRole('textbox', { name: /^Description/ }).fill('English demonstration course (UI import proof).');
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/);
  const courseId = page.url().match(/courses\/([0-9a-f-]{36})/)![1];
  await addVia(page, () => page.getByRole('button', { name: 'Add module' }).click(), 'Add module', 'Identifying the SO-101 and Safety');
  await addVia(page, () => page.getByRole('button', { name: /Add Lesson/ }).first().click(), 'Add lesson', 'Identifying the SO-101 and Safety');
  await addVia(page, () => page.getByRole('button', { name: 'Quick Add Quiz' }).first().click(), 'Add activity', 'Mini-quiz');
  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  await workspace.getByRole('textbox', { name: 'Instructions' }).fill('Choose the best answer.');
  await workspace.getByRole('spinbutton', { name: 'Passing score' }).fill('70');
  await workspace.getByRole('button', { name: 'Create quiz draft' }).click();
  await expect(workspace.getByRole('button', { name: 'Create quiz draft' })).toHaveCount(0);
  const lessonId = (await api(page, instructor, 'GET', `/courses/${courseId}/lessons`)).body[0].id as string;
  expect((await api(page, instructor, 'POST', `/author/question-bank/lessons/${lessonId}/objectives`, { description: 'Recognise the arm structure, the workspace and the safe-stop rules.' })).status).toBe(201);

  await workspace.getByRole('button', { name: 'Questions', exact: true }).click();
  await workspace.getByRole('button', { name: 'Import questions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import questions' });
  const buffer = await readFile(`${pilotDir}/en_beginner_lesson1.csv`);
  await dialog.getByLabel('Question file').setInputFiles({ name: 'en_beginner_lesson1.csv', mimeType: 'text/csv', buffer });
  await expect(dialog.getByRole('status').filter({ hasText: '10 rows · 10 valid · 0 with errors · 0 duplicates (skipped)' })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /2\s+valid.*single choice.*1 \(default\).*LO-1/ })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /3\s+valid.*single choice.*2 \(default\)/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Import 10 valid questions/ })).toBeDisabled();
  if (shotDir) await page.screenshot({ path: `${shotDir}/pilot-import-preview.png`, fullPage: true });
  await dialog.getByLabel('I reviewed this preview and want to import the valid rows.').check();
  await dialog.getByRole('button', { name: /^Import 10 valid questions/ }).click();
  await expect(dialog.getByText(/Imported 10 questions as draft\./)).toBeVisible();
  if (shotDir) await page.screenshot({ path: `${shotDir}/pilot-import-result.png`, fullPage: true });
});
