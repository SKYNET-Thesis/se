-- Release migration K: school-scoped authoring and publishing capabilities (owner-approved policy, 2026-11-16).
--   learning.course.author  -> create/edit/preview a school's courses, curriculum, media, questions and quizzes
--                              (Instructor and School Admin). It does NOT grant publishing authority.
--   learning.course.publish -> publish a school's courses (Instructor only; School Admin must not publish).
-- Both are enforced by the Education API (LearningScopeService), never only by the UI.
-- Role codes come from the existing identity contract / seed fixtures. This migration never creates roles or grants.
-- Fail closed unless canonical roles already exist. Idempotent; no unrelated rows are removed or rewritten.
-- Rollback: explicitly revoke these grants and remove these permission rows after dependent code is rolled back.
DO $$
DECLARE
  author_id uuid;
  publish_id uuid;
  missing_roles text[];
BEGIN
  IF to_regclass('public.permissions') IS NULL OR to_regclass('public.role_permissions') IS NULL OR to_regclass('public.roles') IS NULL THEN
    RAISE EXCEPTION 'RBAC tables are missing; refusing to continue';
  END IF;
  SELECT array_agg(required.code ORDER BY required.code) INTO missing_roles
  FROM (VALUES ('instructor'), ('school_admin')) AS required(code)
  WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.code = required.code);
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Required canonical RBAC roles are missing: %; refusing to seed or elevate roles', array_to_string(missing_roles, ', ');
  END IF;

  INSERT INTO public.permissions(code, description)
  VALUES ('learning.course.author', 'Create, edit and preview school courses, curriculum, media, questions and quizzes; does not grant publishing')
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
  INSERT INTO public.permissions(code, description)
  VALUES ('learning.course.publish', 'Publish courses owned by the member''s own school')
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

  SELECT id INTO STRICT author_id FROM public.permissions WHERE code = 'learning.course.author';
  SELECT id INTO STRICT publish_id FROM public.permissions WHERE code = 'learning.course.publish';
  INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT r.id, author_id FROM public.roles r WHERE r.code IN ('instructor', 'school_admin')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT r.id, publish_id FROM public.roles r WHERE r.code = 'instructor'
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id WHERE r.code = 'instructor' AND rp.permission_id = author_id)
    OR NOT EXISTS (SELECT 1 FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id WHERE r.code = 'school_admin' AND rp.permission_id = author_id)
    OR NOT EXISTS (SELECT 1 FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id WHERE r.code = 'instructor' AND rp.permission_id = publish_id)
    OR EXISTS (SELECT 1 FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id WHERE r.code <> 'instructor' AND rp.permission_id = publish_id) THEN
    RAISE EXCEPTION 'K permission grants do not match the required author/publish policy';
  END IF;
END
$$;
