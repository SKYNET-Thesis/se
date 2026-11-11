-- Review-only SQL release migration F: Question Bank scope for global (organization-less) courses.
--
-- Global canonical courses have learning_courses.organization_id = NULL. Their Question Bank
-- questions must carry the same scope, otherwise a System Administrator cannot author quizzes
-- for a global course. This migration is additive and replay-safe:
--   * DROP NOT NULL is a metadata-only change and is a no-op when already nullable;
--   * the partial unique index uses IF NOT EXISTS;
--   * CREATE OR REPLACE FUNCTION rewrites only the two scope guards created by migration B,
--     keeping every existing rule and comparing organization scope NULL-safely.
--
-- Dependencies: the learning_questions table, triggers and guard functions from migration B
-- (already present in the verified 2026-11-09 Production baseline under their historical
-- version). It does not depend on D or E. Existing rows are untouched: every existing question
-- keeps its non-null organization_id and its (organization_id, code) uniqueness.
--
-- NOT applied to Production. Apply only through scripts/sql_migration_runner.py after release
-- approval and registration in manifest.json.

ALTER TABLE public.learning_questions
  ALTER COLUMN organization_id DROP NOT NULL;

-- (organization_id, code) does not constrain NULLs, so global codes are unique per course.
CREATE UNIQUE INDEX IF NOT EXISTS learning_questions_global_course_code_key
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
