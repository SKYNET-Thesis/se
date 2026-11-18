-- Student temporary password: dormant first-login gate columns (release scope N).
--
-- Additive only: five nullable/defaulted columns on public.education_school_user_profiles. No backfill, no constraint, index,
-- RLS, grant or trigger change. Existing students keep password_change_required = false and are never restricted; the API reads
-- these columns only while STUDENT_TEMP_PASSWORD_ENABLED=true (default false), so the previous API version keeps working both
-- before and after this migration.
--
-- Rollback (only needed if the feature is abandoned; the columns are inert while the flag is off) is documented in
-- docs/operations/sql/n-rollback.sql and is intentionally NOT executed by the release runner.
ALTER TABLE public.education_school_user_profiles
  ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS temporary_password_expires_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS provisioning_claim_token UUID,
  ADD COLUMN IF NOT EXISTS provisioning_lease_until TIMESTAMPTZ(6);
