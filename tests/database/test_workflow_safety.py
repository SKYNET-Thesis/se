import re
import tempfile
import unittest
from pathlib import Path

from scripts.check_database_workflow_safety import backend_ci_problems, inspect_workflows


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


ROOT = Path(__file__).resolve().parents[2]
CI = (ROOT / ".github/workflows/backend-ci.yml").read_text()


class EducationCiSeparationTests(unittest.TestCase):
    """Validation runs on push/PR; Production deployment needs an explicit dispatch, the schema gate and a reviewer."""

    def problems(self, old: str, new: str, count: int = 1) -> list[str]:
        self.assertGreaterEqual(CI.count(old), 1, f"mutation target not found: {old[:60]!r}")
        return backend_ci_problems(CI.replace(old, new, count))

    def test_current_workflow_satisfies_the_separation_invariants(self):
        self.assertEqual(backend_ci_problems(CI), [])

    def test_push_and_pull_request_still_validate(self):
        on_block = re.search(r"(?ms)^on:\n(.*?)(?=^\S)", CI).group(1)
        self.assertIn("  pull_request:", on_block)
        self.assertIn("  push:", on_block)
        self.assertIn("branches: [main]", on_block)
        for job in ("api", "web", "docker", "database-safety"):
            self.assertRegex(CI, rf"(?m)^  {job}:\n")
        self.assertTrue(any("must keep validating" in p for p in backend_ci_problems(CI.replace("  pull_request:\n", "", 1))))

    def test_push_event_cannot_start_production_target_selection(self):
        # the pre-separation condition (push || workflow_dispatch) is reported
        original = CI.replace("if: github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'\n    runs-on", "if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')\n    runs-on", 1)
        self.assertNotEqual(original, CI)
        self.assertTrue(any("changes job" in p for p in backend_ci_problems(original)))

    def test_deploy_jobs_cannot_drop_schema_gate_environment_or_main_only(self):
        for old, new, needle in (
            ("    needs: [api, web, docker, changes, database-safety, schema-gate]", "    needs: [api, web, docker, changes, database-safety]", "deploy-api must depend on schema-gate"),
            ("    needs: [api, web, changes, deploy-api, database-safety, schema-gate]", "    needs: [api, web, changes, deploy-api, database-safety]", "deploy-web must depend on schema-gate"),
            ("needs.schema-gate.result == 'success' && needs.api.result", "needs.api.result", "deploy-web must require a successful schema-gate"),
            ("(needs.schema-gate.result == 'success' || (github.event_name == 'workflow_dispatch' && inputs.action == 'rollback'))", "true", "deploy-api must require a successful schema-gate"),
        ):
            with self.subTest(needle=needle):
                self.assertTrue(any(needle in p for p in self.problems(old, new)), self.problems(old, new))

    def test_approval_environment_and_aws_gates_are_mandatory(self):
        self.assertTrue(any("aws-demo" in p for p in self.problems("    environment: aws-demo\n", "", 1)))
        self.assertTrue(any("vars.AWS_DEPLOY_ENABLED" in p for p in backend_ci_problems(CI.replace("vars.AWS_DEPLOY_ENABLED == 'true' && github.ref == 'refs/heads/main' && needs.database-safety.result == 'success' && needs.changes.result == 'success' && needs.changes.outputs.api", "github.ref == 'refs/heads/main' && needs.database-safety.result == 'success' && needs.changes.result == 'success' && needs.changes.outputs.api", 1))))

    def test_schema_gate_stays_read_only_and_dispatch_only(self):
        self.assertTrue(any("compat" in p for p in self.problems("production_db_release.py compat", "production_db_release.py plan")))
        self.assertTrue(any("schema-gate must depend on the changes job" in p for p in self.problems("    needs: [changes]\n    runs-on: ubuntu-latest\n    environment: production-database-preflight", "    runs-on: ubuntu-latest\n    environment: production-database-preflight")))
        self.assertTrue(any("production-database-preflight" in p for p in self.problems("    environment: production-database-preflight\n", "")))

    def test_failures_cannot_be_hidden_or_bypassed(self):
        self.assertTrue(any("continue-on-error" in p for p in self.problems("      - run: npm test\n", "      - run: npm test\n        continue-on-error: true\n", 1)))
        self.assertTrue(any("pull_request_target" in p for p in backend_ci_problems(CI.replace("on:\n  pull_request:", "on:\n  pull_request_target:\n  pull_request:", 1))))
        self.assertTrue(any("must not add" in p for p in backend_ci_problems(CI.replace("  workflow_dispatch:\n    inputs:", "  schedule:\n    - cron: '0 3 * * *'\n  workflow_dispatch:\n    inputs:", 1))))

    def test_deployments_do_not_share_a_cancelling_group_with_validation(self):
        self.assertTrue(any("concurrency" in p for p in self.problems("group: education-${{ github.event_name == 'workflow_dispatch' && 'deploy' || 'ci' }}-${{ github.ref }}", "group: education-deploy-${{ github.ref }}")))
        self.assertTrue(any("concurrency" in p for p in self.problems("cancel-in-progress: false", "cancel-in-progress: true", 1)))

    def test_production_credentials_stay_inside_the_gated_jobs(self):
        leaked = CI.replace("  docker:\n    if:", "  docker:\n    environment: aws-demo\n    if:", 1)
        self.assertTrue(any("docker must not reference environment:" in p for p in backend_ci_problems(leaked)))

    def test_release_handoff_still_dispatches_the_gated_workflow(self):
        release = (ROOT / ".github/workflows/production-database-release.yml").read_text()
        self.assertIn("gh workflow run backend-ci.yml", release)
        self.assertIn("-f action=deploy", release)
        self.assertIn("needs: [apply]", release)
