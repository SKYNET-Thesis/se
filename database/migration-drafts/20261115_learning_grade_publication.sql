-- Draft (NOT registered in database/migrations/manifest.json; owner approval required before any shared/Production use).
--
-- Separates "saved grading" from "learner-visible publication":
--   learning_assessments.published_at IS NULL     -> draft, hidden from the learner
--   learning_assessments.published_at IS NOT NULL -> released to the learner
--
-- Historical semantics (verified against HEAD 29fa71a assessment.service.ts): before this
-- change, GET /me/submissions/:id returned the assessment for every existing row, i.e. every
-- assessment that exists at migration time was ALREADY learner-visible. The backfill therefore
-- marks exactly those pre-existing rows as published, at the time they were reviewed, so no
-- previously visible grade disappears. Rows created afterwards start as drafts (NULL).
--
-- Idempotent and safe to rerun: the backfill runs only in the statement that adds the column.
-- Once the column exists, a rerun changes nothing (it never publishes later drafts).
-- Rollback: redeploy the previous API (it ignores the column). Dropping the column loses the
-- draft/published distinction and is not recommended.
DO $$
BEGIN
  IF to_regclass('public.learning_assessments') IS NULL THEN
    RAISE EXCEPTION 'public.learning_assessments is missing; refusing to continue';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='learning_assessments' AND column_name='published_at'
  ) THEN
    ALTER TABLE public.learning_assessments ADD COLUMN published_at timestamptz;
    UPDATE public.learning_assessments
       SET published_at = COALESCE(reviewed_at, created_at, now())
     WHERE published_at IS NULL;
  END IF;
END
$$;
