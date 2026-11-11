-- Review-only SQL release migration G: restore the activity-progress scope guard declared by migration A.
--
-- Migration A declared check_learning_activity_progress_scope() and a trigger that rejects a progress row whose
-- activity_definition_id does not belong to the row's lesson. The verified 2026-11-09 Production baseline
-- contains neither object (every other object declared by A/B/C is present). This migration adds them
-- with the same definition as migration A; it does not edit migration A.
--
-- Properties:
--   * additive and replay-safe: CREATE OR REPLACE FUNCTION, then DROP TRIGGER IF EXISTS + CREATE TRIGGER;
--   * validates only future INSERT/UPDATE of (activity_definition_id, lesson_id); existing rows are not
--     scanned, rewritten or rejected, so it cannot fail on existing Production data;
--   * the backend already derives lesson_id from the activity's own section in the same statement
--     (activity-progress.service.ts), so no current write path is affected. The guard protects direct SQL
--     and future code paths.
--
-- NOT applied to Production. Apply only through scripts/sql_migration_runner.py after release approval.

CREATE OR REPLACE FUNCTION public.check_learning_activity_progress_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.activity_definition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.learning_activities a
    JOIN public.learning_sections s ON s.id=a.section_id
    WHERE a.id=NEW.activity_definition_id AND s.lesson_id=NEW.lesson_id
  ) THEN
    RAISE EXCEPTION 'Activity progress definition must belong to its lesson' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS check_learning_activity_progress_scope ON public.learning_activity_progress;
CREATE TRIGGER check_learning_activity_progress_scope
  BEFORE INSERT OR UPDATE OF activity_definition_id, lesson_id ON public.learning_activity_progress
  FOR EACH ROW EXECUTE FUNCTION public.check_learning_activity_progress_scope();
