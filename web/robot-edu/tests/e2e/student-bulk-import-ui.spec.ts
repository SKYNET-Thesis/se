import { expect, test, type Browser, type Page } from '@playwright/test';
import { appendFileSync, readFileSync } from 'node:fs';

/**
 * System Administrator bulk student provisioning, in a real browser against the real Education API, real Supabase GoTrue and real PostgreSQL:
 * Student accounts → select school → upload .xlsx → preview → confirm → actual auth identities with generated temporary passwords → student login →
 * mandatory password change → dashboard. Synthetic students only. Credentials are written to the private secrets file (0600), never asserted in output.
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const API = env('SA_API'); const AUTH = env('SA_AUTH');
const anonKey = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon;
const secretsFile = env('SA_SECRETS_FILE');
const fixture = JSON.parse(readFileSync('/tmp/vista-phase243-fixture-int.json', 'utf8')) as { schoolId: string; otherSchoolId: string };
const run = Date.now().toString(36).toUpperCase();
const remember = (label: string, secret: string) => appendFileSync(secretsFile, `${label}\t${secret}\n`, { mode: 0o600 });
const ALIAS = /@students\.auth\.vista\.invalid/i;

/** A minimal STORED .xlsx (text cells only, optional raw cell XML) so the test controls the exact bytes uploaded. */
function xlsx(rows: string[][], rawCells: Record<string, string> = {}): Buffer {
  const cell = (c: number, r: number, v: string) => rawCells[`${c},${r}`] ?? `<c r="${String.fromCharCode(65 + c)}${r}" t="inlineStr"><is><t xml:space="preserve">${v.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`;
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, ri) => `<row r="${ri + 1}">${row.map((v, ci) => cell(ci, ri + 1, v)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const entries: Array<[string, string]> = [['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'], ['xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'], ['xl/worksheets/sheet1.xml', sheet]];
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name); const data = Buffer.from(text);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(nameBuf.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data); central.push(head, nameBuf); offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADER = ['first_name', 'last_name', 'student_code', 'grade_level'];

async function token(page: Page, who: string) {
  const email = { admin: 'phase243-admin@vista.test', schoolAdmin: 'phase243-school-admin@vista.test', instructor: 'phase243-instructor@vista.test', student: 'phase243-student@vista.test' }[who]!;
  const response = await page.request.post(`${AUTH}/token?grant_type=password`, { headers: { apikey: anonKey }, data: { email, password: `LocalFixturePass-${who}!` } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function signIn(page: Page, who: string) { const value = await token(page, who); await page.goto('/login'); await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('sb-127-auth-token', JSON.stringify(v)); }, value); await page.goto('/login'); return value.access_token as string; }
async function studentLogin(page: Page, schoolCode: string, studentCode: string, password: string) {
  await page.goto('/login'); await page.evaluate(() => localStorage.clear()); await page.goto('/login');
  await page.getByRole('tab', { name: 'Student Code' }).click();
  await page.locator('#login-school-code').fill(schoolCode); await page.locator('#login-student-code').fill(studentCode); await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
const freshPage = async (browser: Browser) => (await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })).newPage();
async function openImport(page: Page) {
  await signIn(page, 'admin');
  await page.goto('/');
  await page.getByRole('link', { name: 'Student accounts' }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await page.getByLabel('School').selectOption(fixture.schoolId);
  await expect(page.getByTestId('selected-school')).toContainText('Accounts will be created in');
  await page.getByRole('tab', { name: 'Students' }).waitFor();
}

test.describe.configure({ mode: 'serial' });
const codes = [`0${run}1`, `0${run}2`, `0${run}3`];   // leading zero preserved end to end
const temp: Record<string, string> = {}; let schoolCode = '';

test('System Admin imports an XLSX: preview validates every row (invalid, duplicate, Vietnamese, leading zeros), confirm creates real accounts with one-time passwords', async ({ page }) => {
  await openImport(page);
  const file = xlsx([HEADER, ['Học sinh', 'kiểm thử 01', codes[0], '10'], ['Nguyễn', 'Thị Mai', codes[1], '10'], ['Trần', 'Thiếu lớp', codes[2], ''], ['Lê', 'Trùng mã', codes[0], '10']]);
  await page.locator('input[aria-label="Upload CSV or XLSX"]').setInputFiles({ name: 'students.xlsx', mimeType: XLSX, buffer: file });
  const review = page.getByRole('dialog', { name: /Review student import/ });
  await expect(review).toBeVisible();
  await expect(review).toContainText('Học sinh kiểm thử 01');                       // Vietnamese preserved
  await expect(review).toContainText(codes[0]);                                    // leading zero preserved
  await expect(review.getByText('Ready', { exact: true }).first()).toBeVisible();
  await expect(review).toContainText(/Duplicate/);                                 // the repeated code in the file
  await expect(review).toContainText(/Needs review/);                              // the row without a grade level
  await page.screenshot({ path: `${process.env.SA_SHOTS ?? '/tmp'}/bulk-import-preview.png`, fullPage: true });
  expect(await page.getByRole('heading', { name: 'One-time temporary credentials' }).count()).toBe(0);   // preview created nothing
  await expect(review.getByRole('button', { name: 'Confirm import' })).toBeDisabled();            // a file with problems cannot be confirmed as a whole
  page.once('dialog', (native) => { expect(native.message()).toMatch(/Import only the 2 ready/); void native.accept(); });   // partial import needs an explicit confirmation
  await review.getByRole('button', { name: /Import 2 ready only/ }).click();
  await expect(review.getByRole('heading', { name: 'One-time temporary credentials' })).toBeVisible({ timeout: 30_000 });
  for (const code of [codes[0], codes[1]]) {
    const line = (await review.locator('p.font-mono', { hasText: code }).first().innerText()).split('·').map((part) => part.trim());
    expect(line[1]).toBe(code); expect(line[2].length).toBeGreaterThanOrEqual(32);
    schoolCode = line[0]; temp[code] = line[2]; remember(`bulk-temp:${code}`, line[2]);
  }
  expect(new Set(Object.values(temp)).size).toBe(2);                                // a different random password per student
  expect(await review.locator('p.font-mono', { hasText: codes[2] }).count()).toBe(0);   // the invalid row was not provisioned
  expect(schoolCode).toBeTruthy();
  expect(await page.locator('body').innerText()).not.toMatch(ALIAS);
  await review.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(temp[codes[0]])).toHaveCount(0);                      // credentials are not kept on the page
});

test('a workbook with a formula or a malformed file is refused at preview and cannot be confirmed', async ({ page }) => {
  await openImport(page);
  const formula = xlsx([HEADER, ['A', 'B', 'X1', '10']], { '0,2': '<c r="A2"><f>1+1</f><v>2</v></c>' });
  await page.locator('input[aria-label="Upload CSV or XLSX"]').setInputFiles({ name: 'formula.xlsx', mimeType: XLSX, buffer: formula });
  const review = page.getByRole('dialog', { name: /Review student import/ });
  await expect(review).toContainText(/formulas/i);
  await expect(review.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
  await review.getByRole('button', { name: /Close|Cancel/ }).first().click().catch(() => undefined);
  await page.locator('input[aria-label="Upload CSV or XLSX"]').setInputFiles({ name: 'broken.xlsx', mimeType: XLSX, buffer: Buffer.from('this is not a workbook') });
  await expect(page.getByRole('dialog', { name: /Review student import/ })).toContainText(/valid XLSX|could not be read/i);
});

test('re-importing the same file creates no duplicate account and never overwrites a password; CSV import works too', async ({ page, browser }) => {
  await openImport(page);
  const file = xlsx([HEADER, ['Học sinh', 'kiểm thử 01', codes[0], '10'], ['Nguyễn', 'Thị Mai', codes[1], '10']]);
  await page.locator('input[aria-label="Upload CSV or XLSX"]').setInputFiles({ name: 'again.xlsx', mimeType: XLSX, buffer: file });
  const review = page.getByRole('dialog', { name: /Review student import/ });
  await expect(review).toBeVisible();
  const confirm = review.getByRole('button', { name: 'Confirm import' });
  if (await confirm.isEnabled()) await confirm.click();
  await expect(review.getByRole('heading', { name: 'One-time temporary credentials' })).toHaveCount(0);   // nothing new was issued
  await expect(review).toContainText(/already|unchanged|Duplicate/i);
  await review.getByRole('button', { name: /Done|Close/ }).first().click().catch(() => undefined);
  // the original temporary password still works: it was not overwritten
  const checkPage = await freshPage(browser);
  await studentLogin(checkPage, schoolCode, codes[1], temp[codes[1]]);
  await expect(checkPage).toHaveURL(/\/student\/change-password$/);
  // CSV through the same UI creates a new account
  await openImport(page);
  const csvCode = `0${run}9`;
  await page.locator('input[aria-label="Upload CSV or XLSX"]').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(`${HEADER.join(',')}\nĐặng,Văn Một,${csvCode},11\n`) });
  const csvReview = page.getByRole('dialog', { name: /Review student import/ });
  await csvReview.getByRole('button', { name: 'Confirm import' }).click();
  await expect(csvReview.getByRole('heading', { name: 'One-time temporary credentials' })).toBeVisible({ timeout: 30_000 });
  const line = (await csvReview.locator('p.font-mono', { hasText: csvCode }).first().innerText()).split('·').map((part) => part.trim());
  expect(line[2].length).toBeGreaterThanOrEqual(32); remember(`bulk-csv-temp:${csvCode}`, line[2]);
});

test('authorization: other schools, instructors and students cannot parse, import or open the page', async ({ page }) => {
  const schoolAdmin = await signIn(page, 'schoolAdmin');
  const csv = Buffer.from(`${HEADER.join(',')}\nA,B,Z${run},10\n`).toString('base64');
  const call = (tok: string, org: string) => page.request.post(`${API}/education-admin/organizations/${org}/user-imports/parse-file`, { headers: { Authorization: `Bearer ${tok}` }, data: { fileName: 'a.csv', contentBase64: csv } });
  expect((await call(schoolAdmin, fixture.schoolId)).status()).toBe(201);          // own organization
  expect((await call(schoolAdmin, fixture.otherSchoolId)).status()).toBe(404);     // another organization: refused server-side, whatever the spreadsheet says
  const importOther = await page.request.post(`${API}/education-admin/organizations/${fixture.otherSchoolId}/user-imports`, { headers: { Authorization: `Bearer ${schoolAdmin}` }, data: { kind: 'students', rows: [{ firstName: 'A', lastName: 'B', studentCode: `Q${run}`, gradeLevel: '10' }] } });
  expect([403, 404]).toContain(importOther.status());
  expect((await call(await signIn(page, 'instructor'), fixture.schoolId)).status()).toBe(404);
  const studentToken = await signIn(page, 'student');
  expect((await call(studentToken, fixture.schoolId)).status()).toBe(404);
  await page.goto('/admin/students');
  await expect(page.getByRole('heading', { name: 'Student accounts' })).toHaveCount(0);   // role guard: the page never renders for a student
});

test('first login of an imported student: held on the password-change page, no deep-link bypass, change works, old password rejected, new one accepted', async ({ browser }) => {
  const page = await freshPage(browser);
  const code = codes[0];
  await studentLogin(page, schoolCode, code, temp[code]);
  await expect(page).toHaveURL(/\/student\/change-password$/);
  for (const path of ['/courses', '/my-learning']) { await page.goto(path); await expect(page).toHaveURL(/\/student\/change-password$/, { timeout: 15_000 }); }
  await page.reload();
  await expect(page).toHaveURL(/\/student\/change-password$/);
  const form = page.getByRole('main');
  const newPassword = `Bulk-Changed-${run}-Passw0rd!`; remember(`bulk-new:${code}`, newPassword);
  await form.locator('input[autocomplete="current-password"]').fill(temp[code]);
  await form.locator('input[autocomplete="new-password"]').first().fill(newPassword);
  await form.locator('input[autocomplete="new-password"]').nth(1).fill(newPassword);
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/my-learning$/);
  await expect(page.getByRole('heading', { name: /My Learning/ }).first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(ALIAS);
  await page.screenshot({ path: `${process.env.SA_SHOTS ?? '/tmp'}/bulk-import-first-login-dashboard.png`, fullPage: true });
  await page.evaluate(() => localStorage.clear());
  await studentLogin(page, schoolCode, code, temp[code]);
  await expect(page.getByRole('alert')).toBeVisible();                              // the temporary password no longer works
  await studentLogin(page, schoolCode, code, newPassword);
  await expect(page).not.toHaveURL(/change-password/);
});

test('School Admin imports an XLSX into their own school through the same pipeline', async ({ browser }) => {
  const page = await freshPage(browser);
  await signIn(page, 'schoolAdmin');
  await page.goto('/school/import');
  await page.getByRole('tab', { name: 'Students' }).click();
  const code = `0${run}8`;
  await page.locator('input[aria-label="Upload CSV or XLSX"]').setInputFiles({ name: 'school-admin.xlsx', mimeType: XLSX, buffer: xlsx([HEADER, ['Phạm', 'Thị Hoa', code, '9']]) });
  const review = page.getByRole('dialog', { name: /Review student import/ });
  await expect(review).toContainText('Phạm Thị Hoa');
  await review.getByRole('button', { name: 'Confirm import' }).click();
  await expect(review.getByRole('heading', { name: 'One-time temporary credentials' })).toBeVisible({ timeout: 30_000 });
  const line = (await review.locator('p.font-mono', { hasText: code }).first().innerText()).split('·').map((part) => part.trim());
  expect(line[2].length).toBeGreaterThanOrEqual(32); remember(`bulk-school-admin-temp:${code}`, line[2]);
});
