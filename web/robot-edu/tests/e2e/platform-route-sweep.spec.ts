import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loadFixture, signIn } from './helpers/academic';

const shots = path.resolve(process.cwd(), '../../docs/acceptance/screenshots');
const PLACEHOLDER = /lorem ipsum|coming soon|not implemented|todo:|under construction|undefined|\[object Object\]|NaN/i;

const ROUTES: Record<string, string[]> = {
  admin: ['/admin/courses/{courseId}', '/admin/organizations', '/admin/courses', '/courses', '/catalog', '/account'],
  schoolAdmin: ['/school', '/school/users', '/school/classrooms', '/school/quizzes', '/school/courses', '/school/offerings', '/school/import', '/school/roles', '/school/profile', '/courses', '/account'],
  instructor: ['/teacher/classes/{classroomId}', '/teacher', '/teacher/classes', '/teacher/assignments', '/teacher/assignments/new', '/teacher/quizzes', '/teacher/submissions', '/courses', '/admin/courses', '/account'],
  student: ['/courses/{courseId}', '/my-learning', '/courses', '/catalog', '/learning-path', '/assignments', '/account', '/settings'],
};
const DASHBOARD: Record<string, string> = { admin: '/admin/organizations', schoolAdmin: '/school', instructor: '/teacher', student: '/my-learning' };

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of (401|403|404)/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return problems;
}

for (const [role, routes] of Object.entries(ROUTES)) {
  test.describe(`route sweep: ${role}`, () => {
    for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]] as const) {
      test(`${label}: every route renders without errors, placeholders or page-level overflow`, async ({ page }) => {
        test.setTimeout(180_000);
        const fixture = await loadFixture(); await signIn(page, fixture, role); await page.setViewportSize(viewport);
        const problems = watch(page);
        for (const template of routes) {
          const route = template.replace(/\{(\w+)\}/g, (_m, key) => String((fixture as Record<string, unknown>)[key]));
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
          await expect(page.locator('main, [role="main"]').first(), `${route} has a main region`).toBeVisible({ timeout: 20_000 });
          const text = await page.locator('main, [role="main"]').first().innerText();
          expect(text.trim().length, `${route} is not blank`).toBeGreaterThan(20);
          expect(PLACEHOLDER.test(text), `${route} contains placeholder text: ${text.match(PLACEHOLDER)?.[0]}`).toBe(false);
          expect(await page.getByText(/something went wrong|unexpected error|Application error/i).count(), `${route} shows an error screen`).toBe(0);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow, `${route} overflows horizontally by ${overflow}px at ${label}`).toBeLessThanOrEqual(1);
        }
        expect(problems, problems.join('\n')).toEqual([]);
        await page.goto(DASHBOARD[role]); await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
        await page.screenshot({ path: path.join(shots, `dashboard-${role}-${label}.png`), fullPage: true });
      });
    }
  });
}

test.describe('legacy prototype routes', () => {
  // The old browser-only demo screens are gone: their URLs land on the real, API-backed pages instead.
  const REDIRECTS: Array<[string, string, RegExp]> = [['instructor', '/teacher/courses', /\/admin\/courses$/], ['student', '/assignments/asg-reach', /\/my-learning$/], ['admin', '/admin/robots', /\/admin\/organizations$/], ['admin', '/admin/users', /\/admin\/organizations$/], ['admin', '/admin/settings', /\/admin\/organizations$/]];
  for (const [role, from, to] of REDIRECTS) {
    test(`${role}: ${from} redirects to the real page`, async ({ page }) => {
      const fixture = await loadFixture(); await signIn(page, fixture, role);
      await page.goto(from); await expect(page).toHaveURL(to);
    });
  }
  test('no browser-stored demo course or assignment is ever shown', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'student');
    await page.goto('/'); await page.evaluate(() => { localStorage.setItem('vista.demo.catalog', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: { courses: [{ id: 'rob-101', code: 'ROB 101', title: 'Foundations of Robot Motion', lessons: [] }], assignments: [] } })); });
    for (const route of ['/my-learning', '/courses', '/studio']) { await page.goto(route); await page.waitForLoadState('networkidle'); expect(await page.locator('body').innerText()).not.toMatch(/Foundations of Robot Motion|ROB 101/); }
  });
});

test.describe('403 / 404 handling', () => {
  test('unknown routes show a not-found page with a way back', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'student');
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to dashboard' })).toBeVisible();
  });

  const FORBIDDEN: Array<[string, string, string]> = [['student', '/teacher', 'Teacher overview'], ['student', '/admin/organizations', 'Organizations'], ['student', '/school', 'School Administration'], ['instructor', '/admin/organizations', 'Organizations'], ['instructor', '/school/users', 'School Administration'], ['schoolAdmin', '/admin/organizations', 'Organizations'], ['schoolAdmin', '/teacher/assignments', 'Assignments']];
  for (const [role, route] of FORBIDDEN) {
    test(`${role} cannot open ${route}`, async ({ page }) => {
      const fixture = await loadFixture(); await signIn(page, fixture, role);
      await page.goto(route); await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      expect(new URL(page.url()).pathname, `${role} was left on ${route}`).not.toBe(route);
    });
  }

  test('unauthenticated visitors are sent to sign in', async ({ page }) => {
    await page.goto('/school/users');
    await expect(page).toHaveURL(/\/login/);
  });
});
