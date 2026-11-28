import { execFileSync, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Simulation safety cases against an ISOLATED longer-running fixture: the submitted program of the disposable WF-03 fixture is rewritten (disposable DB only)
 * to wait ~15 s, so Stop Execution, concurrent control, End Lab Session during a run, session expiry, runtime disconnect and quarantine can be exercised
 * against the real R1 + CHECKIK fake follower. No Production timing is involved; no hardware.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_WF03_FIXTURE_FILE ?? process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as {
  attemptId: string; classroomId: string; submissionId: string; users: Record<string, { authUserId: string }>;
};
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const dbUrl = process.env.VISTA_E2E_ADMIN_DATABASE_URL!;
const psql = (sql: string) => execFileSync('psql', [dbUrl, '-Atqc', sql], { encoding: 'utf8' }).trim();
const TERMINAL = ['succeeded', 'failed', 'cancelled', 'stopped'];
const LONG = JSON.stringify({ kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'arm.select', arm: 'left' }, { type: 'home' }, { type: 'wait', durationMs: 5000 }, { type: 'wait', durationMs: 5000 }, { type: 'wait', durationMs: 5000 }] });

async function token(page: Page, user: string) {
  const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
  const session = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[user].authUserId}`).then((r) => r.json());
  return session.access_token as string;
}
const call = (page: Page, t: string, method: string, path: string, body?: unknown) =>
  page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { data: body } : {}) });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe.serial('simulation safety cases on a long-running isolated fixture', () => {
  let student = ''; let teacher = ''; let peer = ''; let session = ''; let robotId = '';
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    student = await token(page, 'student'); teacher = await token(page, 'instructor'); peer = await token(page, 'peer');
    psql(`UPDATE learning_program_versions SET robot_program='${LONG}'::jsonb WHERE id=(SELECT program_version_id FROM learning_submissions WHERE id='${fixture.submissionId}')`);
    psql(`UPDATE learning_programs SET robot_program='${LONG}'::jsonb WHERE id=(SELECT program_id FROM learning_submissions WHERE id='${fixture.submissionId}')`);
    const robots = await (await call(page, teacher, 'GET', `/classrooms/${fixture.classroomId}/lab-robots`)).json() as Array<{ robotId: string }>;
    robotId = robots[0].robotId;
  });

  const openSession = async (page: Page) => {
    const started = await call(page, teacher, 'POST', `/classrooms/${fixture.classroomId}/lab-sessions`, { robotId });
    expect([200, 201], await started.text()).toContain(started.status());
    session = ((await started.json()) as { id: string }).id;
  };
  const startRun = async (page: Page) => {
    const res = await call(page, student, 'POST', `/me/attempts/${fixture.attemptId}/physical-executions/start`, { safetyConfirmed: true });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()) as { id: string };
  };
  const status = async (page: Page, id: string) => ((await (await call(page, student, 'GET', `/me/physical-executions/${id}`)).json()) as { status: string });
  const untilTerminal = async (page: Page, id: string, ms = 30_000) => {
    const end = Date.now() + ms; let s = { status: '' };
    while (Date.now() < end) { s = await status(page, id); if (TERMINAL.includes(s.status)) return s; await sleep(500); }
    return s;
  };
  const lab = async (page: Page) => ((await (await call(page, teacher, 'GET', `/classrooms/${fixture.classroomId}/lab-sessions`)).json()) as Array<{ id: string; state: string }>).find((x) => x.id === session);
  const ensureClosed = async (page: Page) => { await call(page, teacher, 'POST', `/lab-sessions/${session}/end`).catch(() => undefined); for (let i = 0; i < 20; i += 1) { if ((await lab(page))?.state === 'released') return; await sleep(500); } };

  test('Stop Execution ends only the current run, keeps the reservation; concurrent control is refused', async ({ page }) => {
    await openSession(page);
    const run = await startRun(page);
    await expect.poll(async () => (await status(page, run.id)).status, { timeout: 15_000 }).toMatch(/queued|running/);
    // concurrent control: a repeated start returns the same run (no second command); a different student cannot read or stop it (a second student's own start on the busy robot is covered by the real-PostgreSQL physical-execution/lab-session specs)
    const second = await call(page, student, 'POST', `/me/attempts/${fixture.attemptId}/physical-executions/start`, { safetyConfirmed: true });
    expect(second.status()).toBe(201);                                              // an equivalent active request is IDEMPOTENT: it returns the same run, never a second command
    expect(((await second.json()) as { id: string }).id).toBe(run.id);
    expect([403, 404]).toContain((await call(page, peer, 'GET', `/me/physical-executions/${run.id}`)).status());
    expect([403, 404]).toContain((await call(page, peer, 'POST', `/me/physical-executions/${run.id}/stop`)).status());
    const stop = await call(page, teacher, 'POST', `/lab-sessions/${session}/stop-execution`);
    expect(stop.status(), await stop.text()).toBeLessThan(300);
    const final = await untilTerminal(page, run.id);
    expect(['cancelled', 'stopped', 'failed']).toContain(final.status);          // it did not run to completion (15 s program)
    expect((await lab(page))?.state).toBe('active');                              // the reservation is preserved
  });

  test('a stopped session can be ended; End Lab Session during a run requests a safe stop and releases once the runtime confirms', async ({ page }) => {
    const run = await startRun(page).catch(async () => { await sleep(3000); return startRun(page); });
    await expect.poll(async () => (await status(page, run.id)).status, { timeout: 15_000 }).toMatch(/queued|running/);
    const ended = await call(page, teacher, 'POST', `/lab-sessions/${session}/end`);
    expect(ended.status(), await ended.text()).toBeLessThan(300);
    expect(['terminating', 'released']).toContain((await lab(page))?.state);
    const blocked = await call(page, student, 'POST', `/me/attempts/${fixture.attemptId}/physical-executions/start`, { safetyConfirmed: true });
    expect([409]).toContain(blocked.status());                                     // no new runs once ending
    for (let i = 0; i < 40 && (await lab(page))?.state !== 'released'; i += 1) await sleep(750);
    expect((await lab(page))?.state).toBe('released');
    expect(TERMINAL).toContain((await status(page, run.id)).status);
  });

  test('session expiry: an expired open session is terminated and the run stopped', async ({ page }) => {
    await openSession(page);
    const run = await startRun(page);
    await expect.poll(async () => (await status(page, run.id)).status, { timeout: 15_000 }).toMatch(/queued|running/);
    psql(`UPDATE classroom_lab_sessions SET started_at = now() - interval '10 minutes', expires_at = now() - interval '1 minute' WHERE id='${session}'`);
    await call(page, teacher, 'GET', `/classrooms/${fixture.classroomId}/lab-robots`);   // reconciles expired sessions
    for (let i = 0; i < 40 && (await lab(page))?.state !== 'released'; i += 1) { await call(page, teacher, 'GET', `/classrooms/${fixture.classroomId}/lab-robots`); await sleep(750); }
    expect((await lab(page))?.state).toBe('released');
    expect(['cancelled', 'stopped', 'failed']).toContain((await untilTerminal(page, run.id)).status);
  });

  test('runtime disconnect mid-run is reported truthfully; End with an unreachable runtime quarantines, recovery releases', async ({ page }) => {
    await openSession(page);
    const run = await startRun(page);
    await expect.poll(async () => (await status(page, run.id)).status, { timeout: 15_000 }).toMatch(/queued|running/);
    execFileSync('pkill', ['-f', 'robot-runtime/src/server.py']);                   // runtime disconnect (disposable local R1 only)
    await sleep(1500);
    const raw = await call(page, student, 'GET', `/me/physical-executions/${run.id}`);
    const body = await raw.json().catch(() => ({})) as { status?: string; code?: string };
    // truthful: either a terminal failure or an explicit runtime-unavailable error (503/502) — never "succeeded", never a silent "running" success
    expect(body.status).not.toBe('succeeded');
    expect(raw.status() >= 500 || ['failed', 'cancelled', 'stopped'].includes(body.status ?? '') || body.code === 'ROBOT_RUNTIME_UNAVAILABLE', `status ${raw.status()} ${JSON.stringify(body)}`).toBe(true);
    await call(page, teacher, 'POST', `/lab-sessions/${session}/end`);
    for (let i = 0; i < 12; i += 1) { await call(page, teacher, 'GET', `/classrooms/${fixture.classroomId}/lab-robots`); await sleep(500); }
    const state = (await lab(page))?.state;
    expect(['quarantined', 'terminating', 'released']).toContain(state);
    if (state !== 'released') {
      // recovery: restart R1 (it no longer knows the run), then ONLY the instructor's retry / the reconcile sweep may release; a heartbeat alone never does
      spawn('python3', ['../../services/robot-runtime/src/server.py', '--config', '/tmp/r1-local.json'], { detached: true, stdio: 'ignore', env: { ...process.env, VISTA_RUNTIME_TOKEN: process.env.VISTA_RUNTIME_TOKEN ?? 'runtimetoken-local-0123456789abcdef', VISTA_CHECKIK_ADAPTER_TOKEN: process.env.VISTA_CHECKIK_ADAPTER_TOKEN ?? 'adaptertoken-local-0123456789abcdef' } }).unref();
      await sleep(4000);
      for (let i = 0; i < 40 && (await lab(page))?.state !== 'released'; i += 1) { await call(page, teacher, 'POST', `/lab-sessions/${session}/end`);   // D-17: no student status read needed; the reachable restarted runtime reports the run lost await sleep(1000); }
      expect((await lab(page))?.state).toBe('released');
    }
  });

  test.afterAll(async ({ browser }) => { const page = await browser.newPage(); if (session) await ensureClosed(page); });
});
