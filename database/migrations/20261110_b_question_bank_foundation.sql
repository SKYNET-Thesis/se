-- Additive Question Bank foundation. Course 1 inline quiz and attempts are untouched.
-- The SQL release runner wraps this file in its own transaction.
CREATE TABLE public.learning_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  code text NOT NULL,
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE RESTRICT,
  domain text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_questions_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT learning_questions_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 80)
);
CREATE INDEX learning_questions_course_id_lesson_id_idx ON public.learning_questions(course_id, lesson_id);
CREATE INDEX learning_questions_organization_id_lesson_id_idx ON public.learning_questions(organization_id, lesson_id);
ALTER TABLE public.learning_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.learning_question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.learning_questions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  type text NOT NULL CHECK (type IN ('single_choice','multiple_choice','true_false')),
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  cognitive_level text NOT NULL CHECK (cognitive_level IN ('remember','understand','apply','analyze','evaluate','create')),
  stem text NOT NULL CHECK (length(btrim(stem)) > 0),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  answer_key jsonb NOT NULL CHECK (jsonb_typeof(answer_key) = 'array'),
  explanation text,
  source_reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','archived')),
  authored_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  published_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_question_versions_question_id_version_number_key UNIQUE (question_id, version_number)
);
CREATE INDEX learning_question_versions_question_id_status_idx ON public.learning_question_versions(question_id, status);
ALTER TABLE public.learning_question_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.learning_question_version_objectives (
  question_version_id uuid NOT NULL REFERENCES public.learning_question_versions(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL REFERENCES public.learning_objectives(id) ON DELETE RESTRICT,
  PRIMARY KEY (question_version_id, objective_id)
);
CREATE INDEX learning_question_version_objectives_objective_id_idx ON public.learning_question_version_objectives(objective_id);
ALTER TABLE public.learning_question_version_objectives ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.learning_assignment_question_versions (
  assignment_id uuid NOT NULL REFERENCES public.learning_assignments(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.learning_questions(id) ON DELETE RESTRICT,
  question_version_id uuid NOT NULL REFERENCES public.learning_question_versions(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  points numeric(7,2) NOT NULL CHECK (points > 0),
  PRIMARY KEY (assignment_id, question_version_id),
  CONSTRAINT learning_assignment_question_identity_key UNIQUE (assignment_id, question_id),
  CONSTRAINT learning_assignment_question_versions_assignment_id_ordinal_key UNIQUE (assignment_id, ordinal) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX learning_assignment_question_versions_question_version_id_idx ON public.learning_assignment_question_versions(question_version_id);
ALTER TABLE public.learning_assignment_question_versions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.check_learning_question_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.course_id,NEW.lesson_id,NEW.code) IS DISTINCT FROM
      (OLD.organization_id,OLD.course_id,OLD.lesson_id,OLD.code) AND
      EXISTS (SELECT 1 FROM public.learning_question_versions WHERE question_id=OLD.id) THEN
    RAISE EXCEPTION 'Versioned question identity and scope are immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_lessons l JOIN public.learning_courses c ON c.id=l.course_id
    WHERE l.id=NEW.lesson_id AND c.id=NEW.course_id AND c.organization_id=NEW.organization_id) THEN
    RAISE EXCEPTION 'Question lesson, course and organization must match' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_learning_question_scope BEFORE INSERT OR UPDATE ON public.learning_questions
  FOR EACH ROW EXECUTE FUNCTION public.check_learning_question_scope();

CREATE FUNCTION public.check_learning_question_objective() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.learning_question_versions v
    JOIN public.learning_questions q ON q.id=v.question_id JOIN public.learning_objectives o ON o.id=NEW.objective_id
    JOIN public.learning_lessons l ON l.id=o.lesson_id JOIN public.learning_courses c ON c.id=l.course_id
    WHERE v.id=NEW.question_version_id AND o.lesson_id=q.lesson_id AND c.organization_id=q.organization_id) THEN
    RAISE EXCEPTION 'Question objective must belong to the question lesson and organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_learning_question_objective BEFORE INSERT OR UPDATE ON public.learning_question_version_objectives
  FOR EACH ROW EXECUTE FUNCTION public.check_learning_question_objective();

CREATE FUNCTION public.guard_learning_question_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Question version deletion is not allowed' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('published','archived') THEN
    IF OLD.status='published' AND NEW.status='archived' AND
       (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Published and archived question versions are immutable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_assignment_question_versions a WHERE a.question_version_id=OLD.id) THEN
    RAISE EXCEPTION 'Assigned question versions are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.status='published' AND (
      OLD.status <> 'in_review' OR length(btrim(COALESCE(NEW.explanation,'')))=0 OR
      NOT EXISTS (SELECT 1 FROM public.learning_question_version_objectives WHERE question_version_id=OLD.id)
    ) THEN RAISE EXCEPTION 'Publication requires review, explanation and Learning Outcome' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_learning_question_version BEFORE UPDATE OR DELETE ON public.learning_question_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_learning_question_version();

CREATE FUNCTION public.guard_learning_question_objective() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
BEGIN
  target_id := CASE WHEN TG_OP='DELETE' THEN OLD.question_version_id ELSE NEW.question_version_id END;
  IF TG_OP='UPDATE' AND OLD.question_version_id <> NEW.question_version_id AND
     EXISTS (SELECT 1 FROM public.learning_question_versions WHERE id=OLD.question_version_id AND status <> 'draft') THEN
    RAISE EXCEPTION 'Published objective mapping is immutable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_question_versions WHERE id=target_id AND status <> 'draft') OR
     EXISTS (SELECT 1 FROM public.learning_assignment_question_versions WHERE question_version_id=target_id) THEN
    RAISE EXCEPTION 'Only unassigned draft objective mappings may change' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_learning_question_objective BEFORE INSERT OR UPDATE OR DELETE ON public.learning_question_version_objectives
  FOR EACH ROW EXECUTE FUNCTION public.guard_learning_question_objective();

CREATE FUNCTION public.guard_learning_assignment_question() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid uuid;
BEGIN
  aid := CASE WHEN TG_OP='DELETE' THEN OLD.assignment_id ELSE NEW.assignment_id END;
  PERFORM 1 FROM public.learning_assignments WHERE id=aid FOR UPDATE;
  IF TG_OP='UPDATE' AND (OLD.assignment_id,OLD.question_id,OLD.question_version_id) IS DISTINCT FROM
      (NEW.assignment_id,NEW.question_id,NEW.question_version_id) THEN
    RAISE EXCEPTION 'Assignment question identity and pinned version are immutable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_classroom_assignments ca WHERE ca.assignment_id=aid AND ca.status <> 'draft') OR
     EXISTS (SELECT 1 FROM public.learning_assignment_attempts att JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id WHERE ca.assignment_id=aid) THEN
    RAISE EXCEPTION 'Delivered assignment question versions are pinned' USING ERRCODE='23514';
  END IF;
  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.learning_assignments a JOIN public.learning_question_versions v ON v.id=NEW.question_version_id
    JOIN public.learning_questions q ON q.id=v.question_id
    WHERE a.id=NEW.assignment_id AND q.id=NEW.question_id AND q.lesson_id=a.lesson_id
      AND (TG_OP='UPDATE' OR v.status='published')
      AND EXISTS (SELECT 1 FROM public.learning_question_version_objectives o WHERE o.question_version_id=v.id)
  ) THEN RAISE EXCEPTION 'Assignment requires a published version with matching lesson outcomes' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_learning_assignment_question BEFORE INSERT OR UPDATE OR DELETE ON public.learning_assignment_question_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_learning_assignment_question();

CREATE FUNCTION public.lock_learning_assignment_questions_on_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.learning_assignments WHERE id=NEW.assignment_id FOR UPDATE;
  RETURN NEW;
END $$;
CREATE TRIGGER lock_learning_assignment_questions_on_delivery BEFORE INSERT OR UPDATE OF status ON public.learning_classroom_assignments
  FOR EACH ROW EXECUTE FUNCTION public.lock_learning_assignment_questions_on_delivery();

CREATE FUNCTION public.lock_learning_assignment_questions_on_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.learning_assignments a JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id
    WHERE ca.id=NEW.classroom_assignment_id FOR UPDATE OF a;
  RETURN NEW;
END $$;
CREATE TRIGGER lock_learning_assignment_questions_on_attempt BEFORE INSERT ON public.learning_assignment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.lock_learning_assignment_questions_on_attempt();
