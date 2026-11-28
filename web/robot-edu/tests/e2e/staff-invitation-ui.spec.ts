import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * E-mail invitation acceptance against REAL GoTrue (harness, SA_WITH_UI=1). The e-mail itself cannot be delivered locally, so the link is produced through GoTrue's admin API
 * exactly as the invitation e-mail would carry it (same /verify?token&type=invite URL). Covers ACCT-14/15 (invitation, password establishment, activation), ACCT-21 (reused and
 * forged links) and that an invitation does NOT additionally force the first-login change (the password chosen on the invitation page satisfies it).
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const API = env('SA_API'); const AUTH = env('SA_AUTH'); const DB = env('VISTA_E2E_ADMIN_DATABASE_URL');
for (const url of [API, AUTH]) if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Refusing to run against a non-loopback endpoint.');
const anon = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon;
const service = readFileSync(env('SA_SERVICE_KEY_FILE'), 'utf8').trim();
const ORG = 'f2430000-0000-4000-8000-000000000200';
const run = Date.now().toString(36); const email = `invite.sa.${run}@vista.test`; const password = `Invited-${run}-Pass9!x`;
const psql = (sql: string) => execFileSync('psql', [DB, '-Atqc', sql], { encoding: 'utf8' }).trim();
let link = '';

test.describe.configure({ mode: 'serial' });

test('System Admin invites a School Admin; the real invitation link opens the password page, the password is set, the account becomes Active and the workspace opens', async ({ page, request, browser }) => {
  const login = await request.post(`${AUTH}/token?grant_type=password`, { headers: { apikey: anon, 'X-Forwarded-For': '10.60.0.1' }, data: { email: 'phase243-admin@vista.test', password: 'LocalFixturePass-admin!' } });
  const token = ((await login.json()) as { access_token: string }).access_token;
  const invited = await request.post(`${API}/education-admin/organizations/${ORG}/accounts`, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': '10.60.0.1' }, data: { method: 'invite', role: 'school_admin', fullName: `Invited Admin ${run}`, email } });
  expect(invited.status(), await invited.text()).toBe(201);
  expect(psql(`select status||':'||password_change_required from public.users where email='${email}'`)).toBe('invited:false');   // Pending invitation, not Active, not restricted

  const gen = await request.post(`${AUTH}/admin/generate_link`, { headers: { apikey: service, Authorization: `Bearer ${service}` }, data: { type: 'invite', email, redirect_to: 'http://127.0.0.1:4173/accept-invitation' } });
  expect(gen.ok(), await gen.text()).toBeTruthy(); link = ((await gen.json()) as { action_link: string }).action_link;
  expect(link).toContain('type=invite'); expect(link).not.toContain('localhost:3000');

  await page.goto(link);
  await expect(page).toHaveURL(/\/accept-invitation/);
  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Set password and continue' });
  await expect(submit).toBeDisabled();
  await page.locator('input[autocomplete="new-password"]').first().fill(password);
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(`${password}-different`);
  await expect(submit).toBeDisabled();                                    // Confirm Password must match
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(password);
  await submit.click();
  await expect(page).not.toHaveURL(/accept-invitation|login/);
  expect(psql(`select status||':'||(email_verified_at is not null)::text||':'||password_change_required from public.users where email='${email}'`)).toBe('active:true:false');

  // the invitation link is single use
  const again = await browser.newContext(); const p2 = await again.newPage();
  await p2.goto(link);
  await expect(p2.getByRole('heading', { name: /expired or was already used|cannot be used/ })).toBeVisible();
  await expect(p2.locator('input[type="password"]')).toHaveCount(0);
  await again.close();
});

test('the chosen password works for a normal sign-in and reaches the School Admin workspace without a second forced change', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/login|change-password/);
  await page.goto('/school');
  await expect(page).toHaveURL(/\/school$/);
});

test('a forged invitation fragment or a direct visit never shows the password form', async ({ browser }) => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto('/accept-invitation#access_token=forged.token.value&refresh_token=x&type=invite');
  await expect(p.getByRole('heading', { name: 'This invitation link cannot be used' })).toBeVisible();
  await p.goto('/accept-invitation');
  await expect(p.locator('input[type="password"]')).toHaveCount(0);
  await ctx.close();
});
