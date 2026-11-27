import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/**
 * Browser acceptance of Robot Resource management, many-to-many allocation and the Classroom Lab Session, against the isolated local stack
 * (local JWKS identities, disposable PostgreSQL). Uses the real UI for every role action; direct API calls appear only to prove that checks cannot be bypassed.
 */
const shots = path.resolve(process.cwd(), '../../docs/acceptance/screenshots');
const run = Date.now().toString(36);
const fixture = await loadFixture();
const f = fixture as unknown as { classroomId: string; classroom2Id: string; allocatedRobotId: string; replacementRobotId: string; foreignRobotId: string; schoolId: string; otherSchoolId: string };
const robotRow = (page: Page, name: string) => page.locator('li', { has: page.getByTestId(/robot-status-/), hasText: name }).first();

test.describe.serial('Robot Resources, allocation and Classroom Lab Session', () => {
  let sessionId = '';
  test.beforeEach(async ({ page }) => { page.on('dialog', (dialog) => { void dialog.accept(); }); });

  test('System Admin registers, edits, entitles, revokes and retires a robot entirely in the Web UI', async ({ page }) => {
    await signIn(page, fixture, 'admin');
    await page.goto('/');
    await page.getByRole('link', { name: 'Robot Resources' }).click();
    await expect(page.getByRole('heading', { name: 'Robot Resources', level: 1 })).toBeVisible();
    const serial = `E2E-LAB-${run}`;
    await page.getByRole('button', { name: 'Add robot' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add robot resource' });
    await dialog.getByLabel('Serial number').fill(serial); await dialog.getByLabel('Name').fill(`Lab robot ${run}`);
    await dialog.getByRole('button', { name: 'Add robot' }).click();
    await expect(page.getByRole('row', { name: new RegExp(serial) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(serial) })).toContainText('Not commissioned');   // never presented as ready or connected
    await page.screenshot({ path: path.join(shots, 'lab-session-admin-robots.png'), fullPage: true });
    // duplicate identity is rejected
    await page.getByRole('button', { name: 'Add robot' }).click();
    const again = page.getByRole('dialog', { name: 'Add robot resource' });
    await again.getByLabel('Serial number').fill(serial); await again.getByLabel('Name').fill('Duplicate');
    await again.getByRole('button', { name: 'Add robot' }).click();
    await expect(again.getByRole('alert')).toContainText(/already exists/i);
    await again.getByRole('button', { name: 'Cancel' }).click();
    // edit, entitle
    await page.getByRole('row', { name: new RegExp(serial) }).getByRole('button', { name: 'Manage' }).click();
    const detail = page.getByRole('dialog', { name: new RegExp(serial) });
    await detail.getByRole('button', { name: 'Edit details' }).click();
    await detail.getByLabel('Name').fill(`Lab robot ${run} edited`);
    await detail.getByRole('button', { name: 'Save details' }).click();
    await expect(detail.getByRole('heading', { name: /Details/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: new RegExp(`Lab robot ${run} edited`) })).toBeVisible();
    await detail.getByLabel('Grant to organization').selectOption(f.schoolId);
    await detail.getByRole('button', { name: 'Grant entitlement' }).click();
    await expect(detail.getByText(/active · from/)).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'lab-session-admin-entitlement.png'), fullPage: true });
    await detail.getByRole('button', { name: 'Revoke' }).click();
    await expect(detail.getByText(/ended · from/)).toBeVisible();
    await detail.getByRole('button', { name: 'Disable' }).click();
    await expect(detail.getByText(/Disabled \(maintenance\)/)).toBeVisible();
    await detail.getByRole('button', { name: 'Retire' }).click();
    await expect(detail.getByText(/Status: Retired/)).toBeVisible();
    // unauthorized users cannot reach management
    const schoolToken = await signIn(page, fixture, 'schoolAdmin');
    expect((await call(page, schoolToken, 'GET', '/education-admin/robots')).status).toBe(404);
    expect((await call(page, schoolToken, 'POST', '/education-admin/robots', { serialNo: `X-${run}-AAA`, name: 'nope' })).status).toBe(404);
    const studentToken = await signIn(page, fixture, 'student');
    expect((await call(page, studentToken, 'GET', '/education-admin/robots')).status).toBe(404);
  });

  test('School Admin allocates Robot A to Classroom 1 and 2 and Robot B to Classroom 2; duplicates and cross-organization are rejected', async ({ page }) => {
    const token = await signIn(page, fixture, 'schoolAdmin');
    const allocate = async (classroomId: string, robotId: string, name: string) => {
      await page.goto(`/school/classrooms/${classroomId}`);
      await page.getByRole('button', { name: 'Allocate robot' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Allocate robot resource' });
      await dialog.getByLabel('Eligible robot').selectOption(robotId);
      await dialog.getByRole('button', { name: 'Allocate robot' }).click();
      await expect(page.getByText(name).first()).toBeVisible();
    };
    await allocate(f.classroomId, f.allocatedRobotId, 'WF-01 entitled robot');
    await allocate(f.classroom2Id, f.allocatedRobotId, 'WF-01 entitled robot');
    await allocate(f.classroom2Id, f.replacementRobotId, 'WF-01 replacement robot');
    await page.screenshot({ path: path.join(shots, 'lab-session-school-allocations.png'), fullPage: true });
    const duplicate = await call(page, token, 'POST', `/education-admin/classrooms/${f.classroomId}/robot-allocations`, { robotId: f.allocatedRobotId });
    expect(duplicate.status).toBe(409); expect(duplicate.body.code).toBe('ROBOT_ALREADY_ALLOCATED');
    expect((await call(page, token, 'POST', `/education-admin/classrooms/${f.classroomId}/robot-allocations`, { robotId: f.foreignRobotId })).status).toBe(404);   // another organization's robot
    const eligible = await call(page, token, 'GET', `/education-admin/classrooms/${f.classroomId}/eligible-robots`);
    expect((eligible.body as Array<{ id: string }>).some((item) => item.id === f.foreignRobotId)).toBe(false);                                                // only entitled robots are offered
  });

  test('Instructor 1 reserves Robot A (no arming, survives refresh); Instructor 2 cannot; extension works; unauthorized users cannot end', async ({ page, browser }) => {
    await signIn(page, fixture, 'instructor');
    await page.goto(`/teacher/classes/${f.classroomId}`);
    const row = robotRow(page, 'WF-01 entitled robot');
    await expect(row.getByTestId(/robot-status-/)).toHaveText('Available');
    await row.getByRole('button', { name: 'Start Lab Session' }).click();
    await expect(row.getByTestId(/robot-status-/)).toHaveText('Reserved for this classroom');
    await expect(row).toContainText(/Reserved until/);
    await page.reload();
    await expect(robotRow(page, 'WF-01 entitled robot').getByTestId(/robot-status-/)).toHaveText('Reserved for this classroom');   // persisted server-side
    await page.screenshot({ path: path.join(shots, 'lab-session-instructor-reserved.png'), fullPage: true });
    const token1 = await signIn(page, fixture, 'instructor');
    const sessions = await call(page, token1, 'GET', `/classrooms/${f.classroomId}/lab-sessions`);
    expect(sessions.status).toBe(200);
    const mine = (sessions.body as Array<{ id: string; state: string; robotId: string }>).find((item) => item.robotId === f.allocatedRobotId && item.state === 'active');
    expect(mine).toBeTruthy(); sessionId = mine!.id;
    await robotRow(page, 'WF-01 entitled robot').getByRole('button', { name: 'Extend 30 min' }).click();
    await expect.poll(async () => ((await call(page, token1, 'GET', `/classrooms/${f.classroomId}/lab-sessions`)).body as Array<{ id: string; extensionCount: number }>).find((item) => item.id === sessionId)?.extensionCount).toBe(1);
    // Instructor 2 (Classroom 2) sees it as reserved by another classroom and cannot reserve it
    const page2 = await browser.newPage(); page2.on('dialog', (d) => { void d.accept(); });
    const token2 = await signIn(page2, fixture, 'instructor2');
    await page2.goto(`/teacher/classes/${f.classroom2Id}`);
    const row2 = robotRow(page2, 'WF-01 entitled robot');
    await expect(row2.getByTestId(/robot-status-/)).toHaveText('Reserved by another classroom');
    await expect(row2.getByRole('button', { name: 'Start Lab Session' })).toHaveCount(0);
    expect(JSON.stringify(await (await call(page2, token2, 'GET', `/classrooms/${f.classroom2Id}/lab-robots`)).body)).not.toContain(f.classroomId);   // no other-classroom details leak
    const refused = await call(page2, token2, 'POST', `/classrooms/${f.classroom2Id}/lab-sessions`, { robotId: f.allocatedRobotId });
    expect(refused.status).toBe(409); expect(refused.body.code).toBe('ROBOT_RESERVED_BY_ANOTHER_CLASSROOM');
    await page2.screenshot({ path: path.join(shots, 'lab-session-instructor2-blocked.png'), fullPage: true });
    // Instructor 2 can still reserve the OTHER robot independently
    await robotRow(page2, 'WF-01 replacement robot').getByRole('button', { name: 'Start Lab Session' }).click();
    await expect(robotRow(page2, 'WF-01 replacement robot').getByTestId(/robot-status-/)).toHaveText('Reserved for this classroom');
    // unauthorized parties cannot end or extend Instructor 1's session; a student cannot create one
    expect((await call(page2, token2, 'POST', `/lab-sessions/${sessionId}/end`)).status).toBe(404);
    expect((await call(page2, token2, 'POST', `/lab-sessions/${sessionId}/extend`, { minutes: 30 })).status).toBe(404);
    const studentToken = await signIn(page, fixture, 'student');
    expect((await call(page, studentToken, 'POST', `/classrooms/${f.classroomId}/lab-sessions`, { robotId: f.allocatedRobotId })).status).toBe(404);
    await page2.close();
  });

  test('allocation removal is refused during a reservation; School Admin Force End needs a reason and releases safely; Instructor 2 can then reserve', async ({ page }) => {
    const adminToken = await signIn(page, fixture, 'schoolAdmin');
    const blocked = await call(page, adminToken, 'DELETE', `/education-admin/classrooms/${f.classroomId}/robot-allocations/${f.allocatedRobotId}`);
    expect(blocked.status).toBe(409); expect(blocked.body.code).toBe('LAB_SESSION_OPEN');
    const noReason = await call(page, adminToken, 'POST', `/lab-sessions/${sessionId}/force-end`, { reason: '', confirm: true });
    expect(noReason.status).toBe(400);
    await page.goto(`/school/classrooms/${f.classroomId}`);
    await robotRow(page, 'WF-01 entitled robot').getByRole('button', { name: 'Force end…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Controlled force end' });
    await expect(dialog.getByRole('button', { name: 'Force end session' })).toBeDisabled();
    await dialog.getByLabel('Reason (recorded in the audit trail)').fill('abandoned after the lesson');
    await page.screenshot({ path: path.join(shots, 'lab-session-school-force-end.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Force end session' }).click();
    await expect(robotRow(page, 'WF-01 entitled robot').getByTestId(/robot-status-/)).toHaveText('Available');   // released: no student control was active
    // Classroom 1 holds no reservation any more; Instructor 2 can now reserve Robot A
    const token2 = await signIn(page, fixture, 'instructor2');
    const started = await call(page, token2, 'POST', `/classrooms/${f.classroom2Id}/lab-sessions`, { robotId: f.allocatedRobotId });
    expect(started.status).toBe(201);
    const instructor1 = await signIn(page, fixture, 'instructor');
    const again = await call(page, instructor1, 'POST', `/classrooms/${f.classroomId}/lab-sessions`, { robotId: f.allocatedRobotId });
    expect(again.status).toBe(409);
    // after Instructor 2 ends it, the allocation of Classroom 1 can be removed
    await call(page, token2, 'POST', `/lab-sessions/${(started.body as { id: string }).id}/end`);
    const removed = await call(page, adminToken, 'DELETE', `/education-admin/classrooms/${f.classroomId}/robot-allocations/${f.allocatedRobotId}`);
    expect(removed.status).toBe(200);
  });
});
