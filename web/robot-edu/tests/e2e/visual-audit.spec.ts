import { test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

/**
 * Phase 1F visual audit helper. Opt-in (VISTA_VISUAL_AUDIT=1): captures full-page screenshots of the main LMS screens at
 * four widths and records horizontal overflow. It asserts nothing about taste; a human or reviewer looks at the images.
 */
interface Fixture { courseId: string; lessonId: string; readingActivityId: string; classroomId: string; programDeliveryId: string; users: Record<string, { authUserId: string }> }
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE ?? '';
const outDir = process.env.VISTA_VISUAL_AUDIT_DIR ?? '/tmp/vista-1f-shots';
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
test.skip(process.env.VISTA_VISUAL_AUDIT !== '1', 'visual audit is opt-in');
const fixture = process.env.VISTA_VISUAL_AUDIT === '1' ? (JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture) : ({} as Fixture);

const widths = (process.env.VISTA_VISUAL_AUDIT_WIDTHS ?? '1440,1024,768,390').split(',').map(Number);
const only = process.env.VISTA_VISUAL_AUDIT_ONLY?.split(',');
const screens: Array<[string, string, (f: Fixture) => string]> = [
  ['student', 'student-my-learning', () => '/my-learning'],
  ['student', 'student-courses', () => '/courses'],
  ['student', 'student-course', (f) => `/courses/${f.courseId}`],
  ['student', 'student-lesson', (f) => `/courses/${f.courseId}/lessons/${f.lessonId}`],
  ['student', 'student-activity', (f) => `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.readingActivityId}`],
  ['student', 'student-quiz', (f) => `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${(f as unknown as { quizActivityId: string }).quizActivityId}`],
  ['instructor', 'teacher-assignment-edit', (f) => `/teacher/assignments/${f.classroomId}/2091a24b-938b-4819-b562-9d8b767fb3a9/edit`],
  ['instructor', 'teacher-submission-review', (f) => `/teacher/classes/${f.classroomId}/submissions/ff575d88-58f0-44a4-b667-d4eda1630901`],
  ['student', 'student-quiz-delivery', () => '/my-learning/8b45e60b-a4e1-45a7-956c-dd1361e8835f'],
  ['student', 'student-assignment', (f) => `/my-learning/${f.programDeliveryId}`],
  ['instructor', 'teacher-overview', () => '/teacher'],
  ['instructor', 'teacher-classes', () => '/teacher/classes'],
  ['instructor', 'teacher-class', (f) => `/teacher/classes/${f.classroomId}`],
  ['instructor', 'teacher-assignments', () => '/teacher/assignments'],
  ['instructor', 'teacher-assignment-new', () => '/teacher/assignments/new'],
  ['instructor', 'course-list', () => '/admin/courses'],
  ['instructor', 'course-builder', (f) => `/admin/courses/${f.courseId}`],
  // extra courses authored by the earlier E2E runs in the disposable database (ids are local to that database)
  ['instructor', 'builder-unlock-course', () => '/admin/courses/7d208138-f365-4509-932b-9d12c89e4dcb'],
  ['instructor', 'builder-media-course', () => '/admin/courses/49f29440-ad3f-4057-90cc-4c4e1d93aed9'],
  ['student', 'student-locked-course', () => '/courses/7d208138-f365-4509-932b-9d12c89e4dcb'],
  ['student', 'student-locked-module', () => '/courses/7d208138-f365-4509-932b-9d12c89e4dcb/lessons/f19c9cf8-2b8f-43f9-bc56-6d409b172824'],
  ['student', 'student-media-activity', () => '/courses/49f29440-ad3f-4057-90cc-4c4e1d93aed9/lessons/86585e6d-06cd-4098-a968-8c4730d440a3/activities/8e5ce2e9-3ebe-4d22-9c7b-b4b7b01c578e'],
];

async function signIn(page: Page, who: string) {
  const value = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json();
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
}

test('capture LMS screens at 1440/1024/768/390', async ({ page }) => {
  test.setTimeout(600_000);
  await mkdir(outDir, { recursive: true });
  const report: Array<{ screen: string; width: number; overflowPx: number; culprits?: string[] }> = [];
  let current = '';
  for (const [who, name, url] of screens) {
    if (only && !only.some((o) => name.includes(o))) continue;
    if (current !== who) { await signIn(page, who); current = who; }
    for (const width of widths) {
      await page.setViewportSize({ width, height: 2400 });
      await page.goto(url(fixture));
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => !/^Loading/.test(document.body.innerText.trim()), null, { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const culprits = overflowPx > 0 ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}px: ${(el.textContent ?? '').slice(0, 40)}`)) : [];
      report.push({ screen: name, width, overflowPx, culprits } as never);
      await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: false });
    }
  }
  await writeFile(`${outDir}/overflow.json`, JSON.stringify(report, null, 2));
});

test('capture course builder tabs and editors (interactive states)', async ({ page }) => {
  test.setTimeout(300_000);
  await mkdir(outDir, { recursive: true });
  await signIn(page, 'instructor');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 2000 });
    const open = async () => { await page.goto('/admin/courses/7d208138-f365-4509-932b-9d12c89e4dcb'); await page.getByRole('tab', { name: /Curriculum/ }).click().catch(() => undefined); await page.waitForTimeout(800); };
    await open();
    await page.getByText('Gate quiz').first().click().catch(() => undefined); await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/builder-quiz-editor-${width}.png` });
    await open();
    await page.getByRole('button', { name: /Module 2: Second module/ }).first().click().catch(() => undefined); await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/builder-module-editor-${width}.png` });
    await open();
    await page.getByRole('tab', { name: /Structure & Publishing/ }).click().catch(() => undefined); await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/builder-publishing-${width}.png` });
    await open();
    await page.getByRole('tab', { name: /Media Library/ }).click().catch(() => undefined); await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/builder-media-library-${width}.png` });
    await open();
    await page.getByRole('tab', { name: /Course Details/ }).click().catch(() => undefined); await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/builder-details-${width}.png` });
  }
});
