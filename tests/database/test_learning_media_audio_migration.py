"""Migration H (20261112_h_learning_media_audio_mpeg): allow audio/mpeg in the Learning Media MIME allowlist.

Static tests always run. The PostgreSQL test needs a disposable loopback ``vista_test_*`` database that was bootstrapped
(or is otherwise at migration E or later). It reuses ``VISTA_BOOTSTRAP_VERIFY_DATABASE_URL`` (already provided by the
database-bootstrap workflow, so the strict runner never sees it skipped) or ``VISTA_MIGRATION_TEST_DATABASE_URL``.
It runs inside one transaction that is always rolled back, so it works on a database that already has migration H and
leaves any database exactly as it found it.
"""

import os
import re
import subprocess
import unittest
from pathlib import Path
from urllib.parse import unquote

from scripts.bootstrap_dev_database import REQUIRED_OBJECTS, validate_dev_target
from scripts.sql_migration_runner import validate_transactional_sql

ROOT = Path(__file__).resolve().parents[2]
VERSION = "20261112_h_learning_media_audio_mpeg"
H_SQL = ROOT / "database/migrations" / f"{VERSION}.sql"
E_SQL = ROOT / "database/migrations/20261110_e_learning_media.sql"
MIME_VALUE = re.compile(r"'([^']+)'")


def _allowlist(sql: str) -> list[str]:
    """The quoted MIME values of the learning_media_assets_mime_type constraint, in order."""
    match = re.search(r"CONSTRAINT learning_media_assets_mime_type CHECK \(mime_type IN \((.*?)\)\)", sql, re.S)
    if not match:
        raise AssertionError("mime_type CHECK constraint not found")
    return MIME_VALUE.findall(match.group(1))


class AudioMigrationStaticTests(unittest.TestCase):
    def test_file_follows_the_version_and_ordering_conventions(self):
        self.assertTrue(H_SQL.is_file())
        self.assertRegex(VERSION, r"^\d{8}_[a-z0-9]+(?:_[a-z0-9]+)*$")
        existing = sorted(p.stem for p in (ROOT / "database/migrations").glob("*.sql"))
        self.assertEqual(existing[-1], VERSION, "migration H must sort after every existing migration")
        self.assertGreater(VERSION, "20261111_g_activity_progress_scope_guard")

    def test_runner_accepts_it_as_transactional_sql(self):
        validate_transactional_sql(H_SQL.read_text())

    def test_only_widens_the_allowlist_and_keeps_every_previous_value(self):
        before, after = _allowlist(E_SQL.read_text()), _allowlist(H_SQL.read_text())
        self.assertEqual(len(before), 9)
        self.assertEqual(after[:len(before)], before, "previously supported values must stay, unchanged and in order")
        self.assertEqual(after[len(before):], ["audio/mpeg"])
        self.assertEqual(len(after), len(set(after)))

    def test_touches_only_the_media_mime_constraint_and_never_data(self):
        code = "\n".join(line for line in H_SQL.read_text().splitlines() if not line.lstrip().startswith("--"))
        self.assertEqual(code.count("ALTER TABLE"), 1, "a single atomic statement")
        self.assertIn("ALTER TABLE public.learning_media_assets", code)
        self.assertIn("DROP CONSTRAINT IF EXISTS learning_media_assets_mime_type", code)
        for forbidden in ("DELETE", "UPDATE", "TRUNCATE", "DROP TABLE", "DROP COLUMN", "INSERT", "GRANT", "REVOKE", "DISABLE", "BEGIN", "COMMIT", "CREATE TABLE"):
            self.assertNotIn(forbidden, code.upper(), forbidden)
        self.assertEqual(len(re.findall(r"CONSTRAINT\s+\w+", code)), 2, "only the one named constraint is dropped and re-added")

    def test_bootstrap_verification_knows_how_to_check_it(self):
        entries = [row for row in REQUIRED_OBJECTS if row[2] == VERSION]
        self.assertEqual(len(entries), 1)
        self.assertIn("audio/mpeg", entries[0][1])


DATABASE_URL = os.environ.get("VISTA_MIGRATION_TEST_DATABASE_URL") or os.environ.get("VISTA_BOOTSTRAP_VERIFY_DATABASE_URL")


@unittest.skipUnless(DATABASE_URL, "requires a disposable loopback vista_test_* PostgreSQL database")
class AudioMigrationPostgresTests(unittest.TestCase):
    def test_widens_the_allowlist_without_touching_existing_rows_and_is_replay_safe(self):
        url = DATABASE_URL
        env = {**os.environ, "VISTA_DATABASE_PROJECT_REF": os.environ.get("VISTA_DATABASE_PROJECT_REF", "local-migration-test")}
        env.pop("SUPABASE_URL", None)
        (host, port, database, username, password, _query), _ref = validate_dev_target(url, env)  # loopback + vista_test_* only

        old_list = _allowlist(E_SQL.read_text())
        old_values = ", ".join(f"'{value}'" for value in old_list)
        h_sql = H_SQL.read_text()
        values = ", ".join(f"('{value}')" for value in old_list)
        script = f"""
BEGIN;
-- 1. pre-H state: the constraint exactly as migration E created it
ALTER TABLE public.learning_media_assets DROP CONSTRAINT IF EXISTS learning_media_assets_mime_type,
  ADD CONSTRAINT learning_media_assets_mime_type CHECK (mime_type IN ({old_values}));
-- 2. existing rows: one per previously supported type, across all three states
CREATE TEMP TABLE h_course AS SELECT gen_random_uuid() AS id;
INSERT INTO public.learning_courses(id, title, status) SELECT id, 'migration H probe', 'draft' FROM h_course;
INSERT INTO public.learning_media_assets(course_id, object_key, original_filename, mime_type, size_bytes, status)
  SELECT c.id, 'learning-media/courses/' || c.id || '/documents/' || gen_random_uuid() || '.bin', 'f' || v.n, v.mime, 1000 + v.n,
         (ARRAY['pending','ready','failed'])[1 + v.n % 3]
  FROM h_course c, (SELECT mime, row_number() OVER () AS n FROM (VALUES {values}) AS t(mime)) v;
CREATE TEMP TABLE h_before AS SELECT * FROM public.learning_media_assets WHERE course_id = (SELECT id FROM h_course);
DO $$ BEGIN
  IF (SELECT count(*) FROM h_before) <> {len(old_list)} THEN RAISE EXCEPTION 'fixture rows missing'; END IF;
  BEGIN
    INSERT INTO public.learning_media_assets(course_id, object_key, original_filename, mime_type, size_bytes)
      SELECT id, 'learning-media/courses/' || id || '/audio/' || gen_random_uuid() || '.mp3', 'x.mp3', 'audio/mpeg', 10 FROM h_course;
    RAISE EXCEPTION 'pre-H database unexpectedly accepted audio/mpeg';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
-- 3. apply migration H exactly as released
{h_sql}
-- 4. nothing changed for existing rows (same ids, keys, types, sizes, statuses, timestamps)
DO $$ BEGIN
  IF EXISTS (SELECT * FROM h_before EXCEPT SELECT * FROM public.learning_media_assets WHERE course_id = (SELECT id FROM h_course))
     OR EXISTS (SELECT * FROM public.learning_media_assets WHERE course_id = (SELECT id FROM h_course) EXCEPT SELECT * FROM h_before)
  THEN RAISE EXCEPTION 'migration H changed existing media rows'; END IF;
END $$;
-- 5. audio/mpeg is accepted now, previously supported values still are, everything else is still rejected
DO $$ DECLARE bad text; BEGIN
  INSERT INTO public.learning_media_assets(course_id, object_key, original_filename, mime_type, size_bytes)
    SELECT id, 'learning-media/courses/' || id || '/audio/' || gen_random_uuid() || '.mp3', 'x.mp3', 'audio/mpeg', 10 FROM h_course;
  FOREACH bad IN ARRAY ARRAY['audio/wav','audio/ogg','audio/mp3','AUDIO/MPEG','audio/mpeg ','text/html','application/x-msdownload','image/svg+xml','application/zip',''] LOOP
    BEGIN
      INSERT INTO public.learning_media_assets(course_id, object_key, original_filename, mime_type, size_bytes)
        SELECT id, 'learning-media/courses/' || id || '/documents/' || gen_random_uuid() || '.bin', 'bad', bad, 10 FROM h_course;
      RAISE EXCEPTION 'migration H accepted %', bad;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
END $$;
-- 6. replay: a second execution is harmless and ends with the same definition and rows
CREATE TEMP TABLE h_def AS SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.learning_media_assets'::regclass AND conname = 'learning_media_assets_mime_type';
{h_sql}
DO $$ BEGIN
  IF (SELECT def FROM h_def) <> (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.learning_media_assets'::regclass AND conname = 'learning_media_assets_mime_type')
  THEN RAISE EXCEPTION 'replay changed the constraint'; END IF;
  IF (SELECT count(*) FROM public.learning_media_assets WHERE course_id = (SELECT id FROM h_course)) <> {len(old_list) + 1}
  THEN RAISE EXCEPTION 'replay changed the row count'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.learning_media_assets'::regclass AND contype = 'c') <> 5
  THEN RAISE EXCEPTION 'unexpected number of CHECK constraints on learning_media_assets'; END IF;
END $$;
SELECT 'H_VERIFIED rows=' || count(*) || ' def_has_audio=' || ((SELECT def FROM h_def) LIKE '%''audio/mpeg''%') FROM public.learning_media_assets WHERE course_id = (SELECT id FROM h_course);
ROLLBACK;
"""
        result = subprocess.run(
            ["psql", "-X", "--no-psqlrc", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
             "-h", host, "-p", str(port), "-U", unquote(username), "-d", database, "-f", "-"],
            input=script, text=True, capture_output=True, env={**os.environ, "PGPASSWORD": unquote(password or ""), "PGSSLMODE": "disable"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"H_VERIFIED rows={len(old_list) + 1} def_has_audio=true", result.stdout)
        # the transaction was rolled back: no probe course or media rows remain
        leftover = subprocess.run(
            ["psql", "-X", "--no-psqlrc", "-q", "-t", "-A", "-h", host, "-p", str(port), "-U", unquote(username), "-d", database,
             "-c", "SELECT count(*) FROM public.learning_courses WHERE title = 'migration H probe'"],
            text=True, capture_output=True, env={**os.environ, "PGPASSWORD": unquote(password or ""), "PGSSLMODE": "disable"},
        )
        self.assertEqual(leftover.stdout.strip(), "0")


if __name__ == "__main__":
    unittest.main()
