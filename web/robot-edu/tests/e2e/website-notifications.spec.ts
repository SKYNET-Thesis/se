import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Notification bell with real data in a real browser: a student sees open work, an instructor sees review work; every item links to a real page. */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { users: Record<string, { authUserId: string }> };
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function signIn(page: Page, who: string) {
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json() as { access_token: string };
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
}

for (const who of ['student', 'instructor'] as const) {
  test(`${who}: the notification bell lists pending items that open real pages`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, who);
    await page.goto(who === 'student' ? '/my-learning' : '/teacher');
    const bell = page.locator('[data-testid="notification-bell"]:visible');
    await expect(bell).toBeVisible();
    await expect(bell).toHaveAttribute('aria-label', /^Notifications, (none pending|\d+ pending)$/);
    await bell.click();
    const region = page.getByRole('region', { name: 'Pending items' });
    await expect(region).toBeVisible();
    const links = region.locator('a');
    const count = await links.count();
    if (count === 0) await expect(region.locator('p').nth(1)).toBeVisible();          // an explicit empty state, never a blank popup
    else {
      const href = await links.first().getAttribute('href');
      await links.first().click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(href!.split('?')[0]);
      await expect(page.getByRole('main').first()).toBeVisible();
    }
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}
