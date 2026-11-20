import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Academic LMS metadata against the real API, PostgreSQL authorization and the restricted runtime role:
 * course level, tags, prerequisites, catalog filters, learning path, assignment difficulty/grading, cross-school isolation.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as {
  courseId: string; classroomId: string; programDeliveryId: string; lessonId: string; otherClassroomId: string; otherSchoolId: string; schoolId: string;
  users: Record<string, { authUserId: string }>;
};
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const run = Date.now().toString(36);

async function session(page: Page, who: string) { return (await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json()) as { access_token: string }; }
async function signIn(page: Page, who: string) {
  const s = await session(page, who);
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
  return s.access_token;
}
const call = async (page: Page, token: string, method: string, path: string, data?: unknown) => {
  const r = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status(), body };
};

test.describe.configure({ mode: 'serial' });
let courseA = ''; let courseB = '';

test('A: instructor creates beginner courses with tags and prerequisites; validation, duplicates and cycles are enforced', async ({ page }) => {
  const token = await signIn(page, 'instructor');
  const a = await call(page, token, 'POST', '/admin/courses', { title: `Beginner SO-101 ${run}`, level: 'BEGINNER', tags: ['SO-101', ' so-101 ', 'Blockly', 'Robotics'] });
  expect(a.status, JSON.stringify(a.body)).toBe(201); courseA = a.body.id;
  const detail = await call(page, token, 'GET', `/courses/${courseA}`);
  expect(detail.body).toMatchObject({ level: 'BEGINNER', levelLabel: 'Beginner', tags: ['SO-101', 'Blockly', 'Robotics'], prerequisiteCourseIds: [] }); // duplicate prevented case-insensitively
  const b = await call(page, token, 'POST', '/admin/courses', { title: `Intermediate Kinematics ${run}`, level: 'INTERMEDIATE', tags: ['Robot Kinematics', 'Python'], prerequisiteCourseIds: [courseA] });
  expect(b.status, JSON.stringify(b.body)).toBe(201); courseB = b.body.id;
  expect((await call(page, token, 'GET', `/courses/${courseB}`)).body.prerequisiteCourseIds).toEqual([courseA]);

  expect((await call(page, token, 'POST', '/admin/courses', { title: 'x', level: 'EXPERT' })).status).toBe(400);
  expect((await call(page, token, 'POST', '/admin/courses', { title: 'x', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).status).toBe(400);
  expect((await call(page, token, 'PATCH', `/admin/courses/${courseA}`, { prerequisiteCourseIds: [courseA] })).status).toBe(400);   // self
  const cycle = await call(page, token, 'PATCH', `/admin/courses/${courseA}`, { prerequisiteCourseIds: [courseB] });               // A -> B -> A
  expect(cycle.status, JSON.stringify(cycle.body)).toBe(409);
  const foreign = await call(page, await signIn(page, 'otherSchoolAdmin'), 'POST', '/admin/courses', { title: `Foreign ${run}`, level: 'ADVANCED' });
  if (foreign.status === 201) expect((await call(page, token, 'PATCH', `/admin/courses/${courseA}`, { prerequisiteCourseIds: [foreign.body.id] })).status).toBe(400); // other school's course
  const vocab = (await call(page, token, 'GET', '/course-tags')).body as { used: Array<{ tag: string }>; suggested: string[] };
  expect([...vocab.used.map((entry) => entry.tag), ...vocab.suggested]).toEqual(expect.arrayContaining(['SO-101', 'Simulation', 'Computer Vision', 'Robot Control'])); // existing + suggested vocabulary
  const filtered = await call(page, token, 'GET', `/courses?level=INTERMEDIATE&tag=python&page=1&pageSize=50`);
  expect(filtered.body.items.map((c: { id: string }) => c.id)).toContain(courseB);
  expect(filtered.body.items.map((c: { id: string }) => c.id)).not.toContain(courseA);
});

test('B: course builder shows level, tags and prerequisites and saves edits', async ({ page }) => {
  await signIn(page, 'instructor');
  await page.goto(`/admin/courses/${courseA}?tab=details`);
  const panel = page.getByRole('group', { name: 'Academic classification' });
  await expect(panel.getByLabel('Course level')).toHaveValue('BEGINNER');
  await expect(panel.getByRole('list', { name: 'Selected tags' })).toContainText('SO-101');
  await panel.getByLabel('Add tag').fill('Simulation');
  await panel.getByRole('button', { name: 'Add tag' }).click();
  await panel.getByLabel('Add tag').fill('simulation');            // duplicate (case-insensitive) is refused with a message
  await panel.getByRole('button', { name: 'Add tag' }).click();
  await expect(panel.getByRole('alert')).toContainText('already added');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Course details saved.')).toBeVisible();
  const token = await signIn(page, 'instructor');
  expect((await call(page, token, 'GET', `/courses/${courseA}`)).body.tags).toEqual(['SO-101', 'Blockly', 'Robotics', 'Simulation']);
});

test('D/H: an enrolled student filters the catalog by level and tag and sees the learning path with a recommendation', async ({ page }) => {
  const admin = await signIn(page, 'admin'); // the seeded canonical course is a global course: only a System Administrator may classify it
  expect((await call(page, admin, 'PATCH', `/admin/courses/${fixture.courseId}`, { level: 'BEGINNER', tags: ['SO-101', 'Blockly'] })).status).toBe(200);
  await signIn(page, 'student');
  await page.goto('/courses');
  const tile = page.getByRole('article').filter({ hasText: 'VISTA Phase 2.4.3 canonical course' }).first();
  await expect(tile.getByTestId('level-badge')).toHaveText('Beginner');
  await page.getByLabel('Filter by level').selectOption('ADVANCED');
  await expect(page.getByText('No matching courses')).toBeVisible();
  await page.getByLabel('Filter by level').selectOption('BEGINNER');
  await page.getByLabel('Filter by tag').selectOption('Blockly');
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await page.goto('/learning-path');
  await expect(page.getByRole('heading', { name: 'My learning path' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Level progress' }).getByTestId('level-badge')).toHaveCount(3);
  const recommended = page.getByRole('region', { name: 'Recommended next course' });
  await expect(recommended).toBeVisible();
  const student = await signIn(page, 'student');
  const path = await call(page, student, 'GET', '/me/learning-path');
  expect(path.status).toBe(200);
  const entry = path.body.courses.find((c: { id: string }) => c.id === fixture.courseId);
  expect(entry).toMatchObject({ level: 'BEGINNER', levelLabel: 'Beginner' });
  expect(['available', 'in_progress', 'completed']).toContain(entry.state); // a beginner course needs no hardware or AI model to start
  expect(path.body.levels.find((l: { code: string }) => l.code === 'BEGINNER').total).toBeGreaterThanOrEqual(1);
});

test('I/J: assignment difficulty is independent of the course level, grading rules hold, students see it, other schools cannot touch it', async ({ page }) => {
  const instructor = await signIn(page, 'instructor');
  const created = await call(page, instructor, 'POST', `/classrooms/${fixture.classroomId}/assignments`, { lessonId: fixture.lessonId, title: `Advanced final ${run}`, instructions: 'Design and justify a kinematics solution.' });
  expect(created.status).toBe(201);
  const assignmentId: string = created.body.assignment_id;
  await call(page, instructor, 'PUT', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/rubric`, { criteria: [{ title: 'Analysis', maxPoints: 60 }, { title: 'Safety', maxPoints: 40 }] });
  const academicUrl = `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/academic`;
  expect((await call(page, instructor, 'PATCH', academicUrl, { difficulty: 'ADVANCED', assignmentType: 'manual_final', gradingMethod: 'automatic' })).status).toBe(400); // manual final cannot be fully automatic
  expect((await call(page, instructor, 'PATCH', academicUrl, { passScore: 500 })).status).toBe(400);                                                                 // exceeds the rubric maximum (100)
  const ok = await call(page, instructor, 'PATCH', academicUrl, { difficulty: 'ADVANCED', assignmentType: 'manual_final', gradingMethod: 'manual', passScore: 60, learningObjectives: ['Derive forward kinematics', 'Justify safety limits'] });
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  expect(ok.body).toMatchObject({ difficulty: 'ADVANCED', assignmentType: 'manual_final', gradingMethod: 'manual', passScore: 60, maxScore: 100 });
  // a beginner assignment in the same course: difficulties are independent per assignment
  const beginner = await call(page, instructor, 'POST', `/classrooms/${fixture.classroomId}/assignments`, { lessonId: fixture.lessonId, title: `Beginner Blockly ${run}`, instructions: 'Open the gripper.' });
  await call(page, instructor, 'PATCH', `/classrooms/${fixture.classroomId}/assignments/${beginner.body.assignment_id}/academic`, { difficulty: 'BEGINNER', assignmentType: 'blockly', gradingMethod: 'automatic' });
  const publish = await call(page, instructor, 'POST', `/classrooms/${fixture.classroomId}/assignments/${assignmentId}/publish`);
  expect(publish.status).toBe(201);

  // students see difficulty, grading and objectives
  await signIn(page, 'student');
  await page.goto(`/my-learning/${publish.body.id}`);
  const details = page.getByRole('region', { name: 'Assignment details' });
  await expect(details.getByTestId('level-badge')).toContainText('Advanced');
  await expect(details).toContainText('by your instructor');
  await expect(details).toContainText('Derive forward kinematics');

  // J: another school's staff and a student cannot read or change it
  const foreign = await signIn(page, 'otherSchoolAdmin');
  expect([403, 404]).toContain((await call(page, foreign, 'GET', academicUrl)).status);
  expect([403, 404]).toContain((await call(page, foreign, 'PATCH', academicUrl, { difficulty: 'BEGINNER' })).status);
  const student = await signIn(page, 'student');
  expect([403, 404]).toContain((await call(page, student, 'PATCH', academicUrl, { difficulty: 'BEGINNER' })).status);
  expect([403, 404]).toContain((await call(page, foreign, 'PATCH', `/admin/courses/${courseA}`, { tags: ['Hacked'] })).status);
});
