import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface Fixture {
  courseId: string;
  lessonId: string;
  sectionId: string;
  readingActivityId: string;
  videoActivityId: string;
  quizActivityId: string;
  canonicalQuizAssignmentId: string;
  classroomId: string;
  users: Record<string, { userId: string; authUserId: string }>;
}

const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('E2E fixture must be an isolated /tmp fixture file.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;

async function signIn(page: Page, authUserId: string) {
  const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${encodeURIComponent(authUserId)}`);
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((storedSession) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(storedSession));
  }, session);
  await page.reload();
}

test('Course → Lesson → Section → Activity → Preview → Publish → Classroom → Student quiz → Result', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // System Administrator opens the seeded global course in the current Course Builder and publishes it through the readiness review.
  await signIn(page, fixture.users.admin.authUserId);
  await page.goto(`/admin/courses/${fixture.courseId}?tab=curriculum`);
  await expect(page.getByRole('heading', { level: 1, name: /VISTA Phase 2\.4\.3 canonical course/ })).toBeVisible();
  await expect(page.getByText('Safe robot motion').first()).toBeVisible();
  await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
  const learnerPreview = page.getByRole('dialog').last();
  await expect(learnerPreview.getByText('Safety reading').first()).toBeVisible();
  await page.keyboard.press('Escape');

  const alreadyPublished = await page.getByText('Published', { exact: true }).first().isVisible().catch(() => false);
  if (!alreadyPublished) {
    await page.getByRole('button', { name: /Review & Publish|Readiness Checklist/ }).click();
    await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
    await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  }
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();

  // The instructor who teaches the classroom assigns the published canonical quiz (Quizzes page).
  await signIn(page, fixture.users.instructor.authUserId);
  const token = await page.evaluate(() => (JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}') as { access_token?: string }).access_token);
  const existing = await page.request.get(`${process.env.VISTA_E2E_API_BASE_URL}/classrooms/${fixture.classroomId}/assignments`, { headers: { Authorization: `Bearer ${token}` } });
  expect(existing.ok()).toBeTruthy();
  const assigned = await existing.json() as Array<{ id: string; assignment_id: string; status: string }>;
  let delivery = assigned.find((row) => row.assignment_id === fixture.canonicalQuizAssignmentId && row.status === 'published');
  if (!delivery) {
    await page.goto(`/teacher/quizzes?classroomId=${fixture.classroomId}`);
    await page.getByRole('combobox', { name: 'Classroom' }).selectOption(fixture.classroomId);
    await page.getByLabel('Published canonical quiz').selectOption(fixture.canonicalQuizAssignmentId);
    const deliveryResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/classrooms/${fixture.classroomId}/quiz-deliveries`));
    await page.getByRole('button', { name: 'Save quiz as draft' }).click();
    const createdDeliveryResponse = await deliveryResponse;
    expect(createdDeliveryResponse.ok()).toBeTruthy();
    delivery = await createdDeliveryResponse.json() as { id: string; assignment_id: string; status: string };
    const published = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/classrooms/${fixture.classroomId}/assignments/${delivery!.assignment_id}/publish`));
    await page.getByRole('button', { name: 'Publish to learners' }).click();
    expect((await published).ok()).toBeTruthy();
  }

  await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();
  await page.getByRole('tab', { name: 'Quizzes' }).click();
  await expect(page.getByRole('heading', { name: 'Safety knowledge check' }).first()).toBeVisible();
  await page.goto(`/my-learning/${delivery.id}`);
  await expect(page.getByRole('heading', { name: 'Safety knowledge check' })).toBeVisible();
  await page.getByRole('button', { name: /^(Start|Continue) attempt$|^Start a new attempt$/ }).first().click();
  await expect(page).toHaveURL(/\/practice\//);
  await expect(page.getByText('Which command safely stops the robot?')).toBeVisible();
  await page.getByText('Stop motion', { exact: true }).click();
  await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Stop motion')).toBeChecked();
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await page.getByRole('dialog', { name: 'Submit this quiz?' }).getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  await expect(page.getByText(/Score: 100%/)).toBeVisible();
  expect(errors).toEqual([]);
});
