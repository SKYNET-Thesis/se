-- Staged migration R: Desktop / Edge device provisioning (per-device identity, enrollment challenge, credential lifecycle).
-- NOT part of the release manifest and NOT approved for Production. Additive and idempotent. No shared or long-lived cloud credential is created here:
-- a device holds its own Ed25519 private key, the server stores only the public key and a hash of the one-time enrollment code.
-- Depends on: L (runtime role), K (permissions/roles). The runtime role gets SELECT/INSERT/UPDATE only (never DELETE: devices are revoked, not erased).
-- Rollback (after the API build that uses it no longer runs): DROP TABLE public.device_enrollment_challenges, public.robot_devices;
--   DELETE FROM public.role_permissions WHERE permission_id IN (SELECT id FROM public.permissions WHERE code='education.devices.manage');
--   DELETE FROM public.permissions WHERE code='education.devices.manage';
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.users') IS NULL OR to_regclass('public.robots') IS NULL THEN
    RAISE EXCEPTION 'organizations/users/robots are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code='school_admin' AND scope='organization') THEN
    RAISE EXCEPTION 'Canonical organization-scoped school_admin role is missing';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.robot_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  device_kind text NOT NULL,
  robot_id uuid REFERENCES public.robots(id),
  status text NOT NULL DEFAULT 'pending',
  public_key text,
  key_fingerprint text,
  credential_version integer NOT NULL DEFAULT 1,
  auth_nonce_hash text,
  auth_nonce_expires_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  enrolled_at timestamptz,
  last_seen_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES public.users(id),
  revoke_reason text,
  CONSTRAINT robot_devices_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT robot_devices_kind CHECK (device_kind IN ('desktop_lab_station','edge_runtime')),
  CONSTRAINT robot_devices_status CHECK (status IN ('pending','active','suspended','revoked')),
  CONSTRAINT robot_devices_key_state CHECK ((status IN ('active','suspended') AND public_key IS NOT NULL AND key_fingerprint IS NOT NULL) OR status IN ('pending','revoked')),
  CONSTRAINT robot_devices_revoke_note CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS robot_devices_org_name_active_idx ON public.robot_devices (organization_id, lower(btrim(name))) WHERE status <> 'revoked';
CREATE UNIQUE INDEX IF NOT EXISTS robot_devices_fingerprint_idx ON public.robot_devices (key_fingerprint) WHERE key_fingerprint IS NOT NULL AND status <> 'revoked';
CREATE INDEX IF NOT EXISTS robot_devices_org_status_idx ON public.robot_devices (organization_id, status);

CREATE TABLE IF NOT EXISTS public.device_enrollment_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.robot_devices(id),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  nonce_hash text,
  nonce_expires_at timestamptz,
  consumed_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_enrollment_code_hash_idx ON public.device_enrollment_challenges (code_hash);
CREATE INDEX IF NOT EXISTS device_enrollment_device_idx ON public.device_enrollment_challenges (device_id, created_at DESC);

-- Same exposure model as migration L: RLS on, one backend policy for the runtime role, nothing for PostgREST roles.
ALTER TABLE public.robot_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_enrollment_challenges ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['robot_devices','device_enrollment_challenges'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vista_app_runtime') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO vista_app_runtime', t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='vista_app_runtime_backend_access') THEN
        EXECUTE format('CREATE POLICY vista_app_runtime_backend_access ON public.%I FOR ALL TO vista_app_runtime USING (true) WITH CHECK (true)', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- School Admin may manage devices of their own organization (System Administrators are authorized separately by platform role).
INSERT INTO public.permissions(code, description) VALUES ('education.devices.manage', 'Register, suspend, rotate and revoke Desktop / Edge devices of the organization')
ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p WHERE r.code='school_admin' AND r.scope='organization' AND p.code='education.devices.manage'
ON CONFLICT DO NOTHING;
COMMIT;
