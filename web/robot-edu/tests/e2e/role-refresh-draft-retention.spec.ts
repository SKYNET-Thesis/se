import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loadFixture, signIn } from './helpers/academic';

const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const psql = (sql: string) => {
  const databaseUrl = process.env.VISTA_E2E_ADMIN_DATABASE_URL;
  if (!databaseUrl) throw new Error('VISTA_E2E_ADMIN_DATABASE_URL is required for isolated acceptance assertions.');
  return execFileSync('psql', [databaseUrl, '-Atqc', sql], { encoding: 'utf8' }).trim();
};

test('keeps organization and account drafts through token refresh, then fails closed on logout and role revocation', async ({ page, context }) => {
  test.setTimeout(120_000);
  const fixture = await loadFixture();
  const adminAuthId = fixture.users.admin.authUserId;
  const run = randomUUID().replaceAll('-', '').slice(0, 12);
  const organizationName = `Focus Academy ${run}`;
  const administratorName = `Focus Admin ${run}`;
  const administratorEmail = `focus-admin-${run}@example.test`;
  let roleRequests = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/me/roles')) roleRequests += 1;
  });

  await signIn(page, fixture, 'admin');
  await page.goto('/admin/organizations');
  await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'New organization' }).click();
  const create = page.getByRole('dialog', { name: 'New organization' });
  const organizationInput = create.getByLabel('Organization name');
  await organizationInput.fill(organizationName);

  const secondTab = await context.newPage();
  await secondTab.goto('/');

  const roleRequestsBeforeRefresh = roleRequests;
  const refreshed = await page.request.post(`http://127.0.0.1:${authPort}/auth/v1/token?grant_type=refresh_token`, {
    data: { refresh_token: `stub-refresh:${adminAuthId}` },
  });
  expect(refreshed.ok()).toBeTruthy();
  const refreshedSession = await refreshed.json() as Record<string, unknown>;
  await secondTab.evaluate((session) => {
    const channel = new BroadcastChannel('sb-127-auth-token');
    channel.postMessage({ event: 'TOKEN_REFRESHED', session });
    channel.close();
  }, refreshedSession);
  await expect.poll(() => roleRequests, { timeout: 10_000 }).toBeGreaterThan(roleRequestsBeforeRefresh);
  await expect(organizationInput).toHaveValue(organizationName);
  await expect(create).toBeVisible();

  await create.getByRole('button', { name: 'Create organization' }).click();
  const manage = page.getByRole('dialog', { name: organizationName });
  await expect(manage).toBeVisible();
  expect(psql(`select count(*) from organizations where name='${organizationName}'`)).toBe('1');

  await manage.getByLabel('Administrator name').fill(administratorName);
  await manage.getByLabel('Administrator email').fill(administratorEmail);
  await manage.getByRole('button', { name: 'Assign administrator' }).click();
  await expect(manage.getByTestId('org-admin').filter({ hasText: administratorName })).toContainText('Pending invitation');
  const inviteCount = await (await page.request.get(`http://127.0.0.1:${authPort}/__test/invites?email=${encodeURIComponent(administratorEmail)}`)).json() as { count: number };
  expect(inviteCount.count).toBe(1);
  expect(psql(`select count(*) from organizations where name='${organizationName}'`)).toBe('1');

  await secondTab.evaluate(() => {
    const channel = new BroadcastChannel('sb-127-auth-token');
    channel.postMessage({ event: 'SIGNED_OUT', session: null });
    channel.close();
  });
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toHaveCount(0);

  await signIn(page, fixture, 'admin');
  await page.goto('/admin/organizations');
  await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toBeVisible();
  psql(`delete from user_system_roles where user_id='${fixture.users.admin.userId}'`);
  const roleRequestsBeforeRevocation = roleRequests;
  const revocationRefresh = await page.request.post(`http://127.0.0.1:${authPort}/auth/v1/token?grant_type=refresh_token`, {
    data: { refresh_token: `stub-refresh:${adminAuthId}` },
  });
  expect(revocationRefresh.ok()).toBeTruthy();
  await secondTab.evaluate((session) => {
    const channel = new BroadcastChannel('sb-127-auth-token');
    channel.postMessage({ event: 'TOKEN_REFRESHED', session });
    channel.close();
  }, await revocationRefresh.json());
  await expect.poll(() => roleRequests, { timeout: 10_000 }).toBeGreaterThan(roleRequestsBeforeRevocation);
  await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New organization' })).toHaveCount(0);
});
