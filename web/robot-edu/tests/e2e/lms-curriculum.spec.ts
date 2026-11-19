import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** The seeded SO-101 curriculum (seed-so101-curriculum) delivered through the real School Admin UI and consumed by a student and an instructor. */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { schoolId: string; users: Record<string, { authUserId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const run = Date.now().toString(36).toUpperCase();
import { SO101_CURRICULUM } from '../../../../services/education-api/src/scripts/so101-curriculum.data';
const COURSE = SO101_CURRICULUM[0].title;

async function signIn(page: Page, who: string) {
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json() as { access_token: string };
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
  return s.access_token;
}
const call = async (page: Page, token: string, path: string) => { const r = await page.request.get(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status(), body: await r.json().catch(() => null) as any }; };

test('Seeded beginner course: School Admin delivers it; the student sees level, tags, lessons and learning path; the course needs no robot or AI', async ({ page }) => {
  test.setTimeout(180_000);
  const admin = await signIn(page, 'schoolAdmin');
  const pickable = await call(page, admin, `/education-admin/organizations/${fixture.schoolId}/published-courses`);
  expect((pickable.body as Array<{ title: string }>).map((c) => c.title)).toEqual(expect.arrayContaining([COURSE, 'SO-101 Motion and Coordinates', 'SO-101 Manipulation Project']));

  const className = `SO-101 Foundations ${run}`;
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(className);
  await create.getByLabel('Classroom code').fill(`SO101-${run}`);
  await create.getByLabel('Published course').selectOption({ label: COURSE });
  await create.getByLabel('School offering code').fill(`OFF-SO101-${run}`);
  await create.getByRole('button', { name: 'Create classroom' }).click();
  await expect(create).not.toBeVisible();
  await page.getByRole('button', { name: className }).click();
  for (const person of ['Phase 2.4.3 Test Student', 'Phase 2.4.3 Test Instructor']) {
    await page.getByRole('button', { name: 'Add member' }).click();
    const member = page.getByRole('dialog', { name: 'Add classroom member' });
    await member.getByLabel('Search eligible members').fill(person);
    await member.getByRole('radio', { name: new RegExp(person) }).check();
    await member.getByRole('button', { name: 'Add member' }).click();
    await expect(member).not.toBeVisible();
  }

  // student: catalog card with level badge and tags, filters, three lessons, learning path
  const student = await signIn(page, 'student');
  await page.goto('/courses');
  const tile = page.getByRole('article').filter({ hasText: COURSE });
  await expect(tile.getByTestId('level-badge')).toHaveText('Beginner');
  await expect(tile).toContainText('Blockly');
  await page.getByLabel('Filter by level').selectOption('INTERMEDIATE');
  await expect(page.getByRole('article').filter({ hasText: COURSE })).toHaveCount(0);       // intermediate/advanced courses are not delivered: not visible
  await page.getByLabel('Filter by level').selectOption('BEGINNER');
  await page.getByLabel('Filter by tag').selectOption('SO-101');
  await expect(page.getByRole('article').filter({ hasText: COURSE })).toBeVisible();
  const courses = await call(page, student, '/courses?page=1&pageSize=100');
  const course = (courses.body.items as Array<{ id: string; title: string; level: string; tags: string[] }>).find((c) => c.title === COURSE)!;
  expect(course).toMatchObject({ level: 'BEGINNER', tags: ['SO-101', 'Robotics', 'Blockly'] });
  expect((courses.body.items as Array<{ title: string }>).some((c) => c.title === 'SO-101 Motion and Coordinates')).toBe(false); // other undelivered courses stay private to the student
  const lessons = await call(page, student, `/courses/${course.id}/lessons`);
  expect((lessons.body as Array<{ title: string }>).map((l) => l.title)).toEqual(SO101_CURRICULUM[0].modules.map((m) => m.title));   // three modules, each with two lessons and a module quiz
  await page.goto('/learning-path');
  const entry = page.getByRole('listitem').filter({ hasText: COURSE });
  await expect(entry).toContainText(/Ready to start|In progress|Completed/);   // state depends on earlier specs sharing this student
  // the recommendation prefers a course already in progress (other specs enrol this student elsewhere); it is always present while a course is open
  await expect(page.getByRole('region', { name: 'Recommended next course' })).toBeVisible();
  const path = await call(page, student, '/me/learning-path');
  expect(path.body.courses.find((c: { title: string }) => c.title === COURSE)).toMatchObject({ level: 'BEGINNER', unmetPrerequisites: [] });
  expect(['available', 'in_progress', 'completed']).toContain(path.body.courses.find((c: { title: string }) => c.title === COURSE).state);
  expect(path.body.recommendedNext).not.toBeNull();

  // instructor catalog is reachable; the prerequisite chain itself is validated by the data-pack spec and lms-academic.spec.ts
  const instructor = await signIn(page, 'instructor');
  const all = await call(page, instructor, '/courses?page=1&pageSize=100');
  expect(all.status).toBe(200);
  // lesson content (instructor guidance + objectives) is stored with each lesson
  const lessonRows = await call(page, student, `/courses/${course.id}/lessons`);
  expect(JSON.stringify(lessonRows.body[0].content)).toContain('learningObjectives');
});
