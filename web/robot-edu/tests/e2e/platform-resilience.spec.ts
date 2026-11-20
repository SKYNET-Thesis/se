import { expect, test } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

const run = Date.now().toString(36);

test.describe('Ordering, resilience and access lifecycle', () => {
  test('instructor reorders modules with the keyboard-accessible move buttons and the order persists', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'instructor');
    await page.goto('/admin/courses');
    await page.getByRole('button', { name: 'Create Course' }).click();
    await page.getByRole('textbox', { name: 'Course Title' }).fill(`Order course ${run}`);
    await page.getByRole('button', { name: 'Create Draft' }).click();
    await page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/);
    const courseId = page.url().match(/courses\/([0-9a-f-]{36})/)![1];
    for (const title of ['Module A', 'Module B', 'Module C']) {
      const opener = title === 'Module A' ? page.getByRole('button', { name: 'Add module' }) : page.getByRole('button', { name: 'Add', exact: true }).first();
      await expect(opener).toBeVisible({ timeout: 20_000 });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Add module' });
      await dialog.getByRole('textbox').fill(title); await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
    const titles = async () => ((await call(page, token, 'GET', `/courses/${courseId}/lessons`)).body as Array<{ title: string }>).map((l) => l.title);
    expect(await titles()).toEqual(['Module A', 'Module B', 'Module C']);
    await page.getByRole('button', { name: /Move (module \d+, )?Module C,? up/i }).first().click();
    await expect.poll(titles).toEqual(['Module A', 'Module C', 'Module B']);
    await page.getByRole('button', { name: /Move (module \d+, )?Module A,? down/i }).first().click();
    await expect.poll(titles).toEqual(['Module C', 'Module A', 'Module B']);
    await page.reload();
    expect(await titles()).toEqual(['Module C', 'Module A', 'Module B']);
    // another school's instructor cannot reorder this course
    const foreign = await signIn(page, fixture, 'otherSchoolAdmin');
    const lessons = (await call(page, token, 'GET', `/courses/${courseId}/lessons`)).body as Array<{ id: string }>;
    expect((await call(page, foreign, 'POST', `/admin/courses/${courseId}/lessons/order`, { orderedIds: lessons.map((l) => l.id).reverse() })).status).toBe(404);
  });

  test('challenge builder validates input, edits a draft and deletes it', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'instructor');
    await page.goto('/teacher/challenges');
    await page.getByRole('button', { name: 'New challenge' }).click();
    const dialog = page.getByRole('dialog', { name: 'New challenge' });
    const save = dialog.getByRole('button', { name: 'Save challenge' });
    await expect(save).toBeDisabled();                                            // a title is required
    await dialog.getByLabel('Challenge title').fill(`Draft ${run}`);
    for (const label of ['Select arm', 'Open gripper', 'Close gripper', 'Go home', 'Wait', 'Move to point (preview)']) await dialog.getByLabel(label).uncheck();
    await expect(save).toBeDisabled();                                            // a toolbox needs at least one block
    await dialog.getByLabel('Open gripper').check(); await dialog.getByLabel('Close gripper').check();
    await dialog.getByLabel('Rule 1 type').selectOption('action_count');
    await dialog.getByLabel('Rule 1 comparison').selectOption('gte'); await dialog.getByLabel('Rule 1 count').fill('2');
    await save.click();                                                           // default action is "wait", which this toolbox does not allow: refused with a reason
    await expect(dialog.getByRole('alert')).toContainText(/cannot be completed.*wait/i);
    await dialog.getByLabel('Rule 1 action').selectOption('gripper.open');
    await save.click(); await expect(dialog).not.toBeVisible();
    const row = page.getByTestId('challenge-row').filter({ hasText: `Draft ${run}` });
    await expect(row).toContainText('1 rule');
    await row.getByRole('button', { name: `Edit Draft ${run}` }).click();
    const edit = page.getByRole('dialog', { name: 'Edit challenge' });
    await edit.getByLabel('Challenge title').fill(`Draft ${run} v2`);
    await edit.getByRole('button', { name: 'Save challenge' }).click(); await expect(edit).not.toBeVisible();
    const renamed = page.getByTestId('challenge-row').filter({ hasText: `Draft ${run} v2` });
    await expect(renamed).toBeVisible();
    // a student cannot author; a draft is not offered for assignments
    const student = await signIn(page, fixture, 'student');
    expect((await call(page, student, 'GET', '/author/challenges')).status).toBe(404);
    await signIn(page, fixture, 'instructor');
    page.once('dialog', (d) => void d.accept());
    await renamed.getByRole('button', { name: `Delete Draft ${run} v2` }).click();
    await expect(renamed).toHaveCount(0);
    expect(((await call(page, token, 'GET', '/author/challenges')).body as Array<{ title: string }>).some((c) => c.title.startsWith(`Draft ${run}`))).toBe(false);
  });

  test('logout ends the session and protected pages then require sign-in', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'schoolAdmin');
    await page.goto('/school/profile');
    await expect(page.getByRole('heading', { name: 'School profile', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/school/profile');
    await expect(page).toHaveURL(/\/login/);
  });

  test('an expired session on a management page is sent to sign-in instead of showing stale data', async ({ page }) => {
    const fixture = await loadFixture();
    const expired = await (await page.request.get(`http://127.0.0.1:${process.env.VISTA_E2E_JWKS_PORT}/token?sub=${fixture.users.admin.authUserId}&ttl=-60`)).json();
    await page.goto('/'); await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), expired);
    await page.goto('/admin/organizations');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toHaveCount(0);
  });

  test('a network failure on a management page is explained and Retry recovers', async ({ page, context }) => {
    test.setTimeout(120_000);
    const fixture = await loadFixture(); await signIn(page, fixture, 'admin');
    await page.goto('/admin/courses'); await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Organizations' }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 60_000 });
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('org-row').first()).toBeVisible();
  });

  test('a deactivated student loses access immediately and regains it when reactivated', async ({ page }) => {
    const fixture = await loadFixture();
    const adminToken = await signIn(page, fixture, 'schoolAdmin');
    const studentToken = await signIn(page, fixture, 'otherStudent');
    expect((await call(page, studentToken, 'GET', '/me/learning')).status).toBe(200);
    const id = fixture.users.otherStudent.userId;
    expect((await call(page, adminToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${id}/status`, { status: 'suspended' })).status).toBe(200);
    try {
      const blocked = await call(page, studentToken, 'GET', '/me/learning');
      expect(JSON.stringify(blocked.body)).not.toContain('classroom_assignment_id');           // no data is served to a suspended member
      expect((await call(page, studentToken, 'GET', `/education-admin/organizations/${fixture.schoolId}/overview`)).status).toBe(404);
    } finally {
      expect((await call(page, adminToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${id}/status`, { status: 'active' })).status).toBe(200);
    }
    expect((await call(page, studentToken, 'GET', '/me/learning')).status).toBe(200);
  });
});
