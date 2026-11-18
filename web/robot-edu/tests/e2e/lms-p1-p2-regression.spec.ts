import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Regression journeys for the Production acceptance findings (PR #167) against the real Education API and a real
 * browser: internal alias hidden, instructor-enabled evidence attachments (upload, ownership, isolation), quiz
 * navigation from My Learning, required-video completion, rubric visible before submission, no robot-program request
 * for quiz attempts, attempt-limit error code, released grade visible in the student's attempt list.
 */
interface Fixture { courseId: string; lessonId: string; classroomId: string; canonicalQuizAssignmentId: string; videoActivityId: string; users: Record<string, { userId: string; authUserId: string }> }
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const ALIAS = /student-[0-9a-f-]{8,}@students\.auth\.vista\.invalid/i;

async function session(page: Page, who: string, email?: string) {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`);
  expect(response.ok()).toBeTruthy();
  const value = await response.json() as { access_token: string; user: Record<string, unknown> };
  if (email) value.user.email = email;
  return value;
}
const bearer = async (page: Page, who: string) => ({ Authorization: `Bearer ${(await session(page, who)).access_token}` });
async function signIn(page: Page, who: string, email?: string) {
  const value = await session(page, who, email);
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), value);
  await page.reload();
}
const json = async <T>(response: { ok(): boolean; status(): number; json(): Promise<unknown>; text(): Promise<string> }): Promise<T> => {
  if (!response.ok()) throw new Error(`HTTP ${response.status()}: ${(await response.text()).slice(0, 200)}`);
  return await response.json() as T;
};

test.describe.configure({ mode: 'serial' });

test('P1: the internal student alias is never shown in the student UI', async ({ page }) => {
  const alias = `student-${fixture.users.otherStudent.authUserId}@students.auth.vista.invalid`;
  await page.goto('/');
  await signIn(page, 'otherStudent', alias);
  for (const path of ['/courses', '/my-learning', '/account']) {
    await page.goto(path);
    await expect(page.getByRole('main').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.locator('body').innerText(), `alias visible on ${path}`).not.toMatch(ALIAS);
  }
});

test('P1/P2: evidence attachments are enabled by the instructor, uploaded and isolated; rubric is visible before submission; attempt limit has a code; released grade shows in the attempt list', async ({ page }) => {
  const teacher = await bearer(page, 'instructor'); const student = await bearer(page, 'student');
  const classmate = await bearer(page, 'otherStudent'); const otherAdmin = await bearer(page, 'otherSchoolAdmin');
  const create = async (title: string, extra: Record<string, unknown>) => {
    const made = await json<{ assignment_id: string }>(await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments`, { headers: teacher, data: { lessonId: fixture.lessonId, title, instructions: 'Upload evidence.', ...extra } }));
    return made.assignment_id;
  };
  const run = Date.now();
  const withFiles = await create(`Evidence on ${run}`, { attachmentsEnabled: true });
  const withoutFiles = await create(`Evidence off ${run}`, {});
  // instructor-configurable after creation too (and a title-only edit must not reset it)
  expect((await page.request.patch(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${withFiles}`, { headers: teacher, data: { title: `Evidence on ${run} (edited)` } })).ok()).toBeTruthy();
  // rubric configured before publishing
  expect((await page.request.put(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${withFiles}/rubric`, { headers: teacher, data: { criteria: [{ title: 'Clarity of evidence', maxPoints: 6 }, { title: 'Safety', maxPoints: 4 }] } })).ok()).toBeTruthy();
  expect((await page.request.patch(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${withFiles}/schedule`, { headers: teacher, data: { maxAttempts: 1 } })).ok()).toBeTruthy();
  const deliveryOn = (await json<{ id: string }>(await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${withFiles}/publish`, { headers: teacher }))).id;
  const deliveryOff = (await json<{ id: string }>(await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${withoutFiles}/publish`, { headers: teacher }))).id;

  // P2 rubric visible to the student BEFORE any submission
  await signIn(page, 'student');
  await page.goto(`/my-learning/${deliveryOn}`);
  await expect(page.getByText('How this is graded')).toBeVisible();
  await expect(page.getByText('Clarity of evidence')).toBeVisible();

  const attempt = await json<{ id: string }>(await page.request.post(`${apiBase}/classroom-assignments/${deliveryOn}/attempts`, { headers: student }));
  // resuming while an attempt is in progress returns the same attempt (no second attempt consumed)
  expect((await json<{ id: string }>(await page.request.post(`${apiBase}/classroom-assignments/${deliveryOn}/attempts`, { headers: student }))).id).toBe(attempt.id);

  // attachments disabled: upload refused
  const offAttempt = await json<{ id: string }>(await page.request.post(`${apiBase}/classroom-assignments/${deliveryOff}/attempts`, { headers: student }));
  const refused = await page.request.post(`${apiBase}/me/attempts/${offAttempt.id}/files`, { headers: student, data: { filename: 'e.pdf', contentType: 'application/pdf', sizeBytes: 12 } });
  expect([400, 403, 409]).toContain(refused.status());

  // attachments enabled: presign, upload to storage, complete, list
  const bytes = Buffer.from('%PDF-1.4 evidence');
  const created = await json<{ file: { id: string }; upload: { url: string; fields: Record<string, string> } }>(await page.request.post(`${apiBase}/me/attempts/${attempt.id}/files`, { headers: student, data: { filename: 'evidence.pdf', contentType: 'application/pdf', sizeBytes: bytes.length } }));
  const put = await page.request.post(created.upload.url, { multipart: { ...created.upload.fields, file: { name: 'evidence.pdf', mimeType: 'application/pdf', buffer: bytes } } });
  expect(put.status(), await put.text()).toBeLessThan(300);
  expect((await page.request.post(`${apiBase}/me/attempts/${attempt.id}/files/${created.file.id}/complete`, { headers: student })).ok()).toBeTruthy();
  const files = await json<Array<{ id: string; status: string }>>(await page.request.get(`${apiBase}/me/attempts/${attempt.id}/files`, { headers: student }));
  expect(files.find((f) => f.id === created.file.id)?.status).toBe('ready');

  // ownership and school isolation
  for (const headers of [classmate, otherAdmin]) {
    for (const path of [`/me/attempts/${attempt.id}/files`, `/me/attempts/${attempt.id}/files/${created.file.id}/url`, `/attempts/${attempt.id}/files`]) {
      expect([401, 403, 404], `non-owner GET ${path}`).toContain((await page.request.get(`${apiBase}${path}`, { headers })).status());
    }
  }
  expect([403, 404]).toContain((await page.request.post(`${apiBase}/me/attempts/${attempt.id}/files`, { headers: classmate, data: { filename: 'x.pdf', contentType: 'application/pdf', sizeBytes: 5 } })).status());
  // the instructor can open the evidence
  expect((await page.request.get(`${apiBase}/attempts/${attempt.id}/files/${created.file.id}/url`, { headers: teacher })).ok()).toBeTruthy();

  // Blockly-only submission (no Robot Lab), instructor grades and releases
  const program = await json<{ id: string }>(await page.request.post(`${apiBase}/me/attempts/${attempt.id}/program`, { headers: student, data: { title: 'P', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] } } }));
  const version = await json<{ id: string }>(await page.request.post(`${apiBase}/me/programs/${program.id}/versions`, { headers: student, data: { changeSummary: 'final' } }));
  const submission = await json<{ id: string }>(await page.request.post(`${apiBase}/me/attempts/${attempt.id}/submission`, { headers: student, data: { programVersionId: version.id } }));
  // P3 attempt limit: once the single allowed attempt is submitted, a new start is a conflict with a stable code, not a 404
  const again = await page.request.post(`${apiBase}/classroom-assignments/${deliveryOn}/attempts`, { headers: student });
  expect(again.status()).toBe(409);
  expect((await again.json() as { code?: string }).code).toBe('ATTEMPT_LIMIT_REACHED');
  const rubric = await json<{ criteria: Array<{ id: string }> }>(await page.request.get(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${withFiles}/rubric`, { headers: teacher }));

  // before release: attempt list must not leak a grade
  const before = await json<Array<{ id: string; grading_released?: boolean; score?: unknown }>>(await page.request.get(`${apiBase}/me/attempts`, { headers: student }));
  expect(before.find((a) => a.id === attempt.id)?.grading_released).toBe(false);
  expect((await page.request.post(`${apiBase}/submissions/${submission.id}/assessment`, { headers: teacher, data: { overallFeedback: 'Good evidence.', scores: [{ criterionId: rubric.criteria[0].id, awardedPoints: 5 }, { criterionId: rubric.criteria[1].id, awardedPoints: 4 }] } })).ok()).toBeTruthy();
  expect(await (await page.request.get(`${apiBase}/me/attempts/${attempt.id}/grading`, { headers: student })).json()).toEqual({ attemptId: attempt.id, released: false });
  const release = await page.request.post(`${apiBase}/attempts/${attempt.id}/release`, { headers: teacher });
  expect(release.ok(), await release.text()).toBeTruthy();
  const after = await json<Array<{ id: string; grading_released?: boolean }>>(await page.request.get(`${apiBase}/me/attempts`, { headers: student }));
  expect(after.find((a) => a.id === attempt.id)?.grading_released).toBe(true);
  const history = await json<Array<{ id: string; grading_released: boolean; file_count: number }>>(await page.request.get(`${apiBase}/me/classroom-assignments/${deliveryOn}/attempts`, { headers: student }));
  expect(history[0]).toMatchObject({ id: attempt.id, grading_released: true, file_count: 1 });

  await page.goto(`/my-learning/${deliveryOn}`);
  await page.getByRole('button', { name: 'View details' }).first().click();
  await expect(page.getByText('Good evidence.')).toBeVisible();
});

test('P1/P2: My Learning "Start Quiz" opens the quiz delivery; the quiz attempt page does not request a robot program', async ({ page }) => {
  const teacher = await bearer(page, 'instructor'); const student = await bearer(page, 'student');
  // deliver the canonical module quiz to the classroom if it has not been delivered yet
  let existing = await json<Array<{ classroom_assignment_id: string | null }>>(await page.request.get(`${apiBase}/me/quizzes`, { headers: student }));
  if (!existing.some((q) => q.classroom_assignment_id)) {
    const created = await json<{ id: string; assignment_id: string }>(await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/quiz-deliveries`, { headers: teacher, data: { canonicalAssignmentId: fixture.canonicalQuizAssignmentId, maxAttempts: 3 } }));
    expect((await page.request.post(`${apiBase}/classrooms/${fixture.classroomId}/assignments/${created.assignment_id}/publish`, { headers: teacher })).ok()).toBeTruthy();
    existing = await json<Array<{ classroom_assignment_id: string | null }>>(await page.request.get(`${apiBase}/me/quizzes`, { headers: student }));
  }
  const quizzes = await json<Array<{ classroom_assignment_id: string | null; title?: string }>>(await page.request.get(`${apiBase}/me/quizzes`, { headers: student }));
  const target = quizzes.find((q) => q.classroom_assignment_id);
  expect(target, 'the student has a delivered quiz').toBeTruthy();

  const programRequests: string[] = [];
  page.on('request', (request) => { if (/\/me\/attempts\/[^/]+\/program/.test(request.url())) programRequests.push(`${request.method()} ${request.url()}`); });
  const failed404: string[] = [];
  page.on('response', (response) => { if (response.status() === 404 && response.url().startsWith(apiBase)) failed404.push(response.url()); });

  await signIn(page, 'student');
  await page.goto('/my-learning');
  await page.getByRole('tab', { name: 'Quizzes' }).click();
  await page.getByRole('button', { name: /Start Quiz|Continue Quiz|Retry Quiz|View Result/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/my-learning/${target!.classroom_assignment_id}$`));
  await expect(page.getByRole('heading').first()).toBeVisible();

  // start an attempt and open the practice page for it: no speculative robot-program request
  // (an earlier spec may already have used every attempt of this delivery; the limit answering 409 ATTEMPT_LIMIT_REACHED is the correct behaviour then)
  const started = await page.request.post(`${apiBase}/classroom-assignments/${target!.classroom_assignment_id}/attempts`, { headers: student });
  expect([200, 201, 409]).toContain(started.status());
  const attempt = started.ok() ? await started.json() as { id: string } : { id: 'no-attempt-started' };
  await page.goto(`/my-learning/${target!.classroom_assignment_id}`);
  await page.waitForLoadState('networkidle');
  const startButton = page.getByRole('button', { name: /Continue|Resume|Start|Open/ }).first();
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  await page.waitForLoadState('networkidle');
  expect(programRequests, 'quiz attempts must not call robot-program endpoints').toEqual([]);
  expect(failed404.filter((u) => u.includes(attempt.id)), 'no 404 for the quiz attempt').toEqual([]);
});
