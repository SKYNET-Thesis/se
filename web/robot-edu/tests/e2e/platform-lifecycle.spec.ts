import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/** Invitation reissue, account enable/disable and unpublish: UI against the real API, real database and the auth stub (counts invitation e-mails). */
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const authPort = process.env.VISTA_E2E_JWKS_PORT;
const invites = async (page: import('@playwright/test').Page, email: string) => ((await (await page.request.get(`http://127.0.0.1:${authPort}/__test/invites?email=${encodeURIComponent(email)}`)).json()) as { count: number }).count;
const run = Date.now().toString(36);

test.describe.serial('lifecycle operations', () => {
  test('School Admin re-sends an instructor invitation; accepted instructors cannot be re-invited', async ({ page }) => {
    const fixture = await loadFixture(); const adminToken = await signIn(page, fixture, 'schoolAdmin');
    const email = `reinvite.${run}@example.test`;
    await page.goto('/school/users'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Add instructor' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add instructor' });
    await dialog.getByLabel('First name').fill('Re'); await dialog.getByLabel('Last name').fill(`Invite${run}`); await dialog.getByLabel('Employee code').fill(`RI-${run}`); await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('button', { name: 'Add instructor' }).click(); await expect(dialog.getByRole('status')).toContainText('Invitation sent'); await dialog.getByRole('button', { name: 'Done' }).click();
    expect(await invites(page, email)).toBe(1);
    await page.getByRole('textbox', { name: 'Search people' }).fill(`Invite${run}`);
    const row = page.getByRole('row', { name: new RegExp(`Re Invite${run}`) });
    await row.getByRole('button', { name: 'Resend invitation' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Invitation sent again to ${email}` })).toBeVisible();
    expect(await invites(page, email)).toBe(2);
    // students and strangers have no such button, other schools and other roles are refused
    const userId = psql(`select id from users where email='${email}'`); const authId = psql(`select auth_user_id from users where email='${email}'`);
    const other = await signIn(page, fixture, 'otherSchoolAdmin');
    expect((await call(page, other, 'POST', `/education-admin/organizations/${fixture.schoolId}/members/${userId}/invitation`)).status).toBe(404);
    expect((await call(page, await signIn(page, fixture, 'instructor'), 'POST', `/education-admin/organizations/${fixture.schoolId}/members/${userId}/invitation`)).status).toBe(404);
    expect((await call(page, adminToken, 'POST', `/education-admin/organizations/${fixture.schoolId}/members/${fixture.users.student.userId}/invitation`)).status).toBe(404);
    // after the person accepts (first verified sign-in) the invitation can no longer be re-sent
    const t = ((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authId}`)).json()) as { access_token: string }).access_token;
    await call(page, t, 'GET', '/me/memberships');
    expect(psql(`select status from users where id='${userId}'`)).toBe('active');
    const again = await call(page, adminToken, 'POST', `/education-admin/organizations/${fixture.schoolId}/members/${userId}/invitation`);
    expect(again.status).toBe(409);
  });

  test('System Admin re-sends an administrator invitation and disables / enables the account', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'admin');
    const orgName = `Lifecycle School ${run}`; const email = `lifecycle.head.${run}@example.test`;
    await page.goto('/admin/organizations');
    await page.getByRole('button', { name: 'New organization' }).click();
    await page.getByRole('dialog', { name: 'New organization' }).getByLabel('Organization name').fill(orgName);
    await page.getByRole('dialog', { name: 'New organization' }).getByRole('button', { name: 'Create organization' }).click();
    const manage = page.getByRole('dialog', { name: orgName });
    await manage.getByLabel('Administrator name').fill(`Life Head ${run}`); await manage.getByLabel('Administrator email').fill(email);
    await manage.getByRole('button', { name: 'Assign administrator' }).click();
    const adminRow = manage.getByTestId('org-admin');
    await expect(adminRow).toContainText('Invited');
    await adminRow.getByRole('button', { name: /Resend invitation to/ }).click();
    await expect(manage.getByRole('status').filter({ hasText: `Invitation sent again to ${email}` })).toBeVisible();
    expect(await invites(page, email)).toBe(2);
    const authId = psql(`select auth_user_id from users where email='${email}'`);
    const token = ((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authId}`)).json()) as { access_token: string }).access_token;
    await adminRow.getByRole('button', { name: /Disable account of/ }).click();
    await expect(adminRow).toContainText('Disabled');
    expect((await call(page, token, 'GET', '/me/memberships')).status).toBe(403);                 // refused everywhere while disabled
    await adminRow.getByRole('button', { name: /Enable account of/ }).click();
    await expect(adminRow).toContainText('Invited');                                               // never accepted: back to invited, not silently active
    expect((await call(page, token, 'GET', '/me/memberships')).status).toBe(200);                  // the first verified sign-in then activates it (membership + email claim hold)
    expect(psql(`select status from users where email='${email}'`)).toBe('active');
  });

  test('unpublish: challenge in the UI; a delivered course and a started assignment are refused with clear reasons', async ({ page }) => {
    const fixture = await loadFixture(); const teacher = await signIn(page, fixture, 'instructor');
    // challenge: draft -> published -> draft, all in the UI
    await page.goto('/teacher/challenges');
    await page.getByRole('button', { name: 'New challenge' }).click();
    const dialog = page.getByRole('dialog', { name: 'New challenge' });
    await dialog.getByLabel('Challenge title').fill(`Lifecycle ${run}`); await dialog.getByRole('button', { name: 'Save challenge' }).click(); await expect(dialog).not.toBeVisible();
    const row = page.getByTestId('challenge-row').filter({ hasText: `Lifecycle ${run}` });
    await row.getByRole('button', { name: /^Publish/ }).click(); await expect(row.getByTestId('challenge-status')).toHaveText('Published');
    await row.getByRole('button', { name: /^Unpublish/ }).click(); await expect(row.getByTestId('challenge-status')).toHaveText('Draft');

    // course: an undelivered published course returns to draft from the builder
    const course = await call(page, teacher, 'POST', '/admin/courses', { title: `Unpublish course ${run}` });
    expect(course.status).toBe(201);
    psql(`update learning_courses set status='published' where id='${course.body.id}'`);
    await page.goto(`/admin/courses/${course.body.id}?tab=settings`);
    await page.getByRole('button', { name: 'Unpublish course' }).click();
    await expect(page.getByText('Course returned to draft.')).toBeVisible();
    expect(psql(`select status from learning_courses where id='${course.body.id}'`)).toBe('draft');
    // the delivered fixture course cannot be unpublished: nothing changes and the reason is shown
    await signIn(page, fixture, 'admin');
    await page.goto(`/admin/courses/${fixture.courseId}?tab=settings`);
    await page.getByRole('button', { name: 'Unpublish course' }).click();
    await expect(page.getByText(/Archive it instead/)).toBeVisible();
    expect(psql(`select status from learning_courses where id='${fixture.courseId}'`)).toBe('published');

    // assignment: unpublish before any attempt works (UI); after a student starts it, it is refused
    await signIn(page, fixture, 'instructor');
    const created = await call(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/assignments`, { lessonId: fixture.lessonId, title: `Withdrawable ${run}`, instructions: 'x' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const assignmentId = created.body.assignment_id as string;
    const delivery = (await call(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/publish`)).body as { id: string };
    await page.goto(`/teacher/assignments/${fixture.classroomId}/${assignmentId}`);
    await page.getByRole('button', { name: 'Unpublish assignment' }).click();
    await expect.poll(async () => psql(`select status from learning_classroom_assignments where id='${delivery.id}'`)).toBe('draft');
    await call(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/publish`);
    const student = await signIn(page, fixture, 'student');
    expect([200, 201]).toContain((await call(page, student, 'POST', `/classroom-assignments/${delivery.id}/attempts`)).status);
    await signIn(page, fixture, 'instructor');
    await page.goto(`/teacher/assignments/${fixture.classroomId}/${assignmentId}`);
    await page.getByRole('button', { name: 'Unpublish assignment' }).click();
    await expect(page.getByRole('alert')).toContainText(/already started|Close it instead/i);
    expect(psql(`select status from learning_classroom_assignments where id='${delivery.id}'`)).toBe('published');
    // a student cannot unpublish
    expect([403, 404]).toContain((await call(page, student, 'POST', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/unpublish`)).status);
  });
});
