import { expect, test, type Page } from '@playwright/test';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const fixturePath = process.env.VISTA_E2E_WF03_FIXTURE_FILE ?? process.env.VISTA_E2E_FIXTURE_FILE!;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
  courseId: string; l5LessonId: string; attemptId: string; submissionId: string; classroomId: string;
  users: Record<string, { authUserId: string; userId: string }>;
};
const twinDir = path.resolve(process.cwd(), '../../services/digital-twin');
let twin: ChildProcess | undefined;
const s3Endpoint = new URL(process.env.LEARNING_MEDIA_S3_ENDPOINT ?? '');
if (s3Endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(s3Endpoint.hostname) || !s3Endpoint.port) {
  throw new Error('WF-03 E2E artifact deletion requires the disposable loopback S3-compatible store.');
}
if (!/^vista-wf03-e2e-[a-z0-9-]+$/.test(fixture.bucket)) {
  throw new Error('WF-03 E2E can only delete objects from its dedicated disposable evidence bucket.');
}

async function signIn(page: Page, user: string) {
  const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
  const session = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[user].authUserId}`).then((response) => response.json());
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token))).toBe(true);
  return session.access_token as string;
}

async function request(page: Page, accessToken: string, method: string, path: string, body?: unknown) {
  return page.request.fetch(`${apiBase}${path}`, {
    method, headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { data: body } : {}),
  });
}

test.beforeAll(async () => {
  const secret = process.env.DIGITAL_TWIN_SCOPE_SECRET;
  if (!secret) throw new Error('WF-03 acceptance requires the local Education API and Twin to share a test-only scope secret.');
  twin = spawn('uv', ['run', '--frozen', 'uvicorn', 'vista_digital_twin.app:app', '--host', '127.0.0.1', '--port', '8767'], {
    cwd: twinDir, detached: true, stdio: 'ignore', env: { ...process.env, VISTA_TWIN_AUTH_SECRET: secret, PYTHONPATH: 'src' },
  });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch('http://127.0.0.1:8767/health')).ok) return; } catch { /* Twin is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Local Digital Twin did not start for WF-03 evidence acceptance.');
});

test.afterAll(async () => {
  if (twin?.pid) { try { process.kill(-twin.pid, 'SIGTERM'); } catch { /* already stopped */ } }
  twin = undefined;
});

test('student browser runs the local R1 fake follower and retrieves scoped persisted evidence', async ({ page, browser }) => {
  const studentToken = await signIn(page, 'student');
  const teacherToken = await signIn(await browser.newPage(), 'instructor');
  const peerToken = await signIn(await browser.newPage(), 'peer');
  const foreignTeacherToken = await signIn(await browser.newPage(), 'foreignTeacher');

  const eligibility = await request(page, studentToken, 'GET', `/me/attempts/${fixture.attemptId}/physical-execution-eligibility`);
  expect(eligibility.status()).toBe(200);
  const ready = await eligibility.json();
  expect(ready.eligible).toBe(true);
  expect(ready.classroom.id).toBe(fixture.classroomId);
  expect(ready.readiness).toMatchObject({ allocated: true, entitled: true, symbolicPassed: true, runtimeMode: 'fake_follower', runtimeOnline: true, checkikReachable: true });

  const lessonResponse = await request(page, studentToken, 'GET', `/lessons/${fixture.l5LessonId}`);
  expect(lessonResponse.status()).toBe(200);
  const lesson = await lessonResponse.json();
  await page.goto(`/courses/${fixture.courseId}/lessons/${fixture.l5LessonId}/activities/${fixture.l5LessonId}-physical`);
  await expect(page.getByRole('heading', { name: 'Physical Experiment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Explicit Simulation Confirmation Checklist' })).toBeVisible();
  await page.getByLabel('This run is configured for the local fake follower only.').check();
  await page.getByLabel('No physical robot or hardware driver is connected to this runtime.').check();
  await page.getByLabel('I explicitly authorize this local simulation run.').check();
  const startResponsePromise = page.waitForResponse((response) => response.url().includes('/physical-executions/start') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirm & Run Local Simulation' }).click();
  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(201);
  const run = await startResponse.json();
  expect(run.runtime?.mode).toBe('fake_follower');
  let state: any;
  await expect.poll(async () => {
    const response = await request(page, studentToken, 'GET', `/me/physical-executions/${run.id}`);
    expect(response.status()).toBe(200);
    state = await response.json();
    return state.status;
  }, { timeout: 20_000 }).toBe('succeeded');
  expect(state.runtime.mode).toBe('fake_follower');
  expect(state.digitalTwinTelemetry).toBe('accepted');
  expect(state.evidence).toBe('available');

  const artifactsResponse = await request(page, studentToken, 'GET', `/me/experiments/${run.id}/artifacts`);
  expect(artifactsResponse.status()).toBe(200);
  const artifacts = await artifactsResponse.json();
  const artifact = artifacts.find((item: any) => item.availability === 'available' && item.downloadPath);
  expect(artifact).toBeTruthy();
  const studentDownload = await request(page, studentToken, 'GET', artifact.downloadPath);
  expect(studentDownload.status()).toBe(200);
  const signed = await studentDownload.json();
  expect(signed.status).toBe('available');
  const studentBrowserDownloadEvent = page.waitForEvent('download');
  await page.goto(signed.url).catch((error: unknown) => {
    if (!(error instanceof Error) || !error.message.includes('Download is starting')) throw error;
  });
  const studentBrowserDownload = await studentBrowserDownloadEvent;
  const object = JSON.parse(await readFile((await studentBrowserDownload.path())!, 'utf8'));
  expect(object).toMatchObject({ schema: 'vista.experiment.telemetry.v1', experimentId: run.id, sourceMode: 'SIMULATION', studentId: fixture.users.student.userId });

  const peerDownload = await request(page, peerToken, 'GET', artifact.downloadPath);
  expect([403, 404]).toContain(peerDownload.status());
  const foreignDownload = await request(page, foreignTeacherToken, 'GET', `/submissions/${fixture.submissionId}/experiments/${run.id}/artifacts/${artifact.id}/download`);
  expect([403, 404]).toContain(foreignDownload.status());

  const teacherDownload = await request(page, teacherToken, 'GET', `/submissions/${fixture.submissionId}/experiments/${run.id}/artifacts/${artifact.id}/download`);
  expect(teacherDownload.status()).toBe(200);
  const teacherPage = await browser.newPage();
  await signIn(teacherPage, 'instructor');
  await teacherPage.goto(`/teacher/classes/${fixture.classroomId}/submissions/${fixture.submissionId}`);
  const ownerSubmission = await request(teacherPage, teacherToken, 'GET', `/submissions/${fixture.submissionId}`);
  expect(ownerSubmission.status()).toBe(200);
  await expect(teacherPage.getByRole('button', { name: 'Download evidence' })).toBeVisible();
  const teacherBrowserDownloadEvent = teacherPage.waitForEvent('download');
  await teacherPage.getByRole('button', { name: 'Download evidence' }).click();
  const teacherBrowserDownload = await teacherBrowserDownloadEvent;
  expect(JSON.parse(await readFile((await teacherBrowserDownload.path())!, 'utf8')).experimentId).toBe(run.id);
  const peerSubmission = await request(page, peerToken, 'GET', `/me/submissions/${fixture.submissionId}`);
  expect([403, 404]).toContain(peerSubmission.status());

  const objectKey = decodeURIComponent(new URL(signed.url).pathname).split('/').slice(2).join('/');
  await execFileAsync('aws', ['s3api', 'delete-object', '--endpoint-url', s3Endpoint.toString().replace(/\/$/, ''), '--bucket', fixture.bucket, '--key', objectKey], {
    env: { ...process.env, AWS_ACCESS_KEY_ID: process.env.LEARNING_MEDIA_S3_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: process.env.LEARNING_MEDIA_S3_SECRET_KEY, AWS_DEFAULT_REGION: 'us-east-1' },
  });
  const missingDownload = await request(page, studentToken, 'GET', artifact.downloadPath);
  expect(missingDownload.status()).toBe(200);
  expect(await missingDownload.json()).toEqual({ status: 'unavailable' });

  const nonexistent = await request(page, studentToken, 'GET', `/me/experiments/${run.id}/artifacts/00000000-0000-4000-8000-000000000001/download`);
  expect([404, 422]).toContain(nonexistent.status());
});
