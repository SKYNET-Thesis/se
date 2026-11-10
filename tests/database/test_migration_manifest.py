import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.validate_database_migration_manifest import validate_manifest


class ManifestFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.run_git("init", "-q")
        self.run_git("config", "user.email", "tests@example.invalid")
        self.run_git("config", "user.name", "Manifest Tests")
        (self.root / "database/migrations").mkdir(parents=True)
        self.files = {}
        self.manifest = self.root / "database/migrations/manifest.json"

    def tearDown(self):
        self.temp.cleanup()

    def run_git(self, *args, check=True):
        return subprocess.run(
            ["git", *args], cwd=self.root, text=True, capture_output=True,
            check=check,
        )

    def add_migration(self, version, sql=None):
        path = f"database/migrations/{version}.sql"
        content = sql or f"-- {version}\nSELECT 1;\n"
        (self.root / path).write_text(content)
        self.files[version] = (path, content)

    def commit_inventory(self):
        self.run_git("add", "database/migrations")
        self.run_git("commit", "-qm", "add migration inventory")
        return self.run_git("rev-parse", "HEAD").stdout.strip()

    def write_manifest(self, commit, entries=None):
        migrations = []
        for order, (version, (path, content)) in enumerate(
            (entries or list(self.files.items())), start=1
        ):
            migrations.append({
                "version": version,
                "path": path,
                "sha256": hashlib.sha256(content.encode()).hexdigest(),
                "order": order,
            })
        self.manifest.write_text(json.dumps({
            "formatVersion": 1,
            "baselineSha256": "a" * 64,
            "sourceCommit": commit if migrations else None,
            "migrations": migrations,
        }))

    def validate(self, release=False):
        return validate_manifest(self.root, self.manifest, release=release)

    def test_clean_inventory_and_release_provenance_pass(self):
        self.add_migration("20261201_example_change")
        commit = self.commit_inventory()
        self.write_manifest(commit)
        errors = self.validate(release=True)
        self.assertEqual(errors, [])

    def test_empty_manifest_is_valid_inventory_but_not_release(self):
        self.write_manifest(None)
        self.assertEqual(self.validate(), [])
        self.assertTrue(any("at least one" in e for e in self.validate(release=True)))

    def test_checksum_mismatch_fails(self):
        self.add_migration("20261201_example_change")
        commit = self.commit_inventory()
        self.write_manifest(commit)
        payload = json.loads(self.manifest.read_text())
        payload["migrations"][0]["sha256"] = "0" * 64
        self.manifest.write_text(json.dumps(payload))
        self.assertTrue(any("checksum" in e.lower() for e in self.validate()))

    def test_duplicate_version_and_order_fail(self):
        self.add_migration("20261201_first")
        self.add_migration("20261202_second")
        commit = self.commit_inventory()
        self.write_manifest(commit)
        payload = json.loads(self.manifest.read_text())
        payload["migrations"][1]["version"] = payload["migrations"][0]["version"]
        payload["migrations"][1]["order"] = payload["migrations"][0]["order"]
        self.manifest.write_text(json.dumps(payload))
        errors = self.validate()
        self.assertTrue(any("duplicate version" in e.lower() for e in errors))
        self.assertTrue(any("order" in e.lower() for e in errors))

    def test_untracked_or_ignored_sql_fails(self):
        (self.root / ".gitignore").write_text("database/migrations/ignored.sql\n")
        self.add_migration("20261201_tracked_change")
        commit = self.commit_inventory()
        self.write_manifest(commit)
        (self.root / "database/migrations/untracked.sql").write_text("SELECT 2;\n")
        (self.root / "database/migrations/ignored.sql").write_text("SELECT 3;\n")
        errors = self.validate()
        self.assertTrue(any("untracked" in e.lower() for e in errors))
        self.assertTrue(any("ignored" in e.lower() for e in errors))

    def test_source_commit_must_contain_exact_bytes(self):
        self.add_migration("20261201_example_change")
        commit = self.commit_inventory()
        (self.root / "database/migrations/20261201_example_change.sql").write_text("SELECT 99;\n")
        self.write_manifest(commit)
        self.assertTrue(any("source commit" in e.lower() for e in self.validate()))

    def test_applied_november_migration_is_rejected(self):
        version = "20261104_curriculum_foundation"
        self.add_migration(version)
        commit = self.commit_inventory()
        self.write_manifest(commit)
        self.assertTrue(any("already applied" in e.lower() for e in self.validate()))


if __name__ == "__main__":
    unittest.main()
