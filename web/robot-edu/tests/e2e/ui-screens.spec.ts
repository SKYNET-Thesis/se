import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { loadFixture, signIn } from './helpers/academic';

/** Visual-review capture only (not an assertion suite): representative pages x four viewports into VISTA_SHOT_DIR. Local isolated stack, synthetic data. */
const dir = process.env.VISTA_SHOT_DIR ?? '/tmp/vista-shots';
mkdirSync(dir, { recursive: true });
const fixture = await loadFixture();
const f = fixture as unknown as { classroomId: string; courseId: string; lessonId: string };
const sizes = [[1440, 900], [1280, 800], [768, 1024], [390, 844]] as const;
const pages: Array<{ id: string; who?: string; url: string }> = [
  { id: 'login', url: '/login' },
  { id: 'admin-organizations', who: 'admin', url: '/admin/organizations' },
  { id: 'admin-robots', who: 'admin', url: '/admin/robots' },
  { id: 'admin-students', who: 'admin', url: '/admin/students' },
  { id: 'school-home', who: 'schoolAdmin', url: '/school' },
  { id: 'instructor-home', who: 'instructor', url: '/teacher' },
  { id: 'instructor-class', who: 'instructor', url: `/teacher/classes/${f.classroomId}` },
  { id: 'course-builder', who: 'instructor', url: `/admin/courses/${f.courseId}` },
  { id: 'student-my-learning', who: 'student', url: '/my-learning' },
  { id: 'student-courses', who: 'student', url: '/courses' },
  { id: 'student-course', who: 'student', url: `/courses/${f.courseId}` },
  { id: 'student-lesson', who: 'student', url: `/courses/${f.courseId}/lessons/${f.lessonId}` },
  { id: 'student-assignments', who: 'student', url: '/assignments' },
  { id: 'robot-lab', who: 'student', url: '/lab' },
];
const byWho = new Map<string, typeof pages>();
for (const p of pages) byWho.set(p.who ?? '', [...(byWho.get(p.who ?? '') ?? []), p]);
async function shoot(page: Page, id: string, url: string) {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(dir, `${id}-${w}.png`), fullPage: false });
  }
}
for (const [who, list] of byWho) {
  test(`capture ${who || 'public'}`, async ({ page }) => {
    test.setTimeout(180_000);
    if (who) await signIn(page, fixture, who);
    for (const p of list) await shoot(page, p.id, p.url);
  });
}
