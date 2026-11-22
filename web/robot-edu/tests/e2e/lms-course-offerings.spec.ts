import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { SO101_CURRICULUM } from '../../../../services/education-api/src/scripts/so101-curriculum.data';

/**
 * Course offerings inside Course management: one course, many offerings; administrators view and create them from the course itself using
 * the existing school-scoped API; school isolation and roles hold. Real browser, real Education API, isolated PostgreSQL.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { schoolId: string; otherSchoolId: string; users: Record<string, { authUserId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const run = Date.now().toString(36).toUpperCase();
const COURSE = SO101_CURRICULUM[0].title;
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim().split('\n')[0];

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
const openSettings = async (page: Page, courseId: string) => {
  await page.goto(`/admin/courses/${courseId}`);
  await page.getByRole('tab', { name: 'Settings' }).click();
  return page.getByRole('region', { name: 'Course offerings' });
};

test('a School Administrator views and creates several offerings of one course from Course management; other schools and roles are isolated', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  // A school-owned, published course of the fixture school (a school administrator manages their own school's courses; global courses are offered from School offerings)
  const courseTitle = `Offer Course ${run}`;
  const courseId = psql(`INSERT INTO learning_courses(title,status,organization_id) VALUES ('${courseTitle}','published','${fixture.schoolId}') RETURNING id`);
  const course = { id: courseId };
  const admin = await signIn(page, 'schoolAdmin');
  const lessonsBefore = (await call(page, admin, 'GET', `/courses/${course.id}/lessons`)).body.length;

  // view: the panel is inside the course's Settings tab and starts without our offerings
  let panel = await openSettings(page, course.id);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('shared, never copied');
  await expect(panel).not.toContainText(`OFF-${run}-A`);

  // create two offerings of the SAME course from the course itself
  for (const [code, term] of [[`OFF-${run}-A`, 'Fall'], [`OFF-${run}-B`, 'Spring']] as const) {
    await panel.getByRole('button', { name: 'New offering' }).click();
    const dialog = page.getByRole('dialog', { name: 'New offering' });
    await dialog.getByLabel('Offering code').fill(code);
    await dialog.getByLabel(/Academic term/).fill(term);
    await dialog.getByLabel(/Academic year/).fill('2026');
    await dialog.getByRole('button', { name: 'Create draft' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(panel).toContainText(code);
  }
  await expect(panel.getByRole('listitem').filter({ hasText: `OFF-${run}-A` })).toContainText('draft');
  await expect(panel.getByRole('listitem').filter({ hasText: `OFF-${run}-B` })).toContainText('Spring 2026');

  // a duplicate code is explained by the server's own rule
  await panel.getByRole('button', { name: 'New offering' }).click();
  const dialog = page.getByRole('dialog', { name: 'New offering' });
  await dialog.getByLabel('Offering code').fill(`OFF-${run}-A`);
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(dialog.getByRole('alert')).toContainText('already exists');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // persistence, the existing School offerings page shows the same rows, and nothing was duplicated
  await page.reload();
  panel = await openSettings(page, course.id);
  await expect(panel).toContainText(`OFF-${run}-A`); await expect(panel).toContainText(`OFF-${run}-B`);
  const listed = (await call(page, admin, 'GET', `/education-admin/organizations/${fixture.schoolId}/offerings`)).body as Array<{ code: string; courseId: string; classrooms: number }>;
  expect(listed.filter((item) => item.code.startsWith(`OFF-${run}-`)).map((item) => item.courseId)).toEqual([course.id, course.id]);
  await page.goto('/school/offerings');
  await expect(page.getByText(`OFF-${run}-A`)).toBeVisible();
  expect((await call(page, admin, 'GET', `/courses/${course.id}/lessons`)).body.length).toBe(lessonsBefore);
  expect(((await call(page, admin, 'GET', '/courses?page=1&pageSize=100')).body.items as Array<{ title: string }>).filter((item) => item.title === courseTitle)).toHaveLength(1);

  // another school's administrator sees none of these, cannot read them, and cannot create into this school
  const other = await signIn(page, 'otherSchoolAdmin');
  expect([403, 404]).toContain((await call(page, other, 'GET', `/education-admin/organizations/${fixture.schoolId}/offerings`)).status);
  expect([403, 404]).toContain((await call(page, other, 'POST', `/education-admin/organizations/${fixture.schoolId}/course-offerings`, { courseId: course.id, code: `X-${run}` })).status);
  await page.goto(`/admin/courses/${course.id}`);
  await expect(page.getByRole('region', { name: 'Course offerings' })).toHaveCount(0);      // another school's course: no offerings surface at all
  expect([403, 404]).toContain((await call(page, other, 'GET', `/courses/${course.id}`)).status);

  // an instructor cannot create offerings (no panel, API refuses)
  const instructor = await signIn(page, 'instructor');
  expect([403, 404]).toContain((await call(page, instructor, 'POST', `/education-admin/organizations/${fixture.schoolId}/course-offerings`, { courseId: course.id, code: `I-${run}` })).status);
  await page.goto(`/admin/courses/${course.id}`);
  await expect(page.getByRole('region', { name: 'Course offerings' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a System Administrator chooses a school for a global course, sees only that school\'s offerings and can create one', async ({ page }) => {
  test.setTimeout(120_000);
  const admin = await signIn(page, 'admin');
  const courses = await call(page, admin, 'GET', '/courses?page=1&pageSize=100');
  const course = (courses.body.items as Array<{ id: string; title: string }>).find((item) => item.title === COURSE)!;
  const panel = await openSettings(page, course.id);
  await expect(panel).toContainText('Choose a school to see and create');
  await expect(panel.getByRole('button', { name: 'New offering' })).toHaveCount(0);       // nothing can be created before a school is chosen
  const choose = panel.getByLabel('School');
  const schoolName = (await call(page, admin, 'GET', '/education-admin/organizations/managed')).body.find((item: { id: string }) => item.id === fixture.schoolId).name as string;
  await choose.selectOption({ label: schoolName });
  await panel.getByRole('button', { name: 'New offering' }).click();
  const dialog = page.getByRole('dialog', { name: 'New offering' });
  await dialog.getByLabel('Offering code').fill(`SYS-${run}`);
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(panel).toContainText(`SYS-${run}`);
  const listed = (await call(page, admin, 'GET', `/education-admin/organizations/${fixture.otherSchoolId}/offerings`)).body as Array<{ code: string }>;
  expect(listed.some((item) => item.code === `SYS-${run}`)).toBe(false);                   // it went to the chosen school only
});
