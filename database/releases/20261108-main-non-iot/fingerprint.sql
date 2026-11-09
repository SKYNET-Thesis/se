-- Canonical fingerprint of the release-relevant pre-migration catalog.
SELECT md5(string_agg(item, E'\n' ORDER BY item))
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
