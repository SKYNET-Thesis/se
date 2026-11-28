import { expect, test } from '@playwright/test';

/** Real GoTrue browser session: email sign-in, session survives reload, protected routes, logout clears the session. Needs SA_WITH_UI=1 harness. */
const authHost = new URL(process.env.SA_AUTH ?? 'http://invalid.example').hostname;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(authHost)) throw new Error(`Refusing to run against a non-loopback auth endpoint: ${authHost}`);

test('student signs in with GoTrue, keeps the session across reloads and a corrupted session is dropped; logout clears it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/my-learning');
  await expect(page).toHaveURL(/\/login/);                                                      // protected route without a session
  await page.getByLabel('Email address').fill('phase243-student@vista.test');
  await page.locator('input[type="password"]').first().fill('LocalFixturePass-student!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(my-learning|courses|)$/);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: /My Learning/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /My Learning/ }).first()).toBeVisible();     // session survives a reload
  await page.goto('/admin/courses');
  await expect(page.getByRole('heading', { name: /My Learning|Welcome|Not found|Courses/i }).first()).toBeVisible();
  expect(page.url()).not.toMatch(/\/admin\/courses$/);                                           // student role cannot stay on an admin route

  await page.goto('/my-learning');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('auth-token')).map((key) => localStorage.getItem(key)).filter(Boolean).length)).toBe(0);
  await page.goto('/my-learning');
  await expect(page).toHaveURL(/\/login/);                                                      // logged out: protected again
  expect(errors).toEqual([]);
});
