import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Real GoTrue session handling against the Education API (harness: scripts/local_student_auth_harness.sh): password login, token
 * refresh (rotation), tampered / unsigned / foreign tokens, revocation on logout, student authorization and cross-tenant denial.
 * Env: SA_API, SA_AUTH, SA_ANON_KEY_FILE, VISTA_E2E_FIXTURE_FILE. Nothing is mocked; no shared or hosted Supabase is used.
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const API = env('SA_API'); const AUTH = env('SA_AUTH');
// Fixture credentials and a global logout are used here: refuse anything that is not a loopback, disposable harness.
for (const url of [API, AUTH]) if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error(`Refusing to run against a non-loopback endpoint: ${new URL(url).hostname}`);
const anonKey = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon;
const fixture = JSON.parse(readFileSync(env('VISTA_E2E_FIXTURE_FILE'), 'utf8')) as { classroomId: string; otherClassroomId: string };
const STUDENT = { email: 'phase243-student@vista.test', password: 'LocalFixturePass-student!' };
let ip = 40; const forwarded = () => ({ 'X-Forwarded-For': `10.30.0.${(ip = (ip % 240) + 1)}` });

interface Session { access_token: string; refresh_token: string; expires_in: number }
const grant = async (request: APIRequestContext, type: 'password' | 'refresh_token', data: Record<string, string>) => {
  const response = await request.post(`${AUTH}/token?grant_type=${type}`, { headers: { apikey: anonKey, ...forwarded() }, data });
  return { status: response.status(), body: await response.json() as Partial<Session> };
};
const get = (request: APIRequestContext, token: string | null, path: string) =>
  request.get(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}`, ...forwarded() } : forwarded() });

test.describe.configure({ mode: 'serial' });

test('login, authorized reads, refresh rotation and logout revocation with real GoTrue tokens', async ({ request }) => {
  const login = await grant(request, 'password', STUDENT);
  expect(login.status).toBe(200);
  const { access_token: access, refresh_token: refresh } = login.body as Session;
  expect((login.body as Session).expires_in).toBeGreaterThan(0);

  const roles = await get(request, access, '/me/roles');
  expect(roles.status()).toBe(200);
  expect((await get(request, access, '/me/enrollments')).status()).toBe(200);

  // refresh: a new access token is issued and works; the API holds no server-side session
  const refreshed = await grant(request, 'refresh_token', { refresh_token: refresh });
  expect(refreshed.status).toBe(200);
  expect(refreshed.body.access_token).toBeTruthy();
  expect(refreshed.body.refresh_token).not.toBe(refresh);                                    // rotation
  expect((await get(request, refreshed.body.access_token!, '/me/roles')).status()).toBe(200);

  // logout revokes the refresh token chain: neither the rotated nor a fresh refresh succeeds afterwards
  const logout = await request.post(`${AUTH}/logout?scope=global`, { headers: { apikey: anonKey, Authorization: `Bearer ${refreshed.body.access_token}`, ...forwarded() } });
  expect([200, 204]).toContain(logout.status());
  const afterLogout = await grant(request, 'refresh_token', { refresh_token: refreshed.body.refresh_token! });
  expect(afterLogout.status).toBeGreaterThanOrEqual(400);
  expect(afterLogout.status).toBeLessThan(500);
  expect(afterLogout.body.access_token).toBeUndefined();
});

test('missing, malformed, tampered, unsigned and wrong-issuer tokens are rejected with 401', async ({ request }) => {
  const login = await grant(request, 'password', STUDENT);
  const token = login.body.access_token!;
  const [header, payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), exp: Math.floor(Date.now() / 1000) - 60 })).toString('base64url');
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const foreignIssuer = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), iss: 'https://evil.example/auth/v1' })).toString('base64url');
  const cases: Array<[string, string | null]> = [
    ['no token', null], ['garbage', 'not-a-jwt'],
    ['payload edited (expired claim), signature kept', `${header}.${forged}.${signature}`],
    ['alg none', `${noneHeader}.${payload}.`],
    ['foreign issuer, signature kept', `${header}.${foreignIssuer}.${signature}`],
    ['truncated signature', `${header}.${payload}.${signature.slice(0, 10)}`],
  ];
  for (const [label, candidate] of cases) {
    const response = await get(request, candidate, '/me/roles');
    expect(response.status(), label).toBe(401);
  }
  expect((await get(request, token, '/me/roles')).status()).toBe(200);                          // the genuine token still works
});

test('student authorization and cross-tenant denial hold for real sessions', async ({ request }) => {
  const student = (await grant(request, 'password', STUDENT)).body.access_token!;
  const otherAdmin = (await grant(request, 'password', { email: 'phase243-other-school-admin@vista.test', password: 'LocalFixturePass-otherSchoolAdmin!' })).body.access_token!;
  // a student cannot use staff and administration routes
  for (const path of [`/education-admin/classrooms/${fixture.classroomId}/eligible-robots`, '/admin/courses']) {
    expect([403, 404, 405], path).toContain((await get(request, student, path)).status());
  }
  expect((await request.post(`${API}/admin/courses`, { headers: { Authorization: `Bearer ${student}`, ...forwarded() }, data: { title: 'Nope' } })).status()).toBeGreaterThanOrEqual(403);
  // another school's administrator cannot read this school's classroom, and the student cannot read the other school's
  expect([403, 404]).toContain((await get(request, otherAdmin, `/classrooms/${fixture.classroomId}`)).status());
  expect([403, 404]).toContain((await get(request, student, `/classrooms/${fixture.otherClassroomId}`)).status());
});
