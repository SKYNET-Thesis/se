-- WF-01: give the existing School Admin role its classroom robot allocation capability.
-- Allocation remains a standing authorization; this does not grant runtime control or booking.
DO $$
DECLARE
  allocation_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code='school_admin' AND scope='organization') THEN
    RAISE EXCEPTION 'Canonical organization-scoped school_admin role is missing';
  END IF;

  INSERT INTO public.permissions(code, description)
  VALUES ('education.classroom.resource.allocate', 'Allocate an organization-entitled robot resource to a classroom')
  ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description;
  SELECT id INTO STRICT allocation_id FROM public.permissions WHERE code='education.classroom.resource.allocate';

  INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT r.id, allocation_id FROM public.roles r WHERE r.code='school_admin' AND r.scope='organization'
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id
    WHERE r.code='school_admin' AND rp.permission_id=allocation_id
  ) THEN
    RAISE EXCEPTION 'School Admin robot allocation permission grant was not persisted';
  END IF;
END
$$;
