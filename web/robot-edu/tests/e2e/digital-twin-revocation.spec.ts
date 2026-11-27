import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

/**
 * Immediate Digital Twin revocation, driven by REAL API actions against the real database and runtime role.
 * A local double on 127.0.0.1:8767 stands in for the Twin's POST /internal/revoke-attempt (the API is started with
 * DIGITAL_TWIN_TELEMETRY_URL / DIGITAL_TWIN_SCOPE_SECRET pointing at it by scripts/local_integration_stack.sh). It verifies the signature.
 * This proves the Education API half of the contract; the Twin's own handling is covered by its Python tests (test_attempt_scope.py).
 */
const SECRET = 'twsecret_local';      // DIGITAL_TWIN_SCOPE_SECRET of the local integration stack (not a secret)
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { schoolId: string; classroomId: string; programDeliveryId: string; allocatedRobotId: string; replacementRobotId: string; users: Record<string, { authUserId: string; userId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();

interface Revocation { path: string; validSignature: boolean; claims: { kind: string; aud: string; robots: string[]; org: string }; body: { organization_id: string; robot_id: string; attempt_id: string } }
let twin: Server; const received: Revocation[] = [];

test.describe.serial('Twin viewers are revoked the moment the right to watch ends', () => {
  let attemptId = '';
  const headers = async (page: import('@playwright/test').Page, who: string) => ({ Authorization: `Bearer ${((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json()) as { access_token: string }).access_token}` });
  const reopen = () => psql(`update learning_assignment_attempts set status='in_progress' where id='${attemptId}'`);
  const settle = async () => { await new Promise((r) => setTimeout(r, 400)); };
  const revokedFor = (id: string) => received.filter((r) => r.body.attempt_id === id);

  test.beforeAll(async () => {
    twin = createServer((req, res) => {
      let raw = ''; req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const [, encoded, signature] = String(req.headers.authorization ?? '').replace('Bearer ', '').split('.');
        const claims = JSON.parse(Buffer.from(encoded ?? 'e30', 'base64url').toString());
        received.push({ path: req.url ?? '', validSignature: createHmac('sha256', SECRET).update(encoded ?? '').digest('base64url') === signature, claims, body: JSON.parse(raw || '{}') });
        res.writeHead(202, { 'Content-Type': 'application/json' }); res.end('{"status":"revoked"}');
      });
    });
    await new Promise<void>((resolve, reject) => { twin.once('error', reject); twin.listen(8767, '127.0.0.1', resolve); });
  });
  test.afterAll(async () => { await new Promise<void>((resolve) => twin.close(() => resolve())); });
  test.beforeEach(() => { received.length = 0; });

  test('setup: an in-progress attempt on an allocated robot', async ({ page }) => {
    const admin = await headers(page, 'schoolAdmin'); const student = await headers(page, 'student');
    const put = await page.request.put(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocation`, { headers: admin, data: { robotId: fixture.allocatedRobotId } });
    expect([200, 201]).toContain(put.status());
    const started = await page.request.post(`${apiBase}/classroom-assignments/${fixture.programDeliveryId}/attempts`, { headers: student });
    expect([200, 201], await started.text()).toContain(started.status());
    attemptId = ((await started.json()) as { id: string }).id;
    reopen();
  });

  test('removing the allocation revokes viewers bound to that robot; (re)adding it revokes nothing', async ({ page }) => {
    const admin = await headers(page, 'schoolAdmin');
    expect((await page.request.put(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocation`, { headers: admin, data: { robotId: fixture.allocatedRobotId } })).status()).toBeLessThan(500);
    await settle(); expect(revokedFor(attemptId)).toHaveLength(0);
    // allocation is many-to-many since migration S: adding another robot never revokes; removing THIS one does
    const added = await page.request.post(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocations`, { headers: admin, data: { robotId: fixture.replacementRobotId } });
    expect(added.ok(), await added.text()).toBeTruthy(); await settle(); expect(revokedFor(attemptId)).toHaveLength(0);
    const removed = await page.request.delete(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocations/${fixture.allocatedRobotId}`, { headers: admin });
    expect(removed.ok(), await removed.text()).toBeTruthy(); await settle();
    const hits = revokedFor(attemptId);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ path: '/internal/revoke-attempt', validSignature: true, claims: { kind: 'simulation_publisher', aud: 'vista-digital-twin-simulation-publisher', robots: [fixture.allocatedRobotId], org: fixture.schoolId } });
    expect((await page.request.post(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocations`, { headers: admin, data: { robotId: fixture.allocatedRobotId } })).ok()).toBeTruthy();
    await page.request.delete(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocations/${fixture.replacementRobotId}`, { headers: admin });
  });

  test('suspending the member revokes; suspending someone else does not; reactivation restores', async ({ page }) => {
    const admin = await headers(page, 'schoolAdmin');
    const status = (userId: string, value: string) => page.request.patch(`${apiBase}/education-admin/organizations/${fixture.schoolId}/members/${userId}/status`, { headers: admin, data: { status: value } });
    reopen(); received.length = 0;
    expect((await status(fixture.users.otherStudent.userId, 'suspended')).ok()).toBeTruthy(); await settle();
    expect(revokedFor(attemptId)).toHaveLength(0);                                      // an unrelated student's access change does not touch this attempt
    expect((await status(fixture.users.otherStudent.userId, 'active')).ok()).toBeTruthy();
    expect((await status(fixture.users.student.userId, 'suspended')).ok()).toBeTruthy(); await settle();
    expect(revokedFor(attemptId)).toHaveLength(1);
    expect((await status(fixture.users.student.userId, 'active')).ok()).toBeTruthy();
  });

  test('disabling the account revokes; the account is refused while disabled and works again afterwards', async ({ page }) => {
    const sys = await headers(page, 'admin'); const student = await headers(page, 'student');
    reopen(); received.length = 0;
    const off = await page.request.patch(`${apiBase}/education-admin/users/${fixture.users.student.userId}/status`, { headers: sys, data: { status: 'disabled' } });
    expect(off.ok(), await off.text()).toBeTruthy(); await settle();
    expect(revokedFor(attemptId)).toHaveLength(1);
    expect((await page.request.get(`${apiBase}/me/learning`, { headers: student })).status()).toBe(403);
    expect((await page.request.patch(`${apiBase}/education-admin/users/${fixture.users.student.userId}/status`, { headers: await headers(page, 'schoolAdmin'), data: { status: 'disabled' } })).status()).toBe(404);   // only the platform operator may
    expect((await page.request.patch(`${apiBase}/education-admin/users/${fixture.users.admin.userId}/status`, { headers: sys, data: { status: 'disabled' } })).status()).toBe(403);                                  // never itself
    expect((await page.request.patch(`${apiBase}/education-admin/users/${fixture.users.student.userId}/status`, { headers: sys, data: { status: 'active' } })).ok()).toBeTruthy();
    expect((await page.request.get(`${apiBase}/me/learning`, { headers: student })).status()).toBe(200);
    expect(psql(`select status from users where id='${fixture.users.student.userId}'`)).toBe('active');   // a school-provisioned student returns to ACTIVE, not "invited"
    expect([200, 201]).toContain((await page.request.post(`${apiBase}/classroom-assignments/${fixture.programDeliveryId}/attempts`, { headers: student })).status());   // and can work again
  });

  test('suspending the organization revokes every viewer in it; reactivation restores', async ({ page }) => {
    const sys = await headers(page, 'admin'); reopen(); received.length = 0;
    const off = await page.request.patch(`${apiBase}/education-admin/organizations/${fixture.schoolId}`, { headers: sys, data: { status: 'suspended' } });
    try { expect(off.ok(), await off.text()).toBeTruthy(); await settle(); expect(revokedFor(attemptId)).toHaveLength(1); }
    finally { await page.request.patch(`${apiBase}/education-admin/organizations/${fixture.schoolId}`, { headers: sys, data: { status: 'active' } }); }
  });

  test('final submission does NOT revoke the attempt viewers (#253: the WF-03 run follows the submission)', async ({ page }) => {
    const student = await headers(page, 'student'); reopen(); received.length = 0;
    const program = await (await page.request.post(`${apiBase}/me/attempts/${attemptId}/program`, { headers: student, data: { title: 'P', workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }, robotProgram: { kind: 'robot_program', schemaVersion: 1, steps: [] } } })).json() as { id: string };
    const version = await (await page.request.post(`${apiBase}/me/programs/${program.id}/versions`, { headers: student, data: { changeSummary: 'final' } })).json() as { id: string };
    const submitted = await page.request.post(`${apiBase}/me/attempts/${attemptId}/submission`, { headers: student, data: { programVersionId: version.id } });
    expect(submitted.ok(), await submitted.text()).toBeTruthy(); await settle();
    expect(revokedFor(attemptId)).toHaveLength(0);
  });
});
