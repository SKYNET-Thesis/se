import { expect, test, type Page } from '@playwright/test';

/**
 * Public website (signed out): homepage content and navigation, honest Desktop download area, no broken same-origin links or assets,
 * responsive layout, no console errors, public entry points. Real browser against the real dev server; nothing is mocked.
 */
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];

async function collect(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => { if (new URL(request.url()).origin === new URL(page.url() === 'about:blank' ? 'http://127.0.0.1' : page.url()).origin) problems.push(`failed: ${request.url()}`); });
  page.on('response', (response) => { const url = new URL(response.url()); if (url.hostname === '127.0.0.1' && response.status() >= 400 && !url.pathname.startsWith('/api')) problems.push(`${response.status()} ${url.pathname}`); });
  return problems;
}

test('homepage renders its chapters, navigation anchors resolve and the page raises no errors', async ({ page }) => {
  const problems = await collect(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page).toHaveTitle(/VISTA/);
  // every in-page navigation anchor points at an element that exists
  const anchors = await page.locator('header a[href^="#"], nav a[href^="#"]').evaluateAll((nodes) => [...new Set(nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')!))]);
  expect(anchors.length).toBeGreaterThan(3);
  for (const href of anchors) { if (href !== '#top') await expect(page.locator(href), `anchor ${href}`).toHaveCount(1); }
  // every internal route linked from the homepage renders (no dead links); external links open safely
  const internal = await page.locator('a[href^="/"]').evaluateAll((nodes) => [...new Set(nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')!))]);
  for (const href of internal) { const response = await page.request.get(href); expect(response.status(), `link ${href}`).toBe(200); }
  const blank = await page.locator('a[target="_blank"]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).rel));
  for (const rel of blank) expect(rel).toMatch(/noopener/);
  // images that are present have loaded
  const broken = await page.locator('img').evaluateAll((nodes) => (nodes as HTMLImageElement[]).filter((image) => image.complete && image.naturalWidth === 0 && image.currentSrc).map((image) => image.currentSrc));
  expect(broken).toEqual([]);
  expect(problems).toEqual([]);
});

test('entry points: Sign in leads to the sign-in page; there is no public self-registration; protected routes send visitors to sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href="/register"], a[href="/signup"]')).toHaveCount(0);       // accounts are created by administrators, never self-registered
  const cta = page.locator('a[href="/login"]').first();
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /Enter VISTA/ })).toBeVisible();
  for (const path of ['/courses', '/my-learning', '/admin/courses', '/teacher', '/school', '/lab', '/studio']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
  await page.goto('/this-route-does-not-exist');
  await expect(page).toHaveURL(/\/login/);
});

test('Desktop download area: verified Ubuntu amd64 DEB is downloadable, Windows/macOS Coming Soon, no AppImage', async ({ page }) => {
  const DEB = 'https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb';
  await page.goto('/#v2-download');
  const section = page.locator('#v2-download');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading', { name: 'Download VISTA Desktop' })).toBeVisible();
  const tabs = section.getByRole('tablist', { name: 'Installation options' });
  await expect(tabs.getByRole('tab')).toHaveCount(3);
  // Ubuntu: active direct download with version and size; Windows and macOS: two disabled "Coming Soon" buttons
  const download = section.getByRole('link', { name: 'Download DEB' });
  await expect(download).toHaveCount(1);
  await expect(download).toHaveAttribute('href', DEB);
  await expect(section).toContainText('v0.1.0');
  await expect(section).toContainText('131,395,882 bytes');
  await expect(section.getByRole('button', { name: 'Download unavailable' })).toHaveCount(0);
  const soon = section.getByRole('button', { name: 'Coming Soon' });
  await expect(soon).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) await expect(soon.nth(index)).toBeDisabled();
  await expect(section).not.toContainText(/appimage(?! )/i);
  // the only installer link on the page is that single verified DEB
  const links = await page.locator('a[href]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href));
  expect(links.filter((href) => /\.(exe|dmg|pkg|msi|deb|rpm|appimage|zip|tar\.gz)(\?|$)/i.test(href))).toEqual([DEB]);
  // terminal installation, checksum and launch commands; Copy is enabled
  await tabs.getByRole('tab', { name: /Command/i }).click();
  const panel = section.getByRole('tabpanel');
  await expect(panel).toContainText(`curl -fL "${DEB}" -o /tmp/vista-lab-station.deb`);
  await expect(panel).toContainText('a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4');
  await expect(panel).toContainText('sudo apt install /tmp/vista-lab-station.deb');
  await expect(panel).toContainText('gtk-launch vista-lab-station');
  for (const copy of await section.getByRole('button', { name: /^Copy command/ }).all()) await expect(copy).toBeEnabled();
  await tabs.getByRole('tab', { name: /Guide/i }).click();
  await expect(section.getByRole('tabpanel')).toContainText(/Ubuntu/);
  await tabs.getByRole('tab', { name: /Apps/i }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { selected: true })).toHaveCount(1);
});

for (const viewport of VIEWPORTS) {
  test(`homepage and sign-in fit a ${viewport.width}px screen without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const path of ['/', '/login', '/forgot-password']) {
      await page.goto(path);
      await expect(page.locator('main, h1').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  });
}
