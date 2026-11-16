import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { matchesDisposableDatabaseTarget } from './isolated-db-target';

const enabled = process.env.RUN_RUNTIME_ROLE_SECURITY === '1';
const configuredUrl = process.env.VISTA_RUNTIME_SECURITY_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const localAuthOnly = !supabaseUrl || (() => {
  try { const value = new URL(supabaseUrl); return value.protocol === 'http:' && value.hostname === '127.0.0.1' && value.port === '54321' && value.pathname === '/'; }
  catch { return false; }
})();
const isolatedIdentity = matchesDisposableDatabaseTarget(configuredUrl, 'vista_app_runtime') && localAuthOnly;
if (enabled && !isolatedIdentity) {
  throw new Error('Runtime-role security tests require vista_app_runtime on the isolated loopback Course Builder database.');
}

const describeRuntime = enabled && isolatedIdentity ? describe : describe.skip;
const fixtureCourseId = process.env.VISTA_RUNTIME_FIXTURE_COURSE_ID;
const fixtureUserId = process.env.VISTA_RUNTIME_FIXTURE_USER_ID;

describeRuntime('Education API PostgreSQL runtime role security', () => {
  const db = new PrismaClient({ datasources: { db: { url: configuredUrl ?? 'postgresql://disabled:disabled@127.0.0.1:1/disabled' } } });

  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => { await db.$disconnect(); });

  it('connects as a login role without superuser, bypass-RLS, database, role, or inherited privileges', async () => {
    const rows = await db.$queryRaw<Array<{
      current_user: string; rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean;
      rolcreaterole: boolean; rolinherit: boolean; rolcanlogin: boolean;
    }>>`
      SELECT current_user, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolinherit, r.rolcanlogin
      FROM pg_roles r WHERE r.rolname=current_user`;
    expect(rows).toEqual([expect.objectContaining({
      current_user: 'vista_app_runtime', rolsuper: false, rolbypassrls: false,
      rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolcanlogin: true,
    })]);
    const memberships = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)`;
    expect(memberships[0].count).toBe(0n);
    const databasePrivileges = await db.$queryRaw<Array<{ can_connect: boolean; can_create: boolean; can_create_temp: boolean }>>`
      SELECT has_database_privilege(current_user,current_database(),'CONNECT') AS can_connect,
        has_database_privilege(current_user,current_database(),'CREATE') AS can_create,
        has_database_privilege(current_user,current_database(),'TEMP') AS can_create_temp`;
    expect(databasePrivileges[0]).toEqual({ can_connect: true, can_create: false, can_create_temp: false });
    const ownership = await db.$queryRaw<Array<{ database_owner: boolean; owns_objects: boolean }>>`
      SELECT current_user=(SELECT r.rolname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database()) AS database_owner,
        EXISTS (SELECT 1 FROM pg_shdepend sd WHERE sd.refclassid='pg_authid'::regclass
          AND sd.refobjid=(SELECT oid FROM pg_roles WHERE rolname=current_user)
          AND sd.deptype='o' AND sd.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())) AS owns_objects`;
    expect(ownership[0]).toEqual({ database_owner: false, owns_objects: false });
  });

  it('has no API-key or migration-ledger access and does not own the media table', async () => {
    const privileges = await db.$queryRaw<Array<{ media: boolean; api_keys: boolean; owns_media: boolean; rls_enabled: boolean; rls_active: boolean }>>`
      SELECT has_table_privilege(current_user,'public.learning_media_assets','SELECT,INSERT,UPDATE,DELETE') AS media,
        has_table_privilege(current_user,'public.api_keys','SELECT') AS api_keys,
        c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owns_media,
        c.relrowsecurity AS rls_enabled,
        row_security_active('public.learning_media_assets'::regclass) AS rls_active
      FROM pg_class c WHERE c.oid='public.learning_media_assets'::regclass`;
    // Media's RLS policy authorizes the shared backend identity only. This
    // proves RLS is active for the role, not that it filters tenants or users.
    expect(privileges[0]).toEqual({ media: true, api_keys: false, owns_media: false, rls_enabled: true, rls_active: true });
  });

  it('reads identity and authorization catalogs without being able to change role definitions', async () => {
    const rows = await db.$queryRaw<Array<{ role_read: boolean; role_write: boolean; permission_write: boolean; role_map_write: boolean; audit_read: boolean; audit_insert: boolean; auth_token_read: boolean; auth_token_insert: boolean; auth_token_update: boolean; auth_token_delete: boolean; non_public_schema_access: boolean; public_schema_create: boolean }>>`
      SELECT has_table_privilege(current_user,'public.roles','SELECT') AS role_read,
        (has_table_privilege(current_user,'public.roles','INSERT') OR has_table_privilege(current_user,'public.roles','UPDATE') OR has_table_privilege(current_user,'public.roles','DELETE')) AS role_write,
        (has_table_privilege(current_user,'public.permissions','INSERT') OR has_table_privilege(current_user,'public.permissions','UPDATE') OR has_table_privilege(current_user,'public.permissions','DELETE')) AS permission_write,
        (has_table_privilege(current_user,'public.role_permissions','INSERT') OR has_table_privilege(current_user,'public.role_permissions','UPDATE') OR has_table_privilege(current_user,'public.role_permissions','DELETE')) AS role_map_write,
        has_table_privilege(current_user,'public.audit_logs','SELECT') AS audit_read,
        has_table_privilege(current_user,'public.audit_logs','INSERT') AS audit_insert,
        has_table_privilege(current_user,'public.auth_tokens','SELECT') AS auth_token_read,
        has_table_privilege(current_user,'public.auth_tokens','INSERT') AS auth_token_insert,
        has_table_privilege(current_user,'public.auth_tokens','UPDATE') AS auth_token_update,
        has_table_privilege(current_user,'public.auth_tokens','DELETE') AS auth_token_delete,
        (SELECT COALESCE(bool_or(has_schema_privilege(current_user,n.nspname,'USAGE')),false) FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema','public')) AS non_public_schema_access,
        has_schema_privilege(current_user,'public','CREATE') AS public_schema_create`;
    expect(rows[0]).toEqual({ role_read: true, role_write: false, permission_write: false, role_map_write: false, audit_read: false, audit_insert: true, auth_token_read: true, auth_token_insert: true, auth_token_update: true, auth_token_delete: false, non_public_schema_access: false, public_schema_create: false });
  });

  it('can perform authorized media table DML and roll its probe back', async () => {
    if (!fixtureCourseId || !fixtureUserId) throw new Error('Runtime security fixture course/user IDs are required.');
    // This checks PostgreSQL object permissions only. The permissive policy for
    // the trusted backend identity is not tenant isolation; LearningScopeService
    // and module service checks enforce classroom/course access separately.
    const objectKey = `learning-media/courses/${fixtureCourseId}/documents/${randomUUID()}.pdf`;
    const id = randomUUID();
    await expect(db.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO public.learning_media_assets
        (id,course_id,object_key,original_filename,mime_type,size_bytes,status,created_by)
        VALUES (${id}::uuid,${fixtureCourseId}::uuid,${objectKey},'runtime-security.pdf','application/pdf',32,'pending',${fixtureUserId}::uuid)`;
      const updated = await tx.$queryRaw<Array<{ status: string }>>`UPDATE public.learning_media_assets
        SET status='failed' WHERE id=${id}::uuid RETURNING status`;
      expect(updated[0].status).toBe('failed');
      throw new Error('ROLLBACK_RUNTIME_ROLE_PROBE');
    })).rejects.toThrow('ROLLBACK_RUNTIME_ROLE_PROBE');
    const count = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM public.learning_media_assets WHERE object_key=${objectKey}`;
    expect(count[0].count).toBe(0n);
  });

  it('cannot read migration ledgers or API key material', async () => {
    await expect(db.$queryRawUnsafe('SELECT version FROM public.vista_schema_migrations LIMIT 0')).rejects.toThrow(/permission denied/i);
    await expect(db.$queryRawUnsafe('SELECT id FROM public._prisma_migrations LIMIT 0')).rejects.toThrow(/permission denied/i);
    await expect(db.$queryRawUnsafe('SELECT id FROM public.api_keys LIMIT 0')).rejects.toThrow(/permission denied/i);
  });

  it('does not inherit TEMP (or CREATE) from PUBLIC and cannot create temporary objects in practice', async () => {
    const acl = await db.$queryRaw<Array<{ public_temp: boolean; public_create: boolean }>>`
      SELECT has_database_privilege('public',current_database(),'TEMP') AS public_temp,
             has_database_privilege('public',current_database(),'CREATE') AS public_create`;
    expect(acl[0]).toEqual({ public_temp: false, public_create: false });
    await expect(db.$executeRawUnsafe('CREATE TEMP TABLE runtime_temp_probe(x int)')).rejects.toThrow(/permission denied to create temporary tables/);
    await expect(db.$executeRawUnsafe('CREATE SCHEMA runtime_schema_probe')).rejects.toThrow(/permission denied/);
  });

  it('keeps the table privilege matrix: writable runtime tables, SELECT-only catalogs, and nothing else', async () => {
    const privilege = async (table: string, kind: string) => (await db.$queryRawUnsafe<Array<{ ok: boolean }>>(`SELECT has_table_privilege(current_user,'public.${table}','${kind}') AS ok`))[0].ok;
    for (const table of ['learning_submission_files', 'learning_submissions', 'learning_assignment_attempts', 'learning_courses', 'learning_questions', 'learning_enrollments']) {
      for (const kind of ['SELECT', 'INSERT', 'UPDATE']) expect(await privilege(table, kind)).toBe(true);
    }
    for (const table of ['permissions', 'roles', 'role_permissions']) {
      expect(await privilege(table, 'SELECT')).toBe(true);
      for (const kind of ['INSERT', 'UPDATE', 'DELETE']) expect(await privilege(table, kind)).toBe(false);
    }
    for (const table of ['vista_schema_migrations', 'api_keys']) expect(await privilege(table, 'SELECT')).toBe(false);
    // Every public table the runtime role can touch is covered by an allowlisted RLS policy named for this role (no privilege without a policy).
    const unprotected = await db.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
        AND has_table_privilege(current_user,c.oid,'SELECT')
        AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname AND 'vista_app_runtime'=ANY(p.roles))`;
    expect(unprotected).toEqual([]);
  });

  it('cannot create public schema objects or assume the database owner role', async () => {
    const probeTable = `public.vista_runtime_probe_${randomUUID().replace(/-/g, '')}`;
    await expect(db.$executeRawUnsafe(`CREATE TABLE ${probeTable}(id integer)`)).rejects.toThrow(/permission denied/i);
    await expect(db.$executeRawUnsafe('SET ROLE postgres')).rejects.toThrow(/permission denied|cannot set role/i);
  });
});
