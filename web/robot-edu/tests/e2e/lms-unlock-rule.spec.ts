import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createActiveOffering } from './helpers/academic';

/**
 * Phase 1E: unlock rule authored in the UI; a failed quiz keeps the next module locked (UI and direct API), a later pass unlocks it.
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

test('Unlock rule: failing the weighted quiz keeps module two locked; a passing retake unlocks it', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = `Unlock Course ${run}`;
  const instructorToken = await signIn(page, fixture.users.instructor.authUserId);
  const courseId = await authorReadingCourse(page, title);

  // module 1: a required quiz (3-point + 1-point question, 60% to pass) imported from CSV through the UI
  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  await page.getByRole('button', { name: 'Quick Add Quiz' }).first().click();
  const addQuiz = page.getByRole('dialog', { name: 'Add activity' });
  await addQuiz.getByRole('textbox').fill('Gate quiz');
  await addQuiz.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(addQuiz).not.toBeVisible();
  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  await workspace.getByRole('textbox', { name: 'Instructions' }).fill('Pass to continue.');
  await workspace.getByRole('spinbutton', { name: 'Passing score' }).fill('60');
  await workspace.getByRole('button', { name: 'Create quiz draft' }).click();
  await expect(workspace.getByRole('button', { name: 'Create quiz draft' })).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Questions', exact: true }).click();
  await workspace.getByRole('button', { name: 'Import questions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import questions' });
  const header = 'code,type,difficulty,cognitive_level,stem,option_a,option_b,option_c,option_d,option_e,option_f,correct,points,explanation,source_reference';
  const csv = [header, ',single_choice,easy,remember,Heavy gate question?,Right,Wrong,,,,,A,3,Right is right.,', ',single_choice,easy,remember,Light gate question?,Yes,No,,,,,A,1,Yes is right.,'].join('\r\n') + '\r\n';
  await dialog.getByLabel('Question file').setInputFiles({ name: 'gate.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByRole('status').filter({ hasText: '2 rows · 2 valid' })).toBeVisible();
  await dialog.getByLabel('New Learning Outcome').fill('Learners pass the gate.');
  await dialog.getByLabel('Publish immediately (otherwise questions are imported as drafts)').check();
  await dialog.getByLabel('I reviewed this preview and want to import the valid rows.').check();   // hash-bound confirmation (61dcda5)
  await dialog.getByRole('button', { name: /^Import 2 valid questions/ }).click();
  await expect(dialog.getByText(/Imported 2 questions/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  for (const stem of ['Heavy gate question?', 'Light gate question?']) {
    const card = workspace.locator('article', { hasText: stem });
    await card.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Added' })).toBeVisible();
  }
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/author/activities/'));
  await workspace.getByRole('button', { name: 'Save Quiz Activity' }).click();
  expect((await saved).ok()).toBeTruthy();

  // module 2 with its own lesson and reading, locked behind module 1 by an unlock rule set in the UI
  await page.getByTitle('Add Module').click();
  let name = page.getByRole('dialog', { name: 'Add module' });
  await name.getByRole('textbox').fill('Second module');
  await name.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(name).not.toBeVisible();
  const info = page.getByRole('form', { name: 'Module information' });
  await info.getByRole('button', { name: 'Add lesson' }).click();
  name = page.getByRole('dialog', { name: 'Add lesson' });
  await name.getByRole('textbox').fill('Second lesson');
  await name.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(name).not.toBeVisible();
  await page.getByRole('button', { name: 'Quick Add Reading' }).last().click();
  name = page.getByRole('dialog', { name: 'Add activity' });
  await name.getByRole('textbox').fill('Second reading');
  await name.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(name).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Second reading', level: 2 })).toBeVisible();
  await workspace.getByRole('button', { name: '+ Add Paragraph' }).click();
  await workspace.locator('textarea').last().fill('Module two content.');
  await workspace.getByRole('button', { name: 'Save Draft' }).click();
  await expect(workspace.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Module 2: Second module/ }).click();
  const moduleInfo = page.getByRole('form', { name: 'Module information' });
  await expect(moduleInfo.getByText('Unlock rule')).toBeVisible();
  await moduleInfo.getByLabel('Complete “Safe robot motion” first').check();
  await moduleInfo.getByRole('button', { name: 'Save module' }).click();
  await expect(moduleInfo.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  const lessons = (await api(page, instructorToken, 'GET', `/courses/${courseId}/lessons`)).body as Array<{ id: string; title: string; ordinal: number; prerequisiteLessonIds: string[] }>;
  expect(lessons).toHaveLength(2);
  expect(lessons[1].prerequisiteLessonIds).toEqual([lessons[0].id]);
  expect(lessons[0].prerequisiteLessonIds).toEqual([]);
  // a persisted rule survives a reload of the builder
  await page.reload();
  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  await page.getByRole('button', { name: /Module 2: Second module/ }).click();
  await expect(page.getByRole('form', { name: 'Module information' }).getByLabel('Complete “Safe robot motion” first')).toBeChecked();

  // the outline shows the rule next to the module (with a full-sentence accessible name) and the structure view reads in the same Module/Lesson words
  await expect(page.getByLabel('Unlock rule: complete Module 1: Safe robot motion first')).toBeVisible();
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  await expect(page.getByRole('heading', { name: 'Modules', level: 3 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add module' })).toBeVisible();
  await page.getByRole('tab', { name: 'Outline & Editor' }).click();

  // publish everything
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  for (const [moduleName, lessonName, activity] of [['Safe robot motion', 'Read and check', 'Gate quiz'], ['Second module', 'Second lesson', 'Second reading']] as const) {
    await page.getByRole('button', { name: new RegExp(`^${moduleName}`) }).first().click();
    await page.getByRole('button', { name: lessonName, exact: true }).click();
    await page.getByRole('button', { name: `Publish ${lessonName}` }).click();
    await expect(page.getByText('Lesson published.')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`^Publish ${activity}`) }).click();
    await expect(page.getByText('Activity published.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Review & Publish' }).click();
  await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
  await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  const quizId = (await api(page, instructorToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessons[0].id}/assignment`)).body.id as string;

  // Settings tab: shows the real status, and archiving asks for confirmation; cancelling changes nothing
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Settings' }).getByText('published', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive course' }).first().click();
  const archive = page.getByRole('dialog');
  await expect(archive).toBeVisible();
  await archive.getByRole('button', { name: 'Cancel' }).click();
  await expect(archive).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('Course workspace · Published')).toBeVisible();

  // deliver
  const adminToken = await signIn(page, fixture.users.schoolAdmin.authUserId);
  const offering = await createActiveOffering(page, fixture, adminToken, title, `OFF-UL-${run}`.toUpperCase());
  const className = `UL ${run}`;
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(className);
  await create.getByLabel('Classroom code').fill(`UL-${run}`.toUpperCase());
  await create.getByLabel('Active course offering').selectOption({ label: `${offering.title} (${offering.code})` });
  await create.getByRole('button', { name: 'Create classroom' }).click();
  await expect(create).not.toBeVisible();
  await expect(page).toHaveURL(/\/school\/classrooms\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Classroom details' })).toBeVisible();
  for (const person of ['Phase 2.4.3 Test Student', 'Phase 2.4.3 Test Instructor']) {
    await page.getByRole('button', { name: 'Add member' }).click();
    const member = page.getByRole('dialog', { name: 'Add classroom member' });
    await member.getByLabel('Search eligible members').fill(person);
    await member.getByRole('radio', { name: new RegExp(person) }).check();
    await member.getByRole('button', { name: 'Add member' }).click();
    await expect(member).not.toBeVisible();
    await expect(page.getByText(person, { exact: true }).first()).toBeVisible();
  }
  const classroomId = ((await api(page, adminToken, 'GET', `/education-admin/organizations/${fixture.schoolId}/classrooms`)).body as Array<{ id: string; name: string }>).find((row) => row.name === className)!.id;
  await signIn(page, fixture.users.instructor.authUserId);
  await page.goto('/teacher/quizzes');
  await page.getByRole('combobox', { name: 'Classroom' }).selectOption({ label: className });
  await page.getByLabel('Published canonical quiz').selectOption(quizId);
  await page.getByLabel(/Maximum attempts|Attempt limit/i).fill('2');
  const delivered = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/classrooms/${classroomId}/quiz-deliveries`));
  await page.getByRole('button', { name: 'Save quiz as draft' }).click();
  const delivery = await (await delivered).json() as { id: string; assignment_id: string };
  const published = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/classrooms/${classroomId}/assignments/${delivery.assignment_id}/publish`));
  await page.getByRole('button', { name: 'Publish to learners' }).click();
  await page.getByRole('dialog', { name: 'Publish this quiz to students?' }).getByRole('button', { name: 'Publish to students' }).click();
  expect((await published).ok()).toBeTruthy();

  // student: module two is locked in the UI and over the API
  const studentToken = await signIn(page, fixture.users.student.authUserId);
  const pathOf = async () => (await api(page, studentToken, 'GET', `/me/courses/${courseId}/path`)).body as { progressPercent: number; lessons: Array<{ status: string }> };
  expect((await pathOf()).lessons.map((l) => l.status)[1]).toBe('locked');
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole('button', { name: 'Locked', exact: true }).first()).toBeDisabled();
  expect((await api(page, studentToken, 'GET', `/lessons/${lessons[1].id}`)).status).toBe(409);
  expect((await api(page, studentToken, 'GET', `/lessons/${lessons[1].id}/sections`)).status).not.toBe(200);

  // fail: heavy (3 pts) wrong, light (1 pt) right => 25% < 60% => still locked
  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: /^(Start|Continue) attempt$/ }).click();
  await expect(page).toHaveURL(/\/practice\//);
  await page.getByText('Wrong', { exact: true }).click();
  await page.getByText('Yes', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Not passed yet' })).toBeVisible();
  await expect(page.getByText(/Score: 25% · Required: 60%/)).toBeVisible();
  expect((await pathOf()).lessons.map((l) => l.status)[1]).toBe('locked');
  expect((await api(page, studentToken, 'GET', `/lessons/${lessons[1].id}`)).status).toBe(409);
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole('button', { name: 'Locked', exact: true }).first()).toBeDisabled();

  // retake and pass => unlocked
  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: 'Start a new attempt' }).click();
  await page.getByText('Right', { exact: true }).click();
  await page.getByText('Yes', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  const after = await pathOf();
  expect(after.lessons[0].status).toBe('completed'); expect(after.lessons[1].status).not.toBe('locked'); expect(after.progressPercent).toBe(50);
  expect((await api(page, studentToken, 'GET', `/lessons/${lessons[1].id}`)).status).toBe(200);
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByLabel('Course progress').getByText('1 of 2 modules completed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Locked', exact: true })).toHaveCount(0);

  // quiz attempt history: both attempts are listed in a stable order with their scores, survive a reload and a fresh login, and are private to the learner
  const historyOf = async (token: string) => (await api(page, token, 'GET', `/me/classroom-assignments/${delivery.id}/attempts`));
  const history = await historyOf(studentToken);
  expect(history.status).toBe(200);
  const rows = history.body as Array<{ id: string; attempt_number: number; status: string; score: number | string | null }>;
  expect(rows.map((row) => row.attempt_number).sort()).toEqual([1, 2]);
  expect(rows.every((row) => row.status === 'evaluated')).toBe(true);
  const numbers = rows.map((row) => row.attempt_number);
  expect(numbers[0] > numbers[1] || numbers[0] < numbers[1]).toBe(true);
  const scoreByNumber = Object.fromEntries(rows.map((row) => [row.attempt_number, Number(row.score)]));
  expect(scoreByNumber).toEqual({ 1: 25, 2: 100 });
  const readHistoryList = async () => {
    await page.goto(`/my-learning/${delivery.id}`);
    const items = page.getByRole('listitem').filter({ hasText: /^Attempt \d/ });
    await expect(items).toHaveCount(2);
    return await items.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()));
  };
  const listed = await readHistoryList();
  expect(listed.map((text) => Number(/^Attempt (\d)/.exec(text)![1]))).toEqual(numbers);      // the page shows the API order
  expect(listed.find((text) => text.startsWith('Attempt 1'))).toContain('Score 25%');
  expect(listed.find((text) => text.startsWith('Attempt 2'))).toContain('Score 100%');
  await page.reload();
  expect(await readHistoryList()).toEqual(listed);                                             // refresh keeps it
  const freshToken = await signIn(page, fixture.users.student.authUserId);                       // a new session keeps it
  expect(((await historyOf(freshToken)).body as unknown[]).length).toBe(2);
  expect(await readHistoryList()).toEqual(listed);
  const otherToken = await session(page, fixture.users.otherSchoolAdmin.authUserId);             // another user never sees the learner's attempts
  const foreign = await historyOf(otherToken.access_token);
  expect(JSON.stringify(foreign.body)).not.toContain(rows[0].id);
  expect(JSON.stringify(foreign.body)).not.toContain(rows[1].id);
  expect([403, 404]).toContain((await api(page, otherToken.access_token, 'GET', `/me/attempts/${rows[0].id}`)).status);
  expect(errors).toEqual([]);
});
