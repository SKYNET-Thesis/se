import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, readFileSync } from 'node:fs';

/**
 * Student Temporary Password — browser journeys against the real Education API, real Supabase GoTrue and real PostgreSQL:
 * School Admin imports students in the UI and receives one-time credentials; the student signs in, is held on the mandatory
 * password-change page, changes the password and lands in the LMS; admin reissue from the user list.
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const API = env('SA_API'); const AUTH = env('SA_AUTH');
const anonKey = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon;
const secretsFile = env('SA_SECRETS_FILE');
const run = Date.now().toString(36).toUpperCase();
const remember = (label: string, secret: string) => appendFileSync(secretsFile, `${label}\t${secret}\n`, { mode: 0o600 });
const ALIAS = /@students\.auth\.vista\.invalid/i;

async function signInAdmin(page: Page) {
  const response = await page.request.post(`${AUTH}/token?grant_type=password`, { headers: { apikey: anonKey }, data: { email: 'phase243-school-admin@vista.test', password: 'LocalFixturePass-schoolAdmin!' } });
  expect(response.ok()).toBeTruthy();
  const value = await response.json();
  await page.goto('/login');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
}
async function studentLogin(page: Page, schoolCode: string, studentCode: string, password: string) {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Student Code' }).click();
  await page.locator('#login-school-code').fill(schoolCode);
  await page.locator('#login-student-code').fill(studentCode);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe.configure({ mode: 'serial' });

const codes = [`UI-${run}-1`, `UI-${run}-2`];
const temp: Record<string, string> = {}; let schoolCode = '';

test('School Admin imports students in the UI and receives one-time temporary credentials', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/school/import');
  await page.getByRole('tab', { name: 'Students' }).click();
  const csv = ['first_name,last_name,student_code,grade_level,email,guardian_email', `Ui,One,TP-${codes[0]},7,,`, `Ui,Two,TP-${codes[1]},7,,`].join('\n') + '\n';
  codes[0] = `TP-${codes[0]}`; codes[1] = `TP-${codes[1]}`;
  await page.locator('input[aria-label="Upload CSV or XLSX"]').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  const review = page.getByRole('dialog', { name: /Review student import/ });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Confirm import' }).click();
  await expect(review.getByRole('heading', { name: 'One-time temporary credentials' })).toBeVisible();
  for (const code of codes) {
    const line = (await review.locator('p.font-mono', { hasText: code }).first().innerText()).split('·').map((part) => part.trim());
    expect(line[1]).toBe(code); expect(line[2].length).toBeGreaterThanOrEqual(32);
    schoolCode = line[0]; temp[code] = line[2]; remember(`ui-temp:${code}`, line[2]);
  }
  expect(schoolCode).toBeTruthy();
  await expect(review.getByRole('button', { name: 'Copy all credentials' })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(ALIAS);
  // credentials are held only while the result is open
  await review.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(temp[codes[0]])).toHaveCount(0);
});

test('Student signs in with the temporary password, is held on the password-change page, changes it and enters My Learning', async ({ page }) => {
  await studentLogin(page, schoolCode, codes[0], temp[codes[0]]);
  await expect(page).toHaveURL(/\/student\/change-password$/);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  const form = page.getByRole('main');
  const fill = async (current: string, next: string, confirm: string) => {
    await form.locator('input[autocomplete="current-password"]').fill(current); await form.locator('input[autocomplete="new-password"]').first().fill(next); await form.locator('input[autocomplete="new-password"]').nth(1).fill(confirm);
  };
  // live policy feedback: nothing is sent, and Update password stays disabled until every real rule is met
  const update = form.getByRole('button', { name: 'Update password' });
  const match = form.locator('[data-state]');
  await fill(temp[codes[0]], 'short', 'short');
  expect(await form.locator('input[autocomplete="new-password"]').first().evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true); // 12-character minimum
  await expect(update).toBeDisabled();
  await expect(form.getByRole('list', { name: 'Password requirements' })).toContainText('At least 12 characters');
  await fill(temp[codes[0]], 'A-valid-new-Passw0rd', 'A-different-Passw0rd');
  await expect(match).toHaveAttribute('data-state', 'mismatch'); await expect(match).toContainText('Passwords do not match');
  await expect(update).toBeDisabled();
  await form.locator('input[autocomplete="new-password"]').nth(1).fill('A-valid-new-Passw0rd');
  await expect(match).toHaveAttribute('data-state', 'match'); await expect(match).toContainText('Passwords match');
  await form.locator('input[autocomplete="new-password"]').first().fill('A-valid-new-Passw0rd!');                   // changing the original revalidates the confirmation
  await expect(match).toHaveAttribute('data-state', 'mismatch');
  await fill(temp[codes[0]], temp[codes[0]], temp[codes[0]]);
  await expect(update).toBeDisabled();                                                                              // must differ from the temporary password
  await page.screenshot({ path: `${process.env.SA_SHOTS ?? '/tmp'}/password-change-mismatch.png`, fullPage: true });
  await fill('not-the-temporary-password', 'A-valid-new-Passw0rd', 'A-valid-new-Passw0rd');
  await expect(update).toBeEnabled(); await update.click();
  await expect(page.getByRole('alert')).toContainText(/incorrect|rejected|failed/i);                                 // backend refusal is shown, entered values are kept
  await expect(page).toHaveURL(/\/student\/change-password$/);

  const newPassword = `Ui-Changed-${run}-Passw0rd!`; remember(`ui-new:${codes[0]}`, newPassword);
  await fill(temp[codes[0]], newPassword, newPassword);
  await update.click();
  await expect(page).toHaveURL(/\/my-learning$/);
  await expect(page.getByRole('heading', { name: /My Learning/ }).first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(ALIAS);
  // the replacement session survives a reload and reaches the dashboard and courses
  await page.reload();
  await expect(page).toHaveURL(/\/my-learning$/);
  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: /Welcome back|Your courses|Courses/ }).first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(ALIAS);
  temp[`${codes[0]}:new`] = newPassword;

  // signing out and back in with the new password goes straight to the LMS; the temporary password is refused
  await page.evaluate(() => localStorage.clear());
  await studentLogin(page, schoolCode, codes[0], temp[codes[0]]);
  await expect(page.getByRole('alert')).toBeVisible();
  await studentLogin(page, schoolCode, codes[0], newPassword);
  await expect(page).not.toHaveURL(/change-password/);
  await expect(page).toHaveURL(/\/(my-learning|courses|)$/);
});

test('A restricted first-login session cannot reach the LMS by deep link; the app sends it back to the password-change page', async ({ page }) => {
  await studentLogin(page, schoolCode, codes[1], temp[codes[1]]);
  await expect(page).toHaveURL(/\/student\/change-password$/);
  for (const path of ['/courses', '/my-learning', '/assignments']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/student\/change-password$/, { timeout: 15_000 });
  }
});

test('School Admin reissues a temporary password from the user list; it is shown once, the old one stops working, the student is forced to change again', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/school/users');
  await page.getByRole('textbox', { name: 'Search people' }).fill(codes[1]);
  const studentRow = page.getByRole('row').filter({ hasText: codes[1] });
  await expect(studentRow).toBeVisible({ timeout: 20_000 });
  page.once('dialog', (native) => { expect(native.message()).toMatch(/invalidates the current temporary password/); void native.accept(); });
  await studentRow.getByRole('button', { name: /Reissue temporary password/ }).click();
  const dialog = page.getByRole('dialog', { name: 'One-time temporary password' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const text = await dialog.innerText();
  const reissued = text.match(/[A-Za-z0-9_-]{32,}/)?.[0];
  expect(reissued, 'reissued password is displayed').toBeTruthy();
  remember(`ui-reissue:${codes[1]}`, reissued!);
  expect(reissued).not.toBe(temp[codes[1]]);
  expect(text).toMatch(/expires/i);
  expect(text).not.toMatch(ALIAS);

  await page.evaluate(() => localStorage.clear());
  await studentLogin(page, schoolCode, codes[1], temp[codes[1]]);
  await expect(page.getByRole('alert')).toBeVisible();
  await studentLogin(page, schoolCode, codes[1], reissued!);
  await expect(page).toHaveURL(/\/student\/change-password$/);
});

test('School Admin imports students into a classroom from the classroom page: a bad file cannot be confirmed, a good file previews, confirms, shows credentials once and updates the roster', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAdmin(page);
  const fixture = JSON.parse(readFileSync(env('VISTA_E2E_FIXTURE_FILE'), 'utf8')) as { classroomId: string };
  const roster = [`TP-CI-${run}-1`, `TP-CI-${run}-2`];
  const requests: string[] = [];
  page.on('request', (r) => { if (/student-imports/.test(r.url())) requests.push(`${r.method()} ${r.url()}`); });
  await page.goto(`/school/classrooms/${fixture.classroomId}`);
  await page.getByRole('button', { name: 'Import students' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Import students to classroom' });
  await expect(dialog).toBeVisible();

  // a file without the required columns is previewed as "Needs review" and cannot be confirmed: nothing is persisted
  await dialog.locator('input[aria-label="Upload classroom student CSV"]').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('first_name,last_name\nNo,Columns\n') });
  await expect(dialog.getByText('Needs review').first()).toBeVisible();
  await expect(dialog.getByText(/Student code is required/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
  expect(requests.filter((r) => /student-imports$/.test(r.split(' ')[1].split('?')[0]))).toEqual([]);     // no confirm request (only previews) was sent

  // back to the upload step, then a valid file: preview with the server, then confirm
  await dialog.getByRole('button', { name: 'Choose another file' }).click();
  const csv = ['first_name,last_name,student_code,grade_level,email,guardian_email', `Class,One,${roster[0]},7,,`, `Class,Two,${roster[1]},7,,`].join('\n') + '\n';
  await dialog.locator('input[aria-label="Upload classroom student CSV"]').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByText(roster[0]).first()).toBeVisible();
  expect(requests.filter((r) => r.startsWith('POST') && /preview/.test(r)).length).toBeGreaterThan(0);   // the server previewed it; nothing was persisted yet
  await dialog.getByRole('button', { name: 'Confirm import' }).click();
  await expect(dialog.getByRole('heading', { name: 'One-time temporary credentials' })).toBeVisible();
  for (const code of roster) {
    const line = (await dialog.locator('p.font-mono', { hasText: code }).first().innerText()).split('·').map((part) => part.trim());
    expect(line[2].length).toBeGreaterThanOrEqual(32); remember(`classroom-import:${code}`, line[2]);
  }
  expect(await page.locator('body').innerText()).not.toMatch(ALIAS);
  await dialog.getByRole('button', { name: 'Done' }).click();

  // the roster now lists both new students; the credentials are gone from the page
  await expect(page.getByText('Class One').first()).toBeVisible(); await expect(page.getByText('Class Two').first()).toBeVisible();
  await expect(page.getByText('One-time temporary credentials')).toHaveCount(0);
});
