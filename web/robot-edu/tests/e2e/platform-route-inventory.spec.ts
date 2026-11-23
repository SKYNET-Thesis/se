import { expect, test, type Page } from '@playwright/test';
import { loadFixture, signIn } from './helpers/academic';

/**
 * Full-Web route inventory: (1) every navigation link a role can see leads to a real page (no dead route, no error screen, no horizontal
 * overflow) on desktop and mobile, and (2) the parametrised learner/instructor routes that other journeys only reach by clicking are
 * opened directly with real fixture ids. Real browser, real Education API, isolated PostgreSQL.
 */
const PLACEHOLDER = /lorem ipsum|coming soon|not implemented|todo:|under construction|\bundefined\b|\[object Object\]|\bNaN\b/i;
const ROLES = ['admin', 'schoolAdmin', 'instructor', 'student'] as const;

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ws:\/\/127\.0\.0\.1:8767|favicon|Failed to load resource: the server responded with a status of (401|403|404)/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return problems;
}

async function assertHealthy(page: Page, route: string, label: string) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await expect(page.locator('main, [role="main"]').first(), `${route} has a main region`).toBeVisible({ timeout: 20_000 });
  const text = await page.locator('main, [role="main"]').first().innerText();
  expect(text.trim().length, `${route} is not blank`).toBeGreaterThan(10);
  expect(PLACEHOLDER.test(text), `${route} contains placeholder text: ${text.match(PLACEHOLDER)?.[0]}`).toBe(false);
  expect(await page.getByText(/Page not found/i).count(), `${route} is a dead route (404 page)`).toBe(0);
  expect(await page.getByText(/something went wrong|unexpected error|Application error/i).count(), `${route} shows an error screen`).toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px at ${label}`).toBeLessThanOrEqual(1);
}

for (const role of ROLES) {
  for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]] as const) {
    test(`${role} ${label}: every navigation link leads to a real page`, async ({ page }) => {
      test.setTimeout(240_000);
      const fixture = await loadFixture(); await signIn(page, fixture, role); await page.setViewportSize(viewport);
      const problems = watch(page);
      await page.goto('/'); await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      // the dashboard redirect lands on the role's home; collect every in-app link rendered by the shell (sidebar on desktop, drawer on mobile)
      if (label === 'mobile') await page.getByRole('button', { name: /open (navigation|menu)|menu/i }).first().click().catch(() => undefined);
      const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('nav a[href^="/"], aside a[href^="/"], [role="dialog"] a[href^="/"]')].map((a) => (a as HTMLAnchorElement).getAttribute('href')!).filter((h) => !h.startsWith('//')))]);
      expect(hrefs.length, `${role} sees navigation links`).toBeGreaterThan(2);
      for (const href of hrefs) {
        await page.goto(href);
        await assertHealthy(page, href, label);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
}

test('legacy /digital-twin link lands on the Robot Lab that hosts the 3D twin', async ({ page }) => {
  const f = await loadFixture(); await signIn(page, f, 'student');
  await page.goto('/digital-twin'); await expect(page).toHaveURL(/\/lab$/);
  await expect(page.getByRole('heading', { name: /digital twin|3D/i }).first()).toBeVisible();
});

test.describe('parametrised routes opened directly', () => {
  test('student: course info, module, every activity type and the learner workflow load', async ({ page }) => {
    test.setTimeout(240_000);
    const f = await loadFixture() as Record<string, string> & Awaited<ReturnType<typeof loadFixture>>;
    await signIn(page, f, 'student'); const problems = watch(page);
    for (const route of [
      `/courses/${f.courseId}/info`, `/courses/${f.courseId}/lessons/${f.lessonId}`,
      `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.readingActivityId}`,
      `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.videoActivityId}`,
      `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.quizActivityId}`,
      '/learning-loop', '/lab', '/studio',
    ]) { await page.goto(route); await assertHealthy(page, route, 'desktop'); }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('instructor and administrators: classroom, challenge, lab and studio routes load', async ({ page }) => {
    test.setTimeout(240_000);
    const f = await loadFixture() as Record<string, string> & Awaited<ReturnType<typeof loadFixture>>;
    for (const [role, routes] of [
      ['instructor', [`/teacher/classes/${f.classroomId}`, '/teacher/challenges', '/lab', '/studio', `/courses/${f.courseId}/lessons/${f.lessonId}`]],
      ['schoolAdmin', [`/school/classrooms/${f.classroomId}`, '/lab', '/studio']],
      ['admin', ['/lab', '/studio', `/admin/courses/${f.courseId}`]],
    ] as const) {
      await signIn(page, f, role); const problems = watch(page);
      for (const route of routes) { await page.goto(route); await assertHealthy(page, route, 'desktop'); }
      expect(problems, `${role}: ${problems.join('\n')}`).toEqual([]);
    }
  });

  test('public recovery pages render honest states without a session', async ({ page }) => {
    const problems = watch(page);
    for (const route of ['/login', '/forgot-password', '/reset-password']) {
      await page.goto(route); await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      const text = await page.locator('body').innerText();
      expect(text.trim().length, `${route} is not blank`).toBeGreaterThan(20);
      expect(PLACEHOLDER.test(text), `${route} placeholder`).toBe(false);
      expect(await page.getByText(/something went wrong|Application error/i).count(), `${route} error screen`).toBe(0);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
