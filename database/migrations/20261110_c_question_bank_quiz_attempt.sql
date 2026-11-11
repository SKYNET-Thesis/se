-- Existing attempt row keeps public questions/results; private answer keys use a locked 1:1 table.
-- The SQL release runner wraps this file in its own transaction.
CREATE TABLE public.learning_quiz_attempt_grading (
  attempt_id uuid PRIMARY KEY REFERENCES public.learning_assignment_attempts(id) ON DELETE RESTRICT,
  grading_snapshot jsonb NOT NULL CHECK (jsonb_typeof(grading_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_quiz_attempt_grading ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_quiz_attempt_grading FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON public.learning_quiz_attempt_grading FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.learning_quiz_attempt_grading FROM authenticated';
  END IF;
END $$;

CREATE FUNCTION public.guard_question_bank_quiz_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.workspace_snapshot->>'kind'='question_bank_quiz' AND
     NEW.workspace_snapshot IS DISTINCT FROM OLD.workspace_snapshot THEN
    RAISE EXCEPTION 'Issued quiz questions are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_question_bank_quiz_snapshot BEFORE UPDATE ON public.learning_assignment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_question_bank_quiz_snapshot();

CREATE FUNCTION public.guard_question_bank_quiz_grading() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Issued quiz answer keys are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER guard_question_bank_quiz_grading BEFORE UPDATE OR DELETE ON public.learning_quiz_attempt_grading
  FOR EACH ROW EXECUTE FUNCTION public.guard_question_bank_quiz_grading();
