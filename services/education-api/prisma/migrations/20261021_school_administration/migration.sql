-- Add the tenant-scoped school administration capability.  This migration is
-- additive and deliberately does not grant platform (org.manage) authority.
BEGIN;

INSERT INTO public.roles (code, name, scope)
VALUES ('school_admin', 'School administrator', 'organization')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (code, description)
VALUES
  ('education.members.read', 'Read users who belong to the active organization'),
  ('education.classroom.read', 'Read classrooms in the active organization'),
  ('education.classroom.manage', 'Create and update classrooms in the active organization'),
  ('education.classroom.members.manage', 'Manage classroom enrollment and teaching assignments in the active organization')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'education.members.read',
  'education.classroom.read',
  'education.classroom.manage',
  'education.classroom.members.manage'
)
WHERE r.code = 'school_admin'
ON CONFLICT DO NOTHING;

COMMIT;
