-- Release migration M: remove the database TEMP privilege inherited from PUBLIC.
-- Local PostgreSQL does not prove hosted Supabase compatibility. Preserve known platform roles
-- explicitly and fail closed unless ownership, runtime access and platform postconditions hold.
-- Future Supabase roles require explicit review and allowlist maintenance.
-- Recovery/rollback: GRANT TEMPORARY ON DATABASE <db> TO PUBLIC restores prior behavior;
-- then re-run the K-M verifier. The release remains production-BLOCKED until hosted validation.
DO $$
DECLARE
  r text;
  platform_roles text[] := ARRAY['postgres','supabase_admin','supabase_auth_admin','supabase_storage_admin','authenticator','anon','authenticated','service_role'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vista_app_runtime') THEN
    RAISE EXCEPTION 'Required vista_app_runtime role is missing; apply L and verify before M';
  END IF;
  IF has_database_privilege('vista_app_runtime', current_database(), 'CONNECT') IS NOT TRUE THEN
    RAISE EXCEPTION 'Runtime role must retain CONNECT before M';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
    RAISE EXCEPTION 'M requires the database owner role so owner TEMP can be verified';
  END IF;

  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  FOREACH r IN ARRAY platform_roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO %I', current_database(), r);
    END IF;
  END LOOP;

  IF has_database_privilege('vista_app_runtime', current_database(), 'TEMP')
    OR has_database_privilege('public', current_database(), 'TEMP')
    OR NOT has_database_privilege(current_user, current_database(), 'TEMP') THEN
    RAISE EXCEPTION 'M postflight failed: runtime/PUBLIC must lack TEMP and database owner must retain TEMP';
  END IF;
  FOREACH r IN ARRAY platform_roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) AND NOT has_database_privilege(r, current_database(), 'TEMP') THEN
      RAISE EXCEPTION 'M postflight failed: platform role % lost TEMP', r;
    END IF;
  END LOOP;
END
$$;
