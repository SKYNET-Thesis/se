-- Read-only catalog assertions for the exact pre-release production baseline.
-- This script intentionally performs no DDL/DML. It reads _prisma_migrations
-- only to make sure none of this release's versions was already applied.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE bad text;
has_rows boolean;
missing_count integer;
BEGIN
  SELECT string_agg(t.name, ', ')
  INTO bad
  FROM (VALUES
    ('learning_activity_progress'), ('learning_lessons'), ('learning_objectives'),
    ('learning_courses'), ('organizations'), ('users'), ('learning_assignments'),
    ('learning_classroom_assignments'), ('learning_assignment_attempts'),
    ('learning_enrollments'), ('learning_classrooms'), ('learning_course_offerings'),
    ('learning_experiments'), ('control_sessions'), ('robots')
  ) AS t(name)
  WHERE to_regclass(format('public.%I', t.name)) IS NULL;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'preflight: required dependency tables absent: %', bad; END IF;

  SELECT string_agg(t.name, ', ')
  INTO bad
  FROM (VALUES
    ('learning_sections'), ('learning_activities'), ('learning_activity_objectives'),
    ('learning_questions'), ('learning_question_versions'),
    ('learning_question_version_objectives'), ('learning_assignment_question_versions'),
    ('learning_quiz_attempt_grading'), ('iot_command_lifecycles'), ('iot_inbound_events')
  ) AS t(name)
  WHERE to_regclass(format('public.%I', t.name)) IS NOT NULL;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'preflight: migration target relations already exist: %', bad; END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='learning_activity_progress' AND a.attname='activity_definition_id' AND a.attnum>0 AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'preflight: activity_definition_id already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_activity_progress
    WHERE activity_id NOT IN (lesson_id::text || '-reading-1', lesson_id::text || '-reading-2', lesson_id::text || '-demonstration')) THEN
    RAISE EXCEPTION 'preflight: legacy activity progress violates the migration slot contract';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_enrollments WHERE status NOT IN ('active','completed')) THEN
    RAISE EXCEPTION 'preflight: enrollment status is incompatible with the lifecycle migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_enrollments GROUP BY course_id,learner_user_id,classroom_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'preflight: enrollment rows conflict with the replacement unique constraint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_activity_progress'::regclass AND conname='learning_activity_progress_activity_slot_check' AND contype='c') THEN
    RAISE EXCEPTION 'preflight: expected legacy activity slot constraint is absent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_enrollments'::regclass AND conname='learning_enrollments_course_id_learner_user_id_key' AND contype='u') THEN
    RAISE EXCEPTION 'preflight: expected legacy enrollment unique constraint is absent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('learning_lessons','id','uuid'),('learning_lessons','course_id','uuid'),
      ('learning_objectives','id','uuid'),('learning_objectives','lesson_id','uuid'),
      ('learning_courses','id','uuid'),('learning_courses','organization_id','uuid'),
      ('organizations','id','uuid'),('users','id','uuid'),
      ('learning_assignments','id','uuid'),('learning_assignments','lesson_id','uuid'),
      ('learning_assignment_attempts','id','uuid'),('learning_assignment_attempts','workspace_snapshot','jsonb'),
      ('learning_assignment_attempts','classroom_assignment_id','uuid'),
      ('learning_classroom_assignments','id','uuid'),('learning_classroom_assignments','assignment_id','uuid'),
      ('learning_classroom_assignments','status','text'),
      ('learning_experiments','id','uuid'),('control_sessions','id','uuid'),('robots','id','uuid')
    ) AS e(table_name,column_name,expected_type)
    LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
    WHERE c.column_name IS NULL OR c.udt_name IS DISTINCT FROM e.expected_type
  ) THEN RAISE EXCEPTION 'preflight: migration dependency column is missing or has an incompatible type'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('learning_lessons'),('learning_objectives'),('learning_courses'),('organizations'),('users'),
      ('learning_assignments'),('learning_assignment_attempts'),('learning_experiments'),('control_sessions'),('robots')
    ) AS e(table_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='id'
      JOIN pg_constraint p ON p.conrelid=c.oid AND p.contype='p' AND a.attnum=ANY(p.conkey)
      WHERE n.nspname='public' AND c.relname=e.table_name
    )
  ) THEN RAISE EXCEPTION 'preflight: migration dependency id is not a primary key'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('learning_sections_lesson_id_status_ordinal_idx'),('learning_activities_section_id_status_ordinal_idx'),
      ('learning_activity_objectives_objective_id_idx'),('learning_activity_progress_activity_definition_id_idx'),
      ('learning_questions_course_id_lesson_id_idx'),('learning_questions_organization_id_lesson_id_idx'),
      ('learning_question_versions_question_id_status_idx'),('learning_question_version_objectives_objective_id_idx'),
      ('learning_assignment_question_versions_question_version_id_idx'),('idx_learning_enrollments_active_classroom'),
      ('iot_command_lifecycles_robot_state_idx'),('iot_command_lifecycles_experiment_idx'),
      ('iot_inbound_events_command_received_idx'),('iot_inbound_events_robot_received_idx')
    ) AS e(name) JOIN pg_class c ON c.relname=e.name JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
  ) THEN RAISE EXCEPTION 'preflight: a migration index name already exists'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('check_learning_question_scope','check_learning_question_objective','guard_learning_question_version','guard_learning_question_objective','guard_learning_assignment_question','lock_learning_assignment_questions_on_delivery','lock_learning_assignment_questions_on_attempt','guard_question_bank_quiz_snapshot','guard_question_bank_quiz_grading')) THEN
    RAISE EXCEPTION 'preflight: a migration function name already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN ('lock_learning_assignment_questions_on_delivery','lock_learning_assignment_questions_on_attempt','guard_question_bank_quiz_snapshot')) THEN
    RAISE EXCEPTION 'preflight: a migration trigger name already exists on a referenced table';
  END IF;

  IF to_regclass('public._prisma_migrations') IS NULL THEN RAISE EXCEPTION 'preflight: expected Prisma history table is absent'; END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = ANY($1))'
    INTO has_rows USING ARRAY['20261104_curriculum_foundation','20261105_question_bank_foundation','20261106_question_bank_quiz_attempt','20261106_classroom_enrollment_lifecycle','20261106_iot_lifecycle_foundation','20261106_iot_publish_intent','20261108_iot_lifecycle_access_restrictions'];
  IF has_rows THEN RAISE EXCEPTION 'preflight: a requested migration is already present in Prisma history'; END IF;

  IF to_regclass('public.vista_schema_migrations') IS NOT NULL THEN
    SELECT count(*) INTO missing_count FROM (VALUES
      ('version','text'),('checksum','text'),('release_id','text'),('source_commit','text'),
      ('operator_id','text'),('applied_at','timestamptz'),('provenance','text')
    ) AS expected(column_name,udt_name)
    LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name='vista_schema_migrations' AND c.column_name=expected.column_name
    WHERE c.column_name IS NULL OR c.udt_name IS DISTINCT FROM expected.udt_name OR c.is_nullable <> 'NO';
    IF missing_count > 0 THEN RAISE EXCEPTION 'preflight: application ledger schema is incompatible'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.vista_schema_migrations'::regclass AND contype='p'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.vista_schema_migrations'::regclass AND attname='version')]::smallint[]) THEN
      RAISE EXCEPTION 'preflight: application ledger version primary key is incompatible';
    END IF;
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.vista_schema_migrations WHERE version = ANY($1))'
      INTO has_rows USING ARRAY['20261104_curriculum_foundation','20261105_question_bank_foundation','20261106_question_bank_quiz_attempt','20261106_classroom_enrollment_lifecycle','20261106_iot_lifecycle_foundation','20261106_iot_publish_intent','20261108_iot_lifecycle_access_restrictions'];
    IF has_rows THEN RAISE EXCEPTION 'preflight: one or more release versions already exist in the application ledger'; END IF;
  END IF;
END
$$;

WITH required_tables(name) AS (VALUES
  ('learning_activity_progress'), ('learning_lessons'), ('learning_objectives'),
  ('learning_courses'), ('organizations'), ('users'), ('learning_assignments'),
  ('learning_classroom_assignments'), ('learning_assignment_attempts'),
  ('learning_enrollments'), ('learning_classrooms'), ('learning_course_offerings'),
  ('learning_experiments'), ('control_sessions'), ('robots')
), missing AS (
  SELECT name FROM required_tables
  EXCEPT
  SELECT table_name FROM information_schema.tables WHERE table_schema='public'
), target_tables(name) AS (VALUES
  ('learning_sections'), ('learning_activities'), ('learning_activity_objectives'),
  ('learning_questions'), ('learning_question_versions'),
  ('learning_question_version_objectives'), ('learning_assignment_question_versions'),
  ('learning_quiz_attempt_grading'), ('iot_command_lifecycles'), ('iot_inbound_events')
), unexpected AS (
  SELECT table_name FROM information_schema.tables WHERE table_schema='public'
    AND table_name IN (SELECT name FROM target_tables)
), checks AS (
  SELECT 'required tables absent' AS check_name, COALESCE(string_agg(name, ', '), '') AS detail FROM missing
  UNION ALL
  SELECT 'target tables already exist', COALESCE(string_agg(table_name, ', '), '') FROM unexpected
  UNION ALL
  SELECT 'application ledger', CASE WHEN to_regclass('public.vista_schema_migrations') IS NULL THEN 'will be created atomically with the first migration' ELSE 'present and clear for this release' END
  UNION ALL
  SELECT 'activity_definition_id already exists', COALESCE(string_agg(column_name, ', '), '')
  FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_activity_progress' AND column_name='activity_definition_id'
  UNION ALL
  SELECT 'activity progress rows violate legacy slot contract', CASE WHEN count(*) = 0 THEN '' ELSE count(*)::text END
  FROM public.learning_activity_progress
  WHERE activity_id NOT IN (lesson_id::text || '-reading-1', lesson_id::text || '-reading-2', lesson_id::text || '-demonstration')
  UNION ALL
  SELECT 'enrollment statuses incompatible with revoked lifecycle', COALESCE(string_agg(status || ':' || count, ', '), '')
  FROM (SELECT status, count(*)::text AS count FROM public.learning_enrollments WHERE status NOT IN ('active','completed') GROUP BY status) AS incompatible
)
SELECT check_name, detail, (detail = '' OR check_name = 'application ledger') AS passed FROM checks ORDER BY check_name;

SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('learning_activity_progress', 'learning_enrollments')
ORDER BY c.relname, con.conname;

SELECT md5(string_agg(item, E'\n' ORDER BY item)) AS baseline_fingerprint
FROM (
  SELECT 'table:' || c.relname AS item FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('learning_activity_progress','learning_lessons','learning_objectives','learning_courses','organizations','users','learning_assignments','learning_classroom_assignments','learning_assignment_attempts','learning_enrollments','learning_classrooms','learning_course_offerings')
  UNION ALL
  SELECT 'column:' || table_name || ':' || column_name || ':' || data_type || ':' || is_nullable
  FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('learning_activity_progress','learning_enrollments')
  UNION ALL
  SELECT 'constraint:' || c.relname || ':' || con.conname || ':' || pg_get_constraintdef(con.oid,true)
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('learning_activity_progress','learning_enrollments')
) AS baseline;
ROLLBACK;
