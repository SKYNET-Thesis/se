-- LMS academic metadata (additive, idempotent, no new tables so the migration-L runtime allowlist and grants are unchanged).
--  * canonical BEGINNER / INTERMEDIATE / ADVANCED rows in the existing learning_levels table (courses already reference it);
--  * learning_courses: normalized tags and course-level prerequisites (validated by the API; no data is back-filled);
--  * learning_assignments: its own difficulty (independent of the course level), type, pass score, grading method, objectives.
INSERT INTO public.learning_levels(code, title, description, ordinal) VALUES
  ('BEGINNER',     'Beginner',     'Foundations; no robot hardware or AI model required.', 1),
  ('INTERMEDIATE', 'Intermediate', 'Combines Blockly, programming and simulation.',        2),
  ('ADVANCED',     'Advanced',     'Simulation or Robot Lab; supports manual final assessment.', 3)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.learning_courses
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prerequisite_course_ids uuid[] NOT NULL DEFAULT '{}';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_courses_tags_limit') THEN
    ALTER TABLE public.learning_courses ADD CONSTRAINT learning_courses_tags_limit CHECK (cardinality(tags) <= 10 AND cardinality(prerequisite_course_ids) <= 5);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_learning_courses_tags ON public.learning_courses USING gin (tags);

ALTER TABLE public.learning_assignments
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS assignment_type text,
  ADD COLUMN IF NOT EXISTS pass_score numeric(6,2),
  ADD COLUMN IF NOT EXISTS grading_method text,
  ADD COLUMN IF NOT EXISTS learning_objectives jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_assignments_academic_values') THEN
    ALTER TABLE public.learning_assignments ADD CONSTRAINT learning_assignments_academic_values CHECK (
      (difficulty IS NULL OR difficulty IN ('BEGINNER','INTERMEDIATE','ADVANCED'))
      AND (assignment_type IS NULL OR assignment_type IN ('knowledge','quiz','blockly','simulation','robot_lab','manual_final'))
      AND (grading_method IS NULL OR grading_method IN ('automatic','manual','mixed'))
      AND (pass_score IS NULL OR pass_score >= 0)
      AND jsonb_typeof(learning_objectives) = 'array');
  END IF;
END $$;

-- Student self-enrollment is a classroom-level opt-in controlled by the school (default closed: rosters stay administrator-managed).
ALTER TABLE public.learning_classrooms ADD COLUMN IF NOT EXISTS self_enrollment_open boolean NOT NULL DEFAULT false;
