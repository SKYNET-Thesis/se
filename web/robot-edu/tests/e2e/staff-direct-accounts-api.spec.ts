import { expect, test, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Direct staff account creation + mandatory first-login password change against REAL GoTrue and the real API (harness:
 * scripts/local_student_auth_harness.sh, API restarted with STAFF_TEMP_PASSWORD_ENABLED=true, staged migration U applied).
 * Covers ACCT-01..10, 11, 13 (instructor), 18, 19, 20, 24, 25, 26, 27, 28, 29 (invite path), 30.
 * Env: SA_API, SA_AUTH, SA_ANON_KEY_FILE, SA_SERVICE_KEY_FILE, VISTA_E2E_ADMIN_DATABASE_URL, optional SA_API_LOG.
 */
const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const API = env('SA_API'); const AUTH = env('SA_AUTH');
for (const url of [API, AUTH]) if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Refusing to run against a non-loopback endpoint.');
const anonKey = (JSON.parse(readFileSync(env('SA_ANON_KEY_FILE'), 'utf8')) as { anon: string }).anon;
const serviceKey = readFileSync(env('SA_SERVICE_KEY_FILE'), 'utf8').trim();
const DB = env('VISTA_E2E_ADMIN_DATABASE_URL');
const ORG = 'f2430000-0000-4000-8000-000000000200'; const OTHER_ORG = 'f2430000-0000-4000-8000-000000000201';
const psql = (sql: string) => execFileSync('psql', [DB, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36); let ip = 120; const fwd = () => ({ 'X-Forwarded-For': `10.50.0.${(ip = (ip % 240) + 1)}` });
const seenPasswords: string[] = [];

const login = async (request: APIRequestContext, email: string, password: string) => {
  const r = await request.post(`${AUTH}/token?grant_type=password`, { headers: { apikey: anonKey, ...fwd() }, data: { email, password } });
  return { status: r.status(), token: ((await r.json().catch(() => ({}))) as { access_token?: string }).access_token };
};
const api = async (request: APIRequestContext, method: 'GET' | 'POST' | 'PATCH', path: string, token: string | null, data?: unknown) => {
  const r = await request.fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...fwd() }, ...(data === undefined ? {} : { data }) });
  const text = await r.text(); let body: Record<string, unknown> = {}; try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status(), body, text, headers: r.headers() };
};
const FIX = { admin: ['phase243-admin@vista.test', 'LocalFixturePass-admin!'], schoolAdmin: ['phase243-school-admin@vista.test', 'LocalFixturePass-schoolAdmin!'], instructor: ['phase243-instructor@vista.test', 'LocalFixturePass-instructor!'], other: ['phase243-other-school-admin@vista.test', 'LocalFixturePass-otherSchoolAdmin!'] };
const fixtureToken = async (request: APIRequestContext, who: keyof typeof FIX) => { const r = await login(request, FIX[who][0], FIX[who][1]); expect(r.status, who).toBe(200); return r.token!; };
test.describe.configure({ mode: 'serial' });

let adminToken = ""; const newAdmin = { userId: '', email: '', temp: '', permanent: `Perm-${run}-Aa9!xYz`, token: '' };
const newInstr = { userId: '', email: '', temp: '', permanent: `Inst-${run}-Bb7!qWe`, token: '' };

test('capabilities report the server-side gate; ACCT-24 direct creation needs no SMTP', async ({ request }) => {
  const caps = await api(request, 'GET', '/auth/staff/capabilities', null);
  expect(caps.status).toBe(200); expect(caps.body.staffDirectAccountsEnabled).toBe(true);
  adminToken = await fixtureToken(request, 'admin');
});

test('ACCT-01/02: System Admin directly creates a School Admin; credentials are returned once and are strong', async ({ request }) => {
  newAdmin.email = `acct.sa.${run}@vista.test`;
  const r = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, adminToken, { method: 'direct', role: 'school_admin', fullName: 'Acct School Admin', email: newAdmin.email });
  expect(r.status).toBe(201);
  expect(r.headers['cache-control']).toContain('no-store');
  expect(r.body).toMatchObject({ role: 'school_admin', organizationId: ORG, accountState: 'password_change_required' });
  newAdmin.temp = r.body.temporaryPassword as string; newAdmin.userId = r.body.userId as string; seenPasswords.push(newAdmin.temp);
  expect(newAdmin.temp).toMatch(/^[A-Za-z0-9_-]{32}$/);
  // one-time disclosure: no listing ever returns it
  const list = await api(request, 'GET', `/education-admin/organizations/${ORG}/detail`, adminToken);
  expect(list.text).not.toContain(newAdmin.temp);
  // no plaintext persisted
  expect(psql(`select count(*) from public.users where password_change_required and email='${newAdmin.email}'`)).toBe('1');
  expect(psql(`select count(*) from public.audit_logs where action='account.created' and target_id='${newAdmin.userId}'`)).toBe('1');
  expect(psql(`select count(*) from public.audit_logs where details::text like '%${newAdmin.temp}%'`)).toBe('0');
});

test('ACCT-03..07: temporary login works but every protected route is refused (API, URL-equivalent, refresh, new session)', async ({ request }) => {
  const first = await login(request, newAdmin.email, newAdmin.temp);
  expect(first.status).toBe(200); // ACCT-03
  for (const path of ['/me/roles', `/education-admin/organizations/${ORG}/members`, '/me/learning', '/me/attempts', `/education-admin/organizations/${ORG}/classrooms`]) {
    const r = await api(request, 'GET', path, first.token!);
    expect(r.status, path).toBe(403); expect(r.body.code, path).toBe('PASSWORD_CHANGE_REQUIRED'); // ACCT-05/06/07
  }
  const create = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, first.token!, { method: 'direct', role: 'instructor', fullName: 'X', email: `x.${run}@vista.test`, employeeCode: `X-${run}` });
  expect(create.status).toBe(403); // cannot provision while restricted
  const again = await login(request, newAdmin.email, newAdmin.temp); // "browser restart": a brand new session
  expect((await api(request, 'GET', '/me/roles', again.token!)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
});

test('ACCT-04/08/09/10/27: mandatory change is server-verified; temporary password dies; role and school survive', async ({ request }) => {
  const t = (await login(request, newAdmin.email, newAdmin.temp)).token!;
  expect((await api(request, 'PATCH', '/auth/staff/password', t, { currentPassword: 'wrong-wrong-wrong', newPassword: newAdmin.permanent })).status).toBe(401);
  expect((await api(request, 'PATCH', '/auth/staff/password', t, { currentPassword: newAdmin.temp, newPassword: newAdmin.temp })).status).toBe(401); // cannot keep the temporary password
  expect((await api(request, 'PATCH', '/auth/staff/password', t, { currentPassword: newAdmin.temp, newPassword: 'short' })).status).toBe(400);
  const changed = await api(request, 'PATCH', '/auth/staff/password', t, { currentPassword: newAdmin.temp, newPassword: newAdmin.permanent });
  expect(changed.status).toBe(200); newAdmin.token = changed.body.access_token as string; expect(newAdmin.token).toBeTruthy();
  expect((await login(request, newAdmin.email, newAdmin.temp)).status).toBeGreaterThanOrEqual(400); // ACCT-09
  const perm = await login(request, newAdmin.email, newAdmin.permanent); expect(perm.status).toBe(200); // ACCT-10
  newAdmin.token = perm.token!;
  expect((await api(request, 'GET', '/me/roles', newAdmin.token)).status).toBe(200);
  expect((await api(request, 'GET', '/me/roles', t)).status).toBe(401); // the pre-change session is stale (SESSION_ROTATED)
  expect(psql(`select count(*) from public.users where id='${newAdmin.userId}' and not password_change_required and temporary_password_expires_at is null and password_changed_at is not null`)).toBe('1');
  expect(psql(`select r.code||':'||m.organization_id||':'||m.status from public.memberships m join public.roles r on r.id=m.role_id where m.user_id='${newAdmin.userId}'`)).toBe(`school_admin:${ORG}:active`);
  const members = await api(request, 'GET', `/education-admin/organizations/${ORG}/members`, newAdmin.token);
  expect(members.status).toBe(200); // ACCT-30 reads active now
  expect((members.body as unknown as Array<{ email: string; account_state: string }>).find((m) => m.email === newAdmin.email)?.account_state).toBe('active');
  expect(psql(`select count(*) from public.audit_logs where action='account.first_login_password_changed' and target_id='${newAdmin.userId}'`)).toBe('1');
});

test('ACCT-11/13: the new School Admin directly creates an Instructor who must change the password first', async ({ request }) => {
  newInstr.email = `acct.in.${run}@vista.test`;
  const r = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, newAdmin.token, { method: 'direct', role: 'instructor', fullName: 'Acct Instructor', email: newInstr.email, employeeCode: `E-${run}` });
  expect(r.status).toBe(201); newInstr.temp = r.body.temporaryPassword as string; newInstr.userId = r.body.userId as string; seenPasswords.push(newInstr.temp);
  expect(psql(`select count(*) from public.education_school_user_profiles where user_id='${newInstr.userId}' and person_type='teacher' and organization_id='${ORG}'`)).toBe('1');
  const t = (await login(request, newInstr.email, newInstr.temp)).token!;
  expect((await api(request, 'GET', '/me/roles', t)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  const members = await api(request, 'GET', `/education-admin/organizations/${ORG}/members`, newAdmin.token);
  expect((members.body as unknown as Array<{ email: string; account_state: string }>).find((m) => m.email === newInstr.email)?.account_state).toBe('password_change_required'); // ACCT-30: not falsely Active
  const changed = await api(request, 'PATCH', '/auth/staff/password', t, { currentPassword: newInstr.temp, newPassword: newInstr.permanent });
  expect(changed.status).toBe(200);
  const perm = await login(request, newInstr.email, newInstr.permanent); expect(perm.status).toBe(200); newInstr.token = perm.token!;
  expect((await api(request, 'GET', '/me/roles', newInstr.token)).status).toBe(200);
});

test('ACCT-19/25/26: duplicates, cross-school and escalation are refused without side effects', async ({ request }) => {
  const before = psql(`select count(*) from public.users where lower(email)='${newInstr.email}'`);
  const dup = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, newAdmin.token, { method: 'direct', role: 'instructor', fullName: 'Dup', email: newInstr.email.toUpperCase(), employeeCode: `D-${run}` });
  expect(dup.status).toBe(409); expect(psql(`select count(*) from public.users where lower(email)='${newInstr.email}'`)).toBe(before);
  const otherAdmin = await fixtureToken(request, 'other');
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, otherAdmin, { method: 'direct', role: 'instructor', fullName: 'Cross', email: `cross.${run}@vista.test`, employeeCode: `C-${run}` })).status).toBe(404);
  expect((await api(request, 'POST', `/education-admin/organizations/${OTHER_ORG}/accounts`, newAdmin.token, { method: 'direct', role: 'instructor', fullName: 'Cross2', email: `cross2.${run}@vista.test`, employeeCode: `C2-${run}` })).status).toBe(404);
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, newAdmin.token, { method: 'direct', role: 'school_admin', fullName: 'Esc', email: `esc.${run}@vista.test` })).status).toBe(404);
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, newAdmin.token, { method: 'direct', role: 'system_admin', fullName: 'Esc', email: `esc2.${run}@vista.test` })).status).toBe(400);
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, newInstr.token, { method: 'direct', role: 'instructor', fullName: 'Esc', email: `esc3.${run}@vista.test`, employeeCode: `E3-${run}` })).status).toBe(404);
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, null, { method: 'direct', role: 'instructor', fullName: 'U', email: `u.${run}@vista.test`, employeeCode: `U-${run}` })).status).toBe(401);
  expect(psql(`select count(*) from public.users where email like '%.${run}@vista.test' and email not in ('${newAdmin.email}','${newInstr.email}')`)).toBe('0');
});

test('ACCT-20: expired temporary credentials are rejected; an authorized reset re-issues them and revokes sessions', async ({ request }) => {
  const email = `acct.exp.${run}@vista.test`;
  const made = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, newAdmin.token, { method: 'direct', role: 'instructor', fullName: 'Expiring', email, employeeCode: `X-${run}` });
  expect(made.status).toBe(201); const id = made.body.userId as string; seenPasswords.push(made.body.temporaryPassword as string);
  const oldSession = (await login(request, email, made.body.temporaryPassword as string)).token!;
  psql(`update public.users set temporary_password_expires_at = now() - interval '1 minute' where id='${id}'`);
  const expired = await api(request, 'GET', '/me/roles', oldSession); expect(expired.status).toBe(403); expect(expired.body.code).toBe('TEMPORARY_PASSWORD_EXPIRED');
  expect((await api(request, 'PATCH', '/auth/staff/password', oldSession, { currentPassword: made.body.temporaryPassword, newPassword: 'Another-Long-Pass-9!' })).status).toBe(403);
  const reset = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts/${id}/reset-credentials`, newAdmin.token);
  expect(reset.status).toBe(201); seenPasswords.push(reset.body.temporaryPassword as string);
  expect((await login(request, email, made.body.temporaryPassword as string)).status).toBeGreaterThanOrEqual(400); // old temp dead
  expect((await api(request, 'GET', '/me/roles', oldSession)).status).toBe(401); // session revoked (rotated)
  const fresh = await login(request, email, reset.body.temporaryPassword as string); expect(fresh.status).toBe(200);
  expect((await api(request, 'GET', '/me/roles', fresh.token!)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  expect(psql(`select count(*) from public.audit_logs where action='account.credentials_reset' and target_id='${id}'`)).toBe('1');
  // an account with a permanent password can never be reset this way
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts/${newInstr.userId}/reset-credentials`, newAdmin.token)).status).toBe(409);
});

test('ACCT-18: a pending account (Auth user without a password) is recovered in place; active accounts are never overwritten', async ({ request }) => {
  const email = `acct.pending.${run}@vista.test`;
  // Auth user created the way a failed invitation leaves it: confirmed e-mail, NO usable password
  const created = await request.post(`${AUTH}/admin/users`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, data: { email, email_confirm: false } });
  expect(created.status()).toBeLessThan(300); const authId = ((await created.json()) as { id: string }).id;
  const uid = psql(`insert into public.users(auth_user_id,email,full_name,status,signup_method) values('${authId}','${email}','Pending Person','invited','admin_created') returning id`).split('\n')[0];
  psql(`insert into public.memberships(user_id,organization_id,role_id,status) select '${uid}','${ORG}',id,'active' from public.roles where code='instructor'`);
  psql(`insert into public.education_school_user_profiles(organization_id,user_id,person_type,employee_code,account_state) values('${ORG}','${uid}','teacher','P-${run}','invited')`);
  expect((await login(request, email, 'No-Password-Exists-1!')).status).toBeGreaterThanOrEqual(400);
  const rec = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts/${uid}/recover-pending`, newAdmin.token);
  expect(rec.status).toBe(201); seenPasswords.push(rec.body.temporaryPassword as string);
  expect(psql(`select auth_user_id from public.users where id='${uid}'`)).toBe(authId); // same Auth user id, nothing deleted
  expect(psql(`select count(*) from public.memberships where user_id='${uid}'`)).toBe('1');
  const t = await login(request, email, rec.body.temporaryPassword as string); expect(t.status).toBe(200);
  expect((await api(request, 'GET', '/me/roles', t.token!)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  // the person has now signed in: a second recovery must refuse
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts/${uid}/recover-pending`, newAdmin.token)).status).toBe(409);
  // an active fixture instructor is never overwritten
  const fixtureInstructor = psql(`select id from public.users where email='phase243-instructor@vista.test'`);
  expect((await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts/${fixtureInstructor}/recover-pending`, newAdmin.token)).status).toBe(409);
  expect((await login(request, FIX.instructor[0], FIX.instructor[1])).status).toBe(200);
});

test('ACCT-14/16/29/30: the invitation path is independent of direct creation and leaves no half-created account when delivery fails', async ({ request }) => {
  const email = `acct.invite.${run}@vista.test`;
  const r = await api(request, 'POST', `/education-admin/organizations/${ORG}/accounts`, adminToken, { method: 'invite', role: 'school_admin', fullName: 'Invited Admin', email } as never);
  if (r.status === 201) {
    expect(r.body.accountState).toBe('invited'); expect(r.body.temporaryPassword).toBeUndefined();
    expect(psql(`select status||':'||password_change_required from public.users where email='${email}'`)).toBe('invited:false'); // not falsely Active
  } else {
    expect(r.status).toBe(400);
    expect(psql(`select count(*) from public.users where email='${email}'`)).toBe('0'); // no application rows when the invitation fails
  }
});

test('ACCT-28: no temporary or permanent password appears in audit data, responses of other routes or the API log', async ({ request }) => {
  for (const pw of [...seenPasswords, newAdmin.permanent, newInstr.permanent]) {
    expect(psql(`select count(*) from public.audit_logs where details::text like '%${pw}%'`)).toBe('0');
    expect(psql(`select count(*) from public.users where full_name like '%${pw}%' or email like '%${pw}%'`)).toBe('0');
  }
  const list = await api(request, 'GET', `/education-admin/organizations/${ORG}/members`, newAdmin.token);
  for (const pw of seenPasswords) expect(list.text).not.toContain(pw);
  const log = process.env.SA_API_LOG;
  if (log && existsSync(log)) { const text = readFileSync(log, 'utf8'); for (const pw of [...seenPasswords, newAdmin.permanent, newInstr.permanent]) expect(text).not.toContain(pw); }
});
