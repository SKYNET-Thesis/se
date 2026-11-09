-- Read-only assertions after an approved release execution.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  expected_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM (VALUES
    ('20261104_curriculum_foundation','57cb9b29751f3392214c54ac0291a696fbdb03f5ab252ab9f9e836822f305359'),
    ('20261105_question_bank_foundation','cfad4d384a5ff551d68c5ac57d7c9b1981c2d2e52a37a2060ee1f936a3516056'),
    ('20261106_question_bank_quiz_attempt','e9c2c214dc836d32c7031a4e185c77063a1b4e84ca3c6ff86109f0663b13f825'),
    ('20261106_classroom_enrollment_lifecycle','fc776052d91b80d5b5aef35d3bf2e9cadb2b9896e0adbce36a5e66a5b5a3cd7e'),
    ('20261106_iot_lifecycle_foundation','d5d1ebee0812dfb4388d8deb3188b8c8df9e6815f6a73839b3c8dd88f5883eed'),
    ('20261106_iot_publish_intent','fad0cfbbca5680e9825841a529c9a09b4e0d6457af043b95a5d07f60d7009833'),
    ('20261108_iot_lifecycle_access_restrictions','4e2ac74232b536d0193be32c61fd5922017644721e893423e553362109b01f98')
  ) AS expected(version,checksum)
  JOIN public.vista_schema_migrations actual USING (version,checksum)
  WHERE actual.release_id='20261108-main-schema'
    AND actual.source_commit='c23f3366ef78d20d17979b712af5d9f16aa27512'
    AND actual.provenance='executed';
  IF expected_count <> 7 THEN RAISE EXCEPTION 'postcheck: expected seven executed app-ledger records with pinned checksums'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('learning_sections'),('learning_activities'),('learning_activity_objectives'),
      ('learning_questions'),('learning_question_versions'),('learning_question_version_objectives'),
      ('learning_assignment_question_versions'),('learning_quiz_attempt_grading'),
      ('iot_command_lifecycles'),('iot_inbound_events')
    ) AS expected(table_name)
    LEFT JOIN pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_class c ON c.relname=expected.table_name AND c.relnamespace=n.oid
    WHERE c.oid IS NULL OR NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'postcheck: a release table is absent or RLS is not enabled'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('learning_sections_lesson_id_status_ordinal_idx'),('learning_activities_section_id_status_ordinal_idx'),
      ('learning_activity_objectives_objective_id_idx'),('learning_activity_progress_activity_definition_id_idx'),
      ('learning_questions_course_id_lesson_id_idx'),('learning_questions_organization_id_lesson_id_idx'),
      ('learning_question_versions_question_id_status_idx'),('learning_question_version_objectives_objective_id_idx'),
      ('learning_assignment_question_versions_question_version_id_idx'),('idx_learning_enrollments_active_classroom'),
      ('iot_command_lifecycles_robot_state_idx'),('iot_command_lifecycles_experiment_idx'),
      ('iot_inbound_events_command_received_idx'),('iot_inbound_events_robot_received_idx')
    ) AS expected(index_name)
    WHERE to_regclass(format('public.%I',expected.index_name)) IS NULL
  ) THEN RAISE EXCEPTION 'postcheck: a required release index is absent'; END IF;

  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN (
      'check_learning_question_scope','check_learning_question_objective','guard_learning_question_version',
      'guard_learning_question_objective','guard_learning_assignment_question','lock_learning_assignment_questions_on_delivery',
      'lock_learning_assignment_questions_on_attempt','guard_question_bank_quiz_snapshot','guard_question_bank_quiz_grading'
    )) <> 9 THEN RAISE EXCEPTION 'postcheck: expected Question Bank trigger set is incomplete'; END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') AND (
    has_table_privilege('anon','public.iot_command_lifecycles','SELECT') OR
    has_table_privilege('anon','public.iot_command_lifecycles','INSERT') OR
    has_table_privilege('anon','public.iot_inbound_events','SELECT') OR
    has_table_privilege('anon','public.iot_inbound_events','INSERT')
  ) THEN RAISE EXCEPTION 'postcheck: anon retains IoT table access'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') AND (
    has_table_privilege('authenticated','public.iot_command_lifecycles','SELECT') OR
    has_table_privilege('authenticated','public.iot_command_lifecycles','INSERT') OR
    has_table_privilege('authenticated','public.iot_inbound_events','SELECT') OR
    has_table_privilege('authenticated','public.iot_inbound_events','INSERT')
  ) THEN RAISE EXCEPTION 'postcheck: authenticated retains IoT table access'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_enrollments'::regclass AND conname='learning_enrollments_course_id_learner_user_id_classroom_id_key' AND contype='u') THEN
    RAISE EXCEPTION 'postcheck: enrollment unique constraint is absent';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_enrollments'::regclass AND conname='learning_enrollments_course_id_learner_user_id_key') THEN
    RAISE EXCEPTION 'postcheck: legacy enrollment unique constraint remains';
  END IF;
  IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name IN (
    '20261104_curriculum_foundation','20261105_question_bank_foundation','20261106_question_bank_quiz_attempt',
    '20261106_classroom_enrollment_lifecycle','20261106_iot_lifecycle_foundation','20261106_iot_publish_intent',
    '20261108_iot_lifecycle_access_restrictions'
  )) THEN RAISE EXCEPTION 'postcheck: custom release unexpectedly changed Prisma migration history'; END IF;
END
$$;

SELECT version, checksum, release_id, source_commit, operator_id, provenance, applied_at
FROM public.vista_schema_migrations
WHERE version IN ('20261104_curriculum_foundation','20261105_question_bank_foundation','20261106_question_bank_quiz_attempt','20261106_classroom_enrollment_lifecycle','20261106_iot_lifecycle_foundation','20261106_iot_publish_intent','20261108_iot_lifecycle_access_restrictions')
ORDER BY version;

SELECT table_name, relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN information_schema.tables t ON t.table_schema=n.nspname AND t.table_name=c.relname
WHERE n.nspname='public' AND t.table_name IN ('learning_sections','learning_activities','learning_activity_objectives','learning_questions','learning_question_versions','learning_question_version_objectives','learning_assignment_question_versions','learning_quiz_attempt_grading','iot_command_lifecycles','iot_inbound_events')
ORDER BY table_name;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('iot_command_lifecycles','iot_inbound_events','learning_quiz_attempt_grading')
  AND grantee IN ('anon','authenticated')
ORDER BY grantee, table_name, privilege_type;

SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('learning_activity_progress','learning_enrollments','iot_command_lifecycles','iot_inbound_events')
ORDER BY table_name, conname;

ROLLBACK;
