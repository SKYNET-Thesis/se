-- READ-ONLY hosted Supabase evidence for release scope K-M. Run it ONLY with the approved read-only Production credential
-- (vista_backup_reader) or in the Supabase SQL editor by the database owner; it changes nothing. Redact before sharing; it prints no secrets.
-- It answers the open questions that keep K-M BLOCKED: who owns the database, which roles hold TEMP, which platform roles exist,
-- whether the canonical RBAC roles migration K needs are present, and which roles are connected (candidate TEMP consumers).
BEGIN READ ONLY;

-- 1. Database owner and ACL (migration M requires the apply role to be the database owner).
SELECT d.datname, pg_get_userbyid(d.datdba) AS owner, d.datacl::text AS acl FROM pg_database d WHERE d.datname = current_database();

-- 2. Who the connection really is, and whether it is a member of the owner / platform admin roles.
SELECT current_user AS connected_as, session_user AS session_as,
       pg_has_role(current_user, pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database())), 'MEMBER') AS member_of_database_owner,
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') AS supabase_admin_exists;

-- 3. TEMP today: PUBLIC and every non-system role (roles that only hold TEMP through PUBLIC are the ones migration M would change).
SELECT 'PUBLIC' AS role, has_database_privilege('public', current_database(), 'TEMP') AS has_temp
UNION ALL
SELECT r.rolname, has_database_privilege(r.rolname, current_database(), 'TEMP') FROM pg_roles r WHERE r.rolname !~ '^pg_' ORDER BY 1;

-- 4. Role inventory and attributes (platform roles beyond migration M's allowlist need an explicit decision).
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolinherit, rolbypassrls, rolreplication, rolconnlimit
FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname;

-- 5. Migration M's platform-role allowlist versus what exists here.
SELECT allowlist.role, EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = allowlist.role) AS exists_here
FROM unnest(ARRAY['postgres','supabase_admin','supabase_auth_admin','supabase_storage_admin','authenticator','anon','authenticated','service_role']) AS allowlist(role);

-- 7. Migration L: the runtime role must not exist yet (or exist with safe attributes) and must own nothing.
SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolbypassrls FROM pg_roles WHERE rolname = 'vista_app_runtime';

-- 8. Schemas the L privilege sweep would touch, with their owners (REVOKE on objects the apply role cannot see fails the whole migration).
SELECT n.nspname, pg_get_userbyid(n.nspowner) AS owner, has_schema_privilege(current_user, n.nspname, 'USAGE') AS reader_usage
FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_(toast|temp)' ORDER BY 1;

-- 8b. Migration L sweep PREVIEW for the apply role `postgres`: the sweep REVOKEs in every schema above. On PostgreSQL a REVOKE by a role that has no
-- USAGE on the schema (even an empty one) or no privilege at all on a table raises "permission denied" and aborts the whole migration
-- (verified on a disposable PostgreSQL 17 and on the Supabase PostgreSQL image, where `pgbouncer.get_auth` aborts L). Any row with apply_has_usage = false,
-- or a non-zero count in a column, predicts that failure.
SELECT n.nspname,
       has_schema_privilege('postgres', n.nspname, 'USAGE') AS apply_has_usage,
       (SELECT count(*) FROM pg_class c WHERE c.relnamespace = n.oid
          AND CASE WHEN c.relkind IN ('r','p','v','m','f') THEN NOT has_table_privilege('postgres', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END) AS tables_without_any_apply_privilege,
       (SELECT count(*) FROM pg_class c WHERE c.relnamespace = n.oid
          AND CASE WHEN c.relkind = 'S' THEN NOT has_sequence_privilege('postgres', c.oid, 'USAGE,SELECT,UPDATE') ELSE false END) AS sequences_without_any_apply_privilege,
       (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = n.oid AND NOT has_function_privilege('postgres', p.oid, 'EXECUTE')) AS functions_without_any_apply_privilege
FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_(toast|temp)' ORDER BY 1;

-- 9. Candidate TEMP consumers right now: connected roles/applications and sessions holding temporary schemas.
SELECT usename, application_name, count(*) AS sessions FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2 ORDER BY 3 DESC;
SELECT n.nspname AS temp_schema, count(*) AS temp_relations FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname ~ '^pg_temp_' GROUP BY 1;

-- 6. Migration K prerequisites (kept LAST: it reads the application's own tables, so on a database without them it fails, and a failure aborts the rest of this read-only transaction): canonical roles and the two permission codes (must exist / must not yet exist before K).
SELECT code FROM public.roles WHERE code IN ('instructor', 'school_admin', 'student') ORDER BY code;
SELECT code FROM public.permissions WHERE code IN ('learning.course.author', 'learning.course.publish') ORDER BY code;

ROLLBACK;
