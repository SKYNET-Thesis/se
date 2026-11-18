import { createHash, randomUUID } from 'node:crypto';
import { createDb, describeDb, type Db } from '../learning/db-test-support';
import { StudentAuthService } from './student-auth.service';

/**
 * Student first-time activation against a real PostgreSQL schema that carries the Supabase project's auth->public provisioning trigger
 * (public.handle_new_auth_user, reproduced verbatim from Production). Creating an Auth identity therefore inserts a SECOND public.users row
 * for the same Auth id; before the fix this made the activation fail with a unique violation (users_auth_user_id_key) and left a stub row that
 * blocked every retry (ux_users_email_lower). The fake provider below behaves like Supabase Auth: the identity insert fires the trigger.
 */
describeDb('StudentAuthService activation with the auth provisioning trigger (PostgreSQL)', () => {
  const db: Db = createDb();
  const session = { access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'bearer' };
  const alias = (userId: string) => `student-${userId}@students.auth.vista.invalid`;
  const hash = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex');
  const provider = {
    createStudentIdentity: async (email: string) => {
      const id = randomUUID();
      await db.$executeRaw`INSERT INTO auth.users(id, email, email_confirmed_at) VALUES (${id}::uuid, ${email}, now())`; // fires the trigger
      return { id };
    },
    deleteStudentIdentity: async (id: string) => { await db.$executeRaw`DELETE FROM auth.users WHERE id = ${id}::uuid`; },
    setStudentPassword: async () => undefined,
    replaceStudentLoginEmail: async () => undefined,
    authenticateStudent: async () => session,
  };
  const service = new StudentAuthService(db as never, provider as never);

  beforeAll(async () => {
    await db.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS auth');
    await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb)');
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $f$
      DECLARE resolved_full_name TEXT;
      BEGIN
        resolved_full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '');
        INSERT INTO public.users (auth_user_id, email, full_name, status, signup_method, email_verified_at)
        VALUES (NEW.id, NEW.email, COALESCE(resolved_full_name, 'VISTA User'), 'active', 'self_registered', NEW.email_confirmed_at)
        ON CONFLICT (auth_user_id) DO NOTHING;
        RETURN NEW;
      END; $f$`);
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS vista_it_auth_user_created ON auth.users');
    await db.$executeRawUnsafe('CREATE TRIGGER vista_it_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user()');
  });
  afterAll(async () => {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS vista_it_auth_user_created ON auth.users');
    await db.$disconnect();
  });

  async function pendingStudent() {
    const suffix = randomUUID().slice(0, 8);
    const org = await db.organizations.create({ data: { name: `act ${suffix}`, type: 'institution', segment: 'education', school_code: `ACT${suffix}`.toUpperCase() } });
    const role = await db.roles.upsert({ where: { code: 'student' }, update: {}, create: { code: 'student', name: 'Student', scope: 'organization' } });
    const user = await db.users.create({ data: { full_name: 'Pending Student', status: 'invited', signup_method: 'admin_created' } });
    await db.memberships.create({ data: { user_id: user.id, organization_id: org.id, role_id: role.id, status: 'active' } });
    const studentCode = `S-${suffix}`.toUpperCase();
    await db.$executeRaw`INSERT INTO public.education_school_user_profiles(organization_id,user_id,person_type,student_code,grade_level,account_state) VALUES (${org.id}::uuid,${user.id}::uuid,'student',${studentCode},'7','account_setup_pending')`;
    const setupCode = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 8);
    await db.$executeRaw`INSERT INTO public.auth_tokens(user_id,purpose,token_hash,expires_at) VALUES (${user.id}::uuid,'student_setup',${hash(setupCode)},now() + interval '7 days')`;
    return { org, user, schoolCode: org.school_code as string, studentCode, setupCode };
  }
  const activate = (s: Awaited<ReturnType<typeof pendingStudent>>, password = 'a-personal-password-1') =>
    service.setup({ schoolCode: s.schoolCode, studentCode: s.studentCode, setupCode: s.setupCode, password });

  it('activates a pending student: the existing row is linked to the new Auth identity and no duplicate stub row remains', async () => {
    const s = await pendingStudent();
    await expect(activate(s)).resolves.toEqual(session);

    const row = await db.users.findUniqueOrThrow({ where: { id: s.user.id } });
    expect(row.status).toBe('active');
    expect(row.auth_user_id).not.toBeNull();
    expect(await db.users.count({ where: { auth_user_id: row.auth_user_id } })).toBe(1);
    expect(await db.users.count({ where: { email: alias(s.user.id) } })).toBe(0);
    const profile = await db.$queryRaw<{ account_state: string }[]>`SELECT account_state FROM public.education_school_user_profiles WHERE user_id = ${s.user.id}::uuid`;
    expect(profile[0].account_state).toBe('active');
    const token = await db.$queryRaw<{ used_at: Date | null }[]>`SELECT used_at FROM public.auth_tokens WHERE user_id = ${s.user.id}::uuid AND purpose = 'student_setup'`;
    expect(token[0].used_at).not.toBeNull();
  });

  it('the setup code cannot be used a second time', async () => {
    const s = await pendingStudent();
    await activate(s);
    await expect(activate(s)).rejects.toThrow();
  });

  it('recovers from a stub row left behind by an earlier failed activation (it no longer blocks the retry)', async () => {
    const s = await pendingStudent();
    await db.users.create({ data: { auth_user_id: randomUUID(), email: alias(s.user.id), full_name: 'VISTA User', status: 'active', signup_method: 'self_registered' } }); // orphan stub, dead Auth id
    await expect(activate(s)).resolves.toEqual(session);
    expect(await db.users.count({ where: { email: alias(s.user.id) } })).toBe(0);
    expect((await db.users.findUniqueOrThrow({ where: { id: s.user.id } })).status).toBe('active');
  });

  it('never removes a user that is not a stub: other users and a stub that already has a membership are left alone', async () => {
    const s = await pendingStudent();
    const bystander = await db.users.create({ data: { full_name: 'Bystander', email: `bystander-${s.user.id}@example.test`, status: 'active', signup_method: 'self_registered' } });
    const before = await db.users.count();
    await activate(s);
    expect(await db.users.findUnique({ where: { id: bystander.id } })).not.toBeNull();
    expect(await db.users.count()).toBe(before);   // the trigger-created stub was removed again, nothing else changed

    const s2 = await pendingStudent();
    const role = await db.roles.findUniqueOrThrow({ where: { code: 'student' } });
    const claimed = await db.users.create({ data: { auth_user_id: randomUUID(), email: alias(s2.user.id), full_name: 'Real Member', status: 'active', signup_method: 'self_registered' } });
    await db.memberships.create({ data: { user_id: claimed.id, organization_id: s2.org.id, role_id: role.id, status: 'active' } });
    await expect(activate(s2)).rejects.toThrow();                                  // fails closed, does not delete a user that has a membership
    expect(await db.users.findUnique({ where: { id: claimed.id } })).not.toBeNull();
  });
});
