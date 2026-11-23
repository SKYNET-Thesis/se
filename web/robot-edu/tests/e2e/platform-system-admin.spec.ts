import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { call, createLocalAuthIdentity, loadFixture, signIn } from './helpers/academic';

const shots = path.resolve(process.cwd(), '../../docs/acceptance/screenshots');
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36);

test.describe.serial('System Admin: organization lifecycle, administrator assignment, tenant boundaries', () => {
  const orgName = `E2E Academy ${run}`; const adminEmail = `e2e.head.${run}@example.test`; const adminAuthId = randomUUID();
  let orgId = '';

  test.beforeAll(async ({ request }) => {
    await createLocalAuthIdentity(request, { id: adminAuthId, email: adminEmail });
  });

  test('System Admin lands on Organizations, creates an organization and assigns a School Administrator', async ({ page }) => {
    const fixture = await loadFixture();
    psql(`insert into users(auth_user_id,email,full_name,status,signup_method,email_verified_at) values('${adminAuthId}','${adminEmail}','E2E Head ${run}','active','admin_created',now())`);
    await signIn(page, fixture, 'admin');
    await page.goto('/');
    await expect(page).toHaveURL(/\/admin\/organizations$/);
    await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'system-admin-organizations.png'), fullPage: true });

    await page.getByRole('button', { name: 'New organization' }).click();
    const create = page.getByRole('dialog', { name: 'New organization' });
    await expect(create.getByRole('button', { name: 'Create organization' })).toBeDisabled();
    await create.getByLabel('Organization name').fill(orgName);
    await create.getByRole('button', { name: 'Create organization' }).click();

    const manage = page.getByRole('dialog', { name: orgName });
    await expect(manage).toBeVisible();
    await expect(manage.getByTestId('org-status')).toHaveText('Active');
    await expect(manage.getByText('No administrator assigned yet.')).toBeVisible();
    const assign = manage.getByRole('button', { name: 'Assign administrator' });
    await expect(assign).toBeDisabled();
    await manage.getByLabel('Administrator name').fill(`E2E Head ${run}`);
    await manage.getByLabel('Administrator email').fill(adminEmail);
    await assign.click();
    await expect(manage.getByTestId('org-admin')).toContainText(`E2E Head ${run}`);
    // A brand-new person is invited through the identity provider and shows as Invited.
    await manage.getByLabel('Administrator name').fill(`Invited Head ${run}`);
    await manage.getByLabel('Administrator email').fill(`invited.${run}@example.test`);
    await manage.getByRole('button', { name: 'Assign administrator' }).click();
    await expect(manage.getByTestId('org-admin')).toHaveCount(2);
    await expect(manage.getByTestId('org-admin').filter({ hasText: `Invited Head ${run}` })).toContainText('Invited');
    await page.screenshot({ path: path.join(shots, 'system-admin-manage-organization.png') });
    await manage.getByRole('button', { name: 'Close' }).first().click().catch(() => page.keyboard.press('Escape'));
    orgId = psql(`select id from organizations where name='${orgName}'`);
    expect(orgId).toMatch(/^[0-9a-f-]{36}$/);
    expect(psql(`select count(*) from audit_logs where organization_id='${orgId}' and action in ('organization.created','organization.administrator_assigned')`)).toBe('3');
  });

  test('duplicate names and a second assignment are rejected with a readable error', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'admin');
    const dup = await call(page, token, 'POST', '/education-admin/organizations', { name: orgName.toUpperCase() });
    expect(dup.status).toBe(409);
    const invalid = await call(page, token, 'POST', '/education-admin/organizations', { name: '   ' });
    expect(invalid.status).toBe(400);
    const crossTenant = await call(page, token, 'POST', `/education-admin/organizations/${fixture.otherSchoolId}/administrators`, { email: adminEmail, fullName: 'Someone' });
    expect(crossTenant.status).toBe(409); // already belongs to another organization
  });

  test('the new School Administrator manages only their own school (tenant isolation)', async ({ page }) => {
    const fixture = await loadFixture();
    const token = await (async () => { const s = await (await page.request.get(`http://127.0.0.1:${process.env.VISTA_E2E_JWKS_PORT ?? 54321}/token?sub=${adminAuthId}`)).json() as { access_token: string }; return s.access_token; })();
    expect((await call(page, token, 'GET', `/education-admin/organizations/${orgId}/overview`)).status).toBe(200);
    expect((await call(page, token, 'GET', `/education-admin/organizations/${fixture.schoolId}/overview`)).status).toBe(404);
    expect((await call(page, token, 'GET', `/education-admin/organizations/${fixture.schoolId}/classrooms`)).status).toBe(404);
    expect((await call(page, token, 'GET', '/education-admin/organizations/managed')).status).toBe(404);
    expect((await call(page, token, 'POST', '/education-admin/organizations', { name: `Rogue ${run}` })).status).toBe(404);
    expect((await call(page, token, 'PATCH', `/education-admin/organizations/${orgId}`, { status: 'closed' })).status).toBe(404);
    // Existing School Admin and Instructor of the fixture school cannot reach system routes either.
    for (const who of ['schoolAdmin', 'instructor', 'student']) {
      const t = await signIn(page, fixture, who);
      expect((await call(page, t, 'GET', '/education-admin/organizations/managed')).status).toBe(404);
      expect((await call(page, t, 'POST', `/education-admin/organizations/${fixture.schoolId}/administrators`, { email: 'x@example.test', fullName: 'Xy' })).status).toBe(404);
    }
    // UI: the new administrator lands in the school workspace, not the system workspace.
    await page.goto('/');
    await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'local-e2e-no-refresh', user: { id: adminAuthId, aud: 'authenticated', role: 'authenticated' } });
    await page.goto('/');
    await expect(page).toHaveURL(/\/school\/classrooms$/);
    await page.goto('/admin/organizations');
    await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toHaveCount(0);
  });

  test('suspending an organization blocks its members immediately; reactivation restores access', async ({ page }) => {
    const fixture = await loadFixture(); const adminToken = await signIn(page, fixture, 'admin');
    const adminTok = (await (await page.request.get(`http://127.0.0.1:${process.env.VISTA_E2E_JWKS_PORT ?? 54321}/token?sub=${adminAuthId}`)).json() as { access_token: string }).access_token;
    await page.goto('/admin/organizations');
    await page.getByRole('button', { name: `Manage ${orgName}` }).click();
    const manage = page.getByRole('dialog', { name: orgName });
    await manage.getByRole('button', { name: 'Suspend organization' }).click();
    await expect(manage.getByTestId('org-status')).toHaveText('Suspended');
    expect((await call(page, adminTok, 'GET', `/education-admin/organizations/${orgId}/overview`)).status).toBe(404);
    await manage.getByRole('button', { name: 'Reactivate organization' }).click();
    await expect(manage.getByTestId('org-status')).toHaveText('Active');
    expect((await call(page, adminTok, 'GET', `/education-admin/organizations/${orgId}/overview`)).status).toBe(200);
    await manage.getByRole('button', { name: `Remove Invited Head ${run}` }).click();
    await expect(manage.getByTestId('org-admin').filter({ hasText: `Invited Head ${run}` })).toContainText('Removed');
    // The last administrator cannot be removed.
    const adminUserId = psql(`select id from users where auth_user_id='${adminAuthId}'`);
    const last = await call(page, adminToken, 'DELETE', `/education-admin/organizations/${orgId}/administrators/${adminUserId}`);
    expect(last.status).toBe(409);
    await page.screenshot({ path: path.join(shots, 'system-admin-organization-reactivated.png') });
  });

  test('Organizations page is usable on a phone and shows the new organization', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'admin');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/organizations');
    await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toBeVisible();
    await page.getByLabel('Search organizations').fill(orgName);
    await expect(page.getByTestId('org-row')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(shots, 'system-admin-organizations-mobile.png') });
    await page.getByLabel('Search organizations').fill('zzzz-no-such-org');
    await expect(page.getByText('No organization matches your search')).toBeVisible();
  });
});
