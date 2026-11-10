import re
import tempfile
import unittest
from pathlib import Path

from scripts.check_database_workflow_safety import inspect_workflows


class WorkflowSafetyTests(unittest.TestCase):
    def test_current_workflows_have_no_migration_execution(self):
        root = Path(__file__).resolve().parents[2]
        self.assertEqual(inspect_workflows(root / ".github/workflows"), [])

    def test_production_deploy_jobs_wait_for_database_safety_gate(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / ".github/workflows/backend-ci.yml").read_text()
        for job in ("deploy-api", "deploy-web"):
            match = re.search(
                rf"(?ms)^  {job}:\n(.*?)(?=^  [a-z0-9-]+:|\Z)", workflow
            )
            self.assertIsNotNone(match, f"missing {job} job")
            self.assertIn("database-safety", match.group(1))
        for job in ("deploy-api", "deploy-web"):
            deploy_job = re.search(
                rf"(?ms)^  {job}:\n(.*?)(?=^  [a-z0-9-]+:|\Z)", workflow
            )
            self.assertIsNotNone(deploy_job, f"missing {job} job")
            self.assertIn(
                "needs.database-safety.result == 'success'", deploy_job.group(1)
            )

    def test_prisma_migrate_deploy_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp)
            (workflows / "unsafe.yml").write_text(
                "jobs:\n  deploy:\n    steps:\n      - run: npx prisma migrate deploy\n"
            )
            errors = inspect_workflows(workflows)
            self.assertTrue(any("prisma migrate" in e.lower() for e in errors))

    def test_runner_execution_is_rejected_even_with_environment(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp)
            (workflows / "unsafe.yml").write_text(
                "jobs:\n  deploy:\n    environment: supabase-production-migrations\n"
                "    steps:\n      - run: python scripts/run_sql_migrations.py\n"
            )
            errors = inspect_workflows(workflows)
            self.assertTrue(any("runner" in e.lower() for e in errors))

    def test_sql_runner_apply_command_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp)
            (workflows / "unsafe.yml").write_text(
                "steps:\n  - run: python scripts/sql_migration_runner.py --apply --expected-project-ref x\n"
            )
            errors = inspect_workflows(workflows)
            self.assertTrue(any("runner apply" in e.lower() for e in errors))

    def test_multiline_sql_runner_apply_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp)
            (workflows / "unsafe.yml").write_text(
                "steps:\n  - run: |\n      python scripts/sql_migration_runner.py\n      --apply\n"
            )
            errors = inspect_workflows(workflows)
            self.assertTrue(any("runner apply" in e.lower() for e in errors))

    def test_prisma_client_commands_remain_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp)
            (workflows / "safe.yml").write_text(
                "steps:\n  - run: npx prisma generate\n  - run: npx prisma validate\n"
            )
            self.assertEqual(inspect_workflows(workflows), [])

    def test_api_deployment_entrypoint_cannot_run_prisma_migrate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            workflows = root / ".github/workflows"
            workflows.mkdir(parents=True)
            deploy = root / "infra/terraform/scripts/deploy-api.sh"
            deploy.parent.mkdir(parents=True)
            deploy.write_text("npx prisma migrate deploy\n")
            errors = inspect_workflows(workflows)
            self.assertTrue(any("deploy-api.sh" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
