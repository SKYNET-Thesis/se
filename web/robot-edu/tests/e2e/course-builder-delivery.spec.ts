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

  await signIn(page, fixture.users.admin.authUserId);
  await page.goto(`/admin/courses/${fixture.courseId}/edit`);
  await expect(page.getByRole('heading', { level: 1, name: /VISTA Phase 2\.4\.3 canonical course/ })).toBeVisible();

  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('button', { name: 'Lesson 1 · Safe robot motion' }).click();
  await expect(page.getByText('Lesson 1 · Safe robot motion', { exact: true })).toBeVisible();
  await expect(page.getByText('Read and check', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Safety reading', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Safety video preview', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Safety quiz', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'View as Learner' }).click();
  const learnerPreview = page.getByRole('dialog', { name: 'View as Learner' });
  await expect(learnerPreview.getByText('Safety reading')).toBeVisible();
  await expect(learnerPreview.getByText('Safety video preview')).not.toBeVisible();
  await expect(learnerPreview.getByText('Safety quiz')).toBeVisible();
  await learnerPreview.getByText('Safety reading').click();
  await expect(learnerPreview.getByText(/Activity Type: reading/)).toBeVisible();
  await learnerPreview.getByText('Safety quiz').click();
  await expect(learnerPreview.getByText(/Activity Type: knowledge check/)).toBeVisible();
  await learnerPreview.getByRole('button', { name: 'Exit Learner View' }).click();

  if (!(await page.getByRole('heading', { level: 1, name: /VISTA Phase 2\.4\.3 canonical course/ }).innerText()).includes('published')) {
    await page.getByRole('button', { name: 'Review & Publish' }).click();
    await page.getByRole('dialog', { name: 'Course Readiness Checklist' }).getByRole('button', { name: 'Proceed to Review' }).click();
    await page.getByRole('dialog', { name: 'Review & Publish Course' }).getByRole('button', { name: 'Publish Course' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: /VISTA Phase 2\.4\.3 canonical course.*published/ })).toBeVisible();

  await signIn(page, fixture.users.schoolAdmin.authUserId);
  await page.goto('/school/classrooms');
  await expect(page.getByRole('heading', { name: 'Phase 2.4.3 Test Classroom' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Assign a published quiz' })).toBeVisible();
  const token = await page.evaluate(() => (JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}') as { access_token?: string }).access_token);
  const existing = await page.request.get(`${process.env.VISTA_E2E_API_BASE_URL}/classrooms/${fixture.classroomId}/assignments`, { headers: { Authorization: `Bearer ${token}` } });
  expect(existing.ok()).toBeTruthy();
  const assigned = await existing.json() as Array<{ id: string; assignment_id: string; status: string }>;
  let delivery = assigned.find((row) => row.assignment_id === fixture.canonicalQuizAssignmentId && row.status === 'published');
  if (!delivery) {
    await page.getByLabel('Published canonical quiz').selectOption(fixture.canonicalQuizAssignmentId);
    const deliveryResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/classrooms/${fixture.classroomId}/quiz-deliveries`));
    await page.getByRole('button', { name: 'Save quiz as draft' }).click();
    const createdDeliveryResponse = await deliveryResponse;
    expect(createdDeliveryResponse.ok()).toBeTruthy();
    delivery = await createdDeliveryResponse.json() as { id: string; assignment_id: string; status: string };
    const publishDelivery = page.getByRole('button', { name: 'Publish to learners' });
    await expect(publishDelivery).toBeVisible();
    const deliveryPublishResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/classrooms/${fixture.classroomId}/assignments/${delivery!.assignment_id}/publish`), { timeout: 10_000 });
    await publishDelivery.click();
    expect((await deliveryPublishResponse).ok()).toBeTruthy();
  }

  await signIn(page, fixture.users.student.authUserId);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: 'VISTA Phase 2.4.3 canonical course' })).toBeVisible();
  await page.getByRole('tab', { name: 'Quizzes' }).click();
  await expect(page.getByRole('heading', { name: 'Safety knowledge check' }).first()).toBeVisible();
  await page.goto(`/my-learning/${delivery.id}`);
  await expect(page.getByRole('heading', { name: 'Safety knowledge check' })).toBeVisible();
  await page.getByRole('button', { name: /^(Start|Continue) attempt$/ }).click();
  await expect(page).toHaveURL(/\/practice\//);
  await expect(page.getByText('Which command safely stops the robot?')).toBeVisible();
  await page.getByLabel('Stop motion').check();
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  await expect(page.getByText(/Score: 100%/)).toBeVisible();
  expect(errors).toEqual([]);
});
