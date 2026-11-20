import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto'; void randomUUID;
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SO101_CURRICULUM } from '../../../../services/education-api/src/scripts/so101-curriculum.data';
import { call, deliverCourse, loadFixture, signIn, type Fixture } from './helpers/academic';

/**
 * One continuous journey on a BRAND-NEW tenant, driven through the real browser UI against the real API and PostgreSQL:
 * System Admin creates the organization and assigns its School Admin -> School Admin adds an instructor and a student and
 * delivers a published course to a new classroom -> Instructor delivers the module-end quiz and an assignment -> Student studies,
 * passes the quiz, submits the assignment -> Instructor scores and releases the grade -> Student sees it -> System Admin verifies
 * the organization, suspends/reactivates it and the tenant boundary holds throughout.
 * API-assisted steps (clearly marked) are limited to repetitive setup that other specs already cover through the UI.
 */
const shots = path.resolve(process.cwd(), '../../docs/acceptance/screenshots');
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36);
const COURSE = SO101_CURRICULUM[0]; const MODULE = COURSE.modules[0];
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function tokenFor(page: Page, authUserId: string) { return ((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`)).json()) as { access_token: string }).access_token; }

test('Journey: System Admin -> School Admin -> Instructor -> Student -> grade -> System Admin verification (new tenant)', async ({ page }) => {
  test.setTimeout(480_000);
  const base = await loadFixture();
  const orgName = `Journey School ${run}`; const adminEmail = `journey.head.${run}@example.test`; const teacherEmail = `journey.teacher.${run}@example.test`;
  const teacherName = `Journey Teacher${run}`; const studentName = `Journey Student${run}`; const studentCode = `JS${run}`.toUpperCase();

  // 1. System Admin creates the organization and assigns its School Administrator (UI; identity invited through the provider).
  await signIn(page, base, 'admin');
  await page.goto('/admin/organizations');
  await page.getByRole('button', { name: 'New organization' }).click();
  await page.getByRole('dialog', { name: 'New organization' }).getByLabel('Organization name').fill(orgName);
  await page.getByRole('dialog', { name: 'New organization' }).getByRole('button', { name: 'Create organization' }).click();
  const manage = page.getByRole('dialog', { name: orgName });
  await manage.getByLabel('Administrator name').fill(`Journey Head ${run}`); await manage.getByLabel('Administrator email').fill(adminEmail);
  await manage.getByRole('button', { name: 'Assign administrator' }).click();
  await expect(manage.getByTestId('org-admin')).toContainText(`Journey Head ${run}`);
  const orgId = psql(`select id from organizations where name='${orgName}'`);
  const adminAuth = psql(`select auth_user_id from users where email='${adminEmail}'`);
  expect(adminAuth).toMatch(/^[0-9a-f-]{36}$/);
  const tenant: Fixture = { schoolId: orgId, otherSchoolId: base.otherSchoolId, users: { ...base.users, schoolAdmin: { authUserId: adminAuth, userId: psql(`select id from users where email='${adminEmail}'`) } } };

  // 2. School Admin adds an instructor and a student through the UI.
  await signIn(page, tenant, 'schoolAdmin');
  await page.goto('/school/users');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('textbox', { name: 'Search people' })).toBeVisible();
  await page.getByRole('button', { name: 'Add instructor' }).click();
  const teacherDialog = page.getByRole('dialog', { name: 'Add instructor' });
  await teacherDialog.getByLabel('First name').fill('Journey'); await teacherDialog.getByLabel('Last name').fill(`Teacher${run}`);
  await teacherDialog.getByLabel('Employee code').fill(`EMP${run}`); await teacherDialog.getByLabel('Email').fill(teacherEmail);
  await teacherDialog.getByRole('button', { name: 'Add instructor' }).click();
  await expect(teacherDialog.getByRole('status')).toContainText('Invitation sent');
  await teacherDialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Add student' }).click();
  const studentDialog = page.getByRole('dialog', { name: 'Add student' });
  await studentDialog.getByLabel('First name').fill('Journey'); await studentDialog.getByLabel('Last name').fill(`Student${run}`);
  await studentDialog.getByLabel('Student code').fill(studentCode); await studentDialog.getByLabel('Grade').fill('9');
  await studentDialog.getByRole('button', { name: 'Create student' }).click();
  await expect(studentDialog.getByText('Temporary password')).toBeVisible();
  await studentDialog.getByRole('button', { name: /Done|Close/ }).first().click();
  await page.screenshot({ path: path.join(shots, 'journey-school-admin-people.png'), fullPage: true });
  // This journey drives the student through the API; first-login activation in the browser is covered by platform-from-scratch.spec.ts.
  const studentAuth = psql(`select u.auth_user_id from users u join education_school_user_profiles p on p.user_id=u.id where p.organization_id='${orgId}' and p.student_code='${studentCode}'`);
  psql(`update education_school_user_profiles set password_change_required=false where organization_id='${orgId}' and student_code='${studentCode}'`);
  const teacherAuth = psql(`select auth_user_id from users where email='${teacherEmail}'`);
  tenant.users.instructor = { authUserId: teacherAuth, userId: psql(`select id from users where email='${teacherEmail}'`) };
  tenant.users.student = { authUserId: studentAuth, userId: psql(`select user_id from education_school_user_profiles where organization_id='${orgId}' and student_code='${studentCode}'`) };

  // 3. School Admin creates a classroom delivering the published course and enrolls both people (UI).
  const classroomName = `Journey class ${run}`;
  const classroomId = await deliverCourse(page, tenant, COURSE.title, classroomName, [teacherName, studentName]);
  expect(psql(`select count(*) from learning_classroom_members where classroom_id='${classroomId}' and status='active'`)).toBe('2');

  // 4. Instructor delivers the module-end quiz (UI) and publishes an assignment (API-assisted setup).
  const sysAdmin = await signIn(page, base, 'admin');
  const course = ((await call(page, sysAdmin, 'GET', `/courses?page=1&pageSize=20&q=${encodeURIComponent(COURSE.title)}`)).body.items as Array<{ id: string; title: string }>).find((c) => c.title === COURSE.title)!;
  const lessons = (await call(page, sysAdmin, 'GET', `/courses/${course.id}/lessons`)).body as Array<{ id: string }>;
  const quizId = (await call(page, sysAdmin, 'GET', `/author/question-bank/quiz-authoring/lessons/${lessons[0].id}/assignment`)).body.id as string;
  const teacherToken = await signIn(page, tenant, 'instructor');
  await page.goto('/teacher/classes');
  await expect(page.getByText(classroomName).first()).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'journey-instructor-classes.png'), fullPage: true });
  await page.goto('/teacher/quizzes');
  await page.getByRole('combobox', { name: 'Classroom' }).selectOption({ label: classroomName });
  await page.getByLabel('Published canonical quiz').selectOption(quizId);
  const quizDelivered = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/classrooms/${classroomId}/quiz-deliveries`));
  await page.getByRole('button', { name: 'Save quiz as draft' }).click();
  const quizDelivery = await (await quizDelivered).json() as { id: string; assignment_id: string };
  const quizPublished = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/classrooms/${classroomId}/assignments/${quizDelivery.assignment_id}/publish`));
  await page.getByRole('button', { name: 'Publish to learners' }).click();
  expect((await quizPublished).ok()).toBeTruthy();
  const title = `Journey assignment ${run}`;
  const created = await call(page, teacherToken, 'POST', `/classrooms/${classroomId}/assignments`, { lessonId: lessons[0].id, title, instructions: 'Plan the safe motion.' });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const assignmentId = created.body.assignment_id as string;
  expect((await call(page, teacherToken, 'PUT', `/classrooms/${classroomId}/assignments/${assignmentId}/rubric`, { criteria: [{ title: 'Plan', maxPoints: 6 }, { title: 'Safety', maxPoints: 4 }] })).status).toBe(200);
  const assignmentDelivery = (await call(page, teacherToken, 'POST', `/classrooms/${classroomId}/assignments/${assignmentId}/publish`)).body as { id: string };

  // 5. Student studies and passes the module quiz (UI), then submits the assignment.
  const studentToken = await signIn(page, tenant, 'student');
  const sections = await call(page, studentToken, 'GET', `/lessons/${lessons[0].id}/sections`);
  const activities = ((Array.isArray(sections.body) ? sections.body : sections.body.sections) as Array<{ activities?: Array<{ id: string; type: string }> }>).flatMap((s) => s.activities ?? []);
  for (const reading of activities.filter((a) => a.type === 'reading')) expect([200, 201]).toContain((await call(page, studentToken, 'POST', `/me/activities/${reading.id}/complete`, {})).status);
  await page.goto('/my-learning');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: COURSE.title, level: 2 })).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'journey-student-dashboard.png'), fullPage: true });
  await page.goto(`/my-learning/${quizDelivery.id}`);
  await page.getByRole('button', { name: /^(Start|Continue) attempt$/ }).click();
  for (const q of MODULE.quiz.questions) {
    const group = page.locator('fieldset').filter({ hasText: q.stem }).first();
    for (const option of q.options.filter((o) => q.answer.includes(o.id))) await group.getByText(option.text, { exact: true }).click();
  }
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  const path1 = (await call(page, studentToken, 'GET', `/me/courses/${course.id}/path`)).body as { lessons: Array<{ status: string }> };
  expect(path1.lessons[0].status).toBe('completed');

  const attempt = (await call(page, studentToken, 'POST', `/classroom-assignments/${assignmentDelivery.id}/attempts`)).body as { id: string };
  const program = (await call(page, studentToken, 'POST', `/me/attempts/${attempt.id}/program`, { title: 'P', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] } })).body as { id: string };
  const version = (await call(page, studentToken, 'POST', `/me/programs/${program.id}/versions`, { changeSummary: 'final' })).body as { id: string };
  const submission = (await call(page, studentToken, 'POST', `/me/attempts/${attempt.id}/submission`, { programVersionId: version.id })).body as { id: string };
  expect(submission.id).toBeTruthy();

  // 6. Instructor scores and releases the grade in the UI; the student sees it only after release.
  await signIn(page, tenant, 'instructor');
  await page.goto(`/teacher/classes/${classroomId}/submissions/${submission.id}`);
  await page.getByLabel('Points / 6').fill('5'); await page.getByLabel('Points / 4').fill('4');
  await page.getByPlaceholder('Overall assessment feedback').fill('Good plan, safe execution.');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  expect((await call(page, studentToken, 'GET', `/me/attempts/${attempt.id}/grading`)).body).toEqual({ attemptId: attempt.id, released: false });
  await page.getByRole('button', { name: 'Release grade & feedback' }).click();
  const confirm = page.getByRole('dialog').last(); if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /Release/ }).click();
  await expect(page.getByText(/^Released /)).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'journey-instructor-grading.png'), fullPage: true });
  await signIn(page, tenant, 'student');
  await page.goto(`/my-learning/${assignmentDelivery.id}`);
  await page.getByRole('button', { name: 'View details' }).first().click();
  await expect(page.getByText('Good plan, safe execution.')).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'journey-student-grade.png'), fullPage: true });

  // 7. System Admin verifies the organization, then suspends and reactivates it; boundaries hold for every tenant role.
  const adminToken = await signIn(page, base, 'admin');
  await page.goto('/admin/organizations');
  const row = page.getByRole('row', { name: new RegExp(orgName) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell').nth(3)).toHaveText('1'); await expect(row.getByRole('cell').nth(4)).toHaveText('1'); await expect(row.getByRole('cell').nth(5)).toHaveText('1'); await expect(row.getByRole('cell').nth(6)).toHaveText('1');
  await page.screenshot({ path: path.join(shots, 'journey-system-admin-verification.png'), fullPage: true });
  const schoolAdminToken = await tokenFor(page, adminAuth);
  for (const [label, token] of [['school admin', schoolAdminToken], ['instructor', teacherToken], ['student', studentToken]] as const) {
    expect((await call(page, token, 'GET', `/education-admin/organizations/${base.schoolId}/overview`)).status, `${label} cannot read another school`).toBe(404);
    expect((await call(page, token, 'GET', '/education-admin/organizations/managed')).status, `${label} cannot list organizations`).toBe(404);
  }
  expect((await call(page, schoolAdminToken, 'GET', `/education-admin/organizations/${orgId}/overview`)).status).toBe(200);
  await page.getByRole('button', { name: `Manage ${orgName}` }).click();
  await page.getByRole('dialog', { name: orgName }).getByRole('button', { name: 'Suspend organization' }).click();
  await expect(page.getByRole('dialog', { name: orgName }).getByTestId('org-status')).toHaveText('Suspended');
  expect((await call(page, schoolAdminToken, 'GET', `/education-admin/organizations/${orgId}/overview`)).status).toBe(404);
  expect([403, 404]).toContain((await call(page, studentToken, 'POST', `/classroom-assignments/${assignmentDelivery.id}/attempts`)).status);
  await page.getByRole('dialog', { name: orgName }).getByRole('button', { name: 'Reactivate organization' }).click();
  await expect(page.getByRole('dialog', { name: orgName }).getByTestId('org-status')).toHaveText('Active');
  expect((await call(page, schoolAdminToken, 'GET', `/education-admin/organizations/${orgId}/overview`)).status).toBe(200);
  expect(adminToken).toBeTruthy();
});
