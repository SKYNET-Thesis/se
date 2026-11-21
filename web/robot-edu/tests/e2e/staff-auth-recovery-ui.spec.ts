import { expect, test } from '@playwright/test';
import { appendFileSync, readFileSync } from 'node:fs';

/**
 * Staff (e-mail) password recovery and password change against REAL GoTrue (harness: scripts/local_student_auth_harness.sh, SA_WITH_UI=1).
 * There is no SMTP locally, so the recovery link is generated through GoTrue's admin API exactly as the e-mail would carry it.
 * The fixture instructor's password is restored at the end. Env: SA_AUTH, SA_SERVICE_KEY_FILE, SA_SECRETS_FILE, VISTA_E2E_FIXTURE_FILE.
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const AUTH = env('SA_AUTH');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(AUTH).hostname)) throw new Error('Refusing to run against a non-loopback auth endpoint.');
const service = readFileSync(env('SA_SERVICE_KEY_FILE'), 'utf8').trim();
const anon = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon;
const fixture = JSON.parse(readFileSync(env('VISTA_E2E_FIXTURE_FILE'), 'utf8')) as { users: Record<string, { authUserId: string }> };
const secretsFile = env('SA_SECRETS_FILE');
const EMAIL = 'phase243-instructor@vista.test'; const ORIGINAL = 'LocalFixturePass-instructor!';
const run = Date.now().toString(36);
const RESET_TO = `Reset-${run}-Passphrase!`; const CHANGED_TO = `Changed-${run}-Passphrase!`;
for (const [label, secret] of [['staff-reset', RESET_TO], ['staff-changed', CHANGED_TO]]) appendFileSync(secretsFile, `${label}\t${secret}\n`, { mode: 0o600 });

const admin = { headers: { apikey: service, Authorization: `Bearer ${service}` } };
const grant = async (request: import('@playwright/test').APIRequestContext, password: string) =>
  (await request.post(`${AUTH}/token?grant_type=password`, { headers: { apikey: anon, 'X-Forwarded-For': '10.40.0.9' }, data: { email: EMAIL, password } })).status();
async function restore(request: import('@playwright/test').APIRequestContext) {
  const response = await request.put(`${AUTH}/admin/users/${fixture.users.instructor.authUserId}`, { ...admin, data: { password: ORIGINAL } });
  expect(response.ok()).toBeTruthy();
}
async function uiSignIn(page: import('@playwright/test').Page, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe.configure({ mode: 'serial' });
test.afterAll(async ({ request }) => { await restore(request); });

test('forgot-password page answers identically for known and unknown addresses; direct visits to the reset page are refused', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  for (const address of [`nobody-${run}@vista.test`, EMAIL]) {
    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill(address);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists');
  }
  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: 'This reset link cannot be used' })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('a genuine recovery link lets the user choose a new password once; the old password and the used link stop working', async ({ page, request }) => {
  const link = await request.post(`${AUTH}/admin/generate_link`, { ...admin, data: { type: 'recovery', email: EMAIL, redirect_to: 'http://127.0.0.1:4173/reset-password' } });
  expect(link.ok(), await link.text()).toBeTruthy();
  const actionLink = (await link.json() as { action_link: string }).action_link;

  await page.goto(actionLink);
  await expect(page).toHaveURL(/\/reset-password/);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  const fields = page.locator('input[autocomplete="new-password"]');
  await fields.nth(0).fill(RESET_TO); await fields.nth(1).fill(`${RESET_TO}-different`);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await fields.nth(1).fill(RESET_TO);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/login\?reason=PASSWORD_RESET/);
  await expect(page.getByRole('status')).toContainText('Your password was changed');

  expect(await grant(request, ORIGINAL)).toBe(400);                 // the old password is dead
  expect(await grant(request, RESET_TO)).toBe(200);
  await uiSignIn(page, RESET_TO);
  await expect(page).not.toHaveURL(/\/login/);

  // the same link cannot be used again
  await page.evaluate(() => localStorage.clear());
  await page.goto(actionLink);
  await expect(page.getByRole('heading', { name: 'This reset link cannot be used' })).toBeVisible();
  await restore(request);                                          // leave the fixture account as it was
  expect(await grant(request, ORIGINAL)).toBe(200);
});

test('a forged recovery marker in the URL does not open the reset form for a signed-in user', async ({ page }) => {
  await uiSignIn(page, ORIGINAL);
  await expect(page).not.toHaveURL(/\/login/);
  for (const url of ['/reset-password#type=recovery', '/reset-password?type=recovery#access_token=forged&type=recovery']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'This reset link cannot be used' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);       // no way to set a password without the current one
  }
});

test('Account Settings: staff change their password after proving the current one', async ({ page, request }) => {
  await uiSignIn(page, ORIGINAL);
  await expect(page).not.toHaveURL(/\/login/);                       // sign-in finished
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Change password' });
  await form.getByLabel('Current password').fill('not-the-current-password');
  await form.getByLabel('New password', { exact: true }).fill(CHANGED_TO); await form.getByLabel('Confirm new password').fill(CHANGED_TO);
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(form.getByRole('alert')).toContainText('current password is incorrect');
  expect(await grant(request, CHANGED_TO)).toBe(400);

  await form.getByLabel('Current password').fill(ORIGINAL);
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(form.getByRole('status')).toContainText('Password changed');
  expect(await grant(request, ORIGINAL)).toBe(400);
  expect(await grant(request, CHANGED_TO)).toBe(200);
});
