import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loadFixture, signIn } from './helpers/academic';

/**
 * Global browser console + network sweep: every in-scope route for each role is opened in a real browser; page errors, console errors, failed requests
 * and HTTP >= 400 responses are collected (report: VISTA_SWEEP_DIR/console-network-sweep.json) and must be empty. Local isolated stack, synthetic data.
 */
const fixture = await loadFixture();
const f = fixture as unknown as { courseId: string; lessonId: string; classroomId: string; quizActivityId: string; readingActivityId: string; programAssignmentId: string; programDeliveryId: string };
const routes: Record<string, string[]> = {
  anonymous: ['/', '/login', '/forgot-password'],
  admin: ['/admin/organizations', '/admin/robots', '/admin/students', '/admin/courses', `/admin/courses/${f.courseId}?tab=curriculum`, `/admin/courses/${f.courseId}?tab=media`, '/lab', '/ai-registry', '/account'],
  schoolAdmin: ['/school', '/school/users', '/school/classrooms', `/school/classrooms/${f.classroomId}`, '/school/offerings', '/school/courses', '/school/quizzes'],
  instructor: ['/teacher', '/teacher/classes', `/teacher/classes/${f.classroomId}`, '/teacher/assignments', '/teacher/assignments/new', `/teacher/assignments/${f.classroomId}/${f.programAssignmentId}/edit`, '/teacher/quizzes', '/teacher/submissions', '/teacher/challenges', '/admin/courses', '/lab'],
  student: ['/', '/my-learning', '/courses', '/catalog', '/learning-path', `/courses/${f.courseId}`, `/courses/${f.courseId}/lessons/${f.lessonId}`, `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.readingActivityId}`, `/courses/${f.courseId}/lessons/${f.lessonId}/activities/${f.quizActivityId}`, '/assignments', `/my-learning/${f.programDeliveryId}`, '/studio', '/ai-registry', '/account', '/lab'],
};
const findings: Array<{ role: string; route: string; kind: string; detail: string }> = [];
// Known, intentional responses: Supabase/telemetry endpoints are not part of the local stack; none are expected today.
const IGNORED_URL = /\/favicon\.ico$|fonts\.(googleapis|gstatic)\.com/;

for (const [role, list] of Object.entries(routes)) {
  test(`console/network sweep — ${role}`, async ({ page }) => {
    test.setTimeout(300_000);
    let current = '';
    page.on('pageerror', (e) => findings.push({ role, route: current, kind: 'pageerror', detail: e.message }));
    page.on('console', (m) => { if (m.type() === 'error') findings.push({ role, route: current, kind: 'console.error', detail: m.text().slice(0, 300) }); });
    page.on('requestfailed', (r) => { if (!IGNORED_URL.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') findings.push({ role, route: current, kind: 'requestfailed', detail: `${r.method()} ${r.url()} ${r.failure()?.errorText}` }); });
    page.on('response', (r) => { if (r.status() >= 400 && !IGNORED_URL.test(r.url())) findings.push({ role, route: current, kind: `http-${r.status()}`, detail: `${r.request().method()} ${r.url().replace(/[0-9a-f-]{36}/g, ':id')}` }); });
    if (role !== 'anonymous') await signIn(page, fixture, role);
    for (const route of list) {
      current = route;
      await page.goto(route, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(600);
    }
  });
}

test.afterAll(() => {
  const dir = process.env.VISTA_SWEEP_DIR ?? '/tmp/vista-sweep'; mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'console-network-sweep.json'), JSON.stringify({ routes: Object.values(routes).flat().length, findings }, null, 2));
  expect(findings, JSON.stringify(findings, null, 1)).toEqual([]);
});
