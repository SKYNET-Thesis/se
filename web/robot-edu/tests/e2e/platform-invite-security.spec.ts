import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { call, createLocalAuthIdentity, loadFixture } from './helpers/academic';

/**
 * Security matrix for the invited -> active transition against the real API, runtime DB role and PostgreSQL.
 * A verified token is necessary but NOT sufficient: only an admin-created account with a matching e-mail claim and an ACTIVE
 * instructor/school-admin membership in an ACTIVE organization is activated. Everything else must stay "invited" and unable to author.
 */
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36);
const authPort = process.env.VISTA_E2E_JWKS_PORT;

async function token(page: Page, sub: string) {
  return ((await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${sub}`)).json()) as { access_token: string }).access_token;
}
interface Case { name: string; signup?: string; membership?: { role: string; status?: string; org: 'active' | 'suspended' | 'none' }; claimEmail?: 'match' | 'other' | 'none'; userStatus?: string }
const CASES: Array<Case & { activates: boolean }> = [
  { name: 'instructor, admin-created, matching e-mail, active membership in an active school', membership: { role: 'instructor', org: 'active' }, claimEmail: 'match', activates: true },
  { name: 'school admin, admin-created, matching e-mail, active membership in an active school', membership: { role: 'school_admin', org: 'active' }, claimEmail: 'match', activates: true },
  { name: 'no membership at all', claimEmail: 'match', activates: false },
  { name: 'membership in a SUSPENDED organization', membership: { role: 'instructor', org: 'suspended' }, claimEmail: 'match', activates: false },
  { name: 'suspended membership', membership: { role: 'instructor', status: 'suspended', org: 'active' }, claimEmail: 'match', activates: false },
  { name: 'self-registered account', signup: 'self_registered', membership: { role: 'instructor', org: 'active' }, claimEmail: 'match', activates: false },
  { name: 'token e-mail differs from the invited address', membership: { role: 'instructor', org: 'active' }, claimEmail: 'other', activates: false },
  { name: 'token without an e-mail claim', membership: { role: 'instructor', org: 'active' }, claimEmail: 'none', activates: false },
  { name: 'student membership (students use their own activation flows)', membership: { role: 'student', org: 'active' }, claimEmail: 'match', activates: false },
];

test.describe.serial('invited -> active cannot be used to escalate privileges', () => {
  let schoolId = ''; let suspendedOrg = '';
  test.beforeAll(async () => {
    const fixture = await loadFixture(); schoolId = fixture.schoolId;
    suspendedOrg = psql(`insert into organizations(name,type,segment,status,school_code) values('Suspended ${run}','institution','education','suspended','SUS-${run}') returning id`).split('\n')[0];
  });

  for (const c of CASES) {
    test(`${c.activates ? 'ACTIVATES' : 'stays invited'}: ${c.name}`, async ({ page }) => {
      test.skip(c.claimEmail === 'none', 'This isolated GoTrue image disables phone login and anonymous sign-in; missing-email rejection is covered by SupabaseAuthGuard unit tests.');
      const sub = randomUUID(); const email = `inv.${randomUUID().slice(0, 8)}@example.test`;
      await createLocalAuthIdentity(page.request, c.claimEmail === 'none'
        ? { id: sub, phone: `+1555${Math.floor(1_000_000 + Math.random() * 9_000_000)}` }
        : { id: sub, email: c.claimEmail === 'other' ? `someone.else.${run}@example.test` : email });
      const userId = psql(`insert into users(auth_user_id,email,full_name,status,signup_method) values('${sub}','${email}','Invited ${run}','invited','${c.signup ?? 'admin_created'}') returning id`).split('\n')[0];
      if (c.membership) {
        const org = c.membership.org === 'suspended' ? suspendedOrg : schoolId;
        psql(`insert into memberships(user_id,organization_id,role_id,status) select '${userId}','${org}',id,'${c.membership.status ?? 'active'}' from roles where code='${c.membership.role}' and scope='organization'`);
      }
      const t = await token(page, sub);
      await call(page, t, 'GET', '/me/memberships');                                       // any authenticated request triggers the check
      expect(psql(`select status from users where id='${userId}'`)).toBe(c.activates ? 'active' : 'invited');
      const create = await call(page, t, 'POST', '/admin/courses', { title: `Invite course ${run} ${userId.slice(0, 4)}` });
      if (c.activates) expect(create.status, JSON.stringify(create.body)).toBe(201);
      else expect(create.status, 'an account that was not activated cannot author').toBe(404);
      // an activated account gains nothing beyond its own membership: no foreign tenant, no system routes, no school-admin routes for an instructor
      expect((await call(page, t, 'GET', '/education-admin/organizations/managed')).status).toBe(404);
      expect((await call(page, t, 'GET', `/education-admin/organizations/${suspendedOrg}/overview`)).status).toBe(404);
      if (c.membership?.role === 'instructor') expect((await call(page, t, 'PATCH', `/education-admin/organizations/${schoolId}/profile`, { name: 'Hijack' })).status).toBe(404);
    });
  }

  test('a disabled account is refused outright and never reactivated by a valid token', async ({ page }) => {
    const sub = randomUUID(); const email = `dis.${randomUUID().slice(0, 8)}@example.test`;
    await createLocalAuthIdentity(page.request, { id: sub, email });
    const userId = psql(`insert into users(auth_user_id,email,full_name,status,signup_method) values('${sub}','${email}','Disabled ${run}','disabled','admin_created') returning id`).split('\n')[0];
    psql(`insert into memberships(user_id,organization_id,role_id,status) select '${userId}','${schoolId}',id,'active' from roles where code='instructor' and scope='organization'`);
    const r = await call(page, await token(page, sub), 'GET', '/me/memberships');
    expect(r.status).toBe(403);
    expect(psql(`select status from users where id='${userId}'`)).toBe('disabled');
  });

  test('suspending the organization after activation removes authoring rights again', async ({ page }) => {
    const sub = randomUUID(); const email = `late.${randomUUID().slice(0, 8)}@example.test`;
    await createLocalAuthIdentity(page.request, { id: sub, email });
    const org = psql(`insert into organizations(name,type,segment,status,school_code) values('Late ${run}','institution','education','active','LAT-${run}') returning id`).split('\n')[0];
    const userId = psql(`insert into users(auth_user_id,email,full_name,status,signup_method) values('${sub}','${email}','Late ${run}','invited','admin_created') returning id`).split('\n')[0];
    psql(`insert into memberships(user_id,organization_id,role_id,status) select '${userId}','${org}',id,'active' from roles where code='instructor' and scope='organization'`);
    const t = await token(page, sub);
    expect((await call(page, t, 'POST', '/admin/courses', { title: `Before ${run}` })).status).toBe(201);
    psql(`update organizations set status='suspended' where id='${org}'`);
    expect((await call(page, t, 'POST', '/admin/courses', { title: `After ${run}` })).status).toBe(404);
  });
});
