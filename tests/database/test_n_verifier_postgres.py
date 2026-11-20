"""The scope-N postflight verifier against a real bootstrapped database (baseline + D-L + N): every check must pass, and each rule it enforces
(no backfill, exact column definitions, unchanged content) must actually fail when violated. Needs VISTA_BOOTSTRAP_VERIFY_DATABASE_URL (the strict
runner treats a skip as a failure). Every deliberate violation is reverted in `finally`."""
import json
import os
import subprocess
import unittest
from pathlib import Path

from scripts import verify_production_release_d_i as base
from scripts import verify_production_release_n as n

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("VISTA_BOOTSTRAP_VERIFY_DATABASE_URL")
TABLE = "public.education_school_user_profiles"


@unittest.skipUnless(URL, "requires a bootstrapped loopback vista_test_* database (D-L + N applied)")
class NVerifierOnBootstrappedDatabaseTests(unittest.TestCase):
    ORG = "f1180000-0000-4000-8000-0000000000a1"

    @classmethod
    def setUpClass(cls):
        sql = f"""INSERT INTO public.organizations(id,name,type,segment,status) VALUES ('{cls.ORG}','N verifier fixture','institution','education','active');
          INSERT INTO public.users(id,email,full_name,status,signup_method) VALUES
            ('f1180000-0000-4000-8000-0000000000b1','n-fixture-1@example.test','N Fixture 1','active','admin_created'),
            ('f1180000-0000-4000-8000-0000000000b2','n-fixture-2@example.test','N Fixture 2','active','admin_created');
          INSERT INTO {TABLE}(organization_id,user_id,person_type,student_code,grade_level,account_state) VALUES
            ('{cls.ORG}','f1180000-0000-4000-8000-0000000000b1','student','N-FIX-1','7','active'),
            ('{cls.ORG}','f1180000-0000-4000-8000-0000000000b2','student','N-FIX-2','8','active');"""
        subprocess.run(["psql", URL.split("?")[0], "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], check=True, capture_output=True, env={**{k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG")}, "PGSSLMODE": "disable"})

    @classmethod
    def tearDownClass(cls):
        sql = f"DELETE FROM {TABLE} WHERE organization_id='{cls.ORG}'; DELETE FROM public.users WHERE id IN ('f1180000-0000-4000-8000-0000000000b1','f1180000-0000-4000-8000-0000000000b2'); DELETE FROM public.organizations WHERE id='{cls.ORG}';"
        subprocess.run(["psql", URL.split("?")[0], "-X", "-q", "-c", sql], capture_output=True, env={**{k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG")}, "PGSSLMODE": "disable"})

    def psql(self, sql: str) -> None:
        done = subprocess.run(["psql", URL.split("?")[0], "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True,
                              env={**{k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG")}, "PGSSLMODE": "disable"})
        self.assertEqual(done.returncode, 0, done.stderr[:200])

    def pre(self) -> dict:
        snap = n.snapshot(URL)
        snap["ledger"] = [v for v in snap["ledger"] if v != n.VERSION]  # the state "before" the release, as far as the ledger is concerned
        return snap

    def failed(self, pre: dict) -> list[str]:
        return [name for name, ok, _ in n.verify(URL, pre, root=ROOT) if not ok]

    def test_every_check_passes_on_the_released_schema(self):
        results = n.verify(URL, self.pre(), root=ROOT)
        self.assertEqual([(name, detail) for name, ok, detail in results if not ok], [])
        names = [name for name, _, _ in results]
        self.assertIn("no existing student is forced to change their password (no backfill)", names)
        self.assertTrue(any(name.startswith("column password_change_required: boolean, nullable=NO, default=false") for name in names))
        self.assertEqual(sum(1 for name in names if name.startswith("column ")), 5)

    def test_the_catalog_is_unchanged_by_a_column_only_release(self):
        scope = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]["N"]
        self.assertEqual(base.query(URL, n.CATALOG_SQL), scope["expectedCatalogAfter"])

    def test_a_forced_student_is_detected_as_a_backfill_violation_and_reverted(self):
        pre = self.pre()
        self.psql(f"UPDATE {TABLE} SET password_change_required = true WHERE user_id = (SELECT user_id FROM {TABLE} WHERE person_type='student' LIMIT 1)")
        try:
            self.assertTrue(any("no existing student is forced" in f for f in self.failed(pre)))
        finally:
            self.psql(f"UPDATE {TABLE} SET password_change_required = false")
        self.assertEqual(self.failed(pre), [])

    def test_a_non_null_new_column_value_is_detected_and_reverted(self):
        pre = self.pre()
        self.psql(f"UPDATE {TABLE} SET provisioning_lease_until = now() WHERE user_id = (SELECT user_id FROM {TABLE} LIMIT 1)")
        try:
            self.assertTrue(any("other four columns are NULL" in f for f in self.failed(pre)))
        finally:
            self.psql(f"UPDATE {TABLE} SET provisioning_lease_until = NULL")
        self.assertEqual(self.failed(pre), [])

    def test_changed_existing_profile_content_is_detected_and_reverted(self):
        pre = self.pre()
        self.psql(f"UPDATE {TABLE} SET grade_level = COALESCE(grade_level,'') || 'x' WHERE user_id = (SELECT user_id FROM {TABLE} LIMIT 1)")
        try:
            self.assertTrue(any("content of every existing profile row unchanged" in f for f in self.failed(pre)))
        finally:
            self.psql(f"UPDATE {TABLE} SET grade_level = NULLIF(regexp_replace(COALESCE(grade_level,''), 'x$', ''), '') WHERE grade_level LIKE '%x'")

    def test_a_wrong_column_definition_is_detected_and_reverted(self):
        pre = self.pre()
        self.psql(f"ALTER TABLE {TABLE} ALTER COLUMN password_change_required DROP DEFAULT")
        try:
            self.assertTrue(any(f.startswith("column password_change_required") for f in self.failed(pre)))
        finally:
            self.psql(f"ALTER TABLE {TABLE} ALTER COLUMN password_change_required SET DEFAULT false")
        self.assertEqual(self.failed(pre), [])

    def test_the_release_never_writes(self):
        preview = n.preview(URL)
        self.assertEqual(set(preview), {"profiles", "students", "teachers", "new_columns_already_present"})
        self.assertEqual(preview["new_columns_already_present"], 5)
