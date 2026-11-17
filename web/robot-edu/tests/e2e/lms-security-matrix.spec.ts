import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Phase 1G authorization matrix over the real API (runtime database role): every probe is an HTTP call a hostile or
 * mistaken client could make. Expected: refused (403/404/409), never data from another school, role or owner.
 */
interface Fixture { courseId: string; lessonId: string; classroomId: string; programDeliveryId: string; otherClassroomId: string; users: Record<string, { userId: string; authUserId: string }> }
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as Fixture;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const REFUSED = [401, 403, 404, 409];

async function token(page: Page, who: string) {
  const r = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`);
  return (await r.json() as { access_token: string }).access_token;
}
async function call(page: Page, t: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, data?: unknown) {
  const response = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${t}` }, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  return { status: response.status(), text };
}

test('Authorization matrix: other-school admin, wrong role, non-owner classmate and unauthenticated callers are refused', async ({ page }) => {
  await page.goto('/');
  const student = await token(page, 'student');
  const instructor = await token(page, 'instructor');
  const peer = await token(page, 'otherStudent'); // an enrolled classmate in the same school (not the attempt owner)
  const otherAdmin = await token(page, 'otherSchoolAdmin');
  const attempts = JSON.parse((await call(page, student, 'GET', '/me/attempts')).text) as Array<{ id: string; classroom_assignment_id: string; status: string }>;
  expect(attempts.length).toBeGreaterThan(0);
  const attemptId = attempts[0].id;
  const delivery = fixture.programDeliveryId;
  const classroom = fixture.classroomId;

  // 1. unauthenticated
  const anonymous = await page.request.get(`${apiBase}/me/attempts`);
  expect(anonymous.status()).toBe(401);
  expect((await page.request.get(`${apiBase}/classrooms/${classroom}/learner-progress`)).status()).toBe(401);

  // 2. a classmate who does not own the attempt: no access to it, its grading, or instructor monitoring
  for (const path of [`/me/attempts/${attemptId}`, `/attempts/${attemptId}/grading`, `/me/attempts/${attemptId}/grading`, `/classrooms/${classroom}/learner-progress`, `/classrooms/${classroom}/quiz-results`, `/classrooms/${classroom}/summary`]) {
    const r = await call(page, peer, 'GET', path);
    expect(REFUSED, `classmate GET ${path} -> ${r.status} ${r.text.slice(0, 80)}`).toContain(r.status);
  }
  // attempt history is scoped to the caller: the classmate sees none of the owner's attempts
  const ownHistory = await call(page, peer, 'GET', `/me/classroom-assignments/${delivery}/attempts`);
  expect((JSON.parse(ownHistory.text) as Array<{ id: string }>).map((a) => a.id)).not.toContain(attemptId);
  expect(REFUSED).toContain((await call(page, peer, 'POST', `/attempts/${attemptId}/grading/reopen`, { reason: 'classmate wants to reopen someone else grade' })).status);

  // 3. another school's administrator
  for (const path of [`/classrooms/${classroom}/learner-progress`, `/classrooms/${classroom}/quiz-results`, `/classrooms/${classroom}/summary`, `/classrooms/${classroom}/learner-progress/${fixture.users.student.userId}/lessons`]) {
    const r = await call(page, otherAdmin, 'GET', path);
    expect(REFUSED, `other-school admin GET ${path} -> ${r.status}`).toContain(r.status);
  }

  // 4. a student (wrong role) cannot read instructor monitoring, edit rubric/schedule, release or reopen grades, or import questions
  for (const [method, path, body] of [
    ['GET', `/classrooms/${classroom}/learner-progress`], ['GET', `/classrooms/${classroom}/quiz-results`],
    ['GET', `/classrooms/${classroom}/assignments/${delivery}/rubric`],
    ['PUT', `/classrooms/${classroom}/assignments/${delivery}/rubric`, { criteria: [{ title: 'x', maxPoints: 1 }] }],
    ['PATCH', `/classrooms/${classroom}/assignments/${delivery}/schedule`, { maxAttempts: 99 }],
    ['POST', `/attempts/${attemptId}/grading/reopen`, { reason: 'student wants a different grade' }],
  ] as Array<['GET' | 'POST' | 'PUT' | 'PATCH', string, unknown?]>) {
    const r = await call(page, student, method, path, body);
    expect(REFUSED, `student ${method} ${path} -> ${r.status} ${r.text.slice(0, 80)}`).toContain(r.status);
  }

  // 4b. a student who attaches a real CSV is refused too (multipart path), and nothing is created
  const csv = 'type,difficulty,bloom,stem,option_a,option_b,option_c,option_d,option_e,correct,points,explanation,tags\r\nsingle_choice,easy,remember,Q?,A,B,,,,A,1,x,\r\n';
  for (const suffix of ['import/preview', 'import']) {
    const r = await page.request.post(`${apiBase}/author/question-bank/quiz-authoring/lessons/${fixture.lessonId}/${suffix}`, { headers: { Authorization: `Bearer ${student}` }, multipart: { file: { name: 'q.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }, objectiveId: '00000000-0000-4000-8000-000000000000' } });
    expect(REFUSED, `student multipart ${suffix} -> ${r.status()} ${(await r.text()).slice(0, 80)}`).toContain(r.status());
  }

  // 5. the owning instructor is allowed the monitoring reads (positive control: the refusals above are not a blanket failure)
  expect((await call(page, instructor, 'GET', `/classrooms/${classroom}/learner-progress`)).status).toBe(200);
  expect((await call(page, instructor, 'GET', `/classrooms/${classroom}/quiz-results`)).status).toBe(200);
  // ... but not for a classroom of another school
  expect(REFUSED).toContain((await call(page, instructor, 'GET', `/classrooms/${fixture.otherClassroomId}/learner-progress`)).status);

  // 6. a draft (unpublished) course is invisible to students: lessons, path and media listing are refused
  const created = await call(page, instructor, 'POST', '/admin/courses', { title: `Security draft ${Date.now().toString(36)}`, description: 'unpublished' });
  expect(created.status, created.text.slice(0, 120)).toBeLessThan(300);
  const draftId = (JSON.parse(created.text) as { id: string }).id;
  for (const path of [`/courses/${draftId}/lessons`, `/me/courses/${draftId}/path`, `/admin/courses/${draftId}/media`]) {
    const r = await call(page, student, 'GET', path);
    expect(REFUSED, `student GET ${path} -> ${r.status}`).toContain(r.status);
  }
});
