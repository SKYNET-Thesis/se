import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/** axe-core (WCAG 2.0/2.1 A + AA) over every new management and learning page and over the dialogs that carry forms. Zero violations are allowed. */
const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const run = Date.now().toString(36);

async function audit(page: Page, label: string) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(700); // let dialog/enter animations finish: axe would otherwise measure mid-transition opacity
  await page.addScriptTag({ path: axeSource });
  const result = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string; help: string; nodes: Array<{ target: string[] }> }> }> } }).axe;
    return (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  });
  expect.soft(result, `${label}: ${JSON.stringify(result)}`).toEqual([]);
}

const PAGES: Record<string, string[]> = {
  admin: ['/admin/organizations', '/admin/courses', '/courses', '/catalog', '/account'],
  schoolAdmin: ['/school', '/school/users', '/school/classrooms', '/school/quizzes', '/school/courses', '/school/offerings', '/school/import', '/school/roles', '/school/profile', '/courses'],
  instructor: ['/teacher', '/teacher/classes', '/teacher/classes/{classroomId}', '/teacher/assignments', '/teacher/assignments/new', '/teacher/quizzes', '/teacher/submissions', '/teacher/challenges', '/admin/courses', '/admin/courses/00000000-0000-4000-8000-000000000000'],
  student: ['/my-learning', '/courses', '/courses/{courseId}', '/courses/{courseId}/lessons/{lessonId}', '/courses/{courseId}/lessons/{lessonId}/activities/{readingActivityId}', '/my-learning/{programDeliveryId}', '/catalog', '/learning-path', '/assignments', '/account', '/login'],
};

for (const [role, routes] of Object.entries(PAGES)) {
  test(`axe: ${role} pages have no WCAG A/AA violations`, async ({ page }) => {
    test.setTimeout(240_000);
    const fixture = await loadFixture(); await signIn(page, fixture, role);
    for (const template of routes) {
      const route = template.replace(/\{(\w+)\}/g, (_m, key) => String((fixture as Record<string, unknown>)[key]));
      await page.goto(route); await audit(page, `${role} ${route}`);
    }
  });
}

test('axe: dialogs and forms of the new management screens', async ({ page }) => {
  test.setTimeout(240_000);
  const fixture = await loadFixture();
  await signIn(page, fixture, 'admin'); await page.goto('/admin/organizations');
  await page.getByRole('button', { name: 'New organization' }).click(); await audit(page, 'New organization dialog'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Manage / }).first().click(); await expect(page.getByTestId('org-status')).toBeVisible(); await audit(page, 'Manage organization dialog'); await page.keyboard.press('Escape');

  await signIn(page, fixture, 'schoolAdmin'); await page.goto('/school/users'); await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Add instructor' }).click(); await audit(page, 'Add instructor dialog'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add student' }).click(); await audit(page, 'Add student dialog'); await page.keyboard.press('Escape');
  await page.goto('/school/classrooms'); await page.getByRole('button', { name: 'Create classroom' }).click(); await audit(page, 'Create classroom dialog'); await page.keyboard.press('Escape');

  const token = await signIn(page, fixture, 'instructor'); await page.goto('/teacher/challenges');
  await page.getByRole('button', { name: 'New challenge' }).click();
  const dialog = page.getByRole('dialog', { name: 'New challenge' });
  await dialog.getByLabel('Challenge title').fill(`Axe ${run}`);
  for (const [n, key] of [[2, 'symbolic_duration'], [3, 'preview_target_match'], [4, 'object_lifted']] as const) { await dialog.getByRole('button', { name: 'Add rule' }).click(); await dialog.getByLabel(`Rule ${n} type`).selectOption(key); }
  await audit(page, 'New challenge dialog with all rule forms'); await page.keyboard.press('Escape');

  // course builder (own draft course), course list and the assignment editor with a saved draft
  const course = await call(page, token, 'POST', '/admin/courses', { title: `Axe course ${run}`, level: 'BEGINNER', tags: ['Blockly'] });
  expect(course.status).toBe(201);
  for (const tab of ['details', 'curriculum', 'media', 'settings']) { await page.goto(`/admin/courses/${course.body.id}?tab=${tab}`); await audit(page, `course builder ${tab}`); }
});
