import { expect, test, type Page } from '@playwright/test';

/**
 * Homepage "One lesson, five steps": the real SO-101 3D Preview. In a real browser (software GL here; the same checks pass on a GPU) the
 * shared canvas must show the arm inside the Preview window, play lesson one step by step, answer Play/Pause/Reset and the orbit
 * controls, lose no WebGL context, log no console errors, and say it is a simulation. Public page: no API or sign-in involved.
 */
const GL_ARGS = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', ...(process.env.VISTA_E2E_CHROMIUM_ARGS ?? '').split(' ').filter(Boolean)];
test.use({ launchOptions: { executablePath: process.env.VISTA_E2E_CHROMIUM_PATH ?? '/usr/bin/google-chrome', args: GL_ARGS } });

type Hooked = { __ctx?: { lost: number } };
async function open(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
  await page.addInitScript(() => {
    const ctx = { lost: 0 }; (window as unknown as Hooked).__ctx = ctx;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function hooked(this: HTMLCanvasElement, ...args: unknown[]) {
      const c = (original as (...a: unknown[]) => unknown).apply(this, args);
      if (!(this as unknown as { __h?: boolean }).__h) { (this as unknown as { __h?: boolean }).__h = true; this.addEventListener('webglcontextlost', () => { ctx.lost += 1; }); }
      return c;
    } as typeof original;
  });
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('[data-stage-status]')?.getAttribute('data-stage-status') === 'ready', null, { timeout: 90_000 });
  await page.evaluate(() => document.getElementById('v2-journey')?.scrollIntoView());
  return problems;
}
const jaw = (page: Page) => page.getByTestId('journey-jaw');
const scene = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __labScene: { userOrbit: { azimuth: number; elevation: number }; renderer: { info: { render: { triangles: number; calls: number } } } } }).__labScene;
  return { orbit: s.userOrbit, triangles: s.renderer.info.render.triangles, calls: s.renderer.info.render.calls };
});

test.describe('Homepage SO-101 3D Preview', () => {
  test('desktop: the real arm is drawn in the Preview window, plays lesson one, and the controls work', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const problems = await open(page);

    // the five stages, in order, each with its own panel
    await expect(page.locator('#v2-journey').getByRole('tab')).toHaveText(['Learn', 'Program', 'Preview', 'Evaluate', 'Reflect']);
    for (const [i, heading] of [[0, /Mission briefing/], [1, /block programming/i], [3, /Validation checklist/], [4, /Outcomes/]] as const) {
      await page.locator('#v2-journey').getByRole('tab').nth(i).click();
      await expect(page.locator('#v2-journey').getByRole('tabpanel')).toContainText(heading);
    }

    // Preview: simulation-only label, the arm is drawn (triangles), and the playback runs to the closed gripper
    await page.locator('#v2-journey').getByRole('tab').nth(2).click();
    await expect(page.getByTestId('sim-only')).toContainText('Simulation only');
    await expect(page.getByTestId('journey-orbit')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await scene(page)).triangles, { timeout: 20_000 }).toBeGreaterThan(10_000);
    const window = page.locator('[data-scene="x-journey"] [data-stage-window]');
    const box = (await window.boundingBox())!;
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height * 0.7 };
    await expect(jaw(page)).toHaveText(/open/);
    const before = await page.screenshot({ clip });
    await expect(jaw(page)).toHaveText(/closed/, { timeout: 30_000 });                    // autoplay reaches "close gripper"
    await expect(page.getByTestId('journey-note')).toContainText('gripper.close');
    expect((await page.screenshot({ clip })).equals(before)).toBe(false);                 // the picture changed: the arm moved, it is not a static image

    // Reset returns to the start; Play runs again; Pause holds the step
    await page.locator('#v2-journey').getByRole('button', { name: 'Reset to the start' }).click();
    await expect(page.getByTestId('journey-note')).toContainText('Press play');
    await expect(jaw(page)).toHaveText(/open/);
    await page.locator('#v2-journey').getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('#v2-journey').getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.locator('#v2-journey').getByRole('button', { name: 'Pause' }).click();
    const held = await page.getByTestId('journey-note').textContent();
    await page.waitForTimeout(2200);
    expect(await page.getByTestId('journey-note').textContent()).toBe(held);
    await page.locator('#v2-journey').getByRole('button', { name: 'Step 4: close gripper' }).click();
    await expect(jaw(page)).toHaveText(/closed/);

    // Orbit by keyboard and drag; Reset view restores the camera
    const orbit = page.getByTestId('journey-orbit');
    await orbit.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    expect((await scene(page)).orbit.azimuth).toBeGreaterThan(0.1);
    const c = (await orbit.boundingBox())!;
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down(); await page.mouse.move(c.x + c.width / 2 - 80, c.y + c.height / 2, { steps: 6 }); await page.mouse.up();
    await expect.poll(async () => (await scene(page)).orbit.azimuth, { timeout: 5000 }).toBeGreaterThan(0.5);
    await page.locator('#v2-journey').getByRole('button', { name: 'Reset view' }).click();
    await expect.poll(async () => Math.abs((await scene(page)).orbit.azimuth), { timeout: 5000 }).toBeLessThan(0.001);

    // the page stayed healthy
    expect(await page.evaluate(() => (window as unknown as Hooked).__ctx?.lost)).toBe(0);
    expect(problems).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('preview-desktop.png') });
  });

  test('phone: the five stages fit the width, the Preview shows the arm and its controls are reachable', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const problems = await open(page);
    await page.locator('#v2-journey').getByRole('tab').nth(2).click();
    await expect(page.getByTestId('sim-only')).toBeVisible();
    await expect(page.locator('#v2-journey').getByRole('button', { name: 'Reset view' })).toBeVisible();
    await expect.poll(async () => (await scene(page)).triangles, { timeout: 30_000 }).toBeGreaterThan(10_000);
    await expect(jaw(page)).toHaveText(/closed/, { timeout: 40_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Play', 'Reset to the start', 'Reset view']) {
      const b = (await page.locator('#v2-journey').getByRole('button', { name }).first().boundingBox());
      if (b) { expect(b.width).toBeGreaterThanOrEqual(40); expect(b.height).toBeGreaterThanOrEqual(40); }
    }
    for (const i of [0, 1, 3, 4]) { await page.locator('#v2-journey').getByRole('tab').nth(i).click(); await expect(page.locator('#v2-journey').getByRole('tabpanel')).toBeVisible(); }
    expect(problems).toEqual([]);
  });
});
