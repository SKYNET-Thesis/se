import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/** Desktop / Edge device provisioning against the real API, database and runtime role. The device side is simulated with real Ed25519 keys. */
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36);
const newKey = () => { const { publicKey, privateKey } = generateKeyPairSync('ed25519'); return { publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), sign: (m: string) => sign(null, Buffer.from(m), privateKey).toString('base64url') }; };
type Key = ReturnType<typeof newKey>;
const enrollMsg = (id: string, nonce: string) => `vista-device-enroll:v1:${id}:${nonce}`;
const authMsg = (id: string, nonce: string) => `vista-device-auth:v1:${id}:${nonce}`;

async function enroll(page: Page, code: string, key: Key) {
  const start = await call(page, '', 'POST', '/devices/enroll/start', { enrollmentCode: code });
  if (start.status !== 201) return { start, complete: undefined };
  const complete = await call(page, '', 'POST', '/devices/enroll/complete', { deviceId: start.body.deviceId, nonce: start.body.nonce, publicKey: key.publicKey, signature: key.sign(enrollMsg(start.body.deviceId, start.body.nonce)) });
  return { start, complete };
}
async function login(page: Page, deviceId: string, key: Key) {
  const challenge = await call(page, '', 'POST', '/devices/auth/challenge', { deviceId });
  if (challenge.status !== 200) return { challenge, token: undefined };
  const token = await call(page, '', 'POST', '/devices/auth/token', { deviceId, nonce: challenge.body.nonce, signature: key.sign(authMsg(deviceId, challenge.body.nonce)) });
  return { challenge, token };
}

test.describe.serial('device provisioning lifecycle', () => {
  const key = newKey(); const stranger = newKey(); const secondKey = newKey();
  let orgId = ''; let adminToken = ''; let deviceId = ''; let code = ''; let accessToken = '';
  const base = () => `/education-admin/organizations/${orgId}/devices`;

  test('School Admin registers a device; the one-time code is shown once and never stored', async ({ page }) => {
    const fixture = await loadFixture(); orgId = fixture.schoolId; adminToken = await signIn(page, fixture, 'schoolAdmin');
    const foreign = await call(page, adminToken, 'POST', base(), { name: `Foreign robot ${run}`, deviceKind: 'edge_runtime', robotId: (fixture as unknown as { foreignRobotId: string }).foreignRobotId });
    expect(foreign.status).toBe(404);                                                                // a robot the organization is not entitled to
    expect((await call(page, adminToken, 'POST', base(), { name: '   ', deviceKind: 'edge_runtime' })).status).toBe(400);
    expect((await call(page, adminToken, 'POST', base(), { name: 'x', deviceKind: 'toaster' })).status).toBe(400);
    const registered = await call(page, adminToken, 'POST', base(), { name: `Lab station ${run}`, deviceKind: 'desktop_lab_station', robotId: (fixture as unknown as { allocatedRobotId: string }).allocatedRobotId });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    deviceId = registered.body.device.id; code = registered.body.enrollmentCode;
    expect(registered.body.device).toMatchObject({ status: 'pending', deviceKind: 'desktop_lab_station', keyFingerprint: null });
    expect(code).toMatch(/^vd_[A-Za-z0-9_-]{32}$/);
    expect(JSON.stringify((await call(page, adminToken, 'GET', base())).body)).not.toContain(code);     // never returned again
    expect(psql(`select count(*) from device_enrollment_challenges where code_hash='${code}'`)).toBe('0'); // only a hash is stored
    expect((await call(page, adminToken, 'POST', base(), { name: `lab STATION ${run}`, deviceKind: 'desktop_lab_station' })).status).toBe(409);   // duplicate name
  });

  test('enrollment needs the one-time code AND proof of possession of the private key', async ({ page }) => {
    expect((await call(page, '', 'POST', '/devices/enroll/start', { enrollmentCode: `vd_${'A'.repeat(32)}` })).status).toBe(404);
    const start = await call(page, '', 'POST', '/devices/enroll/start', { enrollmentCode: code });
    expect(start.status).toBe(201); expect(start.body.deviceId).toBe(deviceId);
    const good = { deviceId, nonce: start.body.nonce, publicKey: key.publicKey };
    // a signature made with a DIFFERENT private key, or over another purpose/nonce, or garbage: refused and the challenge survives
    for (const signature of [stranger.sign(enrollMsg(deviceId, start.body.nonce)), key.sign(authMsg(deviceId, start.body.nonce)), key.sign(enrollMsg(deviceId, 'other')), 'A'.repeat(86)]) {
      expect((await call(page, '', 'POST', '/devices/enroll/complete', { ...good, signature })).status).toBe(401);
    }
    expect((await call(page, '', 'POST', '/devices/enroll/complete', { ...good, publicKey: 'not-a-key-'.repeat(6), signature: key.sign(enrollMsg(deviceId, start.body.nonce)) })).status).toBe(400);
    const done = await call(page, '', 'POST', '/devices/enroll/complete', { ...good, signature: key.sign(enrollMsg(deviceId, start.body.nonce)) });
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    expect(done.body).toMatchObject({ deviceId, status: 'active', credentialVersion: 1 }); expect(done.body.keyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    // single use: the code, the nonce and the signature are all dead now
    expect((await call(page, '', 'POST', '/devices/enroll/start', { enrollmentCode: code })).status).toBe(404);
    expect((await call(page, '', 'POST', '/devices/enroll/complete', { ...good, signature: key.sign(enrollMsg(deviceId, start.body.nonce)) })).status).toBe(401);
    expect(psql(`select status || ':' || (public_key is not null) from robot_devices where id='${deviceId}'`)).toBe('active:true');
  });

  test('one key cannot serve two devices', async ({ page }) => {
    const second = await call(page, adminToken, 'POST', base(), { name: `Second ${run}`, deviceKind: 'edge_runtime' });
    const { complete } = await enroll(page, second.body.enrollmentCode, key);                    // same public key as the first device
    expect(complete?.status).toBe(409);
    expect(psql(`select status from robot_devices where id='${second.body.device.id}'`)).toBe('pending');
    expect((await call(page, adminToken, 'POST', `${base()}/${second.body.device.id}/revoke`, { reason: 'test cleanup' })).status).toBe(200);
  });

  test('the device authenticates by signing a single-use nonce and gets a short-lived API token', async ({ page }) => {
    const { challenge, token } = await login(page, deviceId, key);
    expect(challenge.status).toBe(200); expect(token?.status, JSON.stringify(token?.body)).toBe(200);
    expect(token!.body).toMatchObject({ tokenType: 'device', expiresIn: 900 }); accessToken = token!.body.accessToken;
    expect(accessToken).toMatch(/^vd1\./);
    expect((await call(page, accessToken, 'GET', '/devices/me')).body).toMatchObject({ id: deviceId, organizationId: orgId, deviceKind: 'desktop_lab_station', robotId: expect.any(String) });
    expect((await call(page, accessToken, 'POST', '/devices/me/heartbeat')).body.status).toBe('active');
    expect(psql(`select last_seen_at is not null from robot_devices where id='${deviceId}'`)).toBe('t');
    // replay, wrong key, wrong purpose, tampered token, user token, no token
    const replay = await call(page, '', 'POST', '/devices/auth/token', { deviceId, nonce: challenge.body.nonce, signature: key.sign(authMsg(deviceId, challenge.body.nonce)) });
    expect(replay.status).toBe(401);
    const c2 = await call(page, '', 'POST', '/devices/auth/challenge', { deviceId });
    expect((await call(page, '', 'POST', '/devices/auth/token', { deviceId, nonce: c2.body.nonce, signature: stranger.sign(authMsg(deviceId, c2.body.nonce)) })).status).toBe(401);
    const c3 = await call(page, '', 'POST', '/devices/auth/challenge', { deviceId });
    expect((await call(page, '', 'POST', '/devices/auth/token', { deviceId, nonce: c3.body.nonce, signature: key.sign(enrollMsg(deviceId, c3.body.nonce)) })).status).toBe(401);
    expect((await call(page, accessToken.slice(0, -2) + 'xx', 'GET', '/devices/me')).status).toBe(401);
    expect((await call(page, adminToken, 'GET', '/devices/me')).status).toBe(401);                   // a USER token is not a device token
    expect((await call(page, '', 'GET', '/devices/me')).status).toBe(401);
    expect((await call(page, accessToken, 'GET', base())).status).toBe(401);                         // and a device token cannot manage devices
    expect((await call(page, '', 'POST', '/devices/auth/challenge', { deviceId: '00000000-0000-4000-8000-000000000123' })).status).toBe(401);   // unknown device: the same generic answer
  });

  test('isolation and RBAC: other schools, instructors and students cannot see or change devices', async ({ page }) => {
    const fixture = await loadFixture();
    for (const who of ['otherSchoolAdmin', 'instructor', 'student']) {
      const t = await signIn(page, fixture, who);
      expect((await call(page, t, 'GET', base())).status, `${who} list`).toBe(404);
      expect((await call(page, t, 'GET', `${base()}/${deviceId}`)).status, `${who} get`).toBe(404);
      expect((await call(page, t, 'POST', base(), { name: `x ${who}`, deviceKind: 'edge_runtime' })).status, `${who} register`).toBe(404);
      for (const action of ['suspend', 'resume', 'revoke', 'rotate-credential']) expect((await call(page, t, 'POST', `${base()}/${deviceId}/${action}`, {})).status, `${who} ${action}`).toBe(404);
    }
    const sys = await signIn(page, fixture, 'admin');
    expect(((await call(page, sys, 'GET', base())).body as Array<{ id: string }>).some((d) => d.id === deviceId)).toBe(true);   // platform operator can
    // a device of school A is invisible through school B's own management path
    const otherOrg = fixture.otherSchoolId; const otherAdmin = await signIn(page, fixture, 'otherSchoolAdmin');
    expect((await call(page, otherAdmin, 'GET', `/education-admin/organizations/${otherOrg}/devices/${deviceId}`)).status).toBe(404);
  });

  test('suspension and resume take effect on the very next request', async ({ page }) => {
    expect((await call(page, adminToken, 'POST', `${base()}/${deviceId}/suspend`, { reason: 'maintenance' })).body.status).toBe('suspended');
    expect((await call(page, accessToken, 'GET', '/devices/me')).status).toBe(401);                  // live check, not token expiry
    expect((await call(page, '', 'POST', '/devices/auth/challenge', { deviceId })).status).toBe(401);
    expect((await call(page, adminToken, 'POST', `${base()}/${deviceId}/suspend`, {})).body.status).toBe('suspended');   // idempotent
    expect((await call(page, adminToken, 'POST', `${base()}/${deviceId}/resume`)).body.status).toBe('active');
    expect((await call(page, accessToken, 'GET', '/devices/me')).status).toBe(200);
  });

  test('organization suspension disables its devices; reactivation restores them', async ({ page }) => {
    const fixture = await loadFixture(); const sys = await signIn(page, fixture, 'admin');
    await call(page, sys, 'PATCH', `/education-admin/organizations/${orgId}`, { status: 'suspended' });
    try {
      expect((await call(page, accessToken, 'GET', '/devices/me')).status).toBe(401);
      expect((await call(page, '', 'POST', '/devices/auth/challenge', { deviceId })).status).toBe(401);
      expect((await call(page, adminToken, 'GET', base())).status).toBe(404);                       // the school admin is locked out as well
    } finally { await call(page, sys, 'PATCH', `/education-admin/organizations/${orgId}`, { status: 'active' }); }
    expect((await call(page, accessToken, 'GET', '/devices/me')).status).toBe(200);
  });

  test('credential rotation invalidates old tokens and the old key; a new key enrolls with a fresh code', async ({ page }) => {
    const rotated = await call(page, adminToken, 'POST', `${base()}/${deviceId}/rotate-credential`);
    expect(rotated.status, JSON.stringify(rotated.body)).toBe(201);
    expect(rotated.body.device).toMatchObject({ status: 'pending', keyFingerprint: null, credentialVersion: 2 });
    expect((await call(page, accessToken, 'GET', '/devices/me')).status).toBe(401);                  // old token dead at once
    expect((await login(page, deviceId, key)).challenge.status).toBe(401);                            // old key cannot even ask for a nonce
    expect((await call(page, '', 'POST', '/devices/enroll/start', { enrollmentCode: code })).status).toBe(404);   // the previous code is dead
    const { complete } = await enroll(page, rotated.body.enrollmentCode, secondKey);
    expect(complete?.status, JSON.stringify(complete?.body)).toBe(201); expect(complete!.body.credentialVersion).toBe(2);
    const session = await login(page, deviceId, secondKey);
    expect(session.token?.status).toBe(200);
    expect((await login(page, deviceId, key)).token?.status).toBe(401);                                 // the previous key stays useless
    accessToken = session.token!.body.accessToken;
    expect((await call(page, accessToken, 'GET', '/devices/me')).status).toBe(200);
  });

  test('revocation is permanent, idempotent and immediate; nothing is erased', async ({ page }) => {
    const fixture = await loadFixture();
    const revoked = await call(page, adminToken, 'POST', `${base()}/${deviceId}/revoke`, { reason: 'lost device' });
    expect(revoked.body).toMatchObject({ status: 'revoked', revokeReason: 'lost device' });
    expect((await call(page, accessToken, 'GET', '/devices/me')).status).toBe(401);
    expect((await login(page, deviceId, secondKey)).challenge.status).toBe(401);
    expect((await call(page, adminToken, 'POST', `${base()}/${deviceId}/revoke`, {})).body.status).toBe('revoked');      // idempotent
    expect((await call(page, adminToken, 'POST', `${base()}/${deviceId}/rotate-credential`)).status).toBe(409);          // register a new device instead
    expect((await call(page, adminToken, 'POST', `${base()}/${deviceId}/resume`)).status).toBe(409);
    expect(psql(`select count(*) from robot_devices where id='${deviceId}'`)).toBe('1');                                  // the record stays for audit
    // the revoked device's key can be enrolled on a new device (revoked keys no longer count as in use)
    const fresh = await call(page, adminToken, 'POST', base(), { name: `Replacement ${run}`, deviceKind: 'desktop_lab_station' });
    expect((await enroll(page, fresh.body.enrollmentCode, secondKey)).complete?.status).toBe(201);
    void fixture;
  });

  test('every state change is audited and the public endpoints are rate limited', async ({ page }) => {
    for (const action of ['device.registered', 'device.enrolled', 'device.suspended', 'device.resumed', 'device.credential_rotation_requested', 'device.revoked']) {
      expect(Number(psql(`select count(*) from audit_logs where organization_id='${orgId}' and action='${action}' and target_id='${deviceId}'`)), action).toBeGreaterThanOrEqual(1);
    }
    expect(psql(`select count(*) from audit_logs where action like 'device.%' and details::text ~* '(vd_|signature|private)'`)).toBe('0');   // no secret material in the audit trail
    let limited = false;
    for (let i = 0; i < 60 && !limited; i += 1) limited = (await call(page, '', 'POST', '/devices/auth/challenge', { deviceId: '00000000-0000-4000-8000-0000000000aa' })).status === 429;
    expect(limited).toBe(true);
  });
});
