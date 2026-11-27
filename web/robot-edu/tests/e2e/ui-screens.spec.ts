import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { loadFixture, signIn } from './helpers/academic';

/** Visual-review capture only (not an assertion suite): representative pages x four viewports into VISTA_SHOT_DIR. Local isolated stack, synthetic data. */
const dir = process.env.VISTA_SHOT_DIR ?? '/tmp/vista-shots';
mkdirSync(dir, { recursive: true });
const fixture = await loadFixture();
const f = fixture as unknown as { classroomId: string; courseId: string; lessonId: string };
const all = [[1440, 900], [1280, 800], [768, 1024], [390, 844]] as const;
const wanted = (process.env.VISTA_SHOT_WIDTHS ?? '1440,1280,768,390').split(',').map(Number);
const sizes = all.filter(([w]) => wanted.includes(w));
const pages: Array<{ id: string; who?: string; url: string }> = [
  { id: 'public-home', url: '/' },
  { id: 'login', url: '/login' },
  { id: 'forgot-password', url: '/forgot-password' },
  { id: 'admin-organizations', who: 'admin', url: '/admin/organizations' },
  { id: 'admin-robots', who: 'admin', url: '/admin/robots' },
  { id: 'admin-students', who: 'admin', url: '/admin/students' },
  { id: 'admin-courses', who: 'admin', url: '/admin/courses' },
  { id: 'admin-course-builder', who: 'admin', url: `/admin/courses/${f.courseId}?tab=curriculum` },
  { id: 'school-home', who: 'schoolAdmin', url: '/school' },
  { id: 'school-users', who: 'schoolAdmin', url: '/school/users' },
  { id: 'school-classrooms', who: 'schoolAdmin', url: '/school/classrooms' },
  { id: 'school-classroom', who: 'schoolAdmin', url: `/school/classrooms/${f.classroomId}` },
  { id: 'school-offerings', who: 'schoolAdmin', url: '/school/offerings' },
  { id: 'school-courses', who: 'schoolAdmin', url: '/school/courses' },
  { id: 'instructor-home', who: 'instructor', url: '/teacher' },
  { id: 'instructor-classes', who: 'instructor', url: '/teacher/classes' },
  { id: 'instructor-class', who: 'instructor', url: `/teacher/classes/${f.classroomId}` },
  { id: 'instructor-assignments', who: 'instructor', url: '/teacher/assignments' },
  { id: 'instructor-assignment-new', who: 'instructor', url: '/teacher/assignments/new' },
  { id: 'instructor-quizzes', who: 'instructor', url: '/teacher/quizzes' },
  { id: 'instructor-submissions', who: 'instructor', url: '/teacher/submissions' },
  { id: 'instructor-challenges', who: 'instructor', url: '/teacher/challenges' },
  { id: 'student-dashboard', who: 'student', url: '/' },
  { id: 'student-my-learning', who: 'student', url: '/my-learning' },
  { id: 'student-courses', who: 'student', url: '/courses' },
  { id: 'student-catalog', who: 'student', url: '/catalog' },
  { id: 'student-learning-path', who: 'student', url: '/learning-path' },
  { id: 'student-course', who: 'student', url: `/courses/${f.courseId}` },
  { id: 'student-lesson', who: 'student', url: `/courses/${f.courseId}/lessons/${f.lessonId}` },
  { id: 'student-assignments', who: 'student', url: '/assignments' },
  { id: 'student-studio', who: 'student', url: '/studio' },
  { id: 'student-ai-registry', who: 'student', url: '/ai-registry' },
  { id: 'student-account', who: 'student', url: '/account' },
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
    test.setTimeout(420_000);
    if (who) await signIn(page, fixture, who);
    for (const p of list) await shoot(page, p.id, p.url);
  });
}
