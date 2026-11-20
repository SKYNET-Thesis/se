import { expect, test } from '@playwright/test';
import { SO101_CURRICULUM } from '../../../../services/education-api/src/scripts/so101-curriculum.data';
import { call, deliverCourse, loadFixture, signIn } from './helpers/academic';

/** School catalog and authorized self-enrollment: opt-in by the school, eligibility reasons, capacity, prerequisites, cross-school isolation. */
const [BEGINNER, INTERMEDIATE] = SO101_CURRICULUM;
const run = Date.now().toString(36).toUpperCase();

test('Student discovers courses opened by the school and enrolls under the school\'s policies', async ({ page }) => {
  test.setTimeout(300_000);
  const fixture = await loadFixture();
  // School Admin delivers two classrooms with NO members; only the beginner one is opened for self-enrollment (capacity 1), the intermediate one is open too.
  const beginnerRoom = await deliverCourse(page, fixture, BEGINNER.title, `Self enroll beginner ${run}`, [], { selfEnrollment: true, capacity: 1 });
  const closedRoom = await deliverCourse(page, fixture, BEGINNER.title, `Closed room ${run}`, []);   // default: closed
  const intermediateRoom = await deliverCourse(page, fixture, INTERMEDIATE.title, `Self enroll intermediate ${run}`, [], { selfEnrollment: true });

  // 'otherStudent' enrolls; the main fixture student may already be enrolled in this course by earlier specs, which the catalog must report
  const alreadyEnrolled = await signIn(page, fixture, 'student');
  const hint = await call(page, alreadyEnrolled, 'GET', '/me/course-catalog');
  for (const item of (hint.body.items as Array<{ title: string; eligible: boolean; reasons: string[] }>).filter((i) => i.title === BEGINNER.title && !i.eligible)) expect(item.reasons.join(' ')).toContain('already enrolled');
  const student = await signIn(page, fixture, 'otherStudent');
  const catalog = await call(page, student, 'GET', '/me/course-catalog');
  expect(catalog.status).toBe(200);
  const items = catalog.body.items as Array<{ classroomId: string; title: string; level: string; tags: string[]; eligible: boolean; reasons: string[]; prerequisites: Array<{ title: string; completed: boolean }>; seatsLeft: number | null }>;
  const beginner = items.find((i) => i.classroomId === beginnerRoom)!; const intermediate = items.find((i) => i.classroomId === intermediateRoom)!;
  expect(items.some((i) => i.classroomId === closedRoom)).toBe(false);                      // closed classrooms are never offered
  expect(beginner).toMatchObject({ title: BEGINNER.title, level: 'BEGINNER', eligible: true, seatsLeft: 1 });
  expect(intermediate).toMatchObject({ level: 'INTERMEDIATE', eligible: false });
  expect(intermediate.reasons.join(' ')).toContain(`Complete ${BEGINNER.title} first`);
  expect(intermediate.prerequisites).toEqual([{ id: expect.any(String), title: BEGINNER.title, completed: false }]);
  expect((await call(page, student, 'GET', '/me/course-catalog?level=INTERMEDIATE&tag=simulation')).body.items.map((i: { classroomId: string }) => i.classroomId)).toContain(intermediateRoom);
  expect((await call(page, student, 'GET', '/me/course-catalog?level=ADVANCED')).body.items.some((i: { classroomId: string }) => i.classroomId === beginnerRoom)).toBe(false);
  expect((await call(page, student, 'GET', '/me/course-catalog?level=EXPERT')).status).toBe(400);

  // real browser: filters, prerequisite explanation, disabled enroll button, enroll
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Course catalog' })).toBeVisible();
  await page.getByLabel('Catalog level').selectOption('BEGINNER');
  const card = page.getByRole('listitem').filter({ hasText: `Self enroll beginner ${run}` });
  await expect(card.getByTestId('level-badge')).toHaveText('Beginner');
  await page.getByLabel('Catalog level').selectOption('INTERMEDIATE');
  const locked = page.getByRole('listitem').filter({ hasText: `Self enroll intermediate ${run}` });
  await expect(locked).toContainText(`Prerequisites: ${BEGINNER.title}`);
  await expect(locked.getByRole('note')).toContainText('first');
  await expect(locked.getByRole('button', { name: /^Enroll in/ })).toBeDisabled();
  await page.getByLabel('Catalog level').selectOption('BEGINNER');
  await card.getByRole('button', { name: `Enroll in ${BEGINNER.title}` }).click();
  await expect(page.getByRole('status')).toContainText(`You are enrolled in ${BEGINNER.title}`);

  // enrolled: the course is now delivered (courses + learning path); it disappears from the catalog; policies still bite
  const courses = await call(page, student, 'GET', '/courses?page=1&pageSize=100');
  expect((courses.body.items as Array<{ title: string }>).some((c) => c.title === BEGINNER.title)).toBe(true);
  expect((await call(page, student, 'GET', '/me/course-catalog')).body.items.some((i: { classroomId: string }) => i.classroomId === beginnerRoom)).toBe(false);
  expect((await call(page, student, 'POST', `/me/course-catalog/${intermediateRoom}/enroll`)).status).toBe(409);         // prerequisite not completed
  expect((await call(page, student, 'POST', `/me/course-catalog/${closedRoom}/enroll`)).status).toBe(404);               // closed by the school
  expect((await call(page, student, 'POST', `/me/course-catalog/${beginnerRoom}/enroll`)).status).toBe(404);             // already a member
  const full = await call(page, await signIn(page, fixture, 'student'), 'POST', `/me/course-catalog/${beginnerRoom}/enroll`);
  expect(full.status).toBe(409);                                                                                         // capacity 1 reached
  expect(full.body.message).toContain('full');
  await signIn(page, fixture, 'otherStudent');

  // cross-school isolation: a user of another school sees nothing and cannot enroll anywhere
  const foreign = await signIn(page, fixture, 'otherSchoolAdmin');
  expect((await call(page, foreign, 'GET', '/me/course-catalog')).body.items).toEqual([]);
  expect((await call(page, foreign, 'POST', `/me/course-catalog/${intermediateRoom}/enroll`)).status).toBe(404);
  expect((await call(page, foreign, 'POST', `/me/course-catalog/00000000-0000-4000-8000-000000000999/enroll`)).status).toBe(404);
  expect((await call(page, student, 'POST', `/me/course-catalog/not-a-uuid/enroll`)).status).toBe(400);
});
