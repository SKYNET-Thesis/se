import { expect, test, type Page } from '@playwright/test';

/**
 * Browser journey for direct staff account creation (real GoTrue harness, API with STAFF_TEMP_PASSWORD_ENABLED=true, SA_WITH_UI=1):
 * System Admin creates a School Administrator in the UI -> credentials shown once -> the new user signs in, is held on the password-change
 * page (direct URL, refresh and a fresh browser context cannot bypass it) -> changes the password -> reaches the School Admin workspace ->
 * creates an Instructor from the school page -> the temporary password no longer signs in.
 */
const run = Date.now().toString(36);
const ADMIN = { email: 'phase243-admin@vista.test', password: 'LocalFixturePass-admin!' };
const newAdminEmail = `ui.sa.${run}@vista.test`; const newPassword = `Perm-${run}-Ui9!aBcd`;
const orgName = `UI Accounts School ${run}`;
let tempPassword = '';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
test.describe.configure({ mode: 'serial' });

test('System Admin creates a School Administrator account and sees the credentials once', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/admin/organizations');
  await page.getByRole('button', { name: 'New organization' }).click();
  const create = page.getByRole('dialog', { name: 'New organization' });
  await create.getByLabel('Organization name').fill(orgName);
  await create.getByRole('button', { name: 'Create organization' }).click();
  const manage = page.getByRole('dialog', { name: orgName });
  await expect(manage).toBeVisible();
  await expect(manage.getByText('“Assign administrator” sends an e-mail invitation.')).toBeVisible();
  await manage.getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create School Administrator account' });
  await expect(dialog.getByRole('button', { name: 'Create account' })).toBeDisabled();
  await dialog.getByLabel('Full name').fill(`UI School Admin ${run}`);
  await dialog.getByLabel('E-mail (sign-in)').fill(newAdminEmail);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  const reveal = dialog.getByTestId('staff-credentials');
  await expect(reveal).toBeVisible();
  tempPassword = (await reveal.getByTestId('temporary-password').innerText()).trim();
  expect(tempPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
  await expect(reveal).toContainText('shown only once');
  await dialog.getByRole('button', { name: 'I have saved them' }).click();
  // listed as "Password change required", never "Active"; the password is not in the page any more
  await expect(manage.getByTestId('org-admin')).toContainText('Password change required');
  await expect(page.locator('body')).not.toContainText(tempPassword);
});

test('the new administrator is held on the password-change page: direct URL, refresh and a new browser context cannot bypass it', async ({ page, browser }) => {
  await signIn(page, newAdminEmail, tempPassword);
  await expect(page).toHaveURL(/\/student\/change-password$/);
  for (const url of ['/school', '/school/users', '/courses']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/student\/change-password$/);
  }
  await page.reload();
  await expect(page).toHaveURL(/\/student\/change-password$/);
  const other = await browser.newContext(); const fresh = await other.newPage();
  await signIn(fresh, newAdminEmail, tempPassword);
  await expect(fresh).toHaveURL(/\/student\/change-password$/);
  await fresh.goto('/school');
  await expect(fresh).toHaveURL(/\/student\/change-password$/);
  await other.close();
});

test('changing the password clears the gate; the temporary password stops working; the School Admin workspace opens and can create an Instructor', async ({ page, browser }) => {
  await signIn(page, newAdminEmail, tempPassword);
  await expect(page).toHaveURL(/\/student\/change-password$/);
  const form = page.getByRole('main');
  await form.locator('input[autocomplete="current-password"]').fill(tempPassword);
  await form.locator('input[autocomplete="new-password"]').first().fill(tempPassword);
  await form.locator('input[autocomplete="new-password"]').nth(1).fill(tempPassword);
  await expect(form.getByRole('button', { name: 'Update password' })).toBeDisabled(); // cannot keep the temporary password
  await form.locator('input[autocomplete="new-password"]').first().fill(newPassword);
  await form.locator('input[autocomplete="new-password"]').nth(1).fill(newPassword);
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(page).not.toHaveURL(/change-password/);
  await page.goto('/school/users');
  await expect(page).toHaveURL(/\/school\/users$/);
  await page.getByRole('button', { name: 'Create instructor account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Instructor account' });
  await dialog.getByLabel('Full name').fill(`UI Instructor ${run}`);
  await dialog.getByLabel('E-mail (sign-in)').fill(`ui.in.${run}@vista.test`);
  await dialog.getByLabel('Employee code').fill(`UI-${run}`);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.getByTestId('temporary-password')).toBeVisible();
  await dialog.getByRole('button', { name: 'I have saved them' }).click();
  // the old temporary password no longer signs in; the new one does
  const ctx = await browser.newContext(); const p2 = await ctx.newPage();
  await signIn(p2, newAdminEmail, tempPassword);
  await expect(p2).toHaveURL(/\/login/);
  await signIn(p2, newAdminEmail, newPassword);
  await expect(p2).not.toHaveURL(/\/login|change-password/);
  await ctx.close();
});
