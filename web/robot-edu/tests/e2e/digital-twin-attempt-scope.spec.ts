import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Attempt-bound Digital Twin viewer scope against the real API, real PostgreSQL authorization SQL and the restricted runtime role. */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { classroomId: string; programDeliveryId: string; allocatedRobotId: string; foreignRobotId: string; replacementRobotId: string; users: Record<string, { authUserId: string }> };
const apiBase = process.env.VISTA_E2E_API_BASE_URL!; const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

test('attempt-bound viewer scope: granted only to the owner of an in-progress attempt on its allocated, entitled robot', async ({ page }) => {
  const bearer = async (who: string) => ({ Authorization: `Bearer ${((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json()) as { access_token: string }).access_token}` });
  const student = await bearer('student'); const other = await bearer('otherStudent');
  // WF-01: the robot must be allocated to the attempt's classroom; allocation is part of the single authorization path
  const early = await page.request.put(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocation`, { headers: await bearer('schoolAdmin'), data: { robotId: fixture.allocatedRobotId } });
  expect([200, 201], await early.text()).toContain(early.status());
  const started = await page.request.post(`${apiBase}/classroom-assignments/${fixture.programDeliveryId}/attempts`, { headers: student });
  expect([200, 201]).toContain(started.status());
  const attempt = await started.json() as { id: string };
  const scopeUrl = (id: string) => `${apiBase}/me/attempts/${id}/digital-twin/viewer-scope`;

  const granted = await page.request.post(scopeUrl(attempt.id), { headers: student, data: { robotId: fixture.allocatedRobotId, labSessionId: 'lab-1' } });
  expect(granted.status(), await granted.text()).toBe(201);
  const body = await granted.json() as { token: string; expiresAt: string; attemptId: string; robotId: string; organizationId: string };
  expect(body.attemptId).toBe(attempt.id);
  const claims = claimsOf(body.token);
  expect(claims).toMatchObject({ kind: 'viewer', attempt_id: attempt.id, robots: [fixture.allocatedRobotId], org: body.organizationId, lab_session_id: 'lab-1' });
  expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
  expect(typeof claims.assignment_id).toBe('string'); expect(typeof claims.classroom_id).toBe('string');

  // every other combination is refused with 404 and never signs a token
  const denied: Array<[string, Awaited<ReturnType<typeof page.request.post>>]> = [
    ['another school\'s student', await page.request.post(scopeUrl(attempt.id), { headers: other, data: { robotId: fixture.allocatedRobotId } })],
    ['robot of another school', await page.request.post(scopeUrl(attempt.id), { headers: student, data: { robotId: fixture.foreignRobotId } })],
    ['unknown attempt', await page.request.post(scopeUrl('00000000-0000-4000-8000-000000000999'), { headers: student, data: { robotId: fixture.allocatedRobotId } })],
  ];
  for (const [label, response] of denied) { expect(response.status(), label).toBe(404); expect(await response.text(), label).not.toContain('token'); }
  expect((await page.request.post(scopeUrl(attempt.id), { data: { robotId: fixture.allocatedRobotId } })).status()).toBe(401);
  expect((await page.request.post(scopeUrl(attempt.id), { headers: student, data: { robotId: 'not-a-uuid' } })).status()).toBe(400);
});
