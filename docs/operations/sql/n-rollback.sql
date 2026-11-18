-- Rollback for release scope N (student temporary password columns). NOT executed by the release runner.
-- Run only after STUDENT_TEMP_PASSWORD_ENABLED has been false for the whole deployment and no student is pending a first-login change:
--   SELECT count(*) FROM public.education_school_user_profiles WHERE password_change_required;   -- must be 0
-- Dropping the columns is not needed for a normal rollback (they are inert while the flag is off): leaving them is the safe default.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.education_school_user_profiles WHERE password_change_required) THEN
    RAISE EXCEPTION 'students are still pending a first-login password change; reissue or complete them first';
  END IF;
END $$;
ALTER TABLE public.education_school_user_profiles
  DROP COLUMN IF EXISTS provisioning_lease_until,
  DROP COLUMN IF EXISTS provisioning_claim_token,
  DROP COLUMN IF EXISTS temporary_password_expires_at,
  DROP COLUMN IF EXISTS password_changed_at,
  DROP COLUMN IF EXISTS password_change_required;
DELETE FROM public.vista_schema_migrations WHERE version = '20261118_n_student_password_change_required';
COMMIT;
