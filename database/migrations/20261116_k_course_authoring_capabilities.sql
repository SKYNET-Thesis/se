-- Release migration K: school-scoped authoring and publishing capabilities (owner-approved policy, 2026-11-16).
--   learning.course.author  -> create/edit/preview a school's courses, curriculum, media, questions and quizzes
--                              (Instructor and School Admin). Distinct from learning.delivery.manage (classroom
--                              delivery) and from org.manage (System Administrator).
--   learning.course.publish -> publish a school's courses (Instructor only; School Admin must not publish).
-- Both are enforced by the Education API (LearningScopeService), never only by the UI.
-- Granted to the existing roles `instructor` and `school_admin` only when those roles exist.
-- learning.course.publish (publishing a school's courses) is granted to `instructor` ONLY, per the owner's latest policy.
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

  INSERT INTO public.permissions(code, description)
  VALUES ('learning.course.publish', 'Publish courses owned by the member''s own school')
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO perm_id FROM public.permissions WHERE code = 'learning.course.publish';
  INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT r.id, perm_id FROM public.roles r WHERE r.code = 'instructor'
  ON CONFLICT DO NOTHING;
END
$$;
