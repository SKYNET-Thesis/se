-- Rollback of migration Q (Learning Media archive columns). NOT part of any release; run only by an approved operator AFTER the API build that
-- reads archived_at no longer runs. It REFUSES while any file is archived (that state would be lost). Archived files stay in the bucket either way.
-- Also remove the ledger row only through the approved release process; this script never edits vista_schema_migrations.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.learning_media_assets WHERE archived_at IS NOT NULL OR archived_by_user_id IS NOT NULL OR archive_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'refusing: some Learning Media files are archived; restore them first';
  END IF;
END $$;
DROP INDEX IF EXISTS public.learning_media_assets_active_course_idx;
ALTER TABLE public.learning_media_assets DROP CONSTRAINT IF EXISTS learning_media_assets_archive_state,
  DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS archived_by_user_id, DROP COLUMN IF EXISTS archive_reason;
COMMIT;
