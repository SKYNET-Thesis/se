import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Mobile and tablet navigation carries the account controls: identity, Account Settings and Logout. Real browser, real API; desktop is unchanged. */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { users: Record<string, { authUserId: string }> };
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function signIn(page: Page, who: string) {
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json();
  await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
}
const storedSession = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('auth-token')).map((k) => localStorage.getItem(k)).filter(Boolean).length);

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1100 }]] as const) {
  for (const who of ['student', 'instructor', 'schoolAdmin'] as const) {
    test(`${who} on a ${label}: the navigation drawer shows account controls and Logout ends the session`, async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await signIn(page, who);
      await page.goto(who === 'student' ? '/my-learning' : who === 'instructor' ? '/teacher' : '/school');
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Account menu' })).toBeHidden();               // the desktop header menu is not reachable here
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const drawer = page.getByRole('dialog', { name: 'Navigation' });
      await expect(drawer).toBeVisible();
      await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();
      const account = drawer.getByRole('region', { name: 'Account' });
      await expect(account).toContainText('@');                                                      // identity is shown
      await account.getByRole('link', { name: 'Account Settings' }).click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('dialog', { name: 'Navigation' }).getByRole('button', { name: 'Logout' }).click();
      await expect(page).toHaveURL(/\/login/);
      expect(await storedSession(page)).toBe(0);
      await page.goto('/my-learning');
      await expect(page).toHaveURL(/\/login/);                                                       // the session is really gone
      expect(errors).toEqual([]);
    });
  }
}

test('Escape closes the drawer and returns focus to the menu button; desktop keeps its account menu and shows no drawer controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'student');
  await page.goto('/my-learning');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});
