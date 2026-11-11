import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.sql_migration_runner import MigrationRunner, RunnerError
from scripts.restore_schema_baseline_isolated import validate_isolated_target


DATABASE_URL = os.environ.get("VISTA_RUNNER_TEST_DATABASE_URL")


@unittest.skipUnless(DATABASE_URL, "requires an explicitly named loopback PostgreSQL test database")
class PostgresRunnerRollbackIntegrationTests(unittest.TestCase):
    def test_failed_migration_rolls_back_ddl_and_ledger_write(self):
        target = validate_isolated_target(DATABASE_URL)
        sql = (
            "CREATE TABLE public.vista_runner_rollback_probe (id integer);\n"
            "SELECT 1 / 0;\n"
        )
        version = "20261231_runner_rollback_probe"
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            migration_dir = root / "database/migrations"
            migration_dir.mkdir(parents=True)
            source = migration_dir / f"{version}.sql"
            source.write_text(sql)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "config", "user.email", "runner-test@example.invalid"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "Runner Integration Test"], cwd=root, check=True)
            subprocess.run(["git", "add", str(source)], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "rollback probe source"], cwd=root, check=True)
            source_commit = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=root, text=True, capture_output=True, check=True
            ).stdout.strip()
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            manifest_path = migration_dir / "manifest.json"
            manifest_path.write_text(json.dumps({
                "formatVersion": 1,
                "baselineSha256": "5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962",
                "sourceCommit": source_commit,
                "migrations": [{
                    "version": version,
                    "path": f"database/migrations/{version}.sql",
                    "sha256": checksum,
                    "order": 1,
                }],
            }))
            env = {
                "DATABASE_URL": DATABASE_URL,
                "VISTA_DATABASE_PROJECT_REF": "isolated-vista-test",
                "PATH": os.environ.get("PATH", ""),
            }
            runner = MigrationRunner(
                root,
                manifest_path,
                env=env,
                psql_binary=os.environ.get("VISTA_RUNNER_TEST_PSQL_BINARY", "psql"),
            )
            with self.assertRaisesRegex(RunnerError, "transaction aborted"):
                runner.apply(
                    "isolated-vista-test",
                    operator_id="local-integration-test",
                    approval_reference="LOCAL-ROLLBACK-TEST",
                )

            connection = (
                target["host"], target["port"], target["database"], target["username"],
                target["password"], target["query"],
            )
            output = runner._psql(connection, f"""SELECT
  (to_regclass('public.vista_runner_rollback_probe') IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.vista_schema_migrations WHERE version = '{version}'))::text;
""")
            self.assertEqual(output.splitlines()[-1], "true")


if __name__ == "__main__":
    unittest.main()
