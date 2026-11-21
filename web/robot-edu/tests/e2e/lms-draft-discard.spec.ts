import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

/**
 * Instructor draft behaviour in the real Course Builder: unsaved edits are guarded, "Stay Here" keeps them, "Discard Changes" drops them
 * (nothing is persisted), "Save Draft" persists them across navigation and reload. Real browser, real API, isolated PostgreSQL.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { users: Record<string, { authUserId: string }> };
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const run = Date.now().toString(36);
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();

async function signIn(page: Page, who: string) {
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json() as { access_token: string };
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
}

test('draft edits: guarded on navigation, discarded on request, persisted when saved', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, 'instructor');
  await page.goto('/admin/courses');
  await page.getByRole('button', { name: 'Create Course' }).click();
  await page.getByRole('textbox', { name: 'Course Title' }).fill(`Draft Course ${run}`);
  await page.getByRole('textbox', { name: /^Description/ }).fill('Learners practise safe robot operation.');
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/);
  const addVia = async (opener: () => Promise<void>, dialogName: string, text: string) => {
    await opener();
    const dialog = page.getByRole('dialog', { name: dialogName });
    await dialog.getByRole('textbox').fill(text);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  };
  await addVia(() => page.getByRole('button', { name: 'Add module' }).click(), 'Add module', 'Safe robot motion');
  await addVia(() => page.getByRole('button', { name: /Add Lesson/ }).first().click(), 'Add lesson', 'Read and check');
  await addVia(() => page.getByRole('button', { name: 'Quick Add Reading' }).first().click(), 'Add activity', 'Safety reading');
  await expect(page.getByRole('heading', { name: 'Safety reading', level: 2 })).toBeVisible();
  await addVia(() => page.getByRole('button', { name: 'Quick Add Reading' }).first().click(), 'Add activity', 'Second reading');
  await expect(page.getByRole('heading', { name: 'Second reading', level: 2 })).toBeVisible();

  const workspace = page.getByRole('main', { name: 'Content workspace' }).or(page.locator('main').last());
  const outline = (name: string) => page.locator('div.cursor-pointer p.truncate').filter({ hasText: new RegExp(`^${name}$`) }).first();   // the clickable activity row in the outline
  const text = `Unsaved paragraph ${run}`;
  await workspace.getByRole('button', { name: '+ Add Paragraph' }).click();
  await workspace.locator('textarea').last().fill(text);

  // 1) the guard appears; "Stay Here" keeps the edit
  await outline('Safety reading').click();
  const guard = page.getByRole('heading', { name: 'Unsaved Changes' });
  await expect(guard).toBeVisible();
  await page.getByRole('button', { name: 'Stay Here' }).click();
  await expect(guard).not.toBeVisible();
  await expect(workspace.locator('textarea').last()).toHaveValue(text);                         // still on the edited activity with the edit intact

  // 2) "Discard Changes" navigates and drops the edit; nothing was saved
  await outline('Safety reading').click();
  await page.getByRole('button', { name: 'Discard Changes' }).click();
  await expect(guard).toHaveCount(0);
  await outline('Second reading').click();                                                      // no guard now: the edit was dropped
  await expect(guard).toHaveCount(0);
  await expect(workspace.locator('textarea').filter({ hasText: text })).toHaveCount(0);
  await expect(guard).toHaveCount(0);
  await expect(page.getByTestId('save-status')).not.toHaveText(/Unsaved changes/);
  await expect(page.getByText(text)).toHaveCount(0);

  // 3) a saved draft survives navigation and a full reload
  await workspace.getByRole('button', { name: '+ Add Paragraph' }).click();
  await workspace.locator('textarea').last().fill(text);
  await workspace.getByRole('button', { name: 'Save Draft' }).click();
  await expect(workspace.getByText('Saved', { exact: true }).first()).toBeVisible();
  await outline('Safety reading').click();                       // no guard: nothing is unsaved
  await expect(guard).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Safety reading', level: 2 })).toBeVisible();
  // regression: saving after navigating between activities must never write one activity's title or content into another
  const rows = psql(`SELECT a.title || '|' || (a.content::text LIKE '%${text}%') FROM learning_activities a JOIN learning_sections s ON s.id=a.section_id JOIN learning_lessons l ON l.id=s.lesson_id JOIN learning_courses c ON c.id=l.course_id WHERE c.title='Draft Course ${run}' ORDER BY a.ordinal`).split('\n');
  expect(rows).toEqual(['Safety reading|false', 'Second reading|true']);
  await page.reload();
  await page.getByRole('tab', { name: 'Outline & Editor' }).click();
  await outline('Second reading').click();
  await expect(workspace.locator('textarea').filter({ hasText: text }).or(workspace.locator('textarea').last())).toBeVisible();
  expect(await workspace.locator('textarea').evaluateAll((nodes) => nodes.map((node) => (node as HTMLTextAreaElement).value))).toContain(text);
  expect(errors).toEqual([]);
});
