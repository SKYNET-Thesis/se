-- ROLLBACK of release scope K-L, for the database owner/apply role, ONLY after the API no longer connects as vista_app_runtime (switch the secret back, redeploy or
-- stop the API) and after the code that uses the K permissions has been rolled back. It is the recovery path documented for L and K; it is NOT run automatically.
-- Rehearsed on a disposable database where K and L were applied by a non-superuser `postgres` on the Supabase PostgreSQL image. DROP OWNED BY is not used: PostgreSQL 17
-- refuses it to the apply role (no implicit membership for CREATEROLE). Run with: psql -v ON_ERROR_STOP=1 --single-transaction -f k-l-rollback.sql
--
-- L: drop the role's RLS policies, revoke every explicit grant, prove nothing depends on the role, drop it.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT schemaname, tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'vista_app_runtime_backend_access' LOOP
    EXECUTE format('DROP POLICY vista_app_runtime_backend_access ON %I.%I', item.schemaname, item.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vista_app_runtime') THEN
    FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f') LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM vista_app_runtime', item.relname);
    END LOOP;
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM vista_app_runtime';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM vista_app_runtime';
    EXECUTE 'REVOKE ALL PRIVILEGES ON SCHEMA public FROM vista_app_runtime';
    EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM vista_app_runtime', current_database());
    IF EXISTS (SELECT 1 FROM pg_shdepend sd WHERE sd.refobjid = (SELECT oid FROM pg_roles WHERE rolname = 'vista_app_runtime')) THEN
      RAISE EXCEPTION 'vista_app_runtime still owns objects or holds privileges; refusing to drop it';
    END IF;
    EXECUTE 'DROP ROLE vista_app_runtime';
  END IF;
END $$;
-- K: remove exactly the two permission codes and their grants.
DELETE FROM public.role_permissions WHERE permission_id IN (SELECT id FROM public.permissions WHERE code IN ('learning.course.author', 'learning.course.publish'));
DELETE FROM public.permissions WHERE code IN ('learning.course.author', 'learning.course.publish');
-- The migration ledger rows for K and L are NOT edited here: an operator-approved ledger correction is a separate, reviewed step (never manual SQL by this script).
