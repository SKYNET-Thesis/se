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

-- 6. Migration K prerequisites: canonical roles and the two permission codes (must exist / must not yet exist before K).
SELECT code FROM public.roles WHERE code IN ('instructor', 'school_admin', 'student') ORDER BY code;
SELECT code FROM public.permissions WHERE code IN ('learning.course.author', 'learning.course.publish') ORDER BY code;

-- 7. Migration L: the runtime role must not exist yet (or exist with safe attributes) and must own nothing.
SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolbypassrls FROM pg_roles WHERE rolname = 'vista_app_runtime';

-- 8. Schemas the L privilege sweep would touch, with their owners (REVOKE on objects the apply role cannot see fails the whole migration).
SELECT n.nspname, pg_get_userbyid(n.nspowner) AS owner, has_schema_privilege(current_user, n.nspname, 'USAGE') AS reader_usage
FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_(toast|temp)' ORDER BY 1;

-- 9. Candidate TEMP consumers right now: connected roles/applications and sessions holding temporary schemas.
SELECT usename, application_name, count(*) AS sessions FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2 ORDER BY 3 DESC;
SELECT n.nspname AS temp_schema, count(*) AS temp_relations FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname ~ '^pg_temp_' GROUP BY 1;

ROLLBACK;
