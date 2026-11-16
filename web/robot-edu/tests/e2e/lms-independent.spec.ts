import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface Fixture {
  courseId: string;
  schoolId: string;
  otherSchoolId: string;
  otherClassroomId: string;
  offeringId: string;
  classroomId: string;
  programDeliveryId: string;
  rubricCriterionId: string;
  allocatedRobotId: string;
  replacementRobotId: string;
  expiredRobotId: string;
  maintenanceRobotId: string;
  foreignRobotId: string;
  users: Record<string, { userId: string; authUserId: string }>;
}
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function tokenFor(page: Page, authUserId: string): Promise<string> {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json() as { access_token: string }).access_token;
}

async function signIn(page: Page, authUserId: string): Promise<void> {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`);
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
  await page.reload();
}

test('School Admin creates a classroom and enrolls an existing student', async ({ page }) => {
  await signIn(page, fixture.users.schoolAdmin.authUserId);
  await page.goto('/school/classrooms');
  await expect(page.getByRole('heading', { name: 'Classrooms' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Phase 2.4.3 Test Classroom' })).toBeVisible();
  const name = 'Phase 2.4.3 UI Classroom';
  if (!(await page.getByRole('button', { name }).count())) {
    await page.getByRole('button', { name: 'Create classroom' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create classroom' });
    await dialog.getByLabel('Classroom name').fill(name);
    await dialog.getByLabel('Classroom code').fill('E2E-243-UI-CLASS');
    await dialog.getByLabel('Published course').selectOption({ label: 'VISTA Phase 2.4.3 canonical course' });
    await dialog.getByLabel('School offering code').fill(`E2E-243-UI-OFFERING`);
    await dialog.getByRole('button', { name: 'Create classroom' }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.getByRole('button', { name }).click();
  await page.waitForLoadState('networkidle'); // the roster must be loaded before deciding whether the student still has to be added
  if (!(await page.getByText('Phase 2.4.3 Test Student').count())) {
    await page.getByRole('button', { name: 'Add member' }).click();
    const memberDialog = page.getByRole('dialog', { name: 'Add classroom member' });
    await memberDialog.getByLabel('Search eligible members').fill('Phase 2.4.3 Test Student');
    await memberDialog.getByRole('radio', { name: /Phase 2.4.3 Test Student/ }).check();
    await memberDialog.getByRole('button', { name: 'Add member' }).click();
  }
  await expect(page.getByText('Phase 2.4.3 Test Student')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name }).click();
  await expect(page.getByText('Phase 2.4.3 Test Student')).toBeVisible();
});

test('Cross-school classroom and roster access is denied by the real API', async ({ page }) => {
  const firstToken = await tokenFor(page, fixture.users.schoolAdmin.authUserId);
  const otherToken = await tokenFor(page, fixture.users.otherSchoolAdmin.authUserId);
  const own = await page.request.get(`${apiBase}/education-admin/organizations/${fixture.otherSchoolId}/classrooms`, { headers: { Authorization: `Bearer ${otherToken}` } });
  expect(own.status()).toBe(200);
  const foreign = await page.request.get(`${apiBase}/education-admin/organizations/${fixture.otherSchoolId}/classrooms`, { headers: { Authorization: `Bearer ${firstToken}` } });
  expect([403, 404]).toContain(foreign.status());
  const foreignRoster = await page.request.get(`${apiBase}/education-admin/organizations/${fixture.otherSchoolId}/classrooms/${fixture.otherClassroomId}/members`, { headers: { Authorization: `Bearer ${firstToken}` } });
  expect([403, 404]).toContain(foreignRoster.status());
  const foreignClassroom = await page.request.get(`${apiBase}/classrooms/${fixture.otherClassroomId}`, { headers: { Authorization: `Bearer ${firstToken}` } });
  expect([403, 404]).toContain(foreignClassroom.status());
});

test('WF-01 school admin allocates an entitled available robot and the authorized instructor sees the current allocation', async ({ page }) => {
  const adminToken = await tokenFor(page, fixture.users.schoolAdmin.authUserId);
  const instructorToken = await tokenFor(page, fixture.users.instructor.authUserId);
  const otherAdminToken = await tokenFor(page, fixture.users.otherSchoolAdmin.authUserId);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const eligiblePath = `/education-admin/classrooms/${fixture.classroomId}/eligible-robots`;
  const allocationPath = `/education-admin/classrooms/${fixture.classroomId}/robot-allocation`;

  const listed = await page.request.get(`${apiBase}${eligiblePath}`, { headers: auth(adminToken) });
  expect(listed.status()).toBe(200);
  const eligible = await listed.json() as Array<{ id: string }>;
  expect(eligible.map((robot) => robot.id)).toEqual(expect.arrayContaining([fixture.allocatedRobotId, fixture.replacementRobotId]));
  expect(eligible.map((robot) => robot.id)).not.toEqual(expect.arrayContaining([fixture.expiredRobotId, fixture.maintenanceRobotId, fixture.foreignRobotId]));

  const unauthorized = await page.request.put(`${apiBase}${allocationPath}`, { headers: auth(instructorToken), data: { robotId: fixture.allocatedRobotId } });
  expect([403, 404]).toContain(unauthorized.status());
  for (const robotId of [fixture.expiredRobotId, fixture.maintenanceRobotId, fixture.foreignRobotId]) {
    const rejected = await page.request.put(`${apiBase}${allocationPath}`, { headers: auth(adminToken), data: { robotId } });
    expect([403, 404, 409]).toContain(rejected.status());
  }
  const foreignClassroom = await page.request.put(`${apiBase}/education-admin/classrooms/${fixture.otherClassroomId}/robot-allocation`, { headers: auth(adminToken), data: { robotId: fixture.allocatedRobotId } });
  expect([403, 404]).toContain(foreignClassroom.status());
  const foreignListing = await page.request.get(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/eligible-robots`, { headers: auth(otherAdminToken) });
  expect([403, 404]).toContain(foreignListing.status());

  const first = await page.request.put(`${apiBase}${allocationPath}`, { headers: auth(adminToken), data: { robotId: fixture.allocatedRobotId } });
  expect(first.status()).toBe(200);
  const firstView = await page.request.get(`${apiBase}/classrooms/${fixture.classroomId}`, { headers: auth(instructorToken) });
  expect(firstView.status()).toBe(200);
  expect(await firstView.json()).toMatchObject({ allocated_robot: { id: fixture.allocatedRobotId, name: 'WF-01 entitled robot' } });

  const replacement = await page.request.put(`${apiBase}${allocationPath}`, { headers: auth(adminToken), data: { robotId: fixture.replacementRobotId } });
  expect(replacement.status()).toBe(200);
  const afterReplacement = await page.request.get(`${apiBase}/classrooms/${fixture.classroomId}`, { headers: auth(instructorToken) });
  expect(await afterReplacement.json()).toMatchObject({ allocated_robot: { id: fixture.replacementRobotId, name: 'WF-01 replacement robot' } });
  const hiddenForeign = await page.request.get(`${apiBase}/classrooms/${fixture.otherClassroomId}`, { headers: auth(instructorToken) });
  expect([403, 404]).toContain(hiddenForeign.status());
});

test('Student submits a ProgramVersion and instructor assesses and returns feedback', async ({ page }) => {
  const studentToken = await tokenFor(page, fixture.users.student.authUserId);
  const headers = { Authorization: `Bearer ${studentToken}` };
  const started = await page.request.post(`${apiBase}/classroom-assignments/${fixture.programDeliveryId}/attempts`, { headers });
  expect(started.status()).toBe(201);
  const attempt = await started.json() as { id: string };
  const createdProgram = await page.request.post(`${apiBase}/me/attempts/${attempt.id}/program`, { headers, data: {
    title: 'Acceptance Blockly program', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } },
    robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] },
  } });
  // Starting is idempotent while an attempt is open: a rerun reuses the open attempt, which already owns its program.
  expect([201, 409]).toContain(createdProgram.status());
  const programResponse = createdProgram.status() === 201 ? createdProgram : await page.request.get(`${apiBase}/me/attempts/${attempt.id}/program`, { headers });
  expect(programResponse.ok()).toBeTruthy();
  const program = await programResponse.json() as { id: string };
  const savedVersion = await page.request.post(`${apiBase}/me/programs/${program.id}/versions`, { headers, data: { changeSummary: 'Ready for review' } });
  expect(savedVersion.status()).toBe(201);
  const version = await savedVersion.json() as { id: string };
  const submitted = await page.request.post(`${apiBase}/me/attempts/${attempt.id}/submission`, { headers, data: { programVersionId: version.id, reflection: 'I checked the saved version.' } });
  expect(submitted.status()).toBe(201);
  const submission = await submitted.json() as { id: string; status: string };
  expect(submission.status).toBe('submitted');
  const learnerBeforeRelease = await page.request.get(`${apiBase}/me/submissions/${submission.id}`, { headers });
  expect(learnerBeforeRelease.status()).toBe(200);
  expect((await learnerBeforeRelease.json() as { assessment?: unknown }).assessment ?? null).toBeNull();
  const gradingBefore = await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers });
  expect(await gradingBefore.json()).toMatchObject({ released: false });
  const otherStudentToken = await tokenFor(page, fixture.users.otherStudent.authUserId);
  const foreignSubmission = await page.request.get(`${apiBase}/me/submissions/${submission.id}`, { headers: { Authorization: `Bearer ${otherStudentToken}` } });
  expect([403, 404]).toContain(foreignSubmission.status());

  await signIn(page, fixture.users.instructor.authUserId);
  await page.goto(`/teacher/classes/${fixture.classroomId}/submissions/${submission.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Blockly review assignment' })).toBeVisible();
  await expect(page.getByText('Not released to student')).toBeVisible();
  await page.getByLabel('Points / 10').fill('8');
  await page.getByPlaceholder('Overall assessment feedback').fill('Good saved program evidence.');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  // Draft vs release (develop's attempt-level release): a saved grade stays hidden from the student until the instructor releases it.
  const learnerStillBeforeRelease = await page.request.get(`${apiBase}/me/submissions/${submission.id}`, { headers });
  expect((await learnerStillBeforeRelease.json() as { assessment?: unknown }).assessment ?? null).toBeNull();
  await page.getByPlaceholder('Feedback for this student').fill('Review complete; please read the rubric.');
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByText('Review complete; please read the rubric.').first()).toBeVisible();
  // Feedback is released together with the grade.
  const feedbackBeforeRelease = await page.request.get(`${apiBase}/me/submissions/${submission.id}/feedback`, { headers });
  expect(JSON.stringify(await feedbackBeforeRelease.json())).not.toContain('Review complete');
  await page.getByRole('button', { name: 'Release grade & feedback' }).click();
  const confirm = page.getByRole('dialog').last();
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /Release/ }).click();
  await expect(page.getByText('Not released to student')).toHaveCount(0);
  const feedback = await page.request.get(`${apiBase}/me/submissions/${submission.id}/feedback`, { headers });
  expect(feedback.status()).toBe(200);
  expect(JSON.stringify(await feedback.json())).toContain('Review complete; please read the rubric.');
  const grading = await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers });
  expect(grading.status()).toBe(200);
  expect(await grading.json()).toMatchObject({ released: true, assessment: { overallFeedback: 'Good saved program evidence.', scores: [{ awardedPoints: 8 }] } });
  await signIn(page, fixture.users.student.authUserId);
  await page.goto(`/my-learning/${fixture.programDeliveryId}`);
  await expect(page.getByText('Graded').first()).toBeVisible();
  await page.getByRole('button', { name: 'View details' }).first().click();
  await expect(page.getByText('Good saved program evidence.')).toBeVisible();
});

test('Instructor course authoring is school-scoped: allowed for the own school, refused for a foreign school', async ({ page }) => {
  const token = await tokenFor(page, fixture.users.instructor.authUserId);
  const headers = { Authorization: `Bearer ${token}` };
  const own = await page.request.post(`${apiBase}/admin/courses`, { headers, data: { title: 'Own-school instructor course (RC contract)' } });
  expect(own.status()).toBe(201);
  expect((await own.json() as { organization_id: string }).organization_id).toBe(fixture.schoolId);
  const forged = await page.request.post(`${apiBase}/admin/courses`, { headers, data: { title: 'Forged owner', organizationId: fixture.otherSchoolId } });
  expect(forged.status()).toBe(404);
});

test('Enrolled course persists across refresh and relogin', async ({ page }) => {
  await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('sb-127-auth-token'));
  await page.reload();
  await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();
});

test('My Learning shows an interrupted request and recovers through Retry', async ({ page }) => {
  await signIn(page, fixture.users.student.authUserId);
  let interruptions = 4;
  await page.route('**/api/v1/me/quizzes', async (route) => {
    if (interruptions-- > 0) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/my-learning');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('Core LMS pages do not overflow at supported viewport widths', async ({ page }) => {
  const widths = [320, 375, 768, 1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, fixture.users.student.authUserId);
    await page.goto('/my-learning');
    await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();
    const learningOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(learningOverflow, `My Learning overflowed at ${width}px`).toBe(false);

    await signIn(page, fixture.users.schoolAdmin.authUserId);
    await page.goto('/school/classrooms');
    await expect(page.getByRole('heading', { name: 'Classrooms' })).toBeVisible();
    const classroomOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(classroomOverflow, `School Classrooms overflowed at ${width}px`).toBe(false);
  }
});
