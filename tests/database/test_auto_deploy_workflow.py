"""Auto Deploy (workflow_run) may only START the gated deployment path; these tests pin that down and walk its trigger conditions."""
import re
import unittest
from pathlib import Path

from test_education_ci_event_paths import MAIN, simulate  # discovered next to this file by the test runner
from scripts.check_database_workflow_safety import auto_deploy_problems, backend_ci_problems, inspect_workflows

ROOT = Path(__file__).resolve().parents[2]
AUTO = (ROOT / ".github/workflows/auto-deploy.yml").read_text()
CI = (ROOT / ".github/workflows/backend-ci.yml").read_text()


def condition(text: str) -> str:
    block = re.search(r"(?ms)^    if: >-\n(.*?)(?=^    runs-on:)", text).group(1)
    return " ".join(block.split())


def evaluate(expr: str, run: dict, repository: str = "SKYNET-Thesis/se", enabled: str = "true") -> bool:
    py = re.sub(r"github\.event\.workflow_run\.head_repository\.full_name", "run['repo']", expr)
    for key in ("conclusion", "event", "head_branch"):
        py = py.replace(f"github.event.workflow_run.{key}", f"run['{key}']")
    py = py.replace("github.repository", "repository").replace("vars.AWS_DEPLOY_ENABLED", "enabled").replace("&&", " and ").replace("||", " or ")
    assert not re.search(r"\b(github|vars|needs)\.", re.sub(r"'[^']*'", "", py)), expr
    return bool(eval(py, {"__builtins__": {}}, {"run": run, "repository": repository, "enabled": enabled}))  # noqa: S307


GOOD = {"conclusion": "success", "event": "push", "head_branch": "main", "repo": "SKYNET-Thesis/se"}


class AutoDeployTests(unittest.TestCase):
    def test_current_files_satisfy_all_invariants(self):
        self.assertEqual(auto_deploy_problems(AUTO), [])
        self.assertEqual(backend_ci_problems(CI), [])
        self.assertEqual(inspect_workflows(ROOT / ".github/workflows"), [])

    def test_only_a_successful_push_run_of_this_repository_on_main_starts_it(self):
        expr = condition(AUTO)
        self.assertTrue(evaluate(expr, GOOD))
        for key, value in (("conclusion", "failure"), ("conclusion", "cancelled"), ("conclusion", "skipped"), ("event", "pull_request"), ("event", "workflow_dispatch"),
                           ("head_branch", "develop"), ("head_branch", "feat/x"), ("repo", "someone-else/se")):
            with self.subTest(**{key: value}):
                self.assertFalse(evaluate(expr, {**GOOD, key: value}))
        self.assertFalse(evaluate(expr, GOOD, enabled="false"))  # AWS_DEPLOY_ENABLED remains the kill switch
        self.assertFalse(evaluate(expr, GOOD, enabled=""))

    def test_a_dispatched_deployment_does_not_retrigger_auto_deploy(self):
        # the dispatched Education CI run has event == workflow_dispatch, which the condition rejects (no loop)
        self.assertFalse(evaluate(condition(AUTO), {**GOOD, "event": "workflow_dispatch"}))

    def test_it_can_only_start_the_deploy_action_never_rollback_or_a_database_release(self):
        runs = re.findall(r"gh workflow run (\S+)(.*)", AUTO)
        self.assertEqual(runs, [("backend-ci.yml", ' --repo "$GITHUB_REPOSITORY" --ref main -f action=deploy')])
        code = "\n".join(line for line in AUTO.splitlines() if not line.lstrip().startswith("#"))  # comments may mention what it must not do
        for forbidden in ("rollback", "production-database-release", "secrets.", "aws ", "production_db_release", "id-token", "environment:"):
            self.assertNotIn(forbidden, code)

    def test_mutations_are_rejected(self):
        def problems(old, new):
            self.assertIn(old, AUTO, old)
            return auto_deploy_problems(AUTO.replace(old, new, 1))
        self.assertTrue(any("triggered only by workflow_run" in p for p in problems("on:\n  workflow_run:", "on:\n  pull_request:\n  workflow_run:")))
        self.assertTrue(any("main branch" in p for p in problems("branches: [main]", "branches: [main, develop]") + problems("    branches: [main]", "    branches: [\"**\"]")))
        self.assertTrue(any("workflow_run.event == 'push'" in p for p in problems("      github.event.workflow_run.event == 'push' &&\n", "")))
        self.assertTrue(any("head_repository" in p for p in problems("      github.event.workflow_run.head_repository.full_name == github.repository &&\n", "")))
        self.assertTrue(any("AWS_DEPLOY_ENABLED" in p for p in problems("      vars.AWS_DEPLOY_ENABLED == 'true'\n", "      true\n")))
        self.assertTrue(any("permissions must be exactly" in p for p in problems("  actions: write\n", "  actions: write\n  id-token: write\n")))
        self.assertTrue(any("only thing Auto Deploy may start" in p for p in problems("-f action=deploy", "-f action=rollback")))
        self.assertTrue(any("cancel superseded" in p for p in problems("cancel-in-progress: true", "cancel-in-progress: false")))
        self.assertTrue(any("verify the required checks" in p for p in problems("python scripts/ci_required_checks.py checks", "echo skip")))
        self.assertTrue(any("must not contain 'secrets.'" in p for p in problems("GH_TOKEN: ${{ github.token }}", "GH_TOKEN: ${{ secrets.PAT }}")))

    def test_deploy_jobs_keep_freshness_and_version_verification(self):
        for old, needle in (("working-directory: ${{ github.workspace }}\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: python3 scripts/ci_required_checks.py is-head", "superseded commit"),
                            ("https://api.skynex.best/api/v1/version", "/api/v1/version"), ("dist/version.json", "version.json"), ("--build-arg GIT_SHA", "build-arg")):
            mutated = CI.replace(old, "REMOVED")
            self.assertNotEqual(mutated, CI, old)
            self.assertTrue(any(needle in p for p in backend_ci_problems(mutated)), needle)

    def test_end_to_end_chain_validation_is_separate_from_the_gated_deployment(self):
        push = simulate("push", MAIN)
        self.assertEqual([push[j] for j in ("api", "web", "docker", "database-safety")], ["success"] * 4)
        self.assertEqual([push[j] for j in ("changes", "schema-gate", "deploy-api", "deploy-web")], ["skipped"] * 4)  # the push run only validates
        self.assertTrue(evaluate(condition(AUTO), GOOD))  # ...and its success starts Auto Deploy, which dispatches the deployment run:
        blocked = simulate("workflow_dispatch", MAIN, action="deploy", gate="failure")  # Production lacks K-M: the gate fails closed
        self.assertEqual((blocked["schema-gate"], blocked["deploy-api"], blocked["deploy-web"]), ("failure", "skipped", "skipped"))
        released = simulate("workflow_dispatch", MAIN, action="deploy", gate="success")  # after an approved release the same path deploys (behind aws-demo)
        self.assertEqual((released["schema-gate"], released["deploy-api"], released["deploy-web"]), ("success", "success", "success"))
        self.assertFalse(evaluate(condition(AUTO), {**GOOD, "conclusion": "failure"}))  # a failed validation run never starts a deployment

    def test_no_other_workflow_may_use_workflow_run(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp) / ".github/workflows"
            workflows.mkdir(parents=True)
            (workflows / "other.yml").write_text("on:\n  workflow_run:\n    workflows: [x]\njobs:\n  a:\n    steps:\n      - run: echo hi\n")
            self.assertTrue(any("reserved for auto-deploy.yml" in e for e in inspect_workflows(workflows)))


if __name__ == "__main__":
    unittest.main()
