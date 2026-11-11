import hashlib
import json
import os
import unittest
from pathlib import Path

import re

from scripts.bootstrap_dev_database import BASELINE_FILE, EVIDENCE_FILE, EXPECTATION_FILE, REQUIRED_OBJECTS, required_objects_sql, validate_dev_target
from scripts.sql_migration_runner import MigrationRunner, RunnerError

ROOT = Path(__file__).resolve().parents[2]
GOOD_URL = "postgresql://vista_test:pw@127.0.0.1:55432/vista_test_course_builder"
GOOD_ENV = {"VISTA_DATABASE_PROJECT_REF": "vista-course-builder-test"}


class DevBootstrapGuardTests(unittest.TestCase):
    def test_accepts_loopback_vista_test_database(self):
        connection, ref = validate_dev_target(GOOD_URL, GOOD_ENV)
        self.assertEqual(connection[2], "vista_test_course_builder")
        self.assertEqual(ref, "vista-course-builder-test")

    def test_rejects_remote_hosts(self):
        for host in ("db.ovijutkvaaxohauvuxbj.supabase.co", "10.0.0.5", "example.com"):
            with self.subTest(host=host), self.assertRaisesRegex(RunnerError, "loopback"):
                validate_dev_target(f"postgresql://u:p@{host}:5432/vista_test_x", GOOD_ENV)

    def test_rejects_non_test_database_names(self):
        for name in ("postgres", "vista", "vista_prod", "production"):
            with self.subTest(name=name), self.assertRaisesRegex(RunnerError, "must be named"):
                validate_dev_target(f"postgresql://u:p@127.0.0.1:5432/{name}", GOOD_ENV)

    def test_rejects_production_reference_and_missing_label(self):
        with self.assertRaisesRegex(RunnerError, "PROJECT_REF"):
            validate_dev_target(GOOD_URL, {"VISTA_DATABASE_PROJECT_REF": "ovijutkvaaxohauvuxbj"})
        with self.assertRaisesRegex(RunnerError, "PROJECT_REF"):
            validate_dev_target(GOOD_URL, {})

    def test_rejects_supabase_url(self):
        with self.assertRaisesRegex(RunnerError, "SUPABASE_URL"):
            validate_dev_target(GOOD_URL, {**GOOD_ENV, "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co"})


class DevBaselineIntegrityTests(unittest.TestCase):
    def test_checked_in_baseline_matches_evidence_and_manifest(self):
        evidence = json.loads((ROOT / EVIDENCE_FILE).read_text())
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())
        raw = (ROOT / BASELINE_FILE).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), evidence["sha256"])
        self.assertEqual(len(raw), evidence["fileSizeBytes"])
        self.assertEqual(evidence["sha256"], manifest["baselineSha256"])

    def test_baseline_is_schema_only_and_outside_release_inventory(self):
        text = (ROOT / BASELINE_FILE).read_text()
        self.assertNotRegex(text, r"(?m)^(INSERT INTO|COPY )")
        self.assertFalse(BASELINE_FILE.startswith("database/migrations/"))


    def test_baseline_contains_no_sensitive_material(self):
        text = (ROOT / BASELINE_FILE).read_text()
        patterns = {
            "email": r"[\w.+-]+@[\w-]+\.[\w.]+",
            "url": r"https?://\S+",
            "ip address": r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
            "uuid literal": r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
            "cloud or key material": r"arn:aws|AKIA[0-9A-Z]{12,}|amazonaws|eyJ[\w-]{10,}|-----BEGIN|sk_(live|test)",
            "role or password statement": r"(?i)\b(CREATE|ALTER) (ROLE|USER)\b|\bPASSWORD\s+'",
            "production project reference": r"ovijutkvaaxohauvuxbj",
        }
        for label, pattern in patterns.items():
            with self.subTest(label=label):
                self.assertIsNone(re.search(pattern, text), f"baseline contains {label}")


class RequiredObjectSelectionTests(unittest.TestCase):
    def test_migration_checks_follow_the_manifest(self):
        base = required_objects_sql(set())
        self.assertNotIn("migration G", base)
        full = required_objects_sql({v for _, _, v in REQUIRED_OBJECTS if v})
        for marker in ("migration D", "migration E", "migration F", "migration G"):
            self.assertIn(marker, full)

    def test_manifest_versions_each_have_a_required_object_check(self):
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())
        covered = {v for _, _, v in REQUIRED_OBJECTS if v}
        self.assertEqual({m["version"] for m in manifest["migrations"]} - covered, set())

    def test_pinned_expectation_matches_manifest_when_present(self):
        path = ROOT / EXPECTATION_FILE
        if not path.is_file():
            self.skipTest("expectation file not generated yet")
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())
        expectation = json.loads(path.read_text())
        self.assertEqual(expectation["ledgerVersions"], [m["version"] for m in manifest["migrations"]])
        self.assertRegex(expectation["schemaFingerprint"], r"^[0-9a-f]{64}$")


@unittest.skipUnless(os.environ.get("VISTA_BOOTSTRAP_VERIFY_DATABASE_URL"), "requires a bootstrapped loopback vista_test_* database")
class BootstrappedDatabaseVerificationTests(unittest.TestCase):
    def test_verify_database_passes(self):
        from scripts.bootstrap_dev_database import verify_database
        url = os.environ["VISTA_BOOTSTRAP_VERIFY_DATABASE_URL"]
        env = {**os.environ, "DATABASE_URL": url}
        connection, _ = validate_dev_target(url, env)
        runner = MigrationRunner(ROOT, ROOT / "database/migrations/manifest.json", env=env)
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())
        self.assertEqual(len(verify_database(runner, connection)["ledger"]), len(manifest["migrations"]))
