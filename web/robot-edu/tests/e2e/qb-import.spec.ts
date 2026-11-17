import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Phase 1D: Question Bank CSV import journey (template → preview → errors/duplicates → import → quiz → student weighted result).
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


/** Optional visual-audit capture (Phase 1F): only when VISTA_VISUAL_AUDIT_DIR is set; captures desktop and mobile widths. */
async function shot(page: Page, name: string) {
  const dir = process.env.VISTA_VISUAL_AUDIT_DIR;
  if (!dir) return;
  const original = page.viewportSize();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1700 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  }
  if (original) await page.setViewportSize(original);
}

test('Question Bank import: template, preview with row errors and duplicates, import, quiz with imported points, student weighted result', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = `QB Import Course ${run}`;
  const instructorToken = await signIn(page, fixture.users.instructor.authUserId);
  const courseId = await authorReadingCourse(page, title);

  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  await page.getByRole('button', { name: 'Quick Add Quiz' }).first().click();
  const addQuiz = page.getByRole('dialog', { name: 'Add activity' });
  await addQuiz.getByRole('textbox').fill('Imported quiz');
  await addQuiz.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(addQuiz).not.toBeVisible();
  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  await workspace.getByRole('textbox', { name: 'Instructions' }).fill('Choose the best answer.');
  await workspace.getByRole('spinbutton', { name: 'Passing score' }).fill('70');
  await workspace.getByRole('button', { name: 'Create quiz draft' }).click();
  await expect(workspace.getByRole('button', { name: 'Create quiz draft' })).toHaveCount(0);

  // 1-2. Quiz Builder → Questions → Import questions → download the template
  await workspace.getByRole('button', { name: 'Questions', exact: true }).click();
  await workspace.getByRole('button', { name: 'Import questions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import questions' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'CSV', exact: true }).click();
  const template = await download;
  expect(template.suggestedFilename()).toBe('question-bank-template.csv');
  const templateText = await readFile((await template.path())!, 'utf8');
  expect(templateText.split('\r\n')[0]).toBe('code,type,difficulty,cognitive_level,stem,option_a,option_b,option_c,option_d,option_e,option_f,correct,points,explanation,source_reference');

  // 3-6. upload a file with two valid rows, one duplicate and one invalid row; the preview explains each
  const header = templateText.split('\r\n')[0];
  const csv = [header,
    ',single_choice,easy,remember,Which control stops the robot instantly?,Emergency stop,Slow down,Ignore it,,,,A,3,The emergency stop halts all motion.,',
    ',single_choice,easy,remember,Which part is a robot sensor?,Camera,Chair,,,,,A,1,A camera senses the scene.,',
    ',single_choice,easy,remember,  which control STOPS the robot instantly?,Emergency stop,Slow down,,,,,A,2,duplicate of row 2,',
    ',single_choice,easy,remember,Broken row,Yes,No,,,,,Z,1,bad answer key,',
  ].join('\r\n') + '\r\n';
  await dialog.getByLabel('Question file').setInputFiles({ name: 'questions.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByRole('status').filter({ hasText: '4 rows · 2 valid · 1 with errors · 1 duplicate (skipped)' })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /3\s+valid.*Which part is a robot sensor/ })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /4\s+duplicate.*Same as row 2/ })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /5\s+invalid.*does not exist/ })).toBeVisible();
  await shot(page, 'qb-import-preview');
  // nothing is written by a preview
  const lessonId = (await api(page, instructorToken, 'GET', `/courses/${courseId}/lessons`)).body[0].id as string;
  expect((await api(page, instructorToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessonId}/questions`)).body.total).toBe(0);
  // a Learning Outcome is required before importing
  await expect(dialog.getByRole('button', { name: /^Import 2 valid questions/ })).toBeDisabled();
  await dialog.getByLabel('New Learning Outcome').fill('Learners can name basic robot controls.');

  // 7. confirm the import
  await dialog.getByRole('button', { name: /^Import 2 valid questions/ }).click();
  await expect(dialog.getByText('Imported 2 questions. Skipped: 1 invalid, 1 duplicate.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // 8-10. imported questions are in the Question Bank with the file's points pre-filled; add both to the quiz
  const heavy = workspace.locator('article', { hasText: 'Which control stops the robot instantly?' });
  const light = workspace.locator('article', { hasText: 'Which part is a robot sensor?' });
  await expect(heavy).toBeVisible(); await expect(light).toBeVisible();
  await expect(workspace.locator('article', { hasText: 'Broken row' })).toHaveCount(0);
  await expect(heavy.getByRole('spinbutton')).toHaveValue('3');
  await expect(light.getByRole('spinbutton')).toHaveValue('1');
  await heavy.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(heavy.getByRole('button', { name: 'Added' })).toBeVisible();
  await light.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(light.getByRole('button', { name: 'Added' })).toBeVisible();
  await shot(page, 'qb-quiz-builder');
  const quiz = await api(page, instructorToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessonId}/assignment`);
  expect(quiz.body.questions.map((q: { stem: string; points: number }) => [q.stem, Number(q.points)]).sort()).toEqual([['Which control stops the robot instantly?', 3], ['Which part is a robot sensor?', 1]]);
  // re-importing the same file now reports the existing questions as duplicates (nothing new to import)
  await workspace.getByRole('button', { name: 'Import questions' }).click();
  await dialog.getByLabel('Question file').setInputFiles({ name: 'questions.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByRole('status').filter({ hasText: '4 rows · 0 valid · 1 with errors · 3 duplicates (skipped)' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // XLSX path in the browser: the downloaded XLSX template is itself a valid import file
  await workspace.getByRole('button', { name: 'Import questions' }).click();
  const xlsxDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'XLSX', exact: true }).click();
  const xlsxTemplate = await xlsxDownload;
  expect(xlsxTemplate.suggestedFilename()).toBe('question-bank-template.xlsx');
  await dialog.getByLabel('Question file').setInputFiles({ name: xlsxTemplate.suggestedFilename(), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await readFile((await xlsxTemplate.path())!) });
  await expect(dialog.getByRole('status').filter({ hasText: '2 rows · 2 valid · 0 with errors · 0 duplicates (skipped)' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/author/activities/'));
  await workspace.getByRole('button', { name: 'Save Quiz Activity' }).click();
  expect((await saved).ok()).toBeTruthy();

  // publish section, quiz and course
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  await page.getByRole('button', { name: /^Safe robot motion/ }).first().click();
  await page.getByRole('button', { name: 'Read and check', exact: true }).click();
  await page.getByRole('button', { name: 'Publish Read and check' }).click();
  await expect(page.getByText('Section published.')).toBeVisible();
  await page.getByRole('button', { name: /^Publish Imported quiz/ }).click();
  await expect(page.getByText('Activity published.')).toBeVisible();
  await page.getByRole('button', { name: 'Review & Publish' }).click();
  await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
  await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  const quizId = (await api(page, instructorToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessonId}/assignment`)).body.id as string;

  // deliver: classroom + enrolment (School Admin UI), quiz delivery (Teacher UI)
  const adminToken = await signIn(page, fixture.users.schoolAdmin.authUserId);
  const className = `QB Import ${run}`;
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(className);
  await create.getByLabel('Classroom code').fill(`QBI-${run}`.toUpperCase());
  await create.getByLabel('Published course').selectOption({ label: title });
  await create.getByLabel('School offering code').fill(`OFF-QBI-${run}`.toUpperCase());
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
  const classroomId = ((await api(page, adminToken, 'GET', `/education-admin/organizations/${fixture.schoolId}/classrooms`)).body as Array<{ id: string; name: string }>).find((row) => row.name === className)!.id;
  await signIn(page, fixture.users.instructor.authUserId);
  await page.goto('/teacher/quizzes');
  await page.getByRole('combobox', { name: 'Classroom' }).selectOption({ label: className });
  await page.getByLabel('Published canonical quiz').selectOption(quizId);
  const delivered = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/classrooms/${classroomId}/quiz-deliveries`));
  await page.getByRole('button', { name: 'Save quiz as draft' }).click();
  const delivery = await (await delivered).json() as { id: string; assignment_id: string };
  const published = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/classrooms/${classroomId}/assignments/${delivery.assignment_id}/publish`));
  await page.getByRole('button', { name: 'Publish to learners' }).click();
  expect((await published).ok()).toBeTruthy();

  // 11. student: heavy (3 pt) wrong, light (1 pt) right => 1 of 4 = 25%, not passed; then both right => 100%
  const studentToken = await signIn(page, fixture.users.student.authUserId);
  await page.goto(`/my-learning/${delivery.id}`);
  await shot(page, 'student-quiz-assignment');
  await page.getByRole('button', { name: /^(Start|Continue) attempt$/ }).click();
  await expect(page).toHaveURL(/\/practice\//);
  const attemptId = page.url().match(/practice\/([0-9a-f-]{36})/)![1];
  expect(JSON.stringify((await api(page, studentToken, 'GET', `/me/attempts/${attemptId}`)).body)).not.toMatch(/answerKey|answer_key/);
  await expect(page.getByTestId('quiz-total-points')).toHaveText('Total: 4 points · Pass at 70%');
  await expect(page.getByTestId('question-points')).toHaveText(['· 3 points', '· 1 point']);
  await shot(page, 'student-quiz-taking');
  await page.getByText('Slow down', { exact: true }).click();
  await page.getByText('Camera', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Not passed yet' })).toBeVisible();
  await expect(page.getByText(/Score: 25% · Required: 70%/)).toBeVisible();
  await expect(page.getByTestId('quiz-earned-points')).toHaveText('1 of 4 points earned');
  await shot(page, 'student-quiz-not-passed');
  await page.goto(`/my-learning/${delivery.id}`);
  await page.getByRole('button', { name: 'Start a new attempt' }).click();
  await page.getByText('Emergency stop', { exact: true }).click();
  await page.getByText('Camera', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  await expect(page.getByTestId('quiz-earned-points')).toHaveText('4 of 4 points earned');
  await shot(page, 'student-quiz-passed');
  const scores = ((await api(page, studentToken, 'GET', '/me/attempts')).body as Array<{ classroom_assignment_id?: string; score: number | null }>).filter((a) => a.classroom_assignment_id === delivery.id).map((a) => Number(a.score)).sort((x, y) => x - y);
  expect(scores).toEqual([25, 100]);

  // progression consistency: passing the quiz completed the lesson (no other required activity), and the student's course
  // page shows exactly what the API reports; a failed attempt earlier left it incomplete
  const path = (await api(page, studentToken, 'GET', `/me/courses/${courseId}/path`)).body as { progressPercent: number; lessons: Array<{ status: string }> };
  expect(path.progressPercent).toBe(100); expect(path.lessons.map((l) => l.status)).toEqual(['completed']);
  await page.goto(`/courses/${courseId}`);
  const panel = page.getByLabel('Course progress');
  await expect(panel.getByText('100%', { exact: true })).toBeVisible();
  await expect(panel.getByText('1 module completed')).toBeVisible();
  // the instructor's monitoring view agrees with the student's
  const teacherToken = await signIn(page, fixture.users.instructor.authUserId);
  const monitored = (await api(page, teacherToken, 'GET', `/classrooms/${classroomId}/learner-progress`)).body as Array<{ fullName: string; progressPercent: number; lessonsCompleted: number; attemptsSubmitted: number; bestScore: number }>;
  expect(monitored.find((m) => m.fullName === 'Phase 2.4.3 Test Student')).toMatchObject({ progressPercent: 100, lessonsCompleted: 1, attemptsSubmitted: 2, bestScore: 100 });
  await page.goto(`/teacher/classes/${classroomId}`);
  await expect(page.getByLabel('Learner progress').getByRole('row', { name: /Phase 2\.4\.3 Test Student.*100%.*1 \/ 1.*2.*100%/ })).toBeVisible();
  // instructor reviews the weighted quiz attempts and drills into the student's lessons (browser UI)
  const quizResults = page.getByLabel('Quiz results');
  await expect(quizResults.getByRole('row', { name: /Phase 2\.4\.3 Test Student.*Imported quiz.*#1.*1 \/ 4.*25% \(pass 70%\).*Not passed/ })).toBeVisible();
  await expect(quizResults.getByRole('row', { name: /Phase 2\.4\.3 Test Student.*Imported quiz.*#2.*4 \/ 4.*100%.*Passed/ })).toBeVisible();
  await page.getByRole('button', { name: 'Show lessons for Phase 2.4.3 Test Student' }).click();
  await expect(page.getByLabel('Lessons of Phase 2.4.3 Test Student').getByText(/1\. Safe robot motion/)).toBeVisible();
  await expect(page.getByLabel('Lessons of Phase 2.4.3 Test Student').getByText('Completed')).toBeVisible();
  await expect(page.getByLabel('Lessons of Phase 2.4.3 Test Student').getByText('Best 100%')).toBeVisible();
  expect([403, 404]).toContain((await api(page, studentToken, 'GET', `/classrooms/${classroomId}/quiz-results`)).status);
  // students cannot read instructor monitoring, and another school's admin cannot either
  expect([403, 404]).toContain((await api(page, studentToken, 'GET', `/classrooms/${classroomId}/learner-progress`)).status);
  expect([403, 404]).toContain((await api(page, (await session(page, fixture.users.otherSchoolAdmin.authUserId)).access_token, 'GET', `/classrooms/${classroomId}/learner-progress`)).status);

  // authorization: another school cannot import into this school's lesson
  const otherToken = (await session(page, fixture.users.otherSchoolAdmin.authUserId)).access_token;
  const foreign = await page.request.post(`${apiBase}/author/question-bank/quiz-authoring/lessons/${lessonId}/import/preview`, { headers: { Authorization: `Bearer ${otherToken}` }, multipart: { file: { name: 'q.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) } } });
  expect(foreign.status()).toBe(404);
  expect(errors).toEqual([]);
});
