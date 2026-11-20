import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * REAL end-to-end revocation: the actual Digital Twin service (uvicorn) on 127.0.0.1:8767, a REAL WebSocket viewer authorized by an API-issued
 * attempt scope, and the REAL API actions. Success is the viewer socket being CLOSED with code 4403 - not an HTTP 2xx.
 * Setup shortcut (psql): an attempt that a previous scenario submitted is re-opened so scenarios can reuse the fixture attempt.
 */
const SECRET = 'twsecret_local'; const TWIN = 'http://127.0.0.1:8767'; const WS_URL = 'ws://127.0.0.1:8767/ws/twin';
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { schoolId: string; classroomId: string; lessonId: string; programDeliveryId: string; allocatedRobotId: string; replacementRobotId: string; users: Record<string, { authUserId: string; userId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const twinDir = path.resolve(process.cwd(), '../../services/digital-twin');
const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];

let twin: ChildProcess | undefined;
async function startTwin() {
  twin = spawn('uv', ['run', '--frozen', 'uvicorn', 'vista_digital_twin.app:app', '--host', '127.0.0.1', '--port', '8767'], { cwd: twinDir, detached: true, stdio: 'ignore', env: { ...process.env, VISTA_TWIN_AUTH_SECRET: SECRET, PYTHONPATH: 'src' } });
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${TWIN}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('Digital Twin did not start');
}
async function stopTwin() {
  if (twin?.pid) { try { process.kill(-twin.pid, 'SIGKILL'); } catch { /* gone */ } }
  twin = undefined;
  for (let i = 0; i < 40; i += 1) { try { await fetch(`${TWIN}/health`); await new Promise((r) => setTimeout(r, 250)); } catch { return; } }
}
const publisherToken = (org: string, robot: string) => {
  const payload = Buffer.from(JSON.stringify({ aud: 'vista-digital-twin-simulation-publisher', exp: Math.floor(Date.now() / 1000) + 60, jti: randomUUID(), kind: 'simulation_publisher', org, robots: [robot], sub: 'education-api' })).toString('base64url');
  return `v1.${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
};
const frame = (robot: string, sequence: number) => ({ schema_version: 1, robot_id: robot, source_mode: 'SIMULATION', controller_id: 'e2e-sim', sequence, measured_at: new Date().toISOString(), connection: 'connected',
  measured: JOINTS.map((name) => ({ name, position: 0.1, unit: name === 'gripper' ? 'percent' : 'rad' })) });
async function publish(attemptId: string, robot: string, sequence: number) {
  return fetch(`${TWIN}/internal/simulation-telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publisherToken(fixture.schoolId, robot)}` }, body: JSON.stringify({ organization_id: fixture.schoolId, robot_id: robot, experiment_id: 'e2e', attempt_id: attemptId, telemetry: frame(robot, sequence) }) });
}

interface Viewer { frames: number; closed: Promise<{ code: number; reason: string }>; isClosed: () => boolean; stop: () => void }
let sequenceCounter = 0;                                                                              // the Twin requires strictly increasing sequences per stream
const nextSequence = () => (sequenceCounter += 1);
async function connect(token: string, attemptId: string, robot: string): Promise<Viewer> {
  // The stream must exist before the viewer connects (the Twin refuses a scope that matches no buffered stream): publish first, deterministically.
  const first = await publish(attemptId, robot, nextSequence());
  if (first.status !== 202) throw new Error(`publisher rejected: ${first.status} attempt=${attemptId} ${await first.text()}`);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, [`vista.twin.${token}`]);
    let frames = 0; let closedNow = false;
    const closed = new Promise<{ code: number; reason: string }>((done) => ws.addEventListener('close', (event) => { closedNow = true; clearInterval(timer); done({ code: event.code, reason: event.reason }); }));
    const timer = setInterval(() => { void publish(attemptId, robot, nextSequence()).catch(() => undefined); }, 150);
    const viewer: Viewer = { get frames() { return frames; }, closed, isClosed: () => closedNow, stop: () => { clearInterval(timer); try { ws.close(); } catch { /* closed */ } } } as Viewer;
    ws.addEventListener('message', () => { frames += 1; if (frames === 1) resolve(viewer); });
    ws.addEventListener('error', () => undefined);
    void closed.then(() => { if (frames === 0) reject(Object.assign(new Error('closed before any frame'), { closed })); });
    setTimeout(() => { if (frames === 0) { clearInterval(timer); reject(new Error(`no frame within 10s (attempt ${attemptId}, closed=${closedNow})`)); } }, 10_000);
  });
}
/** Opens a viewer and reports what the server did: refused during the handshake, closed with a code, or streamed attempt frames. */
const probe = (token: string, ms = 2500) => new Promise<{ opened: boolean; attemptFrames: number; code: number | null; reason: string }>((resolve) => {
  const ws = new WebSocket(WS_URL, [`vista.twin.${token}`]); const out = { opened: false, attemptFrames: 0, code: null as number | null, reason: '' };
  ws.addEventListener('open', () => { out.opened = true; });
  ws.addEventListener('message', (e) => { if (String(e.data).includes('e2e-sim')) out.attemptFrames += 1; });
  ws.addEventListener('close', (e) => { out.code = e.code; out.reason = e.reason; resolve(out); });
  ws.addEventListener('error', () => undefined);
  setTimeout(() => { try { ws.close(); } catch { /* closed */ } resolve(out); }, ms);
});
const closedWithin = async (viewer: Viewer, ms = 8000) => Promise.race([viewer.closed, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
const stillOpen = async (viewer: Viewer) => { const before = viewer.frames; await new Promise((r) => setTimeout(r, 900)); return !viewer.isClosed() && viewer.frames > before; };

test.describe.serial('Digital Twin: a connected WebSocket viewer is closed the moment access ends', () => {
  test.setTimeout(120_000);
  let studentToken = ''; let adminToken = ''; let sysToken = ''; let attemptId = ''; let attempt2 = ''; let delivery2 = '';
  const bearer = async (page: Page, who: string) => ((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json()) as { access_token: string }).access_token;
  const api = async (page: Page, token: string, method: string, p: string, data?: unknown) => { const r = await page.request.fetch(`${apiBase}${p}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) }); const t = await r.text(); let body: any = t; try { body = JSON.parse(t); } catch { /* text */ } return { status: r.status(), body }; };
  const reopen = (...ids: string[]) => ids.forEach((id) => psql(`update learning_assignment_attempts set status='in_progress' where id='${id}'`));
  const viewerFor = async (page: Page, id: string, robot = fixture.allocatedRobotId) => {
    const scope = await api(page, studentToken, 'POST', `/me/attempts/${id}/digital-twin/viewer-scope`, { robotId: robot });
    expect(scope.status, JSON.stringify(scope.body)).toBe(201);
    return { token: scope.body.token as string, viewer: await connect(scope.body.token, id, robot) };
  };
  const freshAttempt = async (page: Page) => {
    const teacher = await bearer(page, 'instructor');
    const created = await api(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/assignments`, { lessonId: fixture.lessonId, title: `Twin WS ${randomUUID().slice(0, 6)}`, instructions: 'x' });
    expect(created.status).toBe(201);
    const delivery = (await api(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/assignments/${created.body.assignment_id}/publish`)).body.id;
    return (await api(page, studentToken, 'POST', `/classroom-assignments/${delivery}/attempts`)).body.id as string;
  };
  const putAllocation = (page: Page, robot: string) => api(page, adminToken, 'PUT', `/education-admin/classrooms/${fixture.classroomId}/robot-allocation`, { robotId: robot });

  test.beforeAll(async () => { await startTwin(); });
  test.afterAll(async () => { await stopTwin(); });

  test('setup: two in-progress attempts of the same student, both on the allocated robot', async ({ page }) => {
    studentToken = await bearer(page, 'student'); adminToken = await bearer(page, 'schoolAdmin'); sysToken = await bearer(page, 'admin');
    expect((await api(page, adminToken, 'POST', `/education-admin/organizations/${fixture.schoolId}/classrooms/${fixture.classroomId}/members`, { userId: fixture.users.student.userId })).status).toBeLessThan(300);   // idempotent: start from an enrolled student
    expect((await putAllocation(page, fixture.allocatedRobotId)).status).toBeLessThan(300);
    const first = await api(page, studentToken, 'POST', `/classroom-assignments/${fixture.programDeliveryId}/attempts`);
    attemptId = first.body.id; reopen(attemptId);
    const teacher = await bearer(page, 'instructor');
    const created = await api(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/assignments`, { lessonId: fixture.lessonId, title: `Twin WS ${randomUUID().slice(0, 6)}`, instructions: 'x' });
    expect(created.status).toBe(201);
    delivery2 = (await api(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/assignments/${created.body.assignment_id}/publish`)).body.id;
    const second = await api(page, studentToken, 'POST', `/classroom-assignments/${delivery2}/attempts`);
    attempt2 = second.body.id; expect(attempt2).not.toBe(attemptId);
  });

  test('a scope-authorized viewer really receives frames; a viewer with no valid scope is refused', async ({ page }) => {
    const { viewer } = await viewerFor(page, attemptId);
    expect(viewer.frames).toBeGreaterThan(0);
    viewer.stop();
    const bad = await probe('v1.invalid.signature');
    expect(bad.opened).toBe(false);                                                                 // refused during the handshake: it never opens
    expect(bad.attemptFrames).toBe(0);
  });

  test('final submission closes THAT attempt\'s viewer with 4403; another attempt of the same student stays connected', async ({ page }) => {
    const target = await freshAttempt(page);                                                        // a brand-new attempt: program and submission rows are created here
    reopen(target, attempt2);
    const a = await viewerFor(page, target); const b = await viewerFor(page, attempt2);
    const programRes = (await api(page, studentToken, 'POST', `/me/attempts/${target}/program`, { title: 'P', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] } }));
    const program = programRes.status === 409 ? { id: psql(`select program_id from learning_assignment_attempts where id='${target}'`) } : programRes.body;   // earlier runs may already have created it
    if (programRes.status !== 409) expect(programRes.status, JSON.stringify(programRes.body)).toBeLessThan(300);
    const version = (await api(page, studentToken, 'POST', `/me/programs/${program.id}/versions`, { changeSummary: 'final' })).body;
    const submitted = await api(page, studentToken, 'POST', `/me/attempts/${target}/submission`, { programVersionId: version.id });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    const closed = await closedWithin(a.viewer);
    expect(closed?.code).toBe(4403); expect(closed?.reason).toMatch(/revoked/i);
    expect(await stillOpen(b.viewer)).toBe(true);                                                  // isolation: the other attempt keeps streaming
    // fail closed: the still-valid scope token of the revoked attempt cannot reconnect
    expect((await probe(a.token)).attemptFrames).toBe(0);                                          // the revoked attempt's scope yields no attempt data
    // a new scope for the submitted attempt is refused by the API
    expect((await api(page, studentToken, 'POST', `/me/attempts/${target}/digital-twin/viewer-scope`, { robotId: fixture.allocatedRobotId })).status).toBe(404);
    b.viewer.stop();
  });

  const scenarios: Array<[string, (page: Page) => Promise<unknown>, (page: Page) => Promise<unknown>]> = [
    ['membership suspension', (p) => api(p, adminToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${fixture.users.student.userId}/status`, { status: 'suspended' }), (p) => api(p, adminToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${fixture.users.student.userId}/status`, { status: 'active' })],
    ['account disable', (p) => api(p, sysToken, 'PATCH', `/education-admin/users/${fixture.users.student.userId}/status`, { status: 'disabled' }), (p) => api(p, sysToken, 'PATCH', `/education-admin/users/${fixture.users.student.userId}/status`, { status: 'active' })],
    ['organization suspension', (p) => api(p, sysToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}`, { status: 'suspended' }), (p) => api(p, sysToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}`, { status: 'active' })],
    ['removal from the classroom', (p) => api(p, adminToken, 'DELETE', `/education-admin/organizations/${fixture.schoolId}/classrooms/${fixture.classroomId}/members/${fixture.users.student.userId}`), (p) => api(p, adminToken, 'POST', `/education-admin/organizations/${fixture.schoolId}/classrooms/${fixture.classroomId}/members`, { userId: fixture.users.student.userId })],
    ['classroom archive', (p) => api(p, adminToken, 'POST', `/education-admin/organizations/${fixture.schoolId}/classrooms/${fixture.classroomId}/archive`), (p) => api(p, adminToken, 'POST', `/education-admin/organizations/${fixture.schoolId}/classrooms/${fixture.classroomId}/reactivate`)],
    ['robot reassignment', (p) => putAllocation(p, fixture.replacementRobotId), (p) => putAllocation(p, fixture.allocatedRobotId)],
  ];
  for (const [name, trigger, restore] of scenarios) {
    test(`${name} closes the connected viewer with 4403`, async ({ page }) => {
      await stopTwin(); await startTwin();                                                          // the Twin remembers revoked attempts for its lifetime: start each scenario from a clean one
      reopen(attemptId);
      const { viewer } = await viewerFor(page, attemptId);
      expect(viewer.frames).toBeGreaterThan(0);
      try {
        const result = await trigger(page) as { status: number; body: unknown };
        expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
        const closed = await closedWithin(viewer);
        expect(closed?.code, `${name}: viewer must be closed by the server`).toBe(4403);
        expect(closed?.reason).toMatch(/revoked/i);
      } finally { viewer.stop(); const restored = await restore(page) as { status: number; body: unknown }; expect(restored.status, `restore after ${name}: ${JSON.stringify(restored.body)}`).toBeLessThan(300); }
    });
  }

  test('revocation is idempotent: repeating it is harmless and the viewer stays closed', async ({ page }) => {
    await stopTwin(); await startTwin();
    reopen(attemptId);
    const { token, viewer } = await viewerFor(page, attemptId);
    const call = () => fetch(`${TWIN}/internal/revoke-attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publisherToken(fixture.schoolId, fixture.allocatedRobotId)}` }, body: JSON.stringify({ organization_id: fixture.schoolId, robot_id: fixture.allocatedRobotId, attempt_id: attemptId }) });
    expect((await call()).status).toBe(202);
    expect((await closedWithin(viewer))?.code).toBe(4403);
    expect((await call()).status).toBe(202); expect((await call()).status).toBe(202);              // again and again: still accepted
    viewer.stop(); void token;
  });

  test('retry: the Twin is down when access ends; revocation still lands once it is back, and the old scope is then refused', async ({ page }) => {
    await stopTwin(); await startTwin();
    reopen(attemptId);
    const { token, viewer } = await viewerFor(page, attemptId);
    await stopTwin();
    expect((await closedWithin(viewer, 6000))).not.toBeNull();                                      // the viewer lost its connection with the Twin
    const suspended = await api(page, adminToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${fixture.users.student.userId}/status`, { status: 'suspended' });
    try {
      expect(suspended.status).toBeLessThan(300);                                                   // the business operation is never blocked by the Twin being down
      await new Promise((r) => setTimeout(r, 1200));
      await startTwin();                                                                            // back inside the API's retry window (0, 0.5, 2, 5 s)
      await new Promise((r) => setTimeout(r, 4500));
      // Proof of delivery: a freshly restarted Twin knows nothing, so it only refuses this attempt's frames if the API's retried revocation reached it.
      expect((await publish(attemptId, fixture.allocatedRobotId, 99)).status).toBe(403);
      expect((await probe(token)).attemptFrames).toBe(0);
    } finally { await api(page, adminToken, 'PATCH', `/education-admin/organizations/${fixture.schoolId}/members/${fixture.users.student.userId}/status`, { status: 'active' }); if (!twin) await startTwin(); }
  });
});
