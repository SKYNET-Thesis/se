import hashlib
import tempfile
import unittest
from pathlib import Path

from scripts.verify_schema_baseline import verify_baseline


SAMPLE = """-- schema fixture
CREATE TABLE public.users (
  id uuid NOT NULL,
  display_name text,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE INDEX users_display_name_idx ON public.users USING btree (display_name);
CREATE SEQUENCE public.users_seq;
CREATE TYPE public.user_state AS ENUM ('active', 'closed');
CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  INSERT INTO public.audit_log VALUES (NEW.id);
  RETURN NEW;
END;
$body$;
CREATE TRIGGER users_touch BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch();
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_read ON public.users USING (true);
GRANT SELECT ON public.users TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
"""


class BaselineVerifierTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "baseline.sql"

    def tearDown(self):
        self.temp.cleanup()

    def verify(self, sql=SAMPLE, expected_sha=None, expected_size=None):
        self.path.write_text(sql)
        data = self.path.read_bytes()
        return verify_baseline(
            self.path,
            expected_sha256=expected_sha or hashlib.sha256(data).hexdigest(),
            expected_size=expected_size if expected_size is not None else len(data),
        )

    def test_schema_only_dump_passes_and_counts_expected_objects(self):
        result = self.verify()
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["counts"]["tables"], 1)
        self.assertEqual(result["counts"]["columns"], 2)
        self.assertEqual(result["counts"]["functions"], 1)
        self.assertEqual(result["counts"]["types"], 1)
        self.assertEqual(result["counts"]["policies"], 1)

    def test_copy_data_and_top_level_insert_are_rejected(self):
        sql = SAMPLE + "COPY public.users (id) FROM stdin;\n00000000-0000-0000-0000-000000000001\n\\.\n"
        self.assertTrue(any("data" in error.lower() for error in self.verify(sql)["errors"]))
        sql = SAMPLE + "INSERT INTO public.users VALUES ('00000000-0000-0000-0000-000000000001');\n"
        self.assertTrue(any("data" in error.lower() for error in self.verify(sql)["errors"]))

    def test_dml_inside_function_body_is_not_mistaken_for_dumped_rows(self):
        self.assertEqual(self.verify()["errors"], [])

    def test_credentials_are_rejected_without_echoing_secret(self):
        secret = "postgresql://vista:very-secret-value@example.invalid/db"
        result = self.verify(SAMPLE + f"-- {secret}\n")
        self.assertTrue(any("database uri" in error.lower() for error in result["errors"]))
        self.assertNotIn("very-secret-value", " ".join(result["errors"]))

    def test_hash_and_size_mismatch_are_rejected(self):
        result = self.verify(expected_sha="0" * 64, expected_size=1)
        self.assertTrue(any("sha-256" in error.lower() for error in result["errors"]))
        self.assertTrue(any("size" in error.lower() for error in result["errors"]))


if __name__ == "__main__":
    unittest.main()
