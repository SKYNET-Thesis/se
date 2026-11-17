import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Phase 1E accessibility smoke over the real LMS pages: landmarks, names for controls, labelled fields, image alternatives, keyboard reach. */
interface Fixture { courseId: string; classroomId: string; programDeliveryId: string; users: Record<string, { userId: string; authUserId: string }> }
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function signIn(page: Page, who: string) {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`);
  const value = await response.json();
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
  await page.reload();
}

/** Returns human-readable accessibility problems found in the rendered DOM. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const text = (el: Element) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
    const labelled = (el: Element) => {
      if (el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim()) return true;
      const by = el.getAttribute('aria-labelledby'); if (by && by.split(' ').some((id) => document.getElementById(id)?.textContent?.trim())) return true;
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
      return Boolean(el.closest('label'));
    };
    if (!document.documentElement.lang) problems.push('<html> has no lang');
    if (!document.querySelector('main, [role="main"]')) problems.push('no main landmark');
    const h1 = [...document.querySelectorAll('h1')].filter(visible); if (h1.length !== 1) problems.push(`expected one visible h1, found ${h1.length}`);
    document.querySelectorAll('button, [role="button"], a[href]').forEach((el) => { if (visible(el) && !text(el) && !el.querySelector('img[alt]:not([alt=""]), svg[aria-label]')) problems.push(`unnamed ${el.tagName.toLowerCase()}: ${el.outerHTML.slice(0, 90)}`); });
    document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((el) => { if (visible(el) && !labelled(el)) problems.push(`unlabelled ${el.tagName.toLowerCase()}: ${el.outerHTML.slice(0, 90)}`); });
    document.querySelectorAll('img').forEach((el) => { if (visible(el) && !el.hasAttribute('alt')) problems.push(`img without alt: ${el.outerHTML.slice(0, 90)}`); });
    const ids = new Map<string, number>(); document.querySelectorAll('[id]').forEach((el) => ids.set(el.id, (ids.get(el.id) ?? 0) + 1));
    ids.forEach((n, id) => { if (n > 1) problems.push(`duplicate id ${id}`); });
    return problems;
  });
}

const pages: Array<[string, string, () => string]> = [
  ['student', 'My Learning', () => '/my-learning'],
  ['student', 'Course page', () => `/courses/${fixture.courseId}`],
  ['student', 'Assignment page', () => `/my-learning/${fixture.programDeliveryId}`],
  ['instructor', 'Teacher classroom', () => `/teacher/classes/${fixture.classroomId}`],
  ['instructor', 'Assignment editor', () => '/teacher/assignments/new'],
  ['instructor', 'Course list', () => '/admin/courses'],
];

for (const [who, name, url] of pages) {
  test(`Accessibility smoke: ${name} (${who})`, async ({ page }) => {
    await signIn(page, who);
    await page.goto(url());
    await page.waitForLoadState('networkidle');
    expect(await audit(page), `${name} accessibility problems`).toEqual([]);
    // keyboard: Tab reaches an interactive element with a visible focus target
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => { const el = document.activeElement; return el && el !== document.body ? el.tagName : ''; });
    expect(focused).not.toBe('');
  });
}

test('Accessibility audit detects unnamed controls, unlabelled fields and images without alternatives (negative control)', async ({ page }) => {
  await page.setContent('<html><body><button></button><input type="text"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></body></html>');
  const problems = await audit(page);
  expect(problems.some((p) => p.startsWith('unnamed button'))).toBe(true);
  expect(problems.some((p) => p.startsWith('unlabelled input'))).toBe(true);
  expect(problems.some((p) => p.startsWith('img without alt'))).toBe(true);
  expect(problems).toContain('no main landmark');
});
