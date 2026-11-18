import { expect, test, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

/**
 * Student Temporary Password — real integration: Education API (runtime DB role) + real Supabase GoTrue (ES256 JWKS) +
 * real PostgreSQL. Nothing here mocks Supabase. Run with the harness described in docs/operations/student-temp-password.md.
 *
 * Env: SA_API (flag ON), SA_API_LEGACY (flag OFF), SA_AUTH, SA_ANON_KEY_FILE, SA_SECRETS_FILE (collected one-time passwords, mode 0600,
 * grepped afterwards against DB dump and logs), VISTA_E2E_FIXTURE_FILE, VISTA_E2E_ADMIN_DATABASE_URL.
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const API = env('SA_API'); const LEGACY = env('SA_API_LEGACY'); const AUTH = env('SA_AUTH');
const anonKey = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon;
const secretsFile = env('SA_SECRETS_FILE'); const dbUrl = env('VISTA_E2E_ADMIN_DATABASE_URL');
const fixture = JSON.parse(readFileSync(env('VISTA_E2E_FIXTURE_FILE'), 'utf8')) as { schoolId: string; classroomId: string; otherClassroomId: string; otherSchoolId: string };
const run = Date.now().toString(36).toUpperCase();
let ipCounter = 10;
const nextIp = () => { ipCounter += 1; return `10.20.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`; };
const remember = (label: string, secret: string) => appendFileSync(secretsFile, `${label}\t${secret}\n`, { mode: 0o600 });
const psql = (sql: string) => execFileSync('psql', [dbUrl, '-Atqc', sql], { encoding: 'utf8' }).trim();

async function passwordGrant(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${AUTH}/token?grant_type=password`, { headers: { apikey: anonKey }, data: { email, password } });
  return { status: response.status(), body: await response.json() as { access_token?: string; refresh_token?: string } };
}
const staff = async (request: APIRequestContext, who: 'schoolAdmin' | 'instructor' | 'otherSchoolAdmin' | 'student') => {
  const emails = { schoolAdmin: 'phase243-school-admin@vista.test', instructor: 'phase243-instructor@vista.test', otherSchoolAdmin: 'phase243-other-school-admin@vista.test', student: 'phase243-student@vista.test' };
  const grant = await passwordGrant(request, emails[who], `LocalFixturePass-${who}!`);
  expect(grant.status, `${who} sign-in`).toBe(200);
  return { Authorization: `Bearer ${grant.body.access_token}` };
};
const importRows = (request: APIRequestContext, headers: Record<string, string>, rows: Array<Record<string, string>>, base = API, classroomId = fixture.classroomId, schoolId = fixture.schoolId) =>
  request.post(`${base}/education-admin/organizations/${schoolId}/classrooms/${classroomId}/student-imports`, { headers: { ...headers, 'X-Forwarded-For': nextIp() }, data: { rows } });
const studentPost = (request: APIRequestContext, path: string, data: unknown, base = API) =>
  request.post(`${base}/auth/students/${path}`, { headers: { 'X-Forwarded-For': nextIp() }, data });
const login = (request: APIRequestContext, schoolCode: string, studentCode: string, password: string, base = API) => studentPost(request, 'login', { schoolCode, studentCode, password }, base);
const me = (request: APIRequestContext, token: string, path = '/me/roles', base = API) => request.get(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
const reissue = (request: APIRequestContext, headers: Record<string, string>, studentId: string, base = API, schoolId = fixture.schoolId) =>
  request.post(`${base}/education-admin/organizations/${schoolId}/students/${studentId}/temporary-password/reissue`, { headers, data: { confirm: true } });
const row = (n: number, tag: string) => ({ firstName: `Temp${tag}`, lastName: `Student${n}`, studentCode: `TP-${run}-${tag}${n}`, gradeLevel: '7' });

test.describe.configure({ mode: 'serial' });

interface Created { studentCode: string; password: string; userId?: string }
const first: Created = { studentCode: '', password: '' }; const second: Created = { studentCode: '', password: '' };
let schoolCode = ''; let admin: Record<string, string>; let newPasswordFirst = '';

test.beforeAll(async ({ request }) => {
  admin = await staff(request, 'schoolAdmin');
  // the isolated fixture school has no school code yet (real schools receive one when first importing students)
  psql(`update organizations set school_code='SA${run}' where id='${fixture.schoolId}' and school_code is null`);
});

test('E2E-01/02: school admin creates students; temporary passwords are generated, shown once, never persisted in plaintext', async ({ request }) => {
  const rows = [row(1, 'A'), row(2, 'A')];
  const response = await importRows(request, admin, rows);
  expect(response.status()).toBe(201);
  expect(response.headers()['cache-control']).toContain('no-store');
  const body = await response.json() as { schoolCode?: string; createdAndAdded: number; results: Array<{ status: string; studentCode?: string; temporaryPassword?: string; temporaryPasswordExpiresAt?: string; setupCode?: string }> };
  expect(body.createdAndAdded).toBe(2); expect(body.schoolCode).toBeTruthy(); schoolCode = body.schoolCode!;
  for (const [index, result] of body.results.entries()) {
    expect(result.temporaryPassword!.length).toBeGreaterThanOrEqual(32);
    expect(result.setupCode).toBeUndefined();
    const hours = (new Date(result.temporaryPasswordExpiresAt!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71); expect(hours).toBeLessThanOrEqual(72.01);
    remember(`temp:${rows[index].studentCode}`, result.temporaryPassword!);
    (index === 0 ? first : second).studentCode = rows[index].studentCode; (index === 0 ? first : second).password = result.temporaryPassword!;
  }
  expect(first.password).not.toBe(second.password);
  // persisted state is metadata only; the DB row is flagged and carries an expiry, never the password
  const state = psql(`select password_change_required, temporary_password_expires_at is not null, account_state from education_school_user_profiles where student_code='${first.studentCode}'`);
  expect(state).toBe('t|t|active');
  // the internal alias is a real Supabase identity, mapped to a VISTA user in this school
  const mapped = psql(`select count(*) from users u join education_school_user_profiles p on p.user_id=u.id where p.student_code='${first.studentCode}' and u.auth_user_id is not null and u.status='active'`);
  expect(mapped).toBe('1');
});

test('E2E-03/04/05/06/07/08: first login is restricted until the password is changed; old password dies; LMS opens afterwards', async ({ request }) => {
  const loginResponse = await login(request, schoolCode, first.studentCode, first.password);
  expect(loginResponse.status()).toBe(201);
  const session = await loginResponse.json() as { access_token: string; refresh_token: string; password_change_required: boolean };
  expect(session.password_change_required).toBe(true);

  // E2E-04: every ordinary route is refused with a stable code, the password endpoint is not
  for (const path of ['/me/roles', '/me/learning', '/me/attempts', '/me/memberships']) {
    const blocked = await me(request, session.access_token, path);
    expect(blocked.status(), path).toBe(403);
    expect((await blocked.json() as { code?: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
  }
  const change = (currentPassword: string, newPassword: string, token = session.access_token) =>
    request.patch(`${API}/auth/students/password`, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': nextIp() }, data: { currentPassword, newPassword } });
  expect([400, 401].includes((await change(first.password, 'short')).status())).toBe(true);                       // policy
  expect([400, 401, 409].includes((await change(first.password, first.password)).status())).toBe(true);           // reuse
  expect((await change('definitely-wrong-password', 'A-brand-new-Passw0rd!')).status()).toBe(401);                // current password verified
  expect((await request.patch(`${API}/auth/students/password`, { data: { currentPassword: 'x', newPassword: 'y'.repeat(14) } })).status()).toBe(401); // no token

  // E2E-05
  newPasswordFirst = `Changed-${run}-Passw0rd!`; remember(`new:${first.studentCode}`, newPasswordFirst);
  const changed = await change(first.password, newPasswordFirst);
  expect(changed.status(), await changed.text()).toBe(200);
  const next = await changed.json() as { access_token: string; refresh_token: string };
  expect(next.access_token).toBeTruthy();

  // E2E-06: the temporary password is dead
  expect((await login(request, schoolCode, first.studentCode, first.password)).status()).toBe(401);
  // documented server-side cutoff: tokens issued before the change are refused...
  const stale = await me(request, session.access_token, '/me/roles');
  expect(stale.status()).toBe(401);
  expect((await stale.json() as { code?: string }).code).toBe('SESSION_ROTATED');
  // ...and the pre-change session's refresh token was really revoked at Supabase (logout scope=others)
  const refreshed = await request.post(`${AUTH}/token?grant_type=refresh_token`, { headers: { apikey: anonKey }, data: { refresh_token: session.refresh_token } });
  expect(refreshed.status()).toBeGreaterThanOrEqual(400);

  // E2E-07/08: new password works and the LMS is reachable with the replacement session
  const relogin = await login(request, schoolCode, first.studentCode, newPasswordFirst);
  expect(relogin.status()).toBe(201);
  const fresh = await relogin.json() as { access_token: string; password_change_required: boolean };
  expect(fresh.password_change_required).toBe(false);
  for (const path of ['/me/roles', '/me/learning', '/me/attempts', '/me/memberships']) expect((await me(request, fresh.access_token, path)).status(), path).toBe(200);
  expect((await me(request, next.access_token, '/me/learning')).status()).toBe(200);
  // a second change is refused: nothing pending (and the endpoint is not a general password-reset)
  expect((await change(newPasswordFirst, 'Another-Passw0rd-123', fresh.access_token)).status()).toBe(409);
  // the student sees their own enrolled classroom only
  const classes = await (await me(request, fresh.access_token, '/me/learning')).text();
  expect(classes).not.toContain(fixture.otherClassroomId);
});

test('E2E-16: re-importing the same CSV is idempotent: no new credentials, no password rotation', async ({ request }) => {
  const response = await importRows(request, admin, [row(1, 'A'), row(2, 'A')]);
  expect(response.status()).toBe(201);
  const body = await response.json() as { createdAndAdded: number; results: Array<{ temporaryPassword?: string; setupCode?: string }> };
  expect(body.createdAndAdded).toBe(0);
  expect(body.results.every((r) => !r.temporaryPassword && !r.setupCode)).toBe(true);
  expect(psql(`select count(*) from education_school_user_profiles where student_code in ('${first.studentCode}','${second.studentCode}')`)).toBe('2');
  expect(psql(`select count(*) from users u join education_school_user_profiles p on p.user_id=u.id where p.student_code in ('${first.studentCode}','${second.studentCode}')`)).toBe('2');
  // first student's changed password and second student's original temporary password both still work
  expect((await login(request, schoolCode, first.studentCode, newPasswordFirst)).status()).toBe(201);
  expect((await login(request, schoolCode, second.studentCode, second.password)).status()).toBe(201);
});

test('E2E-09/10/11: expired temporary credentials are refused; admin reissue replaces them; the old one is invalid', async ({ request }) => {
  psql(`update education_school_user_profiles set temporary_password_expires_at = now() - interval '1 minute' where student_code='${second.studentCode}'`);
  const expiredLogin = await login(request, schoolCode, second.studentCode, second.password);
  expect(expiredLogin.status()).toBe(401);
  const userId = psql(`select user_id from education_school_user_profiles where student_code='${second.studentCode}'`); second.userId = userId;

  const issued = await reissue(request, admin, userId);
  expect(issued.status(), await issued.text()).toBe(201);
  expect(issued.headers()['cache-control']).toContain('no-store');
  const body = await issued.json() as { temporaryPassword: string; temporaryPasswordExpiresAt: string; schoolCode?: string };
  remember(`reissue1:${second.studentCode}`, body.temporaryPassword);
  expect(new Date(body.temporaryPasswordExpiresAt).getTime()).toBeGreaterThan(Date.now() + 70 * 3_600_000);
  expect(body.temporaryPassword).not.toBe(second.password);

  expect((await login(request, schoolCode, second.studentCode, second.password)).status()).toBe(401);      // E2E-11
  const ok = await login(request, schoolCode, second.studentCode, body.temporaryPassword);
  expect(ok.status()).toBe(201);
  expect((await ok.json() as { password_change_required: boolean }).password_change_required).toBe(true);
  // an unconfirmed reissue is refused, and the audit trail records the reissue without the secret
  expect((await request.post(`${API}/education-admin/organizations/${fixture.schoolId}/students/${userId}/temporary-password/reissue`, { headers: admin, data: { confirm: false } })).status()).toBeGreaterThanOrEqual(400);
  const audit = psql(`select count(*) from audit_logs where action='student.temporary_password.reissued' and target_id='${userId}'`);
  expect(Number(audit)).toBeGreaterThanOrEqual(1);
  expect(psql(`select count(*) from audit_logs where details::text like '%${body.temporaryPassword}%'`)).toBe('0');
});

test('E2E-17: concurrent reissue leaves exactly one valid credential and a consistent state', async ({ request }) => {
  const created = await importRows(request, admin, [row(3, 'A')]);
  const result = (await created.json() as { results: Array<{ temporaryPassword: string }> }).results[0];
  remember(`temp:${row(3, 'A').studentCode}`, result.temporaryPassword);
  const code = row(3, 'A').studentCode;
  const userId = psql(`select user_id from education_school_user_profiles where student_code='${code}'`);
  const settled = await Promise.all([reissue(request, admin, userId), reissue(request, admin, userId)]);
  const statuses = settled.map((r) => r.status());
  expect(statuses.every((s) => s === 201), statuses.join(',')).toBe(true);
  const passwords = await Promise.all(settled.map(async (r) => (await r.json() as { temporaryPassword: string }).temporaryPassword));
  passwords.forEach((p, i) => remember(`reissue-concurrent${i}:${code}`, p));
  const results = await Promise.all(passwords.map((p) => login(request, schoolCode, code, p).then((r) => r.status())));
  expect(results.filter((s) => s === 201).length, `login statuses ${results.join(',')}`).toBe(1);
  expect((await login(request, schoolCode, code, result.temporaryPassword)).status()).toBe(401);
  expect(psql(`select password_change_required from education_school_user_profiles where student_code='${code}'`)).toBe('t');
});

test('E2E-12: authorization and school isolation', async ({ request }) => {
  const otherAdmin = await staff(request, 'otherSchoolAdmin'); const instructor = await staff(request, 'instructor'); const student = await staff(request, 'student');
  const firstUser = psql(`select user_id from education_school_user_profiles where student_code='${first.studentCode}'`);
  // another school's administrator cannot provision into or reissue for this school
  expect([403, 404]).toContain((await reissue(request, otherAdmin, second.userId!)).status());
  expect([403, 404]).toContain((await importRows(request, otherAdmin, [row(9, 'X')])).status());
  expect(psql(`select count(*) from education_school_user_profiles where student_code='${row(9, 'X').studentCode}'`)).toBe('0');
  // an administrator of this school cannot act on another organization's id
  expect([403, 404]).toContain((await reissue(request, admin, second.userId!, API, fixture.otherSchoolId)).status());
  // wrong roles
  for (const headers of [instructor, student]) expect([403, 404]).toContain((await reissue(request, headers, second.userId!)).status());
  // students who already changed their password cannot be reissued a temporary credential
  expect((await reissue(request, admin, firstUser)).status()).toBe(404);
  // unauthenticated
  expect((await request.post(`${API}/education-admin/organizations/${fixture.schoolId}/students/${firstUser}/temporary-password/reissue`, { data: { confirm: true } })).status()).toBe(401);
});

test('E2E-13: accounts that exist before the feature are unaffected', async ({ request }) => {
  const grant = await passwordGrant(request, 'phase243-student@vista.test', 'LocalFixturePass-student!');
  expect(grant.status).toBe(200);
  for (const path of ['/me/roles', '/me/learning', '/me/attempts']) expect((await me(request, grant.body.access_token!, path)).status(), path).toBe(200);
  expect(psql(`select count(*) from education_school_user_profiles where password_change_required and student_code not like 'TP-%'`)).toBe('0');
});

test('Student auth endpoints are rate limited per client address', async ({ request }) => {
  const ip = '10.99.99.99'; let limited = false;
  for (let attempt = 0; attempt < 12 && !limited; attempt += 1) {
    const response = await request.post(`${API}/auth/students/login`, { headers: { 'X-Forwarded-For': ip }, data: { schoolCode: schoolCode, studentCode: 'NOPE', password: 'not-a-real-password' } });
    limited = response.status() === 429;
  }
  expect(limited).toBe(true);
});

test('E2E-14/15 + default-off: with the flag disabled, new students use the legacy Setup Code; activation, login and Recovery Code still work and no password change is forced', async ({ request }) => {
  const legacy = row(1, 'L');
  const response = await importRows(request, admin, [legacy], LEGACY);
  expect(response.status()).toBe(201);
  const body = await response.json() as { schoolCode: string; results: Array<{ temporaryPassword?: string; setupCode?: string }> };
  const result = body.results[0];
  expect(result.temporaryPassword).toBeUndefined();
  expect(result.setupCode!.length).toBeGreaterThan(20);
  expect(psql(`select password_change_required from education_school_user_profiles where student_code='${legacy.studentCode}'`)).toBe('f');
  // reissue is unavailable while the flag is off
  const legacyUser = psql(`select user_id from education_school_user_profiles where student_code='${legacy.studentCode}'`);
  expect([403, 404]).toContain((await reissue(request, admin, legacyUser, LEGACY)).status());

  // E2E-14 Setup Code
  const legacyPassword = `Legacy-${run}-Passw0rd!`; remember(`legacy:${legacy.studentCode}`, legacyPassword);
  const setup = await studentPost(request, 'setup', { schoolCode: body.schoolCode, studentCode: legacy.studentCode, setupCode: result.setupCode, password: legacyPassword }, LEGACY);
  expect(setup.status(), await setup.text()).toBe(201);
  const session = await setup.json() as { access_token: string; password_change_required?: boolean };
  expect(session.password_change_required).toBeFalsy();
  expect((await me(request, session.access_token, '/me/roles', LEGACY)).status()).toBe(200);
  // the same Setup Code cannot be replayed
  expect((await studentPost(request, 'setup', { schoolCode: body.schoolCode, studentCode: legacy.studentCode, setupCode: result.setupCode, password: 'Replay-Passw0rd-123!' }, LEGACY)).status()).toBe(401);
  // login (also against the flag-ON instance: the same student keeps working after the rollout)
  expect((await login(request, body.schoolCode, legacy.studentCode, legacyPassword, LEGACY)).status()).toBe(201);
  const onLogin = await login(request, body.schoolCode, legacy.studentCode, legacyPassword, API);
  expect(onLogin.status()).toBe(201);
  expect((await onLogin.json() as { password_change_required: boolean }).password_change_required).toBe(false);

  // E2E-15 Recovery Code
  const recovery = await request.post(`${API}/education-admin/organizations/${fixture.schoolId}/students/${legacyUser}/password-recovery`, { headers: { ...admin, 'X-Forwarded-For': nextIp() } });
  expect(recovery.status()).toBe(201);
  const { recoveryCode } = await recovery.json() as { recoveryCode: string };
  const recoveredPassword = `Recovered-${run}-Passw0rd!`; remember(`recovered:${legacy.studentCode}`, recoveredPassword);
  expect((await studentPost(request, 'recover', { schoolCode: body.schoolCode, studentCode: legacy.studentCode, recoveryCode, password: recoveredPassword })).status()).toBe(201);
  expect((await login(request, body.schoolCode, legacy.studentCode, legacyPassword)).status()).toBe(401);
  const finalLogin = await login(request, body.schoolCode, legacy.studentCode, recoveredPassword);
  expect(finalLogin.status()).toBe(201);
  expect((await me(request, (await finalLogin.json() as { access_token: string }).access_token)).status()).toBe(200);
});

test('Reissue is rate limited per administrator', async ({ request }) => {
  const userId = second.userId!;
  let limited = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await reissue(request, admin, userId);
    if (response.status() === 429) { limited += 1; break; }
    expect(response.status()).toBe(201);
    remember(`reissue-rl${attempt}:${second.studentCode}`, (await response.json() as { temporaryPassword: string }).temporaryPassword);
  }
  expect(limited).toBe(1);
});
