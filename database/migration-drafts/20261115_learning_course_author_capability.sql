-- Draft (NOT registered in database/migrations/manifest.json; owner review required before any shared/Production use).
-- Introduces the school-scoped authoring capability approved for the VISTA Release Candidate:
--   learning.course.author  -> create/edit/preview/publish the caller's own school's courses, curriculum,
--                              media, questions and quizzes. It is distinct from learning.delivery.manage
--                              (classroom delivery) and from org.manage (System Administrator).
-- Granted to the existing roles `instructor` and `school_admin` only when those roles exist.
-- Idempotent: safe to rerun. No data is removed. Rollback: delete the two role_permissions rows and the permission row.
DO $$
DECLARE perm_id uuid;
BEGIN
  IF to_regclass('public.permissions') IS NULL OR to_regclass('public.role_permissions') IS NULL OR to_regclass('public.roles') IS NULL THEN
    RAISE EXCEPTION 'RBAC tables are missing; refusing to continue';
  END IF;
  INSERT INTO public.permissions(code, description)
  VALUES ('learning.course.author', 'Create, edit, preview and publish courses, questions and quizzes owned by the member''s own school')
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO perm_id FROM public.permissions WHERE code = 'learning.course.author';
  INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT r.id, perm_id FROM public.roles r WHERE r.code IN ('instructor', 'school_admin')
  ON CONFLICT DO NOTHING;
END
$$;
