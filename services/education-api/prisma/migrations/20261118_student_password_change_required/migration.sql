-- Add a dormant-by-default gate for newly provisioned student accounts.
-- Existing students remain unaffected until provisioning explicitly opts them in.
ALTER TABLE public.education_school_user_profiles
  ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.education_school_user_profiles
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ(6);

ALTER TABLE public.education_school_user_profiles
  ADD COLUMN IF NOT EXISTS temporary_password_expires_at TIMESTAMPTZ(6);

ALTER TABLE public.education_school_user_profiles
  ADD COLUMN IF NOT EXISTS provisioning_claim_token UUID;

ALTER TABLE public.education_school_user_profiles
  ADD COLUMN IF NOT EXISTS provisioning_lease_until TIMESTAMPTZ(6);
