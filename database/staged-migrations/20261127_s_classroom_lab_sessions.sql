-- Staged migration S: Classroom Lab Session (classroom-level exclusive robot reservation) and many-to-many robot allocation.
-- NOT part of the release manifest and NOT approved for Production. Additive except for ONE relaxation (below). Idempotent. No data is rewritten.
-- Depends on: L (runtime role), K (permissions/roles), the WF-01 allocation table. Preserves robots, entitlements, allocations, experiments, recordings and users.
--
-- 1. classroom_lab_sessions: server-authoritative reservation of ONE robot by ONE classroom for a bounded, supervised practical session.
--    Layer A exclusivity is enforced here by a partial UNIQUE index: at most one open (active | terminating | quarantined) session per robot across
--    every classroom and organization. 'released' rows are history and are never deleted.
-- 2. learning_classroom_robot_allocations: the UNIQUE(classroom_id) constraint (one robot per classroom) is replaced by UNIQUE(classroom_id, robot_id),
--    so a classroom may hold several robots and a robot may be allocated to several classrooms (robot_id was never unique). Existing rows satisfy the new
--    constraint because they already satisfy the stricter one.
-- 3. permission education.lab_session.manage for the instructor role (start / extend / end a Lab Session of a classroom they teach).
--
-- COMPATIBILITY: the currently deployed API issues `ON CONFLICT (classroom_id)` against the allocation table. Apply this migration ONLY together with
-- (or after) the API build that uses (classroom_id, robot_id); applying it earlier makes the deployed allocation endpoint fail with 42P10.
-- Rollback (after the API build that uses it no longer runs, and only while every classroom has at most one allocation):
--   ALTER TABLE public.learning_classroom_robot_allocations DROP CONSTRAINT learning_classroom_robot_allocations_classroom_robot_key;
--   ALTER TABLE public.learning_classroom_robot_allocations ADD CONSTRAINT learning_classroom_robot_allocations_classroom_id_key UNIQUE (classroom_id);
--   DROP TABLE public.classroom_lab_sessions;
--   DELETE FROM public.role_permissions WHERE permission_id IN (SELECT id FROM public.permissions WHERE code='education.lab_session.manage');
--   DELETE FROM public.permissions WHERE code='education.lab_session.manage';
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.users') IS NULL OR to_regclass('public.robots') IS NULL
     OR to_regclass('public.learning_classrooms') IS NULL OR to_regclass('public.learning_classroom_robot_allocations') IS NULL THEN
    RAISE EXCEPTION 'organizations/users/robots/learning_classrooms/learning_classroom_robot_allocations are required';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.classroom_lab_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id),
  classroom_id        uuid NOT NULL REFERENCES public.learning_classrooms(id),
  robot_id            uuid NOT NULL REFERENCES public.robots(id),
  instructor_user_id  uuid NOT NULL REFERENCES public.users(id),
  state               text NOT NULL DEFAULT 'active' CHECK (state IN ('active','terminating','quarantined','released')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  extension_count     integer NOT NULL DEFAULT 0 CHECK (extension_count >= 0),
  terminating_at      timestamptz,
  ended_at            timestamptz,
  ended_by_user_id    uuid REFERENCES public.users(id),
  ended_by_role       text CHECK (ended_by_role IS NULL OR ended_by_role IN ('instructor','school_admin','system','expiry')),
  end_reason          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > started_at),
  CHECK ((state = 'released') = (ended_at IS NOT NULL))
);
-- Layer A: one open reservation per robot, across all classrooms and organizations.
CREATE UNIQUE INDEX IF NOT EXISTS ux_classroom_lab_sessions_one_open_per_robot ON public.classroom_lab_sessions (robot_id) WHERE state IN ('active','terminating','quarantined');
CREATE INDEX IF NOT EXISTS ix_classroom_lab_sessions_classroom ON public.classroom_lab_sessions (classroom_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_classroom_lab_sessions_open_expiry ON public.classroom_lab_sessions (expires_at) WHERE state IN ('active','terminating','quarantined');

-- Same exposure model as migration L: RLS on, one backend policy for the runtime role, nothing for PostgREST roles. No DELETE: sessions are history.
ALTER TABLE public.classroom_lab_sessions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  REVOKE ALL ON TABLE public.classroom_lab_sessions FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE public.classroom_lab_sessions FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE public.classroom_lab_sessions FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vista_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.classroom_lab_sessions TO vista_app_runtime;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='classroom_lab_sessions' AND policyname='vista_app_runtime_backend_access') THEN
      CREATE POLICY vista_app_runtime_backend_access ON public.classroom_lab_sessions FOR ALL TO vista_app_runtime USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- Many-to-many allocation. Allocation grants ELIGIBILITY only; exclusive control comes from an open classroom_lab_sessions row.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_classroom_robot_allocations'::regclass AND conname='learning_classroom_robot_allocations_classroom_robot_key') THEN
    ALTER TABLE public.learning_classroom_robot_allocations ADD CONSTRAINT learning_classroom_robot_allocations_classroom_robot_key UNIQUE (classroom_id, robot_id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_classroom_robot_allocations'::regclass AND conname='learning_classroom_robot_allocations_classroom_id_key') THEN
    ALTER TABLE public.learning_classroom_robot_allocations DROP CONSTRAINT learning_classroom_robot_allocations_classroom_id_key;
  END IF;
END $$;

INSERT INTO public.permissions(code, description) VALUES ('education.lab_session.manage', 'Start, extend and end a classroom Robot Lab Session for a classroom the user teaches')
ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p WHERE r.code='instructor' AND r.scope='organization' AND p.code='education.lab_session.manage'
ON CONFLICT DO NOTHING;
COMMIT;
