import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.sql_migration_runner import (
    MigrationRunner,
    RunnerError,
    validate_transactional_sql,
)


LEDGER = {
    "columns": ["version", "checksum", "release_id", "source_commit", "operator_id", "applied_at", "provenance"],
    "primary_key": "PRIMARY KEY (version)",
    "rows": [],
}


class RunnerFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        self.fakebin = Path(self.temp.name) / "fake-psql"
        self.log = Path(self.temp.name) / "psql-args.jsonl"
        self.init_repo()
        self.baseline_evidence = self.root / "database/baselines/production-baseline-evidence.json"
        self.baseline_evidence.parent.mkdir(parents=True)
        self.baseline_evidence.write_text(json.dumps({
            "projectRef": "ovijutkvaaxohauvuxbj",
            "sha256": "5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962",
            "captureIntegrityStatus": "verified",
            "isolatedRestoreStatus": "pending",
            "captureCatalogComparisonStatus": "pending",
        }))
        self.fakebin.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            "sql=sys.stdin.read()\n"
            "with open(os.environ['FAKE_PSQL_LOG'],'a') as f: f.write(json.dumps({'args':sys.argv[1:],'sql':sql})+'\\n')\n"
            "if os.environ.get('FAKE_PSQL_MODE') == 'connect_fail':\n"
            " print('password=must-not-escape', file=sys.stderr); sys.exit(2)\n"
            "if 'ledger_exists' in sql:\n"
            " print(json.dumps({'database_name':'vista_baseline_test_runner','server_version_num':170006,'transaction_read_only':False,'in_recovery':False,'ledger_exists':True}))\n"
            "elif 'primary_key' in sql:\n"
            " print(os.environ['FAKE_LEDGER_JSON'])\n"
            "elif '--single-transaction' in sys.argv and os.environ.get('FAKE_PSQL_MODE') == 'apply_fail':\n"
            " print('simulated statement failure', file=sys.stderr); sys.exit(3)\n"
            "else: print('')\n"
        )
        self.fakebin.chmod(0o700)
        self.create_migration()

    def tearDown(self):
        self.temp.cleanup()

    def init_repo(self):
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        for args in (("config", "user.email", "runner@example.invalid"), ("config", "user.name", "Runner Tests")):
            subprocess.run(["git", *args], cwd=self.root, check=True)
        (self.root / "database/migrations").mkdir(parents=True)

    def create_migration(self, sql="CREATE TABLE public.runner_fixture (id integer PRIMARY KEY);\n", version="20261201_runner_fixture"):
        self.version = version
        self.relative = f"database/migrations/{version}.sql"
        (self.root / self.relative).write_text(sql)
        subprocess.run(["git", "add", self.relative], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "add migration"], cwd=self.root, check=True)
        self.source_commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.root, text=True, capture_output=True, check=True).stdout.strip()
        checksum = hashlib.sha256(sql.encode()).hexdigest()
        (self.root / "database/migrations/manifest.json").write_text(json.dumps({
            "formatVersion": 1,
            "baselineSha256": "5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962",
            "sourceCommit": self.source_commit,
            "migrations": [{"version": version, "path": self.relative, "sha256": checksum, "order": 1}],
        }))

    def env(self, *, ledger=None, mode=""):
        return {
            "DATABASE_URL": "postgresql://vista:dummy-secret@127.0.0.1:55432/vista_baseline_test_runner?sslmode=disable",
            "VISTA_DATABASE_PROJECT_REF": "isolated-vista-test",
            "FAKE_PSQL_LOG": str(self.log),
            "FAKE_LEDGER_JSON": json.dumps(ledger or LEDGER),
            "FAKE_PSQL_MODE": mode,
            "PATH": os.environ.get("PATH", ""),
        }

    def runner(self, **kwargs):
        return MigrationRunner(
            self.root,
            self.root / "database/migrations/manifest.json",
            env=kwargs.pop("env", None) or self.env(),
            psql_binary=str(self.fakebin),
            baseline_evidence_path=self.baseline_evidence,
            **kwargs,
        )

    def calls(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_dry_run_reports_pending_and_never_uses_single_transaction(self):
        result = self.runner().dry_run("isolated-vista-test")
        self.assertEqual(result.pending, [self.version])
        self.assertEqual(len(self.calls()), 2)
        self.assertFalse(any("--single-transaction" in call["args"] for call in self.calls()))

    def test_matching_ledger_row_is_skipped_without_apply(self):
        checksum = hashlib.sha256((self.root / self.relative).read_bytes()).hexdigest()
        ledger = {**LEDGER, "rows": [{"version": self.version, "checksum": checksum, "provenance": "executed"}]}
        result = self.runner(env=self.env(ledger=ledger)).apply(
            "isolated-vista-test", operator_id="local-review"
        )
        self.assertEqual(result.pending, [])
        self.assertEqual(len(self.calls()), 2)

    def test_checksum_conflict_fails_before_apply(self):
        ledger = {**LEDGER, "rows": [{"version": self.version, "checksum": "f" * 64, "provenance": "executed"}]}
        with self.assertRaisesRegex(RunnerError, "checksum mismatch"):
            self.runner(env=self.env(ledger=ledger)).dry_run("isolated-vista-test")
        self.assertEqual(len(self.calls()), 2)

    def test_project_identity_mismatch_fails_before_database_connection(self):
        with self.assertRaisesRegex(RunnerError, "(?i)project identity"):
            self.runner().dry_run("wrong-project")
        self.assertEqual(self.calls(), [])

    def test_connection_failure_is_reported_without_echoing_connection_output(self):
        with self.assertRaises(RunnerError) as caught:
            self.runner(env=self.env(mode="connect_fail")).dry_run("isolated-vista-test")
        self.assertNotIn("dummy-secret", str(caught.exception))
        self.assertNotIn("must-not-escape", str(caught.exception))

    def test_apply_is_atomic_locked_and_records_provenance(self):
        result = self.runner().apply("isolated-vista-test", operator_id="local-review", approval_reference="LOCAL-TEST")
        self.assertEqual(result.pending, [self.version])
        apply_call = self.calls()[-1]
        self.assertIn("--single-transaction", apply_call["args"])
        self.assertIn("pg_advisory_xact_lock", apply_call["sql"])
        self.assertIn("newer migration appeared after preflight", apply_call["sql"])
        self.assertIn("INSERT INTO public.vista_schema_migrations", apply_call["sql"])
        self.assertIn(self.source_commit, apply_call["sql"])
        self.assertIn("local-review", apply_call["sql"])

    def test_apply_failure_is_aborted_inside_single_transaction(self):
        with self.assertRaisesRegex(RunnerError, "transaction aborted"):
            self.runner(env=self.env(mode="apply_fail")).apply(
                "isolated-vista-test", operator_id="local-review", approval_reference="LOCAL-TEST"
            )
        apply_call = self.calls()[-1]
        self.assertIn("--single-transaction", apply_call["args"])
        self.assertNotIn("simulated statement failure", str(self.calls()))

    def test_production_apply_requires_explicit_approval_before_connect(self):
        env = {
            **self.env(),
            "DATABASE_URL": "postgresql://postgres:dummy-secret@db.ovijutkvaaxohauvuxbj.supabase.co:5432/postgres?sslmode=require",
            "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co",
        }
        with self.assertRaisesRegex(RunnerError, "explicit Production approval"):
            self.runner(env=env).apply("ovijutkvaaxohauvuxbj", operator_id="operator", approval_reference="CHG-123")
        self.assertEqual(self.calls(), [])

    def test_production_apply_stays_blocked_until_baseline_restore_is_verified(self):
        env = {
            **self.env(),
            "DATABASE_URL": "postgresql://postgres:dummy-secret@db.ovijutkvaaxohauvuxbj.supabase.co:5432/postgres?sslmode=require",
            "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co",
        }
        with self.assertRaisesRegex(RunnerError, "isolated PostgreSQL 17 restore"):
            self.runner(env=env).apply(
                "ovijutkvaaxohauvuxbj", operator_id="operator", approval_reference="CHG-123",
                approve_production=True,
            )
        self.assertEqual(self.calls(), [])

    def test_production_apply_requires_capture_catalog_comparison(self):
        self.baseline_evidence.write_text(json.dumps({
            "projectRef": "ovijutkvaaxohauvuxbj",
            "sha256": "5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962",
            "captureIntegrityStatus": "verified",
            "isolatedRestoreStatus": "verified",
            "captureCatalogComparisonStatus": "pending",
        }))
        env = {
            **self.env(),
            "DATABASE_URL": "postgresql://postgres:dummy-secret@db.ovijutkvaaxohauvuxbj.supabase.co:5432/postgres?sslmode=require",
            "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co",
        }
        with self.assertRaisesRegex(RunnerError, "capture catalog definitions"):
            self.runner(env=env).apply(
                "ovijutkvaaxohauvuxbj", operator_id="operator", approval_reference="CHG-123",
                approve_production=True,
            )
        self.assertEqual(self.calls(), [])

    def test_nontransactional_statements_are_rejected(self):
        for sql in ("COMMIT;", "CREATE INDEX CONCURRENTLY x ON public.t(id);", "VACUUM public.t;"):
            with self.subTest(sql=sql), self.assertRaisesRegex(RunnerError, "transactional|transaction boundaries"):
                validate_transactional_sql(sql)

    def test_psql_meta_commands_are_rejected(self):
        with self.assertRaisesRegex(RunnerError, "psql meta-command"):
            validate_transactional_sql("\\connect postgres\nSELECT 1;\n")


if __name__ == "__main__":
    unittest.main()
