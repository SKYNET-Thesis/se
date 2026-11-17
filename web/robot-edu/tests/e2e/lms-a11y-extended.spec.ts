import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Phase 1G extended accessibility checks over real LMS routes: heading order, touch-target size and WCAG text-contrast ratios
 * (computed from rendered colours). This is an automated smoke aid, not a WCAG conformance audit.
 */
interface Fixture { courseId: string; lessonId: string; readingActivityId: string; classroomId: string; programDeliveryId: string; users: Record<string, { authUserId: string }> }
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as Fixture;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function signIn(page: Page, who: string) {
  const value = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json();
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
    const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const backdrop = (el: Element) => { let layer: Element | null = el; let acc = { r: 255, g: 255, b: 255 }; const stack: Array<{ r: number; g: number; b: number; a: number }> = []; while (layer) { const c = parse(getComputedStyle(layer).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } layer = layer.parentElement; } for (const c of stack.reverse()) acc = { r: c.r * c.a + acc.r * (1 - c.a), g: c.g * c.a + acc.g * (1 - c.a), b: c.b * c.a + acc.b * (1 - c.a) }; return acc; };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((h) => Number(h.tagName[1]));
    const headingSkips: string[] = []; headings.forEach((level, i) => { if (i > 0 && level > headings[i - 1] + 1) headingSkips.push(`h${headings[i - 1]} → h${level}`); });
    const small: string[] = [];
    document.querySelectorAll('button, [role="button"], [role="tab"], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea').forEach((el) => {
      if (!visible(el) || (el as HTMLButtonElement).disabled || el.closest('.sr-only')) return;
      const r = (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') && el.parentElement && el.parentElement.getBoundingClientRect().height > el.getBoundingClientRect().height ? el.parentElement.getBoundingClientRect() : el.getBoundingClientRect(); if (r.width < 24 || r.height < 24) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    const low: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement; if (!el || seen.has(el) || !n.textContent?.trim() || !visible(el) || el.closest('.sr-only, [disabled], [aria-disabled="true"], script, style')) continue; seen.add(el);
      const style = getComputedStyle(el); const fg = parse(style.color); if (!fg) continue;
      const bg = backdrop(el); const blended = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
      const l1 = lum(blended), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(style.fontSize); const bold = Number(style.fontWeight) >= 700; const large = size >= 24 || (size >= 18.66 && bold);
      if (ratio < (large ? 3 : 4.5)) low.push(`${ratio.toFixed(2)}:1 "${n.textContent.trim().slice(0, 28)}" (${style.color} on rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}))`);
    }
    return { headingSkips, small, low };
  });
}

const pages: Array<[string, string, () => string]> = [
  ['student', 'My Learning', () => '/my-learning'],
  ['student', 'Course path', () => `/courses/${fixture.courseId}`],
  ['student', 'Reading activity', () => `/courses/${fixture.courseId}/lessons/${fixture.lessonId}/activities/${fixture.readingActivityId}`],
  ['student', 'Assignment', () => `/my-learning/${fixture.programDeliveryId}`],
  ['instructor', 'Teacher classroom', () => `/teacher/classes/${fixture.classroomId}`],
  ['instructor', 'Assignment editor', () => '/teacher/assignments/new'],
  ['instructor', 'Course list', () => '/admin/courses'],
];

for (const width of [1440, 390]) {
  for (const [who, name, url] of pages) {
    test(`Heading order, touch targets and contrast: ${name} @${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, who);
      await page.goto(url());
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      const result = await measure(page);
      expect(result.headingSkips, `${name}: skipped heading levels`).toEqual([]);
      if (width === 390) expect(result.small, `${name}: controls smaller than 24x24 CSS px`).toEqual([]);
      expect(result.low, `${name}: text below WCAG AA contrast`).toEqual([]);
    });
  }
}
