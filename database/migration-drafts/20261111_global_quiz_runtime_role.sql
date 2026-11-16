-- Phase 2.4.3 additive follow-up for the direct-Prisma Education API runtime.
-- Apply only through scripts/sql_migration_runner.py after release approval.
--
-- Global canonical courses have organization_id NULL. Question Bank identity
-- must support that same scope while retaining per-course code uniqueness.
ALTER TABLE public.learning_questions
  ALTER COLUMN organization_id DROP NOT NULL;

CREATE UNIQUE INDEX learning_questions_global_course_code_key
  ON public.learning_questions(course_id, code)
  WHERE organization_id IS NULL;

CREATE OR REPLACE FUNCTION public.check_learning_question_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.course_id,NEW.lesson_id,NEW.code) IS DISTINCT FROM
      (OLD.organization_id,OLD.course_id,OLD.lesson_id,OLD.code) AND
      EXISTS (SELECT 1 FROM public.learning_question_versions WHERE question_id=OLD.id) THEN
    RAISE EXCEPTION 'Versioned question identity and scope are immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_lessons l JOIN public.learning_courses c ON c.id=l.course_id
    WHERE l.id=NEW.lesson_id AND c.id=NEW.course_id AND c.organization_id IS NOT DISTINCT FROM NEW.organization_id) THEN
    RAISE EXCEPTION 'Question lesson, course and organization must match' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_learning_question_objective() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.learning_question_versions v
    JOIN public.learning_questions q ON q.id=v.question_id JOIN public.learning_objectives o ON o.id=NEW.objective_id
    JOIN public.learning_lessons l ON l.id=o.lesson_id JOIN public.learning_courses c ON c.id=l.course_id
    WHERE v.id=NEW.question_version_id AND o.lesson_id=q.lesson_id
      AND c.organization_id IS NOT DISTINCT FROM q.organization_id) THEN
    RAISE EXCEPTION 'Question objective must belong to the question lesson and organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

-- Prisma connects directly as this single trusted backend identity. It cannot
-- carry the end-user identity into PostgreSQL, so tenant checks remain in the
-- NestJS service layer. These permissive policies are intentionally scoped to
-- this role only; they are not tenant isolation and grant no PUBLIC access.
-- Prisma uses one direct DATABASE_URL identity for the API. This frozen
-- allowlist covers tables referenced by runtime code plus raw-SQL IoT tables;
-- unused models and API keys receive no privilege. Authorization catalogs are
-- SELECT-only, audit storage is insert-only, and one-time auth tokens allow
-- only the SELECT/INSERT/UPDATE operations used by account provisioning.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vista_app_runtime') THEN
    CREATE ROLE vista_app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='vista_app_runtime'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR NOT rolcanlogin OR rolinherit)
  ) THEN
    RAISE EXCEPTION 'Existing vista_app_runtime role has unsafe attributes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles r ON r.oid=m.member
    WHERE r.rolname='vista_app_runtime'
  ) THEN
    RAISE EXCEPTION 'vista_app_runtime must not inherit or assume another PostgreSQL role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba
      WHERE d.datname=current_database() AND r.rolname='vista_app_runtime') OR
     EXISTS (SELECT 1 FROM pg_shdepend sd
       WHERE sd.refclassid='pg_authid'::regclass
         AND sd.refobjid=(SELECT oid FROM pg_roles WHERE rolname='vista_app_runtime')
         AND sd.deptype='o' AND sd.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())) THEN
    RAISE EXCEPTION 'vista_app_runtime must not own the database or any database objects';
  END IF;
END $$;

DO $$
DECLARE item record;
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM vista_app_runtime', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO vista_app_runtime', current_database());
  FOR item IN SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM vista_app_runtime', item.nspname);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM vista_app_runtime', item.nspname);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM vista_app_runtime', item.nspname);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA %I FROM vista_app_runtime', item.nspname);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO vista_app_runtime;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname = ANY(ARRAY[
        'ai_models','benchmark_tasks','control_modes','control_sessions','dataset_episodes','dataset_versions',
        'audit_logs','auth_tokens','demonstration_episodes','education_school_user_profiles','evaluation_runs',
        'iot_command_lifecycles','iot_inbound_events','memberships','model_checkpoints',
        'observation_configurations','org_entitlements','organizations','permissions',
        'robots','role_permissions','roles','safety_profiles','training_runs','user_assignments','user_system_roles',
        'users','learning_assessment_scores','learning_assessments','learning_assignment_attempts','learning_assignments',
        'learning_challenge_conditions','learning_challenge_objects','learning_challenges','learning_classroom_assignments',
        'learning_classroom_members','learning_classrooms','learning_classroom_robot_allocations','learning_competencies',
        'learning_competency_progress','learning_course_offerings','learning_courses','learning_media_assets',
        'learning_demonstration_annotations','learning_demonstration_segments','learning_enrollments',
        'learning_experiment_artifacts','learning_experiment_comparisons','learning_experiment_events','learning_experiments',
        'learning_feedback','learning_lesson_prerequisites','learning_lesson_progress','learning_activity_progress',
        'learning_sections','learning_activities','learning_activity_objectives','learning_lessons','learning_levels',
        'learning_objective_competencies','learning_objectives','learning_questions','learning_question_versions',
        'learning_question_version_objectives','learning_assignment_question_versions','learning_quiz_attempt_grading',
        'learning_program_versions','learning_programs','learning_reflections','learning_rubric_criteria',
        'learning_submissions','learning_symbolic_evaluations','learning_vla_action_steps','learning_vla_interactions'
      ]::text[])
    ORDER BY c.relname
  LOOP
    IF item.relname = ANY(ARRAY['permissions','roles','role_permissions','user_system_roles']::text[]) THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO vista_app_runtime', item.relname);
    ELSIF item.relname = 'audit_logs' THEN
      EXECUTE format('GRANT INSERT ON TABLE public.%I TO vista_app_runtime', item.relname);
    ELSIF item.relname = 'auth_tokens' THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO vista_app_runtime', item.relname);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO vista_app_runtime', item.relname);
    END IF;
    IF item.relrowsecurity THEN
      EXECUTE format(
        'CREATE POLICY vista_app_runtime_backend_access ON public.%I FOR ALL TO vista_app_runtime USING (true) WITH CHECK (true)',
        item.relname
      );
    END IF;
  END LOOP;
END $$;

GRANT USAGE, SELECT ON SEQUENCE public.learning_experiment_events_id_seq TO vista_app_runtime;
