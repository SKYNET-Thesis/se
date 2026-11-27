-- Migration T (STAGED, PROPOSAL — owner approval required; not in the release manifest): rubric achievement-level descriptors and the chosen level.
-- Source: VISTA_Assessment_Rubrics.docx v0.1. Additive, nullable, idempotent. No data is rewritten and no historical grade changes meaning.
--   learning_rubric_criteria.descriptors  jsonb  NULL  -- exactly four strings, descriptor for level 4, 3, 2, 1 (in that order); NULL = legacy direct-point criterion
--   learning_assessment_scores.level      smallint NULL -- 0..4 chosen level; NULL = direct-point score (legacy or entered as points)
-- Weight is NOT stored: w = max_points / 4, points = level × w (the existing `max_points` / `awarded_points` columns stay authoritative for every total).
-- Compatibility: an API that does not know the columns ignores them (SELECT lists are explicit; INSERTs do not name them), so T can be applied before or after
-- the API that reads/writes them. Depends on: the Lab Session / assessment tables only (no S dependency).
-- Rollback (loses only descriptors and recorded levels; points stay):
--   ALTER TABLE public.learning_assessment_scores DROP CONSTRAINT IF EXISTS learning_assessment_scores_level_range;
--   ALTER TABLE public.learning_assessment_scores DROP COLUMN IF EXISTS level;
--   ALTER TABLE public.learning_rubric_criteria DROP CONSTRAINT IF EXISTS learning_rubric_criteria_descriptors_shape;
--   ALTER TABLE public.learning_rubric_criteria DROP COLUMN IF EXISTS descriptors;
DO $$
BEGIN
  IF to_regclass('public.learning_rubric_criteria') IS NULL OR to_regclass('public.learning_assessment_scores') IS NULL THEN
    RAISE EXCEPTION 'learning_rubric_criteria and learning_assessment_scores are required';
  END IF;
END $$;

ALTER TABLE public.learning_rubric_criteria ADD COLUMN IF NOT EXISTS descriptors jsonb;
ALTER TABLE public.learning_assessment_scores ADD COLUMN IF NOT EXISTS level smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_rubric_criteria_descriptors_shape') THEN
    ALTER TABLE public.learning_rubric_criteria ADD CONSTRAINT learning_rubric_criteria_descriptors_shape
      CHECK (descriptors IS NULL OR (jsonb_typeof(descriptors) = 'array' AND jsonb_array_length(descriptors) = 4));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_assessment_scores_level_range') THEN
    ALTER TABLE public.learning_assessment_scores ADD CONSTRAINT learning_assessment_scores_level_range
      CHECK (level IS NULL OR level BETWEEN 0 AND 4);
  END IF;
END $$;
