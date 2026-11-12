-- Review-only SQL release migration H: allow MP3 (audio/mpeg) in Learning Media.
--
-- Migration E created public.learning_media_assets with a MIME allowlist CHECK that has no audio type. Course Builder (D02)
-- accepts MP3 course audio, so the allowlist must also contain 'audio/mpeg'. This migration does not edit migration E.
--
-- Properties:
--   * forward-only and additive: the new allowlist is the previous nine values, unchanged, plus 'audio/mpeg';
--   * one ALTER TABLE statement, so the drop and the re-add are a single atomic step under the runner's transaction;
--   * safe for existing rows: every existing row already satisfies a superset of its old constraint, so adding the
--     constraint cannot reject data; no row is read for rewriting, updated, or deleted;
--   * replay-safe: DROP CONSTRAINT IF EXISTS makes a second execution a no-op with the same final definition;
--   * no other constraint, index, grant or RLS setting on the table is touched (object_scope already covers audio/);
--   * requires migration E (the table must exist), which the manifest orders before this one.
--
-- NOT applied to Production. Apply only through scripts/sql_migration_runner.py after release approval.

ALTER TABLE public.learning_media_assets
  DROP CONSTRAINT IF EXISTS learning_media_assets_mime_type,
  ADD CONSTRAINT learning_media_assets_mime_type CHECK (mime_type IN (
    'video/mp4','video/webm','video/quicktime','application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png','image/jpeg','image/webp',
    'audio/mpeg'
  ));
