# Production backup reader role: reviewed SQL (executed 2026-11-13)

Role `vista_backup_reader` on the Supabase project `ovijutkvaaxohauvuxbj`. **Already created and verified on 2026-11-13**; this page keeps the exact reviewed scripts for audit, rotation and recovery. Design, connection string and hosted verification: [production-db-logical-backup.md](production-db-logical-backup.md#reader-role). This page grants nothing and must not be re-run: the create script refuses if the role exists.

(`*.sql` files are git-ignored in this repository, which is why the scripts live in this document. To use one, copy the block into a local file; never put the password in the file.)

## Create (as `postgres`, once, password via psql variable)

```
psql "<owner connection, session pooler 5432>" -X -v ON_ERROR_STOP=1 -f vars.psql -f create_vista_backup_reader.sql
# vars.psql (mode 0600, deleted afterwards) contains one line:  \set reader_password '<random password>'
```

```sql
-- VISTA: create the read-only logical-backup role on the Supabase project ovijutkvaaxohauvuxbj.   NOT EXECUTED WITHOUT APPROVAL.
--
-- Run ONCE, as `postgres` (session pooler 5432 or direct), with the password passed as a psql variable so it never appears in this file,
-- in shell history of the SQL, or in the server log text of a literal:
--     psql "<owner connection URL>" -X -v ON_ERROR_STOP=1 -v reader_password="$READER_PASSWORD" -f create_vista_backup_reader.sql
-- One transaction: any failed guard or verification rolls everything back.
\set ON_ERROR_STOP on
\if :{?reader_password}
\else
  \echo 'reader_password is not set (use: -v reader_password=...)'
  \quit
\endif
BEGIN;

DO $guard$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'run as postgres'; END IF;
  IF current_database() <> 'postgres' THEN RAISE EXCEPTION 'unexpected database'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vista_backup_reader') THEN RAISE EXCEPTION 'role vista_backup_reader already exists; refusing to modify it'; END IF;
  -- the model assumes nothing is granted to PUBLIC on public tables/sequences or schema CREATE (checked read-only before approval; re-checked here)
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault((CASE c.relkind WHEN 'S' THEN 'S' ELSE 'r' END)::"char", c.relowner))) a
             WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S') AND a.grantee = 0 AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')) THEN
    RAISE EXCEPTION 'PUBLIC has write privileges on public tables; the reader would inherit them';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'CREATE') THEN
    RAISE EXCEPTION 'PUBLIC can CREATE in schema public; the reader would inherit it';
  END IF;
END
$guard$;

-- 1. the role: login, bypasses RLS (RLS stays enabled on every table), nothing else
CREATE ROLE vista_backup_reader LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 5 PASSWORD :'reader_password';
ALTER ROLE vista_backup_reader SET default_transaction_read_only = on;       -- only a default; the tooling also wraps its reads in BEGIN READ ONLY
ALTER ROLE vista_backup_reader SET statement_timeout = '10min';              -- the pooler/owner default is 2 min; room for a growing COPY
ALTER ROLE vista_backup_reader SET idle_in_transaction_session_timeout = '10min';

-- 2. existing objects: schema public only (never auth/storage/vault/realtime)
GRANT USAGE ON SCHEMA public TO vista_backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vista_backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO vista_backup_reader;

-- 3. future objects created by postgres (the migration runner and the dashboard SQL editor run as postgres), otherwise the next backup fails closed
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO vista_backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO vista_backup_reader;

-- 4. verification inside the transaction: anything unexpected raises and rolls the whole thing back
DO $verify$
DECLARE r pg_roles%ROWTYPE; bad text;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'vista_backup_reader';
  IF NOT (r.rolcanlogin AND r.rolbypassrls AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND r.rolconnlimit = 5) THEN RAISE EXCEPTION 'role attributes differ from the plan'; END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) THEN RAISE EXCEPTION 'the reader is a member of another role'; END IF;
  IF NOT has_schema_privilege('vista_backup_reader', 'public', 'USAGE') OR has_schema_privilege('vista_backup_reader', 'public', 'CREATE') THEN RAISE EXCEPTION 'schema privileges differ from the plan'; END IF;
  SELECT string_agg(c.relname, ', ') INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND ((c.relkind IN ('r','p') AND NOT has_table_privilege('vista_backup_reader', c.oid, 'SELECT')) OR (c.relkind = 'S' AND NOT has_sequence_privilege('vista_backup_reader', c.oid, 'SELECT')));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'reader cannot read: %', bad; END IF;
  SELECT string_agg(c.relname, ', ') INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND (has_table_privilege('vista_backup_reader', c.oid, 'INSERT') OR has_table_privilege('vista_backup_reader', c.oid, 'UPDATE')
         OR has_table_privilege('vista_backup_reader', c.oid, 'DELETE') OR has_table_privilege('vista_backup_reader', c.oid, 'TRUNCATE'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'reader can write: %', bad; END IF;
  IF (SELECT count(*) FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       WHERE n.nspname = 'public' AND d.defaclrole = 'postgres'::regrole AND a.grantee = r.oid AND a.privilege_type = 'SELECT') <> 2 THEN RAISE EXCEPTION 'default privileges differ from the plan'; END IF;
END
$verify$;

COMMIT;
\echo 'vista_backup_reader created and verified'
```

## Recovery: remove the role (as `postgres`)

`DROP OWNED BY` is not usable here: `postgres` holds only `ADMIN`, not `INHERIT`, on a role it created. Tested on a disposable container of Supabase's PostgreSQL 17.11 image (role, grants, default privileges and role settings all removed; the create script then runs again).

```sql
-- VISTA: remove the backup reader role (recovery/rollback). Run as postgres. NOT EXECUTED WITHOUT APPROVAL.
-- (DROP OWNED BY is not usable: postgres holds only ADMIN, not INHERIT, on the role it created.)
\set ON_ERROR_STOP on
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON TABLES FROM vista_backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON SEQUENCES FROM vista_backup_reader;
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM vista_backup_reader;
REVOKE SELECT ON ALL SEQUENCES IN SCHEMA public FROM vista_backup_reader;
REVOKE USAGE ON SCHEMA public FROM vista_backup_reader;
DROP ROLE vista_backup_reader;
COMMIT;
\echo 'vista_backup_reader removed'
```

## Rotate the password (as `postgres`), then set the GitHub secret again

```sql
ALTER ROLE vista_backup_reader PASSWORD :'reader_password';  -- via psql variable, as above
```
