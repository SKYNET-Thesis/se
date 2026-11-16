-- Release migration M: remove the TEMPORARY-table privilege that every role inherits from PUBLIC on this database.
--
-- Finding: PostgreSQL grants CONNECT and TEMP on a new database to PUBLIC (datacl `=Tc/owner`), so the restricted
-- runtime role `vista_app_runtime` (migration L) could create temporary tables although L revokes everything it can
-- revoke from the role itself — a privilege granted to PUBLIC cannot be removed from one role.
-- Policy: the runtime role must not create temporary objects.
-- Change (narrow and explicit): revoke TEMPORARY from PUBLIC on THIS database only, then grant it back, by name, to the
-- platform/administrative roles that exist in the cluster. CONNECT is untouched. The database owner keeps all privileges.
-- Roles not listed (including vista_app_runtime and any future role) no longer get TEMP implicitly.
-- Idempotent. Rollback: GRANT TEMPORARY ON DATABASE <db> TO PUBLIC.
DO $$
DECLARE r text;
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  FOREACH r IN ARRAY ARRAY['postgres','supabase_admin','supabase_auth_admin','supabase_storage_admin','authenticator','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO %I', current_database(), r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vista_app_runtime') THEN
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM vista_app_runtime', current_database());
    IF has_database_privilege('vista_app_runtime', current_database(), 'TEMP') THEN
      RAISE EXCEPTION 'vista_app_runtime still has TEMPORARY privilege on %', current_database();
    END IF;
  END IF;
END
$$;
