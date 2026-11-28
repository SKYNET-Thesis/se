-- Migration U (STAGED, PROPOSAL - owner approval required; not in the release manifest): server-authoritative first-login password state for staff.
-- Directly created School Administrators and Instructors must replace their temporary password before using the application. Students already
-- have this state on education_school_user_profiles (migration N); School Administrators have no profile row, so the state lives on public.users.
-- Additive only: three columns, no backfill, no constraint/index/RLS/grant change. Existing users keep password_change_required=false and are never restricted.
-- The API reads/writes these columns only while STAFF_TEMP_PASSWORD_ENABLED=true (default false), so the current API runs unchanged before and after this
-- migration (deploy-before-migrate is safe). Do not switch the flag off while staff are still pending their first password change.
-- Rollback (loses only the pending-change state; credentials are unaffected):
--   ALTER TABLE public.users DROP COLUMN IF EXISTS temporary_password_expires_at, DROP COLUMN IF EXISTS password_changed_at, DROP COLUMN IF EXISTS password_change_required;
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN RAISE EXCEPTION 'public.users is required'; END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS temporary_password_expires_at TIMESTAMPTZ(6);
