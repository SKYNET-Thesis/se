import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, readFileSync } from 'node:fs';

/**
 * Student password reset (Recovery Code) and the full account lifecycle in the browser against REAL GoTrue:
 * School Admin adds a student -> first login with the temporary password -> mandatory change -> the student forgets the password ->
 * School Admin issues a one-time recovery code -> the student resets the password with it -> the old password and a reused/wrong code are refused.
 * Run with the student-auth harness: scripts/local_student_auth_harness.sh up; playwright test -c playwright.student-auth.config.ts (SA_WITH_UI=1).
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const AUTH = env('SA_AUTH'); const anonKey = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon; const secretsFile = env('SA_SECRETS_FILE');
const remember = (label: string, secret: string) => appendFileSync(secretsFile, `${label}\t${secret}\n`, { mode: 0o600 });
const run = Date.now().toString(36).toUpperCase();

async function signInSchoolAdmin(page: Page) {
  const response = await page.request.post(`${AUTH}/token?grant_type=password`, { headers: { apikey: anonKey }, data: { email: 'phase243-school-admin@vista.test', password: 'LocalFixturePass-schoolAdmin!' } });
  expect(response.ok()).toBeTruthy();
  await page.goto('/login'); await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), await response.json());
}
/** A signed-in browser is redirected away from /login, so every student action starts from a signed-out profile. */
async function signedOutLogin(page: Page) { await page.goto('/login'); await page.evaluate(() => localStorage.clear()); await page.goto('/login'); }
async function studentLogin(page: Page, schoolCode: string, studentCode: string, password: string) {
  await signedOutLogin(page); await page.getByRole('tab', { name: 'Student Code' }).click();
  await page.locator('#login-school-code').fill(schoolCode); await page.locator('#login-student-code').fill(studentCode); await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function recover(page: Page, schoolCode: string, studentCode: string, code: string, password: string) {
  await signedOutLogin(page); await page.getByRole('tab', { name: 'Student Code' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.locator('#login-school-code').fill(schoolCode); await page.locator('#login-student-code').fill(studentCode); await page.locator('#login-recovery-code').fill(code);
  await page.locator('#login-password').fill(password); await page.locator('#login-password-confirm').fill(password);
  await page.getByRole('button', { name: 'Reset password' }).click();
}

test('forgotten password: School Admin issues a one-time code, the student resets, old password and reused code are refused', async ({ page }) => {
  test.setTimeout(120_000);
  const studentCode = `RC-${run}`; const first = `First-Chosen-${run}-Passw0rd!`; const reset = `After-Reset-${run}-Passw0rd!`;
  // School Admin adds the student (UI) and reads the one-time temporary credentials
  await signInSchoolAdmin(page);
  await page.goto('/school/users'); await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Add student' }).click();
  const add = page.getByRole('dialog', { name: 'Add student' });
  await add.getByLabel('First name').fill('Recover'); await add.getByLabel('Last name').fill(`Student${run}`); await add.getByLabel('Student code').fill(studentCode); await add.getByLabel('Grade').fill('8');
  await add.getByRole('button', { name: 'Create student' }).click();
  await expect(add.getByText('Temporary password')).toBeVisible();
  const [schoolCode, shown, temporary] = await add.locator('p.font-mono').allTextContents();
  expect(shown).toBe(studentCode); remember(`rc-temp:${studentCode}`, temporary);
  await add.getByRole('button', { name: 'Done' }).click();
  // first login: held on the password-change page, then into the LMS
  await studentLogin(page, schoolCode, studentCode, temporary);
  await expect(page).toHaveURL(/\/student\/change-password$/);
  const form = page.getByRole('main');
  await form.locator('input[autocomplete="current-password"]').fill(temporary);
  await form.locator('input[autocomplete="new-password"]').first().fill(first); await form.locator('input[autocomplete="new-password"]').nth(1).fill(first);
  await form.getByRole('button', { name: 'Update password' }).click(); await expect(page).toHaveURL(/\/my-learning$/);
  remember(`rc-first:${studentCode}`, first);

  // the student forgot the password: wrong code first, then the real one-time code issued by the School Admin
  await page.evaluate(() => localStorage.clear());
  await recover(page, schoolCode, studentCode, 'definitely-not-the-code-0123456789', reset);
  await expect(page.getByRole('alert')).toBeVisible();
  await signInSchoolAdmin(page);
  await page.goto('/school/users'); await page.waitForLoadState('networkidle');
  await page.getByRole('textbox', { name: 'Search people' }).fill(studentCode);
  const row = page.getByRole('row').filter({ hasText: studentCode });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'Issue reset code' }).click();
  const dialog = page.getByRole('dialog', { name: 'Student password recovery' });
  await expect(dialog).toBeVisible();
  const code = (await dialog.locator('p.font-mono').innerText()).trim();
  expect(code.length).toBeGreaterThanOrEqual(20); remember(`rc-code:${studentCode}`, code);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(code)).toHaveCount(0);                    // shown once, not kept on the page

  await page.evaluate(() => localStorage.clear());
  await recover(page, schoolCode, studentCode, code, reset);
  await expect(page.getByText('Your password has been reset')).toBeVisible();
  remember(`rc-reset:${studentCode}`, reset);
  await studentLogin(page, schoolCode, studentCode, first);              // the old password no longer works
  await expect(page.getByRole('alert')).toBeVisible();
  await studentLogin(page, schoolCode, studentCode, reset);
  await expect(page).toHaveURL(/\/(my-learning|courses|)$/); await expect(page).not.toHaveURL(/change-password/);
  await page.evaluate(() => localStorage.clear());
  await recover(page, schoolCode, studentCode, code, `Another-${run}-Passw0rd!`);   // the code is single-use
  await expect(page.getByRole('alert')).toBeVisible();
  await studentLogin(page, schoolCode, studentCode, reset);               // and the reused code changed nothing
  await expect(page).not.toHaveURL(/\/login/);
});
