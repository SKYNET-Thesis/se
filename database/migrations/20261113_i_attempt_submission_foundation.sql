-- D03 Stage 1: additive foundation for attempt-based student submissions.
--
-- Safe to apply while the previous API is still running: it only ADDS nullable/defaulted columns, new tables
-- and indexes. It does NOT drop or change the legacy UNIQUE (assignment_id, learner_user_id) constraint, does
-- not delete or rewrite any submission, assessment, feedback, reflection, experiment or evaluation row, and
-- the only existing rows it touches are learning_submissions.attempt_id (NULL -> uuid, unambiguous matches
-- only) and learning_assignment_attempts.grading_released_* for already auto-graded quizzes.
-- Stage 2 (database/staged-migrations/20261114_j_one_submission_per_attempt.sql) is a separate release.

-- 1. One submission per attempt (identity only; the legacy uniqueness is still in force).
ALTER TABLE public.learning_submissions
  ADD COLUMN attempt_id uuid REFERENCES public.learning_assignment_attempts(id) ON DELETE CASCADE,
  ADD COLUMN origin text NOT NULL DEFAULT 'original';
ALTER TABLE public.learning_submissions
  ADD CONSTRAINT learning_submissions_origin_check CHECK (origin IN ('original','reconstructed'));
CREATE UNIQUE INDEX learning_submissions_attempt_id_key
  ON public.learning_submissions(attempt_id) WHERE attempt_id IS NOT NULL;

-- 2. Attempt-level quiz draft and grading release.
ALTER TABLE public.learning_assignment_attempts
  ADD COLUMN draft_response jsonb,
  ADD COLUMN draft_saved_at timestamptz,
  ADD COLUMN grading_released_at timestamptz,
  ADD COLUMN grading_released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN grading_release_origin text;
ALTER TABLE public.learning_assignment_attempts
  ADD CONSTRAINT learning_assignment_attempts_draft_size CHECK (draft_response IS NULL OR pg_column_size(draft_response) <= 65536),
  ADD CONSTRAINT learning_assignment_attempts_release_origin CHECK (
    (grading_released_at IS NULL AND grading_release_origin IS NULL)
    OR (grading_released_at IS NOT NULL AND COALESCE(grading_release_origin IN ('instructor','system_auto','legacy_visible'), false)));

-- Auto-graded Question Bank quizzes are released by the system at evaluation time (released_by stays NULL).
-- Backfill preserves what students can already see: their existing evaluated quiz results.
UPDATE public.learning_assignment_attempts
   SET grading_released_at = COALESCE(submitted_at, started_at), grading_release_origin = 'system_auto'
 WHERE status = 'evaluated' AND grading_released_at IS NULL
   AND workspace_snapshot->>'kind' = 'question_bank_quiz';

-- 3. Attempt-linked student attachments (private Learning Media bucket, submissions/ prefix).
CREATE TABLE public.learning_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.learning_assignment_attempts(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.learning_assignments(id) ON DELETE CASCADE,
  learner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  removed_at timestamptz,
  CONSTRAINT learning_submission_files_filename_length CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  CONSTRAINT learning_submission_files_mime_type CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png','image/jpeg','image/webp'
  )),
  CONSTRAINT learning_submission_files_size_bytes CHECK (size_bytes BETWEEN 1 AND 26214400),
  CONSTRAINT learning_submission_files_status CHECK (status IN ('pending','ready','failed','removed')),
  CONSTRAINT learning_submission_files_object_scope CHECK (
    object_key LIKE ('learning-media/submissions/' || assignment_id::text || '/' || learner_user_id::text || '/' || attempt_id::text || '/%')
  )
);
CREATE INDEX learning_submission_files_attempt_idx ON public.learning_submission_files(attempt_id, status);
CREATE INDEX learning_submission_files_status_created_idx ON public.learning_submission_files(status, created_at);
ALTER TABLE public.learning_submission_files ENABLE ROW LEVEL SECURITY;

-- Files belong to an attempt and may only change while that attempt is still in progress. Once the attempt is
-- submitted, evaluated or abandoned its attachment set is frozen (the key/owner columns never change at all).
CREATE FUNCTION public.guard_learning_submission_files()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_row record;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.attempt_id, NEW.assignment_id, NEW.learner_user_id, NEW.object_key, NEW.original_filename, NEW.mime_type, NEW.size_bytes)
     IS DISTINCT FROM (OLD.attempt_id, OLD.assignment_id, OLD.learner_user_id, OLD.object_key, OLD.original_filename, OLD.mime_type, OLD.size_bytes) THEN
    RAISE EXCEPTION 'learning_submission_files identity columns are immutable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT learner_user_id, status INTO attempt_row FROM public.learning_assignment_attempts WHERE id = NEW.attempt_id;
  IF NOT FOUND OR attempt_row.learner_user_id <> NEW.learner_user_id THEN
    RAISE EXCEPTION 'attachment owner does not match the attempt owner' USING ERRCODE = 'check_violation';
  END IF;
  IF attempt_row.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attachments are frozen once the attempt is no longer in progress' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_learning_submission_files
  BEFORE INSERT OR UPDATE ON public.learning_submission_files
  FOR EACH ROW EXECUTE FUNCTION public.guard_learning_submission_files();

-- 4. Backfill audit (review evidence; no application path reads it).
CREATE TABLE public.learning_submission_backfill_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  submission_id uuid,
  attempt_id uuid,
  classification text NOT NULL,
  grading_attribution_uncertain boolean NOT NULL DEFAULT false,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_submission_backfill_audit_classification CHECK (classification IN
    ('mapped','unmapped_no_attempt','ambiguous_multiple_attempts','reconstructed','reconstruction_skipped','legacy_grading_released','legacy_grading_withheld_uncertain')),
  CONSTRAINT learning_submission_backfill_audit_stage CHECK (stage IN ('stage1','stage2'))
);
CREATE UNIQUE INDEX learning_submission_backfill_audit_once_idx
  ON public.learning_submission_backfill_audit(stage, classification, COALESCE(submission_id, attempt_id));
ALTER TABLE public.learning_submission_backfill_audit ENABLE ROW LEVEL SECURITY;

-- 5. Safe backfill of learning_submissions.attempt_id (idempotent).
-- A submission is mapped only when exactly ONE attempt of the same learner, in a classroom delivery of the same
-- assignment, owns the submission's program. Everything else keeps attempt_id NULL and is audited.
CREATE TEMP TABLE d03_submission_candidates ON COMMIT DROP AS
SELECT s.id AS submission_id,
       (SELECT count(*)::int FROM public.learning_assignment_attempts a
          JOIN public.learning_classroom_assignments ca ON ca.id = a.classroom_assignment_id
         WHERE a.learner_user_id = s.learner_user_id AND a.program_id = s.program_id
           AND ca.assignment_id = s.assignment_id) AS match_count,
       (SELECT min(a.id::text)::uuid FROM public.learning_assignment_attempts a
          JOIN public.learning_classroom_assignments ca ON ca.id = a.classroom_assignment_id
         WHERE a.learner_user_id = s.learner_user_id AND a.program_id = s.program_id
           AND ca.assignment_id = s.assignment_id) AS attempt_id,
       -- Earlier submitted attempts of the same learner and assignment whose own submission row was overwritten
       -- by the legacy UPSERT: any grading attached to this row may belong to one of them.
       (SELECT count(*)::int FROM public.learning_assignment_attempts other
          JOIN public.learning_classroom_assignments oca ON oca.id = other.classroom_assignment_id
         WHERE other.learner_user_id = s.learner_user_id AND oca.assignment_id = s.assignment_id
           AND other.status IN ('submitted','evaluated') AND other.program_id IS DISTINCT FROM s.program_id) AS other_submitted_attempts,
       (EXISTS (SELECT 1 FROM public.learning_assessments x WHERE x.submission_id = s.id)
         OR EXISTS (SELECT 1 FROM public.learning_feedback f WHERE f.submission_id = s.id)
         OR EXISTS (SELECT 1 FROM public.learning_reflections r WHERE r.submission_id = s.id)) AS has_dependents
  FROM public.learning_submissions s
 WHERE s.attempt_id IS NULL AND s.program_id IS NOT NULL;

INSERT INTO public.learning_submission_backfill_audit(stage, submission_id, attempt_id, classification, grading_attribution_uncertain, detail)
SELECT 'stage1', c.submission_id,
       CASE WHEN c.match_count = 1 THEN c.attempt_id END,
       CASE WHEN c.match_count = 1 THEN 'mapped'
            WHEN c.match_count = 0 THEN 'unmapped_no_attempt'
            ELSE 'ambiguous_multiple_attempts' END,
       (c.has_dependents AND c.other_submitted_attempts > 0),
       jsonb_build_object('matchCount', c.match_count, 'otherSubmittedAttempts', c.other_submitted_attempts, 'hasDependents', c.has_dependents)
  FROM d03_submission_candidates c
ON CONFLICT DO NOTHING;

-- Rows that have no program at all cannot be mapped either; record them so nothing is silently skipped.
INSERT INTO public.learning_submission_backfill_audit(stage, submission_id, classification, detail)
SELECT 'stage1', s.id, 'unmapped_no_attempt', jsonb_build_object('reason', 'submission has no program_id')
  FROM public.learning_submissions s
 WHERE s.attempt_id IS NULL AND s.program_id IS NULL
ON CONFLICT DO NOTHING;

UPDATE public.learning_submissions s
   SET attempt_id = c.attempt_id
  FROM d03_submission_candidates c
 WHERE s.id = c.submission_id AND c.match_count = 1 AND s.attempt_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.learning_submissions taken WHERE taken.attempt_id = c.attempt_id);
