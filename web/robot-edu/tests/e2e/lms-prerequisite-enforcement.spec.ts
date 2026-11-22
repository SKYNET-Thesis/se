import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { SO101_CURRICULUM } from '../../../../services/education-api/src/scripts/so101-curriculum.data';

/**
 * Course prerequisites are enforced by the server (policy COURSE_PREREQUISITES_ENFORCED_FROM=2026-01-01T00:00:00Z on the local stack).
 * Seeded chain: Beginner -> Intermediate -> Advanced. The School Admin delivers Advanced (student enrolled) and Intermediate (nobody enrolled yet).
 *  - new enrolment, prerequisite not completed: every lesson is locked (API 409 + UI banner); authors are unaffected;
 *  - grandfathering: an enrolment older than the cutoff keeps today's access; started work stays reachable;
 *  - no permanent deadlocks: a prerequisite the student cannot reach is ignored;
 *  - authoring cannot create a trap: a published course cannot depend on a draft course; a prerequisite in use cannot be archived;
 *  - completing the prerequisite unlocks the course.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { schoolId: string; users: Record<string, { authUserId: string; userId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36).toUpperCase();
const ADVANCED = SO101_CURRICULUM[2].title; const INTERMEDIATE = SO101_CURRICULUM[1].title;
const STUDENT = fixture.users.student.userId;

async function signIn(page: Page, who: string) {
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json() as { access_token: string };
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
  return s.access_token;
}
const call = async (page: Page, token: string, method: string, path: string, data?: unknown) => {
  const r = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status(), body };
};
const get = (page: Page, token: string, path: string) => call(page, token, 'GET', path);

async function deliverCourse(page: Page, title: string, code: string, student?: string) {
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(`${code} ${run}`);
  await create.getByLabel('Classroom code').fill(`${code}-${run}`);
  await create.getByLabel('Published course').selectOption({ label: title });
  await create.getByLabel('School offering code').fill(`OFF-${code}-${run}`);
  await create.getByRole('button', { name: 'Create classroom' }).click();
  await expect(create).not.toBeVisible();
  await expect(page).toHaveURL(/\/school\/classrooms\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Classroom details' })).toBeVisible();
  if (!student) return;
  await page.getByRole('button', { name: 'Add member' }).click();
  const member = page.getByRole('dialog', { name: 'Add classroom member' });
  await member.getByLabel('Search eligible members').fill(student);
  await member.getByRole('radio', { name: new RegExp(student.replace(/\./g, '\\.')) }).check();
  await member.getByRole('button', { name: 'Add member' }).click();
  await expect(member).not.toBeVisible();
}

test('Course prerequisites: enforced for new enrolments, grandfathered by cutoff, no deadlocks, safe authoring, unlock on completion', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, 'schoolAdmin');
  await deliverCourse(page, INTERMEDIATE, 'INT');                                   // reachable prerequisite: the school offers it, nobody is enrolled yet
  await deliverCourse(page, ADVANCED, 'ADV', 'Phase 2.4.3 Test Student');

  const student = await signIn(page, 'student');
  const courses = await get(page, student, '/courses?page=1&pageSize=100');
  const advanced = (courses.body.items as Array<{ id: string; title: string }>).find((c) => c.title === ADVANCED)!;
  expect(advanced, 'delivered course is listed').toBeTruthy();
  const pathUrl = `/me/courses/${advanced.id}/path`;
  const path = await get(page, student, pathUrl);
  expect(path.status).toBe(200);
  expect(path.body.course.unmetPrerequisites.map((c: { title: string }) => c.title)).toEqual([INTERMEDIATE]);
  expect(path.body.currentLessonId).toBeNull();
  expect(path.body.lessons.every((l: { status: string; lockReason: { code: string } }) => l.status === 'locked' && l.lockReason.code === 'COURSE_PREREQUISITE_NOT_COMPLETED')).toBe(true);
  const [first, second] = path.body.lessons.map((l: { id: string }) => l.id) as string[];

  // new enrolment: direct API calls cannot bypass the lock
  expect((await get(page, student, `/lessons/${first}`)).status).toBe(409);
  expect((await get(page, student, `/lessons/${first}/sections`)).status).toBe(409);
  await page.goto(`/courses/${advanced.id}`);
  const lock = page.getByTestId('course-prerequisite-lock');
  await expect(lock).toBeVisible();
  await expect(lock).toContainText(INTERMEDIATE);

  // authors stay authorized
  const admin = await signIn(page, 'admin');
  expect((await get(page, admin, `/lessons/${first}`)).status).toBe(200);

  // grandfathering: an enrolment that started before the cutoff keeps today's access; restoring the timestamp enforces again
  psql(`UPDATE learning_enrollments SET enrolled_at='2025-06-01T00:00:00Z' WHERE learner_user_id='${STUDENT}' AND course_id='${advanced.id}'`);
  await signIn(page, 'student');
  expect((await get(page, student, pathUrl)).body.course.unmetPrerequisites).toEqual([]);
  expect((await get(page, student, `/lessons/${first}`)).status).toBe(200);
  psql(`UPDATE learning_enrollments SET enrolled_at=now() WHERE learner_user_id='${STUDENT}' AND course_id='${advanced.id}'`);
  expect((await get(page, student, `/lessons/${first}`)).status).toBe(409);

  // started work stays reachable (an in-progress lesson), the rest of the course stays locked
  psql(`UPDATE learning_lesson_progress SET status='in_progress' WHERE learner_user_id='${STUDENT}' AND lesson_id='${first}'`);
  const started = await get(page, student, pathUrl);
  expect(started.body.lessons.map((l: { status: string }) => l.status)).toEqual(['in_progress', 'locked', 'locked']);
  expect((await get(page, student, `/lessons/${first}`)).status).toBe(200);
  expect((await get(page, student, `/lessons/${second}`)).status).toBe(409);
  psql(`UPDATE learning_lesson_progress SET status='not_started' WHERE learner_user_id='${STUDENT}' AND lesson_id='${first}'`);

  // no permanent deadlock: when the school stops offering the prerequisite and the student cannot reach it, it is ignored
  psql(`UPDATE learning_course_offerings SET status='archived' WHERE organization_id='${fixture.schoolId}' AND course_id=(SELECT id FROM learning_courses WHERE title='${INTERMEDIATE}' LIMIT 1)`);
  expect((await get(page, student, pathUrl)).body.course.unmetPrerequisites).toEqual([]);
  psql(`UPDATE learning_course_offerings SET status='active' WHERE organization_id='${fixture.schoolId}' AND course_id=(SELECT id FROM learning_courses WHERE title='${INTERMEDIATE}' LIMIT 1)`);
  expect((await get(page, student, pathUrl)).body.course.unmetPrerequisites.map((c: { title: string }) => c.title)).toEqual([INTERMEDIATE]);

  // authoring cannot create a trap
  const intermediateId = psql(`SELECT id FROM learning_courses WHERE title='${INTERMEDIATE}' LIMIT 1`);
  const draft = await call(page, admin, 'POST', '/admin/courses', { title: `ACC draft prerequisite ${run}` });
  expect(draft.status).toBe(201);
  const trap = await call(page, admin, 'PATCH', `/admin/courses/${advanced.id}`, { prerequisiteCourseIds: [draft.body.id] });
  expect(trap.status).toBe(400);                                                                  // a published course cannot depend on a draft course
  expect(JSON.stringify(trap.body)).toContain('Publish the prerequisite');
  expect((await call(page, admin, 'PATCH', `/admin/courses/${advanced.id}`, { prerequisiteCourseIds: [advanced.id] })).status).toBe(400);   // itself
  expect((await call(page, admin, 'PATCH', `/admin/courses/${advanced.id}`, { prerequisiteCourseIds: ['00000000-0000-4000-8000-000000000999'] })).status).toBe(400); // missing reference
  expect((await call(page, admin, 'PATCH', `/admin/courses/${intermediateId}`, { prerequisiteCourseIds: [advanced.id] })).status).toBe(409);  // circular
  expect((await call(page, admin, 'POST', `/admin/courses/${intermediateId}/archive`)).status).toBe(409);                                    // in use as a prerequisite
  expect((await call(page, admin, 'POST', `/admin/courses/${intermediateId}/unpublish`)).status).toBe(409);
  const draftWithDraftPrerequisite = await call(page, admin, 'POST', '/admin/courses', { title: `ACC draft dependent ${run}`, prerequisiteCourseIds: [draft.body.id] });
  expect(draftWithDraftPrerequisite.status).toBe(201);                                            // allowed while the dependent is a draft ...
  expect((await call(page, admin, 'POST', `/admin/courses/${draftWithDraftPrerequisite.body.id}/publish`)).status).toBe(409); // ... but it cannot be published (no lessons / unpublished prerequisite)

  // completing the prerequisite unlocks the course with no other change
  psql(`INSERT INTO learning_lesson_progress(learner_user_id,lesson_id,status,progress_percent,started_at,completed_at,updated_at)
    SELECT '${STUDENT}'::uuid,l.id,'completed',100,now(),now(),now() FROM learning_lessons l JOIN learning_courses c ON c.id=l.course_id WHERE c.title='${INTERMEDIATE}'
    ON CONFLICT (learner_user_id,lesson_id) DO UPDATE SET status='completed',progress_percent=100,completed_at=now()`);
  const after = await signIn(page, 'student');
  const unlocked = await get(page, after, pathUrl);
  expect(unlocked.body.course.unmetPrerequisites).toEqual([]);
  expect(unlocked.body.lessons[0].status).not.toBe('locked');
  expect((await get(page, after, `/lessons/${first}`)).status).toBe(200);
  await page.goto(`/courses/${advanced.id}`);
  await expect(page.getByRole('heading', { name: 'Curriculum' })).toBeVisible();
  await expect(page.getByTestId('course-prerequisite-lock')).toHaveCount(0);
  expect(errors).toEqual([]);
});
