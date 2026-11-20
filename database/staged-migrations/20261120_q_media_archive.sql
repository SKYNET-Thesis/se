-- Staged migration Q: Learning Media archive / restore (soft state; nothing is ever deleted).
-- NOT part of the release manifest and NOT approved for Production. Additive and idempotent: three nullable columns, one CHECK, one partial index.
-- Depends on: 20261110_e_learning_media applied. The runtime role already holds table-level SELECT/INSERT/UPDATE on learning_media_assets (migration L).
-- Rollback (only after the API build that reads these columns no longer runs; archived files stay in the bucket either way):
--   DROP INDEX IF EXISTS public.learning_media_assets_active_course_idx;
--   ALTER TABLE public.learning_media_assets DROP CONSTRAINT IF EXISTS learning_media_assets_archive_state,
--     DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS archived_by_user_id, DROP COLUMN IF EXISTS archive_reason;
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.learning_media_assets') IS NULL THEN
    RAISE EXCEPTION 'learning_media_assets is missing; apply migration E first';
  END IF;
END $$;

ALTER TABLE public.learning_media_assets
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by_user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS archive_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_media_assets_archive_state' AND conrelid = 'public.learning_media_assets'::regclass) THEN
    ALTER TABLE public.learning_media_assets ADD CONSTRAINT learning_media_assets_archive_state CHECK (
      (archived_at IS NULL AND archived_by_user_id IS NULL AND archive_reason IS NULL)
      OR (archived_at IS NOT NULL AND (archive_reason IS NULL OR char_length(archive_reason) <= 500))
    );
  END IF;
END $$;

-- Library listings read the active (non-archived) files of one course.
CREATE INDEX IF NOT EXISTS learning_media_assets_active_course_idx
  ON public.learning_media_assets (course_id, created_at DESC) WHERE archived_at IS NULL;
COMMIT;
