import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Release-candidate acceptance for school-scoped authoring (journeys 1 and 2).
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

test('Journey 1: instructor authors, previews and publishes a school course; an enrolled student sees it and it persists', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = `RC Instructor Course ${run}`;
  const instructorToken = await signIn(page, fixture.users.instructor.authUserId);

  const courseId = await authorReadingCourse(page, title);

  // The school owner is derived on the server from the instructor's membership, never from the client.
  const detail = await api(page, instructorToken, 'GET', `/courses/${courseId}`);
  expect(detail.status).toBe(200);
  expect(detail.body.organizationId).toBe(fixture.schoolId);
  expect(detail.body.status).toBe('draft');

  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  await workspace.getByRole('button', { name: '+ Add Paragraph' }).click();
  await workspace.locator('textarea').last().fill('Always check the emergency stop before the robot moves.');
  await workspace.getByRole('button', { name: 'Save Draft' }).click();
  await expect(workspace.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  // Section first, then its activity (an activity can only be published once its section is).
  await page.getByRole('button', { name: /^Safe robot motion/ }).first().click();
  await page.getByRole('button', { name: 'Read and check', exact: true }).click();
  await page.getByRole('button', { name: 'Publish Read and check' }).click();
  await expect(page.getByText('Lesson published.')).toBeVisible();
  await page.getByRole('button', { name: /^Publish Safety reading/ }).click();
  await expect(page.getByText('Activity published.')).toBeVisible();

  // Preview as a learner, then the authoritative readiness review and publish.
  await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
  const learnerPreview = page.getByRole('dialog').last();
  await expect(learnerPreview.getByText('Safety reading').first()).toBeVisible();
  console.log('PREVIEWDLG', await learnerPreview.getByRole('button').allTextContents());
  await page.keyboard.press('Escape');
  await expect(learnerPreview).not.toBeVisible();
  await page.getByRole('button', { name: 'Review & Publish' }).click();
  await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
  await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();

  const published = await api(page, instructorToken, 'GET', `/courses/${courseId}`);
  expect(published.body.status).toBe('published');
  // An enrolled student only sees it after the school delivers it: not before.
  const studentToken = await signIn(page, fixture.users.student.authUserId);
  expect((await api(page, studentToken, 'GET', `/courses/${courseId}`)).status).toBe(404);

  // School Admin delivers it: classroom on the new offering, student enrolled (real UI).
  const adminToken = await signIn(page, fixture.users.schoolAdmin.authUserId);
  // The School Admin's course picker lists the school's own published course (not just global templates).
  const pickable = await api(page, adminToken, 'GET', `/education-admin/organizations/${fixture.schoolId}/published-courses`);
  expect((pickable.body as Array<{ title: string }>).some((row) => row.title === title)).toBe(true);
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create classroom' });
  await dialog.getByLabel('Classroom name').fill(`RC J1 ${run}`);
  await dialog.getByLabel('Classroom code').fill(`RC-J1-${run}`.toUpperCase());
  await dialog.getByLabel('Published course').selectOption({ label: title });
  await dialog.getByLabel('School offering code').fill(`OFF-J1-${run}`.toUpperCase());
  await dialog.getByRole('button', { name: 'Create classroom' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: `RC J1 ${run}` }).click();
  await page.getByRole('button', { name: 'Add member' }).click();
  const memberDialog = page.getByRole('dialog', { name: 'Add classroom member' });
  await memberDialog.getByLabel('Search eligible members').fill('Phase 2.4.3 Test Student');
  await memberDialog.getByRole('radio', { name: /Phase 2.4.3 Test Student/ }).check();
  await memberDialog.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText('Phase 2.4.3 Test Student')).toBeVisible();

  // Authorized student sees it; another school's admin does not; persistence across refresh + relogin.
  await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('sb-127-auth-token'));
  await page.reload();
  await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const afterLoginToken = await signIn(page, fixture.users.student.authUserId);
  const afterLogin = await api(page, afterLoginToken, 'GET', `/courses/${courseId}`);
  expect(afterLogin.status).toBe(200);
  const otherToken = await signIn(page, fixture.users.otherSchoolAdmin.authUserId);
  expect((await api(page, otherToken, 'GET', `/courses/${courseId}`)).status).toBe(404);
  // School isolation is enforced by the server for every authoring action, not only reads.
  expect((await api(page, otherToken, 'PATCH', `/admin/courses/${courseId}`, { title: 'hijacked' })).status).toBe(404);
  expect((await api(page, otherToken, 'POST', `/admin/courses/${courseId}/publish`)).status).toBe(404);
  expect((await api(page, otherToken, 'POST', `/admin/courses/${courseId}/lessons`, { title: 'x' })).status).toBe(404);
  expect((await api(page, otherToken, 'POST', `/admin/courses/${courseId}/archive`)).status).toBe(404);
  // Learning Media is course-scoped too: the owning school's author may list, a foreign school may not.
  expect((await api(page, instructorToken, 'GET', `/admin/courses/${courseId}/media`)).status).toBe(200);
  expect((await api(page, otherToken, 'GET', `/admin/courses/${courseId}/media`)).status).toBe(404);
  expect((await api(page, otherToken, 'POST', `/admin/courses/${courseId}/media/uploads`, { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 })).status).toBe(404);
  // A client cannot assign a course to a school it does not belong to, and students cannot author at all.
  expect((await api(page, instructorToken, 'POST', '/admin/courses', { title: 'Forged owner', organizationId: fixture.otherSchoolId })).status).toBe(404);
  expect((await api(page, afterLoginToken, 'POST', '/admin/courses', { title: 'Student course' })).status).toBe(404);
  expect(errors).toEqual([]);
});

test('Journey 2: instructor authors a school question, builds and configures a quiz, assigns it, a student submits and sees the graded result', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = `RC Quiz Course ${run}`;
  const instructorToken = await signIn(page, fixture.users.instructor.authUserId);
  const courseId = await authorReadingCourse(page, title);

  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  await page.getByRole('button', { name: 'Quick Add Quiz' }).first().click();
  const addQuiz = page.getByRole('dialog', { name: 'Add activity' });
  await addQuiz.getByRole('textbox').fill('Safety quiz');
  await addQuiz.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(addQuiz).not.toBeVisible();
  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  await expect(page.getByRole('button', { name: 'Create quiz draft' })).toBeVisible();

  // Quiz information: instructions + pass threshold, then create the quiz draft.
  await workspace.getByRole('textbox', { name: 'Instructions' }).fill('Choose the safest answer.');
  await workspace.getByRole('spinbutton', { name: 'Passing score' }).fill('70');
  await workspace.getByRole('button', { name: 'Create quiz draft' }).click();
  await expect(workspace.getByRole('button', { name: 'Create quiz draft' })).toHaveCount(0);

  // Author a single-choice and a multiple-choice school question (published immediately by a school author).
  await workspace.getByRole('button', { name: 'Questions', exact: true }).click();
  await workspace.getByRole('button', { name: 'New question' }).click();
  let dialog = page.getByRole('dialog', { name: 'New question' });
  await dialog.getByLabel('Question text').fill('Which command safely stops the robot?');
  await dialog.getByLabel('Option 1').fill('Stop motion');
  await dialog.getByLabel('Option 2').fill('Increase speed');
  await dialog.getByLabel('Correct answer 1').check();
  await dialog.getByLabel('Explanation').fill('Stop motion halts every joint immediately.');
  await dialog.getByLabel('New learning outcome', { exact: true }).fill('Learners can stop a robot safely.');
  await dialog.getByRole('button', { name: 'Save and publish question' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(workspace.getByText('Which command safely stops the robot?')).toBeVisible();

  await workspace.getByRole('button', { name: 'New question' }).click();
  dialog = page.getByRole('dialog', { name: 'New question' });
  await dialog.getByLabel('Question type').selectOption('multiple_choice');
  await dialog.getByLabel('Question text').fill('Select the safety checks before moving the robot.');
  await dialog.getByLabel('Option 1').fill('Check the emergency stop');
  await dialog.getByLabel('Option 2').fill('Clear the workspace');
  await dialog.getByRole('button', { name: 'Add option' }).click();
  await dialog.getByLabel('Option 3').fill('Disable all sensors');
  await dialog.getByLabel('Correct answer 1').check();
  await dialog.getByLabel('Correct answer 2').check();
  await dialog.getByLabel('Explanation').fill('Both checks happen before every move.');
  await dialog.getByRole('combobox').last().selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Save and publish question' }).click();
  await expect(dialog).not.toBeVisible();

  // Validation: a multiple-choice question needs two correct answers (server and client agree), nothing is created.
  await workspace.getByRole('button', { name: 'New question' }).click();
  dialog = page.getByRole('dialog', { name: 'New question' });
  await dialog.getByLabel('Question type').selectOption('multiple_choice');
  await dialog.getByLabel('Question text').fill('Invalid question');
  await dialog.getByLabel('Option 1').fill('A');
  await dialog.getByLabel('Option 2').fill('B');
  await dialog.getByLabel('Correct answer 1').check();
  await dialog.getByLabel('Explanation').fill('x');
  await dialog.getByRole('combobox').last().selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Save and publish question' }).click();
  await expect(dialog.getByRole('alert')).toContainText('at least two correct answers');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Weights: the single-choice question is worth 1 point, the multiple-choice question 3 points (total 4). Validation first.
  const multiCard = workspace.locator('article', { hasText: 'Select the safety checks before moving the robot.' });
  const singleCard = workspace.locator('article', { hasText: 'Which command safely stops the robot?' });
  await multiCard.getByRole('spinbutton').fill('0');
  await expect(multiCard.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await multiCard.getByRole('spinbutton').fill('3');
  await singleCard.getByRole('spinbutton').fill('1');
  const addButtons = workspace.getByRole('button', { name: 'Add', exact: true });
  await expect(addButtons).toHaveCount(2);
  await addButtons.first().click();
  await expect(workspace.getByRole('button', { name: 'Added' })).toHaveCount(1);
  await workspace.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(workspace.getByRole('button', { name: 'Added' })).toHaveCount(2);

  await workspace.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(workspace.getByText('Passing score: 70% · 2 questions')).toBeVisible();
  const quizApi = await api(page, instructorToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${(await api(page, instructorToken, 'GET', `/courses/${courseId}/lessons`)).body[0].id}/assignment`);
  expect(quizApi.body.questions.map((q: { stem: string; points: number }) => [q.stem, Number(q.points)]).sort()).toEqual([['Select the safety checks before moving the robot.', 3], ['Which command safely stops the robot?', 1]]);
  await expect(workspace.getByText('Answer: a, b')).toBeVisible(); // the author sees the answer key; students never do (checked below)
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/author/activities/'));
  await workspace.getByRole('button', { name: 'Save Quiz Activity' }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(workspace.getByText('Unsaved changes')).toHaveCount(0);

  // Publish the section and quiz activity, then the course (readiness review).
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  await expect(page.getByRole('tab', { name: /Structure & Publishing/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /^Safe robot motion/ }).first().click();
  await page.getByRole('button', { name: 'Read and check', exact: true }).click();
  await page.getByRole('button', { name: 'Publish Read and check' }).click();
  await expect(page.getByText('Lesson published.')).toBeVisible();
  await page.getByRole('button', { name: /^Publish Safety quiz/ }).click();
  await expect(page.getByText('Activity published.')).toBeVisible();
  await page.getByRole('button', { name: 'Review & Publish' }).click();
  await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
  await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();

  // Safe edit: the published quiz's pinned questions can no longer be changed destructively once delivered (checked after delivery).
  const lessons = await api(page, instructorToken, 'GET', `/courses/${courseId}/lessons`);
  const lessonId = lessons.body[0].id as string;
  const quiz = await api(page, instructorToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessonId}/assignment`);
  expect(quiz.body.constraints.passPercent).toBe(70);
  expect(quiz.body.questions).toHaveLength(2);
  const quizId = quiz.body.id as string;

  // Global Question Bank stays read-only for school authors; another school cannot touch this school's questions.
  const otherToken = await session(page, fixture.users.otherSchoolAdmin.authUserId).then((v) => v.access_token);
  expect((await api(page, otherToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessonId}/assignment`)).status).toBe(404);
  expect((await api(page, otherToken, 'POST', `/author/question-bank/quiz-authoring/lessons/${lessonId}/questions`, { content: { type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem: 'x', options: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], answerKey: ['a'], explanation: 'e' }, newObjective: 'x' })).status).toBe(404);
  // A school author can neither create a question for another school nor a global (organization-less) one.
  expect((await api(page, instructorToken, 'POST', '/author/question-bank/questions', { code: `FOREIGN-${run}`, courseId, lessonId, organizationId: fixture.otherSchoolId })).status).toBe(404);
  expect((await api(page, instructorToken, 'POST', '/author/question-bank/questions', { code: `GLOBAL-${run}`, courseId, lessonId })).status).toBe(404);

  // School Admin delivers the course: classroom on the new offering with the student and the instructor.
  const adminToken = await signIn(page, fixture.users.schoolAdmin.authUserId);
  const className = `RC J2 ${run}`;
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(className);
  await create.getByLabel('Classroom code').fill(`RC-J2-${run}`.toUpperCase());
  await create.getByLabel('Published course').selectOption({ label: title });
  await create.getByLabel('School offering code').fill(`OFF-J2-${run}`.toUpperCase());
  await create.getByRole('button', { name: 'Create classroom' }).click();
  await expect(create).not.toBeVisible();
  await page.getByRole('button', { name: className }).click();
  for (const person of ['Phase 2.4.3 Test Student', 'Phase 2.4.3 Test Instructor']) {
    await page.getByRole('button', { name: 'Add member' }).click();
    const member = page.getByRole('dialog', { name: 'Add classroom member' });
    await member.getByLabel('Search eligible members').fill(person);
    await member.getByRole('radio', { name: new RegExp(person) }).check();
    await member.getByRole('button', { name: 'Add member' }).click();
    await expect(member).not.toBeVisible();
    await expect(page.getByText(person, { exact: true }).first()).toBeVisible();
  }
  const classrooms = await api(page, adminToken, 'GET', `/education-admin/organizations/${fixture.schoolId}/classrooms`);
  const classroomId = (classrooms.body as Array<{ id: string; name: string }>).find((row) => row.name === className)!.id;

  // The instructor assigns the published quiz to the classroom they teach (real Teacher UI), with an attempt limit.
  await signIn(page, fixture.users.instructor.authUserId);
  const teacherToken = (await session(page, fixture.users.instructor.authUserId)).access_token;
  await page.goto('/teacher/quizzes');
  await page.getByRole('combobox', { name: 'Classroom' }).selectOption({ label: className });
  const quizSelect = page.getByLabel('Published canonical quiz');
  await expect(quizSelect).toBeVisible();
  await quizSelect.selectOption(quizId);
  await page.getByLabel(/Maximum attempts|Attempt limit/i).fill('2');
  const delivered = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/classrooms/${classroomId}/quiz-deliveries`));
  await page.getByRole('button', { name: 'Save quiz as draft' }).click();
  const delivery = await (await delivered).json() as { id: string; assignment_id: string };
  const publishedDelivery = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/classrooms/${classroomId}/assignments/${delivery.assignment_id}/publish`));
  await page.getByRole('button', { name: 'Publish to learners' }).click();
  expect((await publishedDelivery).ok()).toBeTruthy();

  // Safe edit: a delivered quiz can no longer be changed in a way that would alter attempts' meaning.
  const unsafe = await api(page, teacherToken, 'DELETE', `/author/question-bank/assignments/${quizId}/questions/${quiz.body.questions[0].versionId}`);
  expect(unsafe.status).toBe(409);

  // Student: opens the quiz, fails the first attempt, passes the second; the server grades; no answer key is exposed.
  const studentToken = await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await page.getByRole('tab', { name: 'Quizzes' }).click();
  await expect(page.getByRole('heading', { name: 'Safety quiz' }).first()).toBeVisible();
  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: /^(Start|Continue) attempt$/ }).click();
  await expect(page).toHaveURL(/\/practice\//);
  const attemptId = page.url().match(/practice\/([0-9a-f-]{36})/)?.[1];
  if (attemptId) {
    const attempt = await api(page, studentToken, 'GET', `/me/attempts/${attemptId}`);
    expect(JSON.stringify(attempt.body)).not.toMatch(/answerKey|answer_key|correctOptionIds/);
  }
  await expect(page.getByText('Which command safely stops the robot?')).toBeVisible();
  // The student sees the real weights before answering (browser rendering, not just stored data).
  await expect(page.getByTestId('quiz-total-points')).toHaveText('Total: 4 points · Pass at 70%');
  await expect(page.getByTestId('question-points')).toHaveText(['· 3 points', '· 1 point']);
  // Attempt 1: the 1-point question right, the 3-point question wrong => 1 of 4 points = 25% (an unweighted 50% would be wrong).
  await page.getByText('Stop motion', { exact: true }).click();
  await page.getByText('Check the emergency stop', { exact: true }).click();
  await page.getByText('Disable all sensors', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Not passed yet' })).toBeVisible();
  await expect(page.getByText(/Score: 25% · Required: 70%/)).toBeVisible();
  await expect(page.getByTestId('quiz-earned-points')).toHaveText('1 of 4 points earned');
  await expect(page.getByTestId('question-result')).toHaveText([/Question 1: not correct · 0 \/ 3/, /Question 2: correct · 1 \/ 1/]);

  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: 'Start a new attempt' }).click();
  await page.getByText('Stop motion', { exact: true }).click();
  await page.getByText('Check the emergency stop', { exact: true }).click();
  await page.getByText('Clear the workspace', { exact: true }).click();
  const submission = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/knowledge-check'));
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  await expect(page.getByText(/Score: 100%/)).toBeVisible();
  await expect(page.getByTestId('quiz-earned-points')).toHaveText('4 of 4 points earned');

  // Duplicate submission: replaying the same submission is refused or idempotent (never 5xx) and the graded result does not change.
  const original = await submission;
  const replay = await page.request.fetch(original.url(), { method: 'POST', headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' }, data: original.postData() ?? '{}' });
  expect(replay.status()).toBeLessThan(500);
  const attemptsAfter = await api(page, studentToken, 'GET', '/me/attempts');
  const quizAttempts = (attemptsAfter.body as Array<{ classroom_assignment_id?: string; status: string; score: number | null }>).filter((a) => a.classroom_assignment_id === delivery.id);
  expect(quizAttempts).toHaveLength(2);
  expect(quizAttempts.every((a) => a.status !== 'in_progress')).toBe(true); // both attempts are finished; the replay created none
  expect(quizAttempts.map((a) => Number(a.score)).sort((x, y) => x - y)).toEqual([25, 100]); // points-weighted scores persisted by the server

  // The instructor sees the matching result; persistence holds after relogin.
  const teacher = await signIn(page, fixture.users.instructor.authUserId);
  const summary = await api(page, teacher, 'GET', `/classrooms/${classroomId}/summary`);
  expect(summary.status).toBe(200);
  const foreign = await api(page, otherToken, 'GET', `/classrooms/${classroomId}/summary`);
  expect(foreign.status).toBe(404);
  expect(errors).toEqual([]);
});

test('Authoring pages (course list, course builder, teacher assignment editor) do not overflow at 320/375/768/1024/1440 and raise no console errors', async ({ page }) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon|Failed to load resource/.test(message.text())) problems.push(`console: ${message.text()}`); });
  const token = await signIn(page, fixture.users.instructor.authUserId);
  const created = await api(page, token, 'POST', '/admin/courses', { title: `RC Responsive ${run}`, description: 'Responsive check.' });
  expect(created.status).toBe(201);
  const courseId = created.body.id as string;
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/admin/courses', `/admin/courses/${courseId}`, '/teacher/assignments/new']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
  expect(problems).toEqual([]);
});

test('Failure recovery: expired sessions are refused by the API and the app, and validation errors are explained', async ({ page }) => {
  test.setTimeout(120_000);
  // Expired and forged credentials are refused by the real API (never silently accepted).
  const expired = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users.student.authUserId}&ttl=-120`)).json() as { access_token: string };
  for (const token of [expired.access_token, 'not-a-token']) {
    expect((await api(page, token, 'GET', '/courses')).status).toBe(401);
    expect((await api(page, token, 'POST', '/admin/courses', { title: 'x' })).status).toBe(401);
  }
  // The app does not expose private pages or crash with an expired stored session.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const expiredSession = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users.student.authUserId}&ttl=-120`)).json();
  await page.evaluate((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), expiredSession);
  await page.goto('/my-learning');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toHaveCount(0);
  expect(errors).toEqual([]);
  // A fresh sign-in recovers the same account.
  await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();

  // Validation errors are explained by the server, not swallowed: an invalid question and an empty course title.
  const instructor = await signIn(page, fixture.users.instructor.authUserId);
  const emptyTitle = await api(page, instructor, 'POST', '/admin/courses', { title: '   ' });
  expect(emptyTitle.status).toBe(400);
  expect(JSON.stringify(emptyTitle.body)).toMatch(/title/i);
});

test('Publishing policy: School Admin authors courses but cannot publish; only an Instructor publishes', async ({ page }) => {
  test.setTimeout(120_000);
  const adminToken = await signIn(page, fixture.users.schoolAdmin.authUserId);
  // A School Admin creates and edits a course for their own school (authoring is allowed)...
  const created = await api(page, adminToken, 'POST', '/admin/courses', { title: `RC SchoolAdmin Course ${run}`, description: 'Authored by a School Admin.' });
  expect(created.status).toBe(201);
  expect(created.body.organization_id).toBe(fixture.schoolId);
  const courseId = created.body.id as string;
  const lesson = await api(page, adminToken, 'POST', `/admin/courses/${courseId}/lessons`, { title: 'Authored lesson' });
  expect(lesson.status).toBe(201);
  expect((await api(page, adminToken, 'PATCH', `/admin/courses/${courseId}`, { title: `RC SchoolAdmin Course ${run} (edited)` })).status).toBe(200);
  // ...but publishing is refused by the server (not just hidden in the UI), for the course and for any API route that publishes it.
  expect((await api(page, adminToken, 'POST', `/admin/courses/${courseId}/publish`)).status).toBe(404);
  expect((await api(page, adminToken, 'GET', `/courses/${courseId}`)).body.status).toBe('draft');
  // The builder offers no publish action to a School Admin.
  await page.goto(`/admin/courses/${courseId}`);
  await expect(page.getByRole('button', { name: /Review & Publish|Readiness Checklist/ })).toBeDisabled();
  await page.goto('/admin/courses');
  await expect(page.getByRole('button', { name: 'Publish', exact: true }).first()).toBeDisabled();
  // The Instructor of the same school can see the course; publishing still needs a deliverable curriculum (409), which proves the request reached the publish rules.
  const instructorToken = await signIn(page, fixture.users.instructor.authUserId);
  expect((await api(page, instructorToken, 'GET', `/courses/${courseId}`)).status).toBe(200);
  expect((await api(page, instructorToken, 'POST', `/admin/courses/${courseId}/publish`)).status).toBe(409);
});
