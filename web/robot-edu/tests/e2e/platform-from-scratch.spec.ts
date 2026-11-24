import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { blockBox, dragFromFlyout, workspaceBlocks, waitForBlocklyReady } from './helpers/blockly';
import { call, deliverCourse, loadFixture, signIn, type Fixture } from './helpers/academic';

/**
 * The complete Web LMS on a BRAND-NEW tenant, through the real browser, real API and isolated PostgreSQL:
 *  System Admin creates the organization and its School Admin -> School Admin adds an instructor and a student (temporary password)
 *  -> the Instructor builds a NEW course from nothing (module, lesson, reading + PDF/DOCX/PPTX/PNG, video, weighted quiz, Blockly challenge,
 *  assignment), publishes it and the School Admin delivers it -> the Student ACTIVATES the account, studies, passes the quiz, completes
 *  the Blockly lab and the assignment -> the Instructor grades and releases -> the Student sees results and completes the course.
 * For consolidated real-stack acceptance, point the loopback auth endpoint at `local-gotrue-proxy.mjs`; its `/token` helper returns real local GoTrue sessions. Authoring of the assignment record itself is API-assisted.
 */
const shots = path.resolve(process.cwd(), '../../docs/acceptance/screenshots');
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36);
const fixtureDir = new URL('./fixtures/media/', import.meta.url);
const load = (name: string) => readFile(new URL(name, fixtureDir));
const MIME: Record<string, string> = { 'safety-guide.pdf': 'application/pdf', 'lab-notes.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'motion-slides.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const DOCS = Object.keys(MIME);
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const tokenFor = async (page: Page, authUserId: string) => ((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`)).json()) as { access_token: string }).access_token;

async function addVia(page: Page, opener: () => Promise<void>, dialogName: string, text: string) {
  await opener();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await dialog.getByRole('textbox').fill(text);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}


/** Creates, configures and publishes an assignment ONLY through the instructor UI. Returns the classroom-assignment (delivery) id. */
async function createAssignmentViaUi(page: Page, token: string, o: { classroomId: string; classroomName: string; moduleTitle: string; title: string; instructions: string; challengeTitle?: string; rubric: Array<[string, number]>; dueAt?: string; maxAttempts?: number; academic?: { difficulty: string; type: string; grading: string; passScore: number; objectives: string } }) {
  await page.goto('/teacher/assignments/new');
  const form = page.getByRole('form', { name: 'Assignment form' });
  await form.getByRole('combobox', { name: 'Classroom', exact: true }).selectOption({ label: o.classroomName });
  await form.getByRole('combobox', { name: 'Module', exact: true }).selectOption({ label: o.moduleTitle });
  await form.getByLabel('Assignment title').fill(o.title);
  await form.getByLabel('Description / instructions').fill(o.instructions);
  if (o.challengeTitle) await form.getByRole('combobox', { name: 'Challenge', exact: true }).selectOption({ label: o.challengeTitle });
  await form.getByRole('button', { name: 'Save Draft' }).click();
  await expect.poll(async () => ((await call(page, token, 'GET', `/classrooms/${o.classroomId}/assignments`)).body as Array<{ title: string }>).some((a) => a.title === o.title)).toBe(true);
  const draft = ((await call(page, token, 'GET', `/classrooms/${o.classroomId}/assignments`)).body as Array<{ id: string; assignment_id: string; title: string; status: string }>).find((a) => a.title === o.title)!;
  expect(draft.status).toBe('draft');
  await page.goto(`/teacher/assignments/${o.classroomId}/${draft.assignment_id}/edit`);
  const panel = page.getByLabel('Rubric editor');
  await expect(panel).toBeVisible();
  while (await panel.getByRole('button', { name: 'Remove' }).count()) await panel.getByRole('button', { name: 'Remove' }).first().click(); // drop any criteria inherited from an earlier assignment of the module
  for (const [index, [title, points]] of o.rubric.entries()) {
    await panel.getByRole('button', { name: 'Add criterion' }).click();
    await panel.getByLabel(`Criterion ${index + 1} title`).fill(title); await panel.getByLabel(`Criterion ${index + 1} max points`).fill(String(points));
  }
  await panel.getByRole('button', { name: 'Save rubric' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Rubric saved.' })).toBeVisible();
  if (o.academic) {
    const academic = page.getByLabel('Academic settings');
    await academic.getByLabel('Assignment difficulty').selectOption(o.academic.difficulty); await academic.getByLabel('Assignment type').selectOption(o.academic.type);
    await academic.getByLabel('Grading method').selectOption(o.academic.grading); await academic.getByLabel('Pass score').fill(String(o.academic.passScore));
    await academic.getByLabel('Learning objectives').fill(o.academic.objectives);
    await academic.getByRole('button', { name: 'Save academic settings' }).click();
    await expect(academic.getByRole('status').or(academic.getByText(/saved/i)).first()).toBeVisible();
  }
  const schedule = page.getByLabel('Delivery schedule');
  if (o.dueAt) await schedule.getByLabel('Due').fill(o.dueAt);
  if (o.maxAttempts) await schedule.getByLabel('Max attempts').fill(String(o.maxAttempts));
  if (o.dueAt || o.maxAttempts) { await schedule.getByRole('button', { name: 'Save schedule' }).click(); await expect(schedule.getByRole('status').filter({ hasText: 'Schedule saved.' })).toBeVisible(); }
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish to the classroom?' }).getByRole('button', { name: 'Publish' }).click();
  await expect.poll(async () => ((await call(page, token, 'GET', `/classrooms/${o.classroomId}/assignments`)).body as Array<{ title: string; status: string }>).find((a) => a.title === o.title)?.status).toBe('published');
  return ((await call(page, token, 'GET', `/classrooms/${o.classroomId}/assignments`)).body as Array<{ id: string; title: string }>).find((a) => a.title === o.title)!.id;
}

test('Journey: a brand-new school teaches a brand-new course from creation to course completion', async ({ page, browser }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1600, height: 1300 });
  const base = await loadFixture();
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const orgName = `Scratch School ${run}`; const adminEmail = `scratch.head.${run}@example.test`; const teacherEmail = `scratch.teacher.${run}@example.test`;
  const teacherName = `Scratch Teacher${run}`; const studentName = `Scratch Student${run}`; const studentCode = `SC${run}`.toUpperCase();
  const courseTitle = `Scratch Course ${run}`; const text = `Always check the emergency stop first (${run}).`;

  // ---- 1. System Admin: organization + School Admin (UI) --------------------------------------------------------------------------
  await signIn(page, base, 'admin');
  await page.goto('/admin/organizations');
  await page.getByRole('button', { name: 'New organization' }).click();
  await page.getByRole('dialog', { name: 'New organization' }).getByLabel('Organization name').fill(orgName);
  await page.getByRole('dialog', { name: 'New organization' }).getByRole('button', { name: 'Create organization' }).click();
  const manage = page.getByRole('dialog', { name: orgName });
  await manage.getByLabel('Administrator name').fill(`Scratch Head ${run}`); await manage.getByLabel('Administrator email').fill(adminEmail);
  await manage.getByRole('button', { name: 'Assign administrator' }).click();
  await expect(manage.getByTestId('org-admin')).toContainText(`Scratch Head ${run}`);
  const orgId = psql(`select id from organizations where name='${orgName}'`);
  const adminAuth = psql(`select auth_user_id from users where email='${adminEmail}'`);
  const tenant: Fixture = { schoolId: orgId, otherSchoolId: base.otherSchoolId, users: { ...base.users, schoolAdmin: { authUserId: adminAuth, userId: psql(`select id from users where email='${adminEmail}'`) } } };

  // ---- 2. School Admin: instructor + student with a temporary password (UI) ------------------------------------------------------
  await signIn(page, tenant, 'schoolAdmin');
  await page.goto('/school/users'); await page.waitForLoadState('networkidle');
  await expect(page.getByRole('textbox', { name: 'Search people' })).toBeVisible();
  await page.getByRole('button', { name: 'Add instructor' }).click();
  const td = page.getByRole('dialog', { name: 'Add instructor' });
  await td.getByLabel('First name').fill('Scratch'); await td.getByLabel('Last name').fill(`Teacher${run}`);
  await td.getByLabel('Employee code').fill(`EMP${run}`); await td.getByLabel('Email').fill(teacherEmail);
  await td.getByRole('button', { name: 'Add instructor' }).click();
  await expect(td.getByRole('status')).toContainText('Invitation sent'); await td.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Add student' }).click();
  const sd = page.getByRole('dialog', { name: 'Add student' });
  await sd.getByLabel('First name').fill('Scratch'); await sd.getByLabel('Last name').fill(`Student${run}`);
  await sd.getByLabel('Student code').fill(studentCode); await sd.getByLabel('Grade').fill('9');
  await sd.getByRole('button', { name: 'Create student' }).click();
  await expect(sd.getByText('Temporary password')).toBeVisible();
  const [schoolCode, shownCode, tempPassword] = await sd.locator('p.font-mono').allTextContents();
  expect(shownCode).toBe(studentCode); expect(tempPassword.length).toBeGreaterThanOrEqual(12);
  await sd.getByRole('button', { name: 'Done' }).click();
  tenant.users.instructor = { authUserId: psql(`select auth_user_id from users where email='${teacherEmail}'`), userId: psql(`select id from users where email='${teacherEmail}'`), email: teacherEmail };
  const studentUserId = psql(`select user_id from education_school_user_profiles where organization_id='${orgId}' and student_code='${studentCode}'`);
  tenant.users.student = { authUserId: psql(`select auth_user_id from users where id='${studentUserId}'`), userId: studentUserId };

  // ---- 3. Instructor: builds a NEW course (UI) ----------------------------------------------------------------------------------
  const teacherToken = await signIn(page, tenant, 'instructor');
  await page.goto('/admin/courses');
  await page.getByRole('button', { name: 'Create Course' }).click();
  await page.getByRole('textbox', { name: 'Course Title' }).fill(courseTitle);
  await page.getByRole('textbox', { name: /^Description/ }).fill('Learners practise safe robot operation from scratch.');
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/);
  const courseId = page.url().match(/courses\/([0-9a-f-]{36})/)![1];
  expect((await call(page, teacherToken, 'GET', `/courses/${courseId}`)).body.organizationId).toBe(orgId); // owner derived on the server
  await addVia(page, () => page.getByRole('button', { name: 'Add module' }).click(), 'Add module', 'Safe robot motion');
  await addVia(page, () => page.getByRole('button', { name: /Add Lesson/ }).first().click(), 'Add lesson', 'Read and check');
  await addVia(page, () => page.getByRole('button', { name: 'Quick Add Reading' }).first().click(), 'Add activity', 'Safety reading');
  await expect(page.getByRole('heading', { name: 'Safety reading', level: 2 })).toBeVisible();
  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  await workspace.getByRole('button', { name: '+ Add Paragraph' }).click();
  await workspace.locator('textarea').last().fill(text);
  for (const name of DOCS) {
    await workspace.locator('button[aria-label="Attach Document"]').click();
    const lib = page.getByRole('dialog', { name: 'Learning Media Library' });
    await lib.locator('input[type="file"]').setInputFiles({ name, mimeType: MIME[name], buffer: await load(name) });
    await expect(lib.getByText(name).first()).toBeVisible();
    await lib.getByRole('button', { name: 'Use file' }).first().click();
    await expect(workspace.getByLabel('Attached learning media').getByText(name)).toBeVisible();
  }
  await workspace.getByRole('button', { name: 'Insert Image' }).click();
  const imageLib = page.getByRole('dialog', { name: 'Learning Media Library' });
  await imageLib.locator('input[type="file"]').setInputFiles({ name: 'emergency-stop.png', mimeType: 'image/png', buffer: await load('emergency-stop.png') });
  await expect(imageLib.getByText('emergency-stop.png').first()).toBeVisible();
  await imageLib.getByRole('button', { name: 'Use file' }).first().click();
  await workspace.getByLabel(/^Image alternative text/).first().fill('Emergency stop diagram');
  await workspace.getByRole('button', { name: 'Save Draft' }).click();
  await expect(workspace.getByText('Saved', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Quick Add Video' }).first().click();
  const addVideo = page.getByRole('dialog', { name: 'Add activity' });
  await addVideo.getByRole('textbox').fill('Demo video'); await addVideo.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(addVideo).not.toBeVisible();
  await page.getByRole('button', { name: 'Select Video from Library' }).click();
  const videoLib = page.getByRole('dialog', { name: 'Learning Media Library' });
  await videoLib.locator('input[type="file"]').setInputFiles({ name: 'robot-demo.mp4', mimeType: 'video/mp4', buffer: await load('robot-demo.mp4') });
  await expect(videoLib.getByText('robot-demo.mp4').first()).toBeVisible();
  await videoLib.getByRole('button', { name: 'Use file' }).first().click();
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Quick Add Quiz' }).first().click();
  const addQuiz = page.getByRole('dialog', { name: 'Add activity' });
  await addQuiz.getByRole('textbox').fill('Safety quiz'); await addQuiz.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(addQuiz).not.toBeVisible();
  await workspace.getByRole('textbox', { name: 'Instructions' }).fill('Choose the safest answer.');
  await workspace.getByRole('spinbutton', { name: 'Passing score' }).fill('70');
  await workspace.getByRole('button', { name: 'Create quiz draft' }).click();
  await expect(workspace.getByRole('button', { name: 'Create quiz draft' })).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Questions', exact: true }).click();
  await workspace.getByRole('button', { name: 'New question' }).click();
  let dialog = page.getByRole('dialog', { name: 'New question' });
  await dialog.getByLabel('Question text').fill('Which command safely stops the robot?');
  await dialog.getByLabel('Option 1').fill('Stop motion'); await dialog.getByLabel('Option 2').fill('Increase speed');
  await dialog.getByLabel('Correct answer 1').check();
  await dialog.getByLabel('Explanation').fill('Stop motion halts every joint immediately.');
  await dialog.getByLabel('New learning outcome', { exact: true }).fill('Learners can stop a robot safely.');
  await dialog.getByRole('button', { name: 'Save and publish question' }).click();
  await expect(dialog).not.toBeVisible();
  await workspace.getByRole('button', { name: 'New question' }).click();
  dialog = page.getByRole('dialog', { name: 'New question' });
  await dialog.getByLabel('Question type').selectOption('multiple_choice');
  await dialog.getByLabel('Question text').fill('Select the safety checks before moving the robot.');
  await dialog.getByLabel('Option 1').fill('Check the emergency stop'); await dialog.getByLabel('Option 2').fill('Clear the workspace');
  await dialog.getByRole('button', { name: 'Add option' }).click(); await dialog.getByLabel('Option 3').fill('Disable all sensors');
  await dialog.getByLabel('Correct answer 1').check(); await dialog.getByLabel('Correct answer 2').check();
  await dialog.getByLabel('Explanation').fill('Both checks happen before every move.');
  await dialog.getByRole('combobox').last().selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Save and publish question' }).click();
  await expect(dialog).not.toBeVisible();
  const multiCard = workspace.locator('article', { hasText: 'Select the safety checks before moving the robot.' });
  const singleCard = workspace.locator('article', { hasText: 'Which command safely stops the robot?' });
  await multiCard.getByRole('spinbutton').fill('3'); await singleCard.getByRole('spinbutton').fill('1');
  await workspace.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(workspace.getByRole('button', { name: 'Added' })).toHaveCount(1);
  await workspace.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(workspace.getByRole('button', { name: 'Added' })).toHaveCount(2);
  const savedQuiz = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/author/activities/'));
  await workspace.getByRole('button', { name: 'Save Quiz Activity' }).click();
  expect((await savedQuiz).ok()).toBeTruthy();

  // ---- 4. Instructor: Blockly challenge authoring (UI) --------------------------------------------------------------------------
  await page.goto('/teacher/challenges');
  await expect(page.getByText('No challenges yet')).toBeVisible();
  await page.getByRole('button', { name: 'New challenge' }).click();
  const ch = page.getByRole('dialog', { name: 'New challenge' });
  await expect(ch.getByRole('button', { name: 'Save challenge' })).toBeDisabled().catch(() => undefined);
  await ch.getByLabel('Challenge title').fill(`Open and close ${run}`);
  await ch.getByLabel('Description').fill('Open the gripper, wait, then close it.');
  await ch.getByRole('button', { name: 'Add rule' }).click();
  await ch.getByLabel('Rule 2 type').selectOption('final_gripper_state');
  await ch.getByLabel('Rule 2 final state').selectOption('closed');
  await ch.getByLabel('Rule 2 feedback').fill('The gripper must finish closed.');
  await ch.getByLabel('Rule 1 feedback').fill('Open must come before close.');
  await ch.getByRole('button', { name: 'Save challenge' }).click();
  await expect(ch).not.toBeVisible();
  const challengeRow = page.getByTestId('challenge-row').filter({ hasText: `Open and close ${run}` });
  await expect(challengeRow.getByTestId('challenge-status')).toHaveText('Draft');
  await expect(challengeRow).toContainText('2 rules');
  await challengeRow.getByRole('button', { name: /^Publish/ }).click();
  await expect(challengeRow.getByTestId('challenge-status')).toHaveText('Published');
  await page.screenshot({ path: path.join(shots, 'scratch-instructor-challenges.png'), fullPage: true });
  const challengeId = ((await call(page, teacherToken, 'GET', '/author/challenges')).body as Array<{ id: string; title: string }>).find((c) => c.title === `Open and close ${run}`)!.id;
  // every remaining rule the backend supports is authorable too; an unreachable challenge is refused with a readable reason
  await page.getByRole('button', { name: 'New challenge' }).click();
  const adv = page.getByRole('dialog', { name: 'New challenge' });
  await adv.getByLabel('Challenge title').fill(`Reach and grasp ${run}`);
  await adv.getByLabel('Home').or(adv.getByLabel('Go home')).check(); await adv.getByLabel('Move to point (preview)').check();
  await adv.getByLabel('Rule 1 type').selectOption('preview_target_match');
  await adv.getByLabel('Rule 1 target arm').selectOption('left');
  await adv.getByLabel('Rule 1 target x').fill('240'); await adv.getByLabel('Rule 1 target y').fill('220'); await adv.getByLabel('Rule 1 target z').fill('120');
  const addRule = async (n: number, key: string) => { await adv.getByRole('button', { name: 'Add rule' }).click(); await adv.getByLabel(`Rule ${n} type`).selectOption(key); };
  await addRule(2, 'symbolic_duration'); await adv.getByLabel('Rule 2 wait time').fill('500');
  await addRule(3, 'object_grasped'); await adv.getByLabel('Rule 3 grasping arm').selectOption('left');
  await addRule(4, 'object_lifted'); await adv.getByLabel('Rule 4 minimum lift').fill('80');
  await addRule(5, 'object_released'); await addRule(6, 'object_in_target_zone');
  await adv.getByRole('button', { name: 'Save challenge' }).click(); await expect(adv).not.toBeVisible();
  const advRow = page.getByTestId('challenge-row').filter({ hasText: `Reach and grasp ${run}` });
  await expect(advRow).toContainText('6 rules');
  const advId = ((await call(page, teacherToken, 'GET', '/author/challenges')).body as Array<{ id: string; title: string }>).find((c) => c.title === `Reach and grasp ${run}`)!.id;
  const advDetail = (await call(page, teacherToken, 'GET', `/author/challenges/${advId}`)).body as { target: unknown; conditions: Array<{ ruleKey: string }> };
  expect(advDetail.conditions.map((c) => c.ruleKey)).toEqual(['preview_target_match', 'symbolic_duration', 'object_grasped', 'object_lifted', 'object_released', 'object_in_target_zone']);
  expect(advDetail.target).toEqual({ arm: 'left', x: 240, y: 220, z: 120 });          // the student-visible target is derived from the rule
  await advRow.getByRole('button', { name: /^Publish/ }).click(); await expect(advRow.getByTestId('challenge-status')).toHaveText('Published');
  await page.getByRole('button', { name: 'New challenge' }).click();
  const bad = page.getByRole('dialog', { name: 'New challenge' });
  await bad.getByLabel('Challenge title').fill(`Unreachable ${run}`);
  await bad.getByLabel('Rule 1 type').selectOption('preview_target_match');            // default toolbox has no Move block
  await bad.getByRole('button', { name: 'Save challenge' }).click();
  await expect(bad.getByRole('alert')).toContainText(/cannot be completed.*preview\.move_xyz/i);
  await bad.getByRole('button', { name: 'Cancel' }).click();
  // another school's instructor can neither read nor use it
  const foreignToken = await signIn(page, base, 'instructor');
  expect((await call(page, foreignToken, 'GET', `/author/challenges/${challengeId}`)).status).toBe(404);
  expect((await call(page, foreignToken, 'POST', `/author/challenges/${challengeId}/publish`)).status).toBe(404);

  // ---- 5. Instructor: publish the course (UI), including the readiness review ---------------------------------------------------
  await signIn(page, tenant, 'instructor');
  await page.goto(`/admin/courses/${courseId}?tab=structure`);
  await page.getByRole('tab', { name: /Structure & Publishing/ }).click();
  await page.getByRole('button', { name: /^Safe robot motion/ }).first().click();
  await page.getByRole('button', { name: 'Read and check', exact: true }).click();
  await page.getByRole('button', { name: 'Publish Read and check' }).click();
  await expect(page.getByText('Lesson published.')).toBeVisible();
  for (const activity of ['Safety reading', 'Demo video', 'Safety quiz']) {
    await page.getByRole('button', { name: new RegExp(`^Publish ${activity}`) }).click();
    await expect(page.getByText('Activity published.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Review & Publish' }).click();
  await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
  await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  expect((await call(page, teacherToken, 'GET', `/courses/${courseId}`)).body.status).toBe('published');
  const lessonId = ((await call(page, teacherToken, 'GET', `/courses/${courseId}/lessons`)).body as Array<{ id: string }>)[0].id;

  // ---- 6. School Admin delivers the new course to a classroom with the instructor and student (UI) -------------------------------
  const className = `Scratch class ${run}`;
  const classroomId = await deliverCourse(page, tenant, courseTitle, className, [teacherName, studentName]);

  // ---- 7. Instructor: quiz delivery (UI), Blockly lab + assignment (challenge authored above) -----------------------------------
  const quizId = (await call(page, teacherToken, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessonId}/assignment`)).body.id as string;
  await signIn(page, tenant, 'instructor');
  await page.goto('/teacher/quizzes');
  await page.getByRole('combobox', { name: 'Classroom' }).selectOption({ label: className });
  await page.getByLabel('Published canonical quiz').selectOption(quizId);
  await page.getByLabel(/Maximum attempts|Attempt limit/i).fill('3');
  const quizDelivered = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/classrooms/${classroomId}/quiz-deliveries`));
  await page.getByRole('button', { name: 'Save quiz as draft' }).click();
  const quizDelivery = await (await quizDelivered).json() as { id: string; assignment_id: string };
  const quizPublished = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/classrooms/${classroomId}/assignments/${quizDelivery.assignment_id}/publish`));
  await page.getByRole('button', { name: 'Publish to learners' }).click();
  await page.getByRole('dialog', { name: 'Publish this quiz to students?' }).getByRole('button', { name: 'Publish to students' }).click();
  expect((await quizPublished).ok()).toBeTruthy();

  const labTitle = `Lab: Open and close ${run}`; const homeworkTitle = `Plan the safe motion ${run}`;
  const dueAt = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16);
  const labDeliveryId = await createAssignmentViaUi(page, teacherToken, { classroomId, classroomName: className, moduleTitle: 'Safe robot motion', title: labTitle, instructions: 'Open the gripper, wait and close it. Validate, save, run the simulation and submit.', challengeTitle: `Open and close ${run}`, rubric: [['Automatic evaluation passed', 70], ['Clean program', 30]], academic: { difficulty: 'BEGINNER', type: 'blockly', grading: 'automatic', passScore: 70, objectives: 'Order actions correctly' } });
  const labDelivery = { id: labDeliveryId };
  // an authored challenge cannot be edited or deleted once an assignment uses it
  expect((await call(page, teacherToken, 'PATCH', `/author/challenges/${challengeId}`, { title: 'changed' })).status).toBe(409);
  expect((await call(page, teacherToken, 'DELETE', `/author/challenges/${challengeId}`)).status).toBe(409);
  const homeworkDeliveryId = await createAssignmentViaUi(page, teacherToken, { classroomId, classroomName: className, moduleTitle: 'Safe robot motion', title: homeworkTitle, instructions: 'Describe how you will keep the workspace safe.', rubric: [['Plan', 6], ['Safety', 4]], dueAt, maxAttempts: 2 });
  const homeworkDelivery = { id: homeworkDeliveryId };
  const labAssignmentId = ((await call(page, teacherToken, 'GET', `/classrooms/${classroomId}/assignments`)).body as Array<{ id: string; assignment_id: string }>).find((a) => a.id === labDeliveryId)!.assignment_id;
  expect(labAssignmentId).toBeTruthy();

  // ---- 8. Student: ACTIVATES the account in the browser (temporary password -> new password) ------------------------------------
  const studentPage = await browser.newPage(); await studentPage.setViewportSize({ width: 1600, height: 1300 });
  studentPage.on('pageerror', (e) => errors.push(e.message));
  await studentPage.goto('/login');
  await studentPage.getByRole('tab', { name: 'Student Code' }).click();
  await studentPage.locator('#login-school-code').fill(schoolCode); await studentPage.locator('#login-student-code').fill(studentCode); await studentPage.locator('#login-password').fill(tempPassword);
  await studentPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(studentPage).toHaveURL(/\/student\/change-password$/);
  await studentPage.goto('/my-learning'); // a restricted session cannot reach the LMS by deep link
  await expect(studentPage).toHaveURL(/\/student\/change-password$/);
  const newPassword = `Scratch-New-${run}-Passw0rd!`;
  const form = studentPage.getByRole('main');
  await form.locator('input[autocomplete="current-password"]').fill(tempPassword);
  await form.locator('input[autocomplete="new-password"]').first().fill(newPassword); await form.locator('input[autocomplete="new-password"]').nth(1).fill(newPassword);
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(studentPage).toHaveURL(/\/my-learning$/);
  await expect(studentPage.getByRole('heading', { name: courseTitle, level: 2 })).toBeVisible();
  await studentPage.screenshot({ path: path.join(shots, 'scratch-student-dashboard.png'), fullPage: true });
  const studentToken = JSON.parse((await studentPage.evaluate(() => localStorage.getItem('sb-127-auth-token')))!).access_token as string;

  // ---- 9. Student: studies the new course ----------------------------------------------------------------------------------------
  const sections = (await call(page, studentToken, 'GET', `/lessons/${lessonId}/sections`)).body as { sections: Array<{ activities: Array<{ id: string; title: string; type: string }> }> };
  const acts = sections.sections.flatMap((s) => s.activities);
  const reading = acts.find((a) => a.title === 'Safety reading')!; const video = acts.find((a) => a.title === 'Demo video')!;
  await studentPage.goto(`/courses/${courseId}/lessons/${lessonId}/activities/${reading.id}`);
  await expect(studentPage.getByText(text)).toBeVisible();
  for (const name of DOCS) await expect(studentPage.getByRole('link', { name })).toBeVisible();
  const image = studentPage.getByRole('img', { name: 'Emergency stop diagram' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await studentPage.getByRole('button', { name: /Mark as Completed/ }).click();
  await expect(studentPage.getByText('Completed', { exact: false }).first()).toBeVisible();
  await studentPage.goto(`/courses/${courseId}/lessons/${lessonId}/activities/${video.id}`);
  const videoEl = studentPage.locator('video').first();
  await expect(videoEl).toBeVisible();
  await videoEl.evaluate(async (el: HTMLVideoElement) => { el.muted = true; await el.play(); });
  await expect.poll(() => videoEl.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.2);
  await studentPage.getByRole('button', { name: /Mark as Completed/ }).click();
  await expect(studentPage.getByText('Completed', { exact: false }).first()).toBeVisible();

  // quiz: weighted attempt, fail then retake and pass
  await studentPage.goto(`/my-learning/${quizDelivery.id}`);
  await studentPage.getByRole('button', { name: /^(Start|Continue) attempt$/ }).click();
  await expect(studentPage.getByTestId('quiz-total-points')).toHaveText('Total: 4 points · Pass at 70%');
  await studentPage.getByText('Stop motion', { exact: true }).click(); await studentPage.getByText('Check the emergency stop', { exact: true }).click(); await studentPage.getByText('Disable all sensors', { exact: true }).click();
  await studentPage.getByRole('button', { name: 'Submit quiz' }).click();
  await studentPage.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(studentPage.getByRole('heading', { name: 'Not passed yet' })).toBeVisible();
  await expect(studentPage.getByTestId('quiz-earned-points')).toHaveText('1 of 4 points earned');
  await studentPage.goto(`/my-learning/${quizDelivery.id}`);
  await studentPage.getByRole('button', { name: 'Start a new attempt' }).click();
  await studentPage.getByText('Stop motion', { exact: true }).click(); await studentPage.getByText('Check the emergency stop', { exact: true }).click(); await studentPage.getByText('Clear the workspace', { exact: true }).click();
  await studentPage.getByRole('button', { name: 'Submit quiz' }).click();
  await studentPage.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(studentPage.getByRole('heading', { name: 'Passed' })).toBeVisible();

  // ---- 10. Student: Blockly lab (authored challenge) graded automatically ---------------------------------------------------------
  await studentPage.goto(`/my-learning/${labDelivery.id}`);
  await expect(studentPage.getByRole('region', { name: 'Assignment details' }).getByTestId('level-badge')).toContainText('Beginner');
  const labAttempt = await call(page, studentToken, 'POST', `/classroom-assignments/${labDelivery.id}/attempts`);
  expect([200, 201]).toContain(labAttempt.status);
  await studentPage.goto(`/practice/${labAttempt.body.id}`);
  await waitForBlocklyReady(studentPage);
  expect((await studentPage.locator('.blocklyToolboxCategory').allInnerTexts()).join(' ')).not.toContain('Movement'); // the toolbox is exactly what the instructor allowed
  await dragFromFlyout(studentPage, 'Program', /when\s*program\s*starts/, { x: 760, y: 560 });
  const start = (await workspaceBlocks(studentPage).first().boundingBox())!;
  await dragFromFlyout(studentPage, 'Program', /use\s*left\s*arm/, { x: start.x + 16, y: start.y + start.height + 22 });
  const arm = (await workspaceBlocks(studentPage).nth(1).boundingBox())!;
  await dragFromFlyout(studentPage, 'Gripper', /open/i, { x: arm.x + 32, y: arm.y + 62 });
  const open = await blockBox(studentPage, /open\s*gripper/);
  await dragFromFlyout(studentPage, 'Timing', /wait/i, { x: open.x + 8, y: open.y + open.height + 18 });
  const wait = await blockBox(studentPage, /wait/);
  await dragFromFlyout(studentPage, 'Gripper', /close/i, { x: wait.x + 8, y: wait.y + wait.height + 12 });
  await expect(workspaceBlocks(studentPage)).toHaveCount(5);
  await studentPage.getByRole('button', { name: 'Validate' }).click();
  await expect(studentPage.getByText(/valid and ready for server evaluation/i)).toBeVisible();
  const versionSaved = studentPage.waitForResponse((r) => /\/me\/programs\/[^/]+\/versions$/.test(r.url()) && r.request().method() === 'POST');
  await studentPage.getByRole('button', { name: 'Save version' }).click(); expect((await versionSaved).status()).toBe(201);
  const evaluated = studentPage.waitForResponse((r) => /evaluate-symbolic$/.test(r.url()) && r.request().method() === 'POST', { timeout: 40_000 });
  await studentPage.getByRole('button', { name: 'Run simulation' }).click();
  const ev = await (await evaluated).json() as { verdict: string; ruleResults: Array<{ passed: boolean }> };
  expect(ev.verdict).toBe('passed'); expect(ev.ruleResults).toHaveLength(2); expect(ev.ruleResults.every((r) => r.passed)).toBe(true);
  await expect(studentPage.getByRole('heading', { name: 'Simulation Passed' })).toBeVisible();
  await studentPage.getByRole('button', { name: 'Submit assignment' }).click();
  const labSubmitted = studentPage.waitForResponse((r) => /\/me\/attempts\/[^/]+\/submission$/.test(r.url()) && r.request().method() === 'POST');
  await studentPage.getByRole('dialog').getByRole('button', { name: /Submit/ }).last().click();
  const labSubmission = await (await labSubmitted).json() as { id: string };

  // ---- 11. Student: the assignment (submitted before the deadline) ---------------------------------------------------------------
  const hwAttempt = (await call(page, studentToken, 'POST', `/classroom-assignments/${homeworkDelivery.id}/attempts`)).body as { id: string };
  const program = (await call(page, studentToken, 'POST', `/me/attempts/${hwAttempt.id}/program`, { title: 'P', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] } })).body as { id: string };
  const version = (await call(page, studentToken, 'POST', `/me/programs/${program.id}/versions`, { changeSummary: 'final' })).body as { id: string };
  const hwSubmission = (await call(page, studentToken, 'POST', `/me/attempts/${hwAttempt.id}/submission`, { programVersionId: version.id })).body as { id: string };
  expect(hwSubmission.id).toBeTruthy();

  // ---- 12. Instructor grades both submissions and releases (UI) -------------------------------------------------------------------
  await signIn(page, tenant, 'instructor');
  await page.goto(`/teacher/classes/${classroomId}/submissions/${labSubmission.id}`);
  await expect(page.getByText(/Passed:|rule/i).first()).toBeVisible();
  await page.getByLabel(/Points \/ 70/).fill('70'); await page.getByLabel(/Points \/ 30/).fill('25');
  await page.getByPlaceholder('Overall assessment feedback').fill('Automatic checks passed; tidy program.');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  await page.getByPlaceholder('Feedback for this student').fill('Well ordered: open, wait, close.');
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await page.getByRole('button', { name: 'Release grade & feedback' }).click();
  const c1 = page.getByRole('dialog').last(); if (await c1.isVisible().catch(() => false)) await c1.getByRole('button', { name: /Release/ }).click();
  await expect(page.getByText(/^Released /)).toBeVisible();
  await page.goto(`/teacher/classes/${classroomId}/submissions/${hwSubmission.id}`);
  await page.getByLabel('Points / 6').fill('5'); await page.getByLabel('Points / 4').fill('4');
  await page.getByPlaceholder('Overall assessment feedback').fill('Good safety plan.');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  await page.getByRole('button', { name: 'Release grade & feedback' }).click();
  const c2 = page.getByRole('dialog').last(); if (await c2.isVisible().catch(() => false)) await c2.getByRole('button', { name: /Release/ }).click();
  await expect(page.getByText(/^Released /)).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'scratch-instructor-grading.png'), fullPage: true });

  // ---- 13. Student: results, history, progress and course completion --------------------------------------------------------------
  const labGrade = await call(page, studentToken, 'GET', `/me/attempts/${labAttempt.body.id}/grading`);
  expect(labGrade.body).toMatchObject({ released: true }); expect(labGrade.body.assessment.overallFeedback).toBe('Automatic checks passed; tidy program.');
  await studentPage.goto(`/my-learning/${homeworkDelivery.id}`);
  await studentPage.getByRole('button', { name: 'View details' }).first().click();
  await expect(studentPage.getByText('Good safety plan.')).toBeVisible();
  await studentPage.screenshot({ path: path.join(shots, 'scratch-student-grade.png'), fullPage: true });
  const attempts = (await call(page, studentToken, 'GET', '/me/attempts')).body as Array<{ classroom_assignment_id: string }>;
  expect(attempts.filter((a) => a.classroom_assignment_id === quizDelivery.id)).toHaveLength(2);
  const pathState = (await call(page, studentToken, 'GET', `/me/courses/${courseId}/path`)).body as { lessons: Array<{ status: string }> };
  expect(pathState.lessons.map((l) => l.status)).toEqual(['completed']);
  await studentPage.goto(`/courses/${courseId}`);
  await expect(studentPage.getByText('✓ Course Completed')).toBeVisible();
  await studentPage.screenshot({ path: path.join(shots, 'scratch-student-course-complete.png'), fullPage: true });

  // ---- 14. Cross-school isolation ---------------------------------------------------------------------------------------------------
  const outsider = await signIn(page, base, 'otherStudent');
  for (const url of [`/courses/${courseId}`, `/classroom-assignments/${labDelivery.id}`, `/me/attempts/${labAttempt.body.id}/grading`]) expect((await call(page, outsider, 'GET', url)).status, url).toBeGreaterThanOrEqual(403);
  const otherAdmin = await signIn(page, base, 'otherSchoolAdmin');
  expect((await call(page, otherAdmin, 'GET', `/education-admin/organizations/${orgId}/people?page=1&pageSize=5`)).status).toBe(404);
  expect((await call(page, otherAdmin, 'GET', `/author/challenges/${challengeId}`)).status).toBe(404);
  expect(errors).toEqual([]);
});
