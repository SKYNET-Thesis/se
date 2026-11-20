-- Rollback for release scope O-P (WF-01 permission + LMS academic metadata). NOT executed by the release runner; needs its own approval.
-- A normal rollback does NOT need this: roll the API image back and leave the additive columns in place (older code ignores them).
-- Run only after the API that reads the columns is no longer running AND no school has used the new features:
--   courses with tags/prerequisites, assignments with academic settings, classrooms open for self-enrollment must all be 0.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.learning_courses WHERE cardinality(tags) > 0 OR cardinality(prerequisite_course_ids) > 0) THEN
    RAISE EXCEPTION 'courses already carry tags or prerequisites; export them before dropping the columns';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_assignments WHERE difficulty IS NOT NULL OR assignment_type IS NOT NULL OR pass_score IS NOT NULL OR grading_method IS NOT NULL OR jsonb_array_length(learning_objectives) > 0) THEN
    RAISE EXCEPTION 'assignments already carry academic settings; export them before dropping the columns';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_classrooms WHERE self_enrollment_open) THEN
    RAISE EXCEPTION 'classrooms are open for self-enrollment; close them first';
  END IF;
END $$;
ALTER TABLE public.learning_courses DROP CONSTRAINT IF EXISTS learning_courses_tags_limit;
ALTER TABLE public.learning_assignments DROP CONSTRAINT IF EXISTS learning_assignments_academic_values;
DROP INDEX IF EXISTS public.idx_learning_courses_tags;
ALTER TABLE public.learning_courses DROP COLUMN IF EXISTS tags, DROP COLUMN IF EXISTS prerequisite_course_ids;
ALTER TABLE public.learning_assignments DROP COLUMN IF EXISTS difficulty, DROP COLUMN IF EXISTS assignment_type, DROP COLUMN IF EXISTS pass_score,
  DROP COLUMN IF EXISTS grading_method, DROP COLUMN IF EXISTS learning_objectives;
ALTER TABLE public.learning_classrooms DROP COLUMN IF EXISTS self_enrollment_open;
-- The three learning_levels rows are canonical reference data and are left in place. The WF-01 permission grant (migration O) is left in place too:
-- it is only meaningful together with the WF-01 code; revoke it explicitly only if that code is removed.
DELETE FROM public.vista_schema_migrations WHERE version IN ('20261119_p_course_level_tags_prerequisites_assignment_difficulty', '20261119_o_wf01_robot_allocation_permission');
COMMIT;
