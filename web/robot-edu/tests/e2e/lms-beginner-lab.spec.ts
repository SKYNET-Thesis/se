import { expect, test } from '@playwright/test';
import { SO101_CURRICULUM } from '../../../../services/education-api/src/scripts/so101-curriculum.data';
import { blockBox, dragFromFlyout, workspaceBlocks, waitForBlocklyReady } from './helpers/blockly';
import { call, deliverCourse, loadFixture, signIn } from './helpers/academic';

/**
 * Integrated WF-01 -> WF-04 journey on one new classroom, in the real browser against the real API and PostgreSQL:
 *  Active Offering -> Classroom (UI) -> School Admin allocates an entitled robot (UI; a standing authorization, NOT execution) -> Instructor sees it
 *  -> Instructor publishes a Blockly lab -> Student builds, validates, saves a version and runs the schematic SIMULATION (automatic grading)
 *  -> submits -> Instructor reviews the persisted evidence, assesses, releases -> Student sees the result and writes a reflection -> the instructor's
 *  class view lists the result. No robot is commanded, no AI model is run, no Digital Twin is needed (the runtime boundary is wf03-runtime-evidence).
 */
const COURSE = SO101_CURRICULUM[0]; const LAB = COURSE.labs[0];
const run = Date.now().toString(36).toUpperCase();

test('Integrated WF-01 to WF-04: classroom, robot allocation, Blockly lab, automatic simulation grading, review, release and reflection', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 1300 });
  const fixture = await loadFixture();
  const classroomName = `Foundations lab ${run}`;
  const classroomId = await deliverCourse(page, fixture, COURSE.title, classroomName, ['Phase 2.4.3 Test Student', 'Phase 2.4.3 Test Instructor']);

  // WF-01 (UI): the School Admin allocates an entitled robot to the new classroom; the Instructor sees it. Allocation authorizes, it does not execute.
  const adminToken = await signIn(page, fixture, 'schoolAdmin');
  await page.goto(`/school/classrooms/${classroomId}`);
  await expect(page.getByText('No robot resource assigned')).toBeVisible();
  await page.getByRole('button', { name: 'Allocate robot' }).click();
  const allocate = page.getByRole('dialog', { name: 'Allocate robot resource' });
  const robotOption = allocate.getByRole('option', { name: /WF-01 entitled robot/ });
  await expect(robotOption).toHaveCount(1);
  await allocate.getByLabel('Eligible robot').selectOption((await robotOption.getAttribute('value'))!);
  await allocate.getByRole('button', { name: 'Allocate robot' }).click();
  await expect(page.getByText('Allocated', { exact: true })).toBeVisible();
  await expect(page.getByText('WF-01 entitled robot').first()).toBeVisible();
  const allocationPath = `/education-admin/classrooms/${classroomId}/robot-allocation`;
  const instructorToken = await signIn(page, fixture, 'instructor');
  await page.goto(`/teacher/classes/${classroomId}`);
  await expect(page.getByText(/Allocated:\s*WF-01 entitled robot/)).toBeVisible();
  // WF-01 rejections (403/404, never a silent change): an instructor, another school's admin and a robot that is not entitled to this school
  expect([403, 404]).toContain((await call(page, instructorToken, 'PUT', allocationPath, { robotId: fixture.allocatedRobotId })).status);
  const otherAdmin = await signIn(page, fixture, 'otherSchoolAdmin');
  expect([403, 404]).toContain((await call(page, otherAdmin, 'PUT', allocationPath, { robotId: fixture.allocatedRobotId })).status);
  expect([403, 404, 409]).toContain((await call(page, adminToken, 'PUT', allocationPath, { robotId: fixture.foreignRobotId as string })).status);
  expect(((await call(page, instructorToken, 'GET', `/classrooms/${classroomId}`)).body as { allocated_robot?: { name: string } }).allocated_robot?.name).toBe('WF-01 entitled robot');

  // instructor: the delivery option lists the seeded challenge; the new assignment inherits its allowed blocks (no Movement blocks for a beginner lab)
  const teacher = await signIn(page, fixture, 'instructor');
  const options = (await call(page, teacher, 'GET', `/classrooms/${classroomId}/delivery-options`)).body as Array<{ lesson_id: string; challenges: Array<{ id: string; title: string }> }>;
  const option = options.find((o) => o.challenges.some((c) => c.title === LAB.challenge.title));
  expect(option, 'seeded challenge is offered to instructors').toBeTruthy();
  const challenge = option!.challenges.find((c) => c.title === LAB.challenge.title)!;
  const title = `${LAB.title} ${run}`;
  const created = await call(page, teacher, 'POST', `/classrooms/${classroomId}/assignments`, { lessonId: option!.lesson_id, challengeId: challenge.id, title, instructions: LAB.instructions });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const assignmentId = created.body.assignment_id as string;
  const academic = await call(page, teacher, 'PATCH', `/classrooms/${classroomId}/assignments/${assignmentId}/academic`, { difficulty: LAB.difficulty, assignmentType: LAB.type, gradingMethod: LAB.grading, passScore: LAB.passScore, learningObjectives: LAB.objectives });
  expect(academic.status).toBe(200);
  expect((await call(page, teacher, 'PUT', `/classrooms/${classroomId}/assignments/${assignmentId}/rubric`, { criteria: LAB.rubric.map((r) => ({ title: r.title, description: r.description, maxPoints: r.maxPoints })) })).status).toBe(200);
  const publish = await call(page, teacher, 'POST', `/classrooms/${classroomId}/assignments/${assignmentId}/publish`);
  expect(publish.status).toBe(201);

  // student: opens the assignment (difficulty/grading shown), builds the program by drag and drop
  const token = await signIn(page, fixture, 'student');
  await page.goto(`/my-learning/${publish.body.id}`);
  const details = page.getByRole('region', { name: 'Assignment details' });
  await expect(details.getByTestId('level-badge')).toContainText('Beginner');
  await expect(details).toContainText('automatic');
  const started = await call(page, token, 'POST', `/classroom-assignments/${publish.body.id}/attempts`);
  expect([200, 201]).toContain(started.status);
  await page.goto(`/practice/${started.body.id}`);
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
  await waitForBlocklyReady(page);
  const cats = await page.locator('.blocklyToolboxCategory').allInnerTexts();
  expect(cats.join(' ')).not.toContain('Movement');                                            // beginner lab: Blockly-only, no movement blocks

  await dragFromFlyout(page, 'Program', /when\s*program\s*starts/, { x: 760, y: 560 });
  const start = (await workspaceBlocks(page).first().boundingBox())!;
  await dragFromFlyout(page, 'Program', /use\s*left\s*arm/, { x: start.x + 16, y: start.y + start.height + 22 });
  const arm = (await workspaceBlocks(page).nth(1).boundingBox())!;
  await dragFromFlyout(page, 'Gripper', /open/i, { x: arm.x + 32, y: arm.y + 62 });
  const open = await blockBox(page, /open\s*gripper/);
  await dragFromFlyout(page, 'Timing', /wait/i, { x: open.x + 8, y: open.y + open.height + 18 });
  const wait = await blockBox(page, /wait/);
  await dragFromFlyout(page, 'Gripper', /close/i, { x: wait.x + 8, y: wait.y + wait.height + 12 });
  await expect(workspaceBlocks(page)).toHaveCount(5);

  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/valid and ready for server evaluation/i)).toBeVisible();
  const versionSaved = page.waitForResponse((r) => /\/me\/programs\/[^/]+\/versions$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save version' }).click();
  expect((await versionSaved).status()).toBe(201);
  const evaluated = page.waitForResponse((r) => /evaluate-symbolic$/.test(r.url()) && r.request().method() === 'POST', { timeout: 40_000 });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  const ev = await evaluated; expect(ev.status()).toBe(201);
  const evaluation = await ev.json() as { verdict: string; ruleResults: Array<{ passed: boolean }>; experimentId: string };
  expect(evaluation.verdict).toBe('passed');                                                    // automatic grading
  expect(evaluation.ruleResults.every((r) => r.passed)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Simulation Passed' })).toBeVisible();

  // submit, instructor reviews the persisted evidence and releases; the student sees the result
  await page.getByRole('button', { name: 'Submit assignment' }).click();
  const submitted = page.waitForResponse((r) => /\/me\/attempts\/[^/]+\/submission$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('dialog').getByRole('button', { name: /Submit/ }).last().click();
  const submission = await (await submitted).json() as { id: string; status: string };
  expect(submission.status).toBe('submitted');
  expect((await call(page, token, 'GET', `/me/experiments/${evaluation.experimentId}`)).body.execution_mode).toBe('schematic'); // simulation, not physical

  const reviewer = await browser.newPage(); await reviewer.setViewportSize({ width: 1400, height: 1200 });
  await reviewer.goto('/'); await signIn(reviewer, fixture, 'instructor');
  await reviewer.goto(`/teacher/classes/${classroomId}/submissions/${submission.id}`);
  await expect(reviewer.getByText(/learning preview target matches|Passed:/i).first()).toBeVisible();
  const [safe, clean] = [LAB.rubric[0].maxPoints, LAB.rubric[1].maxPoints];
  await reviewer.getByLabel(new RegExp(`Points / ${safe}`)).fill(String(safe)); await reviewer.getByLabel(new RegExp(`Points / ${clean}`)).fill(String(clean - 5));
  await reviewer.getByPlaceholder('Overall assessment feedback').fill('Automatic evaluation passed and the program is clean.');
  await reviewer.getByRole('button', { name: 'Save assessment' }).click();
  await expect(reviewer.getByRole('status').filter({ hasText: /Assessment saved/ })).toBeVisible();
  await reviewer.getByPlaceholder('Feedback for this student').fill('Nice work: open, wait, close in the right order.');
  await reviewer.getByRole('button', { name: 'Send feedback' }).click();
  await reviewer.getByRole('button', { name: 'Release grade & feedback' }).click();
  const confirm = reviewer.getByRole('dialog').last();
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /Release/ }).click();
  await expect(reviewer.getByText('Not released to student')).toHaveCount(0);

  const grading = await (await page.request.get(`${apiBase()}/me/attempts/${started.body.id}/grading`, { headers: { Authorization: `Bearer ${token}` } })).json() as { released: boolean; assessment: { scores: Array<{ awardedPoints: number }> } };
  expect(grading.released).toBe(true);
  expect(grading.assessment.scores.map((s) => s.awardedPoints).sort((a, b) => a - b)).toEqual([safe, clean - 5].sort((a, b) => a - b));
  await page.goto(`/my-learning/${publish.body.id}`);
  await expect(page.getByText('Graded').first()).toBeVisible();

  // WF-04: the student reflects on the released feedback (persisted against the submission); the instructor's class view lists the result
  await page.getByRole('button', { name: 'View details' }).first().click();
  const reflection = page.getByRole('region', { name: 'Your reflection' });
  await reflection.getByRole('textbox').fill('Open, wait, close was the right order; next time I will add a safety check.');
  await reflection.getByRole('button', { name: 'Save reflection' }).click();
  await expect(reflection.getByText('Open, wait, close was the right order; next time I will add a safety check.')).toBeVisible();
  const reflections = (await call(page, token, 'GET', `/me/submissions/${submission.id}/reflections`)).body as Array<{ response_text: string }>;
  expect(reflections.map((r) => r.response_text)).toEqual(['Open, wait, close was the right order; next time I will add a safety check.']);
  await reviewer.goto(`/teacher/classes/${classroomId}`);
  await expect(reviewer.getByRole('heading', { name: 'Submitted results' })).toBeVisible();
  await expect(reviewer.getByText('Phase 2.4.3 Test Student').first()).toBeVisible();
});
const apiBase = () => process.env.VISTA_E2E_API_BASE_URL!;
