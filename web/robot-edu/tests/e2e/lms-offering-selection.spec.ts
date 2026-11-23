import { expect, test } from '@playwright/test';
import { loadFixture, signIn, call } from './helpers/academic';

const run = Date.now().toString(36).toUpperCase();
const COURSE = 'VISTA Phase 2.4.3 canonical course';

test('an active Offering keeps its metadata and can be shared by two Classrooms', async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await loadFixture();
  const token = await signIn(page, fixture, 'schoolAdmin');
  const code = `SHARE-${run}`;
  const offeringTitle = `Shared Offering ${run}`;
  const course = ((await call(page, token, 'GET', '/education-admin/organizations/' + fixture.schoolId + '/published-courses')).body as Array<{ id: string; title: string }>).find((item) => item.title === COURSE);
  expect(course, 'the canonical published course is offered to this school').toBeTruthy();

  await page.goto('/school/offerings');
  await page.getByRole('button', { name: 'New offering' }).click();
  const dialog = page.getByRole('dialog', { name: 'New course offering' });
  await dialog.getByLabel(/Published course/).selectOption(course!.id);
  await dialog.getByLabel('Offering code').fill(code);
  await dialog.getByLabel('Title').fill(offeringTitle);
  await dialog.getByLabel(/Academic term/).fill('Spring');
  await dialog.getByLabel(/Academic year/).fill('2027');
  await dialog.getByLabel('Course start date').fill('2027-02-01');
  await dialog.getByLabel('Course end date').fill('2027-06-30');
  await dialog.getByLabel('Enrollment open').fill('2027-01-05');
  await dialog.getByLabel('Enrollment close').fill('2027-01-25');
  await dialog.getByLabel('Max students').fill('37');
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(dialog).not.toBeVisible();
  const rows = await call(page, token, 'GET', `/education-admin/organizations/${fixture.schoolId}/offerings`);
  expect(rows.status).toBe(200);
  const offering = (rows.body as Array<{ id: string; code: string; title: string; courseId: string; academicTerm: string; academicYear: number; startAt: string; endAt: string; enrollmentOpenAt: string; enrollmentCloseAt: string; maxStudents: number }>).find((item) => item.code === code)!;
  expect(offering).toMatchObject({ title: offeringTitle, courseId: course!.id, academicTerm: 'Spring', academicYear: 2027, maxStudents: 37 });
  expect(offering.startAt).toMatch(/^2027-02-01/);
  expect(offering.endAt).toMatch(/^2027-06-30/);
  expect(offering.enrollmentOpenAt).toMatch(/^2027-01-05/);
  expect(offering.enrollmentCloseAt).toMatch(/^2027-01-25/);

  const activated = await call(page, token, 'POST', `/education-admin/organizations/${fixture.schoolId}/course-offerings/${offering.id}/activate`);
  expect([200, 201]).toContain(activated.status);

  const classroomIds: string[] = [];
  for (const suffix of ['A', 'B']) {
    await page.goto('/school/classrooms');
    await page.getByRole('button', { name: 'Create classroom' }).click();
    const create = page.getByRole('dialog', { name: 'Create classroom' });
    await expect(create).toContainText('Multiple classrooms can share the same offering.');
    await create.getByLabel('Classroom name').fill(`Shared Offering ${run} ${suffix}`);
    await create.getByLabel('Classroom code').fill(`SO${run}${suffix}`);
    await create.getByLabel('Active course offering').selectOption(offering.id);
    await create.getByRole('button', { name: 'Create classroom' }).click();
    await expect(create).not.toBeVisible();
    await expect(page).toHaveURL(/\/school\/classrooms\/[0-9a-f-]+$/);
    const list = await call(page, token, 'GET', `/education-admin/organizations/${fixture.schoolId}/classrooms`);
    expect(list.status).toBe(200);
    const classroom = (list.body as Array<{ id: string; name: string; offering_id: string }>).find((item) => item.name === `Shared Offering ${run} ${suffix}`);
    expect(classroom?.offering_id).toBe(offering.id);
    classroomIds.push(classroom!.id);
  }
  expect(classroomIds).toHaveLength(2);
  const finalList = (await call(page, token, 'GET', `/education-admin/organizations/${fixture.schoolId}/classrooms`)).body as Array<{ id: string; offering_id: string }>;
  expect(finalList.filter((item) => classroomIds.includes(item.id)).map((item) => item.offering_id)).toEqual([offering.id, offering.id]);
});
