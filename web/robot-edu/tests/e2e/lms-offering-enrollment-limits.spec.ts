import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { call, loadFixture, signIn, type Fixture } from './helpers/academic';

/**
 * Offering rules on student SELF-enrollment through the real browser, API and PostgreSQL: the enrollment window and the student cap across
 * every classroom of an offering; clear messages in the catalog and in the refused request; concurrent students cannot exceed the cap;
 * a School Admin can still place students administratively. Students are created fresh so the shared fixture student is untouched.
 */
const run = Date.now().toString(36).toUpperCase();
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim().split('\n')[0];
const COURSE = 'SO-101 Robotics Foundations';
const iso = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
let fixture: Fixture; let courseId = '';
const learners: Array<{ id: string; fixture: Fixture }> = [];

function newStudent(label: string) {
  const authUserId = randomUUID(); const email = `limits-${label}-${run}@example.test`;
  const id = psql(`insert into users(auth_user_id,email,full_name,status,signup_method,email_verified_at) values('${authUserId}','${email}','Limits ${label} ${run}','active','admin_created',now()) returning id`);
  psql(`insert into memberships(user_id,organization_id,role_id,status) values('${id}','${fixture.schoolId}',(select id from roles where code='student' limit 1),'active')`);
  const learner = { id, fixture: { schoolId: fixture.schoolId, otherSchoolId: '', users: { me: { authUserId, userId: id, email } } } as unknown as Fixture };
  learners.push(learner); return learner;
}
const as = (page: Page, learner: { fixture: Fixture }) => signIn(page, learner.fixture, 'me');
const offeringRow = (page: Page, title: string) => page.locator('div.px-5.py-4').filter({ has: page.getByRole('heading', { name: title }) });

/** An offering with the given rules, activated, with `rooms` classrooms opened for self-enrollment. */
async function offeringWithRooms(page: Page, adminToken: string, tag: string, rules: Record<string, unknown>, rooms = 1) {
  const org = `/education-admin/organizations/${fixture.schoolId}`;
  const created = await call(page, adminToken, 'POST', `${org}/course-offerings`, { courseId, code: `LIM-${tag}-${run}`.slice(0, 40), title: `${COURSE} ${tag}`, ...rules });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  expect([200, 201]).toContain((await call(page, adminToken, 'POST', `${org}/course-offerings/${created.body.id}/activate`)).status);
  const classrooms: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < rooms; i += 1) {
    const name = `Limits ${tag} ${i + 1} ${run}`;
    const room = await call(page, adminToken, 'POST', `${org}/classrooms`, { offeringId: created.body.id, name, code: `L${tag}${i}${run}`.slice(0, 30) });
    expect(room.status, JSON.stringify(room.body)).toBe(201);
    expect((await call(page, adminToken, 'PATCH', `${org}/classrooms/${room.body.id}`, { name, code: `L${tag}${i}${run}`.slice(0, 30), selfEnrollmentOpen: true })).status).toBe(200);
    classrooms.push({ id: room.body.id, name });
  }
  return { offeringId: created.body.id as string, classrooms };
}

test.describe.serial('Offering enrollment window and student cap', () => {
  test.beforeAll(async () => { fixture = await loadFixture(); });

  test('the catalog explains a window that has not opened or has closed, the enroll button is off, and the API refuses with codes', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = await signIn(page, fixture, 'schoolAdmin');
    courseId = ((await call(page, admin, 'GET', `/education-admin/organizations/${fixture.schoolId}/published-courses`)).body as Array<{ id: string; title: string }>).find((c) => c.title === COURSE)!.id;
    const future = await offeringWithRooms(page, admin, 'FUT', { enrollmentOpenAt: iso(48), enrollmentCloseAt: iso(96) });
    const closed = await offeringWithRooms(page, admin, 'CLS', { enrollmentOpenAt: iso(-96), enrollmentCloseAt: iso(-1) });
    const open = await offeringWithRooms(page, admin, 'OPN', { enrollmentOpenAt: iso(-1), enrollmentCloseAt: iso(24) });
    const learner = newStudent('window'); const token = await as(page, learner);

    await page.goto('/catalog');
    const card = (name: string) => page.getByRole('listitem').filter({ hasText: name });
    await expect(card(future.classrooms[0].name).getByRole('note')).toContainText(/Enrollment for this course opens on \d{4}-\d{2}-\d{2}/);
    await expect(card(closed.classrooms[0].name).getByRole('note')).toContainText(/Enrollment for this course closed on \d{4}-\d{2}-\d{2}/);
    await expect(card(future.classrooms[0].name).getByRole('button', { name: /Enroll/ })).toBeDisabled();
    await expect(card(closed.classrooms[0].name).getByRole('button', { name: /Enroll/ })).toBeDisabled();
    await expect(card(open.classrooms[0].name)).toContainText(/Enrollment closes/);
    await expect(card(open.classrooms[0].name).getByRole('button', { name: /Enroll/ })).toBeEnabled();

    // a direct request is refused the same way, with machine-readable codes, and nothing is created
    const early = await call(page, token, 'POST', `/me/course-catalog/${future.classrooms[0].id}/enroll`);
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ code: 'ENROLLMENT_NOT_ELIGIBLE', reasonCodes: ['ENROLLMENT_NOT_OPEN'] });
    expect((await call(page, token, 'POST', `/me/course-catalog/${closed.classrooms[0].id}/enroll`)).body).toMatchObject({ reasonCodes: ['ENROLLMENT_CLOSED'] });
    expect(psql(`select count(*) from learning_classroom_members where user_id='${learner.id}'`)).toBe('0');

    // inside the window the student enrolls from the page
    await card(open.classrooms[0].name).getByRole('button', { name: /Enroll/ }).click();
    await expect(page.getByRole('status').filter({ hasText: /You are enrolled in/ })).toBeVisible();
    expect(psql(`select count(*) from learning_enrollments where learner_user_id='${learner.id}' and status='active'`)).toBe('1');
  });

  test('a full offering is closed to self-enrollment in every classroom, the school sees the count, and an administrator can still place a student', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = await signIn(page, fixture, 'schoolAdmin');
    const { offeringId, classrooms } = await offeringWithRooms(page, admin, 'CAP', { maxStudents: 2 }, 2);
    const [a, b, c] = [newStudent('capA'), newStudent('capB'), newStudent('capC')];
    expect((await call(page, await as(page, a), 'POST', `/me/course-catalog/${classrooms[0].id}/enroll`)).status).toBe(201);
    expect((await call(page, await as(page, b), 'POST', `/me/course-catalog/${classrooms[1].id}/enroll`)).status).toBe(201);   // the other classroom takes the second place

    const cToken = await as(page, c);
    const refused = await call(page, cToken, 'POST', `/me/course-catalog/${classrooms[0].id}/enroll`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'ENROLLMENT_NOT_ELIGIBLE', reasonCodes: ['OFFERING_FULL'], message: 'This course is full (2 of 2 places taken).' });
    await page.goto('/catalog');
    const full = page.getByRole('listitem').filter({ hasText: classrooms[1].name });
    await expect(full.getByRole('note')).toContainText('This course is full (2 of 2 places taken).');
    await expect(full.getByRole('button', { name: /Enroll/ })).toBeDisabled();

    // the school's view shows the places taken
    await signIn(page, fixture, 'schoolAdmin');
    await page.goto('/school/offerings');
    await expect(offeringRow(page, `${COURSE} CAP`).getByText('2 of 2 places taken')).toBeVisible();

    // authorized administrative enrollment is not blocked by the cap (the school decides)
    const placed = await call(page, admin, 'POST', `/education-admin/organizations/${fixture.schoolId}/classrooms/${classrooms[0].id}/members`, { userId: c.id });
    expect([200, 201]).toContain(placed.status);
    expect(psql(`select count(*) from learning_enrollments where learner_user_id='${c.id}' and status='active'`)).toBe('1');
    await page.goto('/school/offerings');
    await expect(offeringRow(page, `${COURSE} CAP`).getByText('3 of 2 places taken')).toBeVisible();
    expect(offeringId).toBeTruthy();
  });

  test('six students racing for two places across two classrooms: exactly two succeed, four get a clean 409, the cap holds', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = await signIn(page, fixture, 'schoolAdmin');
    const { offeringId, classrooms } = await offeringWithRooms(page, admin, 'RACE', { maxStudents: 2 }, 2);
    const racers = Array.from({ length: 6 }, (_, i) => newStudent(`race${i}`));
    const tokens = [];
    for (const racer of racers) tokens.push(await as(page, racer));
    const responses = await Promise.all(tokens.map((token, i) => call(page, token, 'POST', `/me/course-catalog/${classrooms[i % 2].id}/enroll`)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(2);
    const refused = responses.filter((r) => r.status !== 201);
    expect(refused.map((r) => r.status)).toEqual([409, 409, 409, 409]);
    for (const r of refused) expect(r.body).toMatchObject({ code: 'ENROLLMENT_NOT_ELIGIBLE' });
    expect(psql(`select count(distinct m.user_id) from learning_classroom_members m join learning_classrooms c on c.id=m.classroom_id where c.offering_id='${offeringId}' and m.classroom_role='student' and m.status='active'`)).toBe('2');
  });

  test.afterAll(() => { /* disposable database: nothing to clean, students and offerings are unique per run */ });
});
