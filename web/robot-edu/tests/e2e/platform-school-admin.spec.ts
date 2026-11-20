import path from 'node:path';
import { expect, test } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

const shots = path.resolve(process.cwd(), '../../docs/acceptance/screenshots');
const run = Date.now().toString(36);

test.describe.serial('School Admin: profile, roles, instructors, access management and isolation', () => {
  test('School Admin lands in the school workspace and sees the new navigation', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'schoolAdmin');
    await page.goto('/');
    await expect(page).toHaveURL(/\/school\/classrooms$/);
    const nav = page.getByRole('navigation').first();
    for (const label of ['School overview', 'Teachers & students', 'Classrooms', 'Roles & permissions', 'School profile']) await expect(nav.getByRole('link', { name: label })).toBeVisible();
    await page.goto('/school');
    await expect(page.getByRole('heading', { name: 'School Administration' })).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'school-admin-overview.png'), fullPage: true });
  });

  test('school profile shows identity and lets the administrator rename the school', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'schoolAdmin');
    await page.goto('/school/profile');
    await expect(page.getByRole('heading', { name: 'School profile', level: 1 })).toBeVisible();
    const original = (await page.getByTestId('school-name').textContent())!.trim();
    await expect(page.getByTestId('school-code')).toBeVisible();
    await page.getByRole('button', { name: 'Save name' }).isDisabled();
    await page.getByLabel('Change school name').fill(`${original} ${run}`);
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByTestId('school-name')).toHaveText(`${original} ${run}`);
    await page.screenshot({ path: path.join(shots, 'school-admin-profile.png'), fullPage: true });
    expect((await call(page, token, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/profile`, { name: original })).status).toBe(200);
    // Name collision with another school is refused.
    const other = await call(page, await signIn(page, fixture, 'admin'), 'GET', `/education-admin/organizations/${fixture.otherSchoolId}/profile`);
    expect(other.status).toBe(200);
    expect((await call(page, token, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/profile`, { name: other.body.name })).status).toBe(409);
    expect((await call(page, token, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/profile`, { name: '  ' })).status).toBe(400);
  });

  test('roles & permissions matrix is read-only and shows school roles', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'schoolAdmin');
    await page.goto('/school/roles');
    await expect(page.getByRole('heading', { name: 'Roles & permissions', level: 1 })).toBeVisible();
    await expect(page.getByTestId('role-card').first()).toBeVisible();
    for (const name of ['School Administrator', 'Instructor', 'Student']) await expect(page.getByRole('region', { name: new RegExp(name, 'i') }).first()).toBeVisible();
    expect(await page.getByRole('button', { name: /save|edit|grant/i }).count()).toBe(0);
    await page.screenshot({ path: path.join(shots, 'school-admin-roles.png'), fullPage: true });
  });

  test('add an instructor, deactivate and reactivate their access', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'schoolAdmin');
    const email = `e2e.teacher.${run}@example.test`;
    await page.goto('/school/users');
    await page.getByRole('button', { name: 'Add instructor' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add instructor' });
    await expect(dialog.getByRole('button', { name: 'Add instructor' })).toBeDisabled();
    await dialog.getByLabel('First name').fill('Ada'); await dialog.getByLabel('Last name').fill(`Teacher${run}`);
    await dialog.getByLabel('Employee code').fill(`EMP-${run}`); await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('button', { name: 'Add instructor' }).click();
    await expect(dialog.getByRole('status')).toContainText('Invitation sent');
    await dialog.getByRole('button', { name: 'Done' }).click();
    // Duplicate employee code is reported as already existing, not duplicated.
    await page.getByRole('button', { name: 'Add instructor' }).click();
    await dialog.getByLabel('First name').fill('Ada'); await dialog.getByLabel('Last name').fill(`Teacher${run}`);
    await dialog.getByLabel('Employee code').fill(`EMP-${run}`); await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('button', { name: 'Add instructor' }).click();
    await expect(dialog.getByRole('status')).toContainText('already exists');
    await dialog.getByRole('button', { name: 'Done' }).click();

    await page.getByPlaceholder(/Search name/).fill(`Teacher${run}`);
    const row = page.getByRole('row', { name: new RegExp(`Ada Teacher${run}`) });
    await expect(row).toBeVisible(); await expect(row).toContainText(email);
    await page.screenshot({ path: path.join(shots, 'school-admin-people.png'), fullPage: true });
    page.once('dialog', (d) => void d.accept());
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(row).toHaveCount(0);
    await page.getByLabel('Access').selectOption('suspended');
    const suspended = page.getByRole('row', { name: new RegExp(`Ada Teacher${run}`) });
    await expect(suspended).toBeVisible();
    await suspended.getByRole('button', { name: 'Reactivate' }).click();
    await expect(suspended).toHaveCount(0);
    await page.getByLabel('Access').selectOption('active');
    await expect(page.getByRole('row', { name: new RegExp(`Ada Teacher${run}`) })).toBeVisible();
    // Server rules: cannot change an administrator or oneself.
    const me = fixture.users.schoolAdmin.userId;
    expect((await call(page, token, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${me}/status`, { status: 'suspended' })).status).toBe(403);
  });

  test('tenant isolation and permissions for school management routes', async ({ page }) => {
    const fixture = await loadFixture();
    const sa = await signIn(page, fixture, 'schoolAdmin');
    for (const suffix of ['profile', 'roles', 'people?page=1&pageSize=5']) expect((await call(page, sa, 'GET', `/education-admin/organizations/${fixture.otherSchoolId}/${suffix}`)).status).toBe(404);
    expect((await call(page, sa, 'PATCH', `/education-admin/organizations/${fixture.otherSchoolId}/profile`, { name: 'Hijack' })).status).toBe(404);
    expect((await call(page, sa, 'PATCH', `/education-admin/organizations/${fixture.otherSchoolId}/members/${fixture.users.otherStudent.userId}/status`, { status: 'suspended' })).status).toBe(404);
    const other = await signIn(page, fixture, 'otherSchoolAdmin');
    expect((await call(page, other, 'GET', `/education-admin/organizations/${fixture.schoolId}/profile`)).status).toBe(404);
    for (const who of ['instructor', 'student']) {
      const t = await signIn(page, fixture, who);
      expect((await call(page, t, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/profile`, { name: 'Nope' })).status).toBe(404);
      expect((await call(page, t, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${fixture.users.otherStudent.userId}/status`, { status: 'suspended' })).status).toBe(404);
    }
    // UI route guards: a student cannot open school pages.
    await page.goto('/school/profile');
    await expect(page.getByRole('heading', { name: 'School profile', level: 1 })).toHaveCount(0);
  });

  test('school pages work on a phone without horizontal page scroll', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'schoolAdmin');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [route, heading] of [['/school/profile', 'School profile'], ['/school/roles', 'Roles & permissions'], ['/school/users', 'School Administration'], ['/school/classrooms', 'School Administration']] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await page.goto('/school/roles'); await page.screenshot({ path: path.join(shots, 'school-admin-roles-mobile.png') });
  });
});
