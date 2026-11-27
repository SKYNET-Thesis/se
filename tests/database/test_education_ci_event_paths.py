"""Walks every trigger path of .github/workflows/backend-ci.yml through the job graph by evaluating the workflow's own `if:` expressions.

Only the GitHub expression subset the file uses is supported (==, !=, &&, ||, !, always(), needs/inputs/vars/github contexts); an
unsupported token fails the test instead of being guessed. Job results follow GitHub's rules: without a status function a job is skipped
unless every needed job succeeded; `always()` evaluates the expression alone.
"""
import re
import unittest
from pathlib import Path

from scripts.check_database_workflow_safety import _job_if, _jobs

ROOT = Path(__file__).resolve().parents[2]
CI = (ROOT / ".github/workflows/backend-ci.yml").read_text()


class _Ctx(dict):
    def __getattr__(self, key):
        return self[key]


def _evaluate(expression: str, github: dict, inputs: dict, variables: dict, needs: dict, outputs: dict) -> bool:
    py = expression
    py = re.sub(r"needs\.([a-z-]+)\.outputs\.([a-z]+)", lambda m: f"outputs[{m.group(1)!r}][{m.group(2)!r}]", py)
    py = re.sub(r"needs\.([a-z-]+)\.result", lambda m: f"needs[{m.group(1)!r}]", py)
    py = py.replace("github.event_name", "event").replace("github.ref", "ref").replace("inputs.action", "action").replace("vars.AWS_DEPLOY_ENABLED", "aws_enabled")
    py = py.replace("always()", "True").replace("&&", " and ").replace("||", " or ")
    py = re.sub(r"!(?!=)", " not ", py)
    leftover = re.sub(r"'[^']*'", "", py)
    if re.search(r"\b(github|inputs|vars|needs)\.", leftover):
        raise AssertionError(f"unsupported expression token in: {expression}")
    scope = {"event": github["event_name"], "ref": github["ref"], "action": inputs.get("action", ""), "aws_enabled": variables.get("AWS_DEPLOY_ENABLED", ""),
             "needs": needs, "outputs": outputs, "True": True}
    return bool(eval(py, {"__builtins__": {}}, scope))  # noqa: S307 - expression text comes from the checked-in workflow


def simulate(event: str, ref: str, action: str = "", aws_enabled: str = "true", gate: str = "success", api_ok: bool = True, targets=("true", "true"), guard: str = "success") -> dict:
    """Returns {job: 'success'|'skipped'|'failure'}. `gate` is what schema-gate would report if it runs (Production lacking K-M => 'failure')."""
    jobs = _jobs(CI)
    github = {"event_name": event, "ref": ref}
    inputs = {"action": action} if event == "workflow_dispatch" else {}
    variables = {"AWS_DEPLOY_ENABLED": aws_enabled}
    results: dict[str, str] = {}
    outputs = {"changes": {"api": targets[0], "web": targets[1]}}
    order = ["api", "web", "docker", "database-safety", "changes", "schema-gate", "rollback-guard", "deploy-api", "deploy-web"]
    for name in order:
        body = jobs[name]
        needs_match = re.search(r"(?m)^    needs: (\[.*\]|\w[\w-]*)\s*$", body)
        needs = [n.strip() for n in needs_match.group(1).strip("[]").split(",")] if needs_match else []
        condition = _job_if(body)
        needs_view = {n: results[n] for n in needs}
        if condition:
            if "always()" in condition:
                run = _evaluate(condition, github, inputs, variables, {n: results[n] for n in order if n in results}, outputs)
            else:
                run = all(v == "success" for v in needs_view.values()) and _evaluate(condition, github, inputs, variables, {n: results[n] for n in order if n in results}, outputs)
        else:
            run = all(v == "success" for v in needs_view.values())
        if not run:
            results[name] = "skipped"
        elif name == "schema-gate":
            results[name] = gate
        elif name == "rollback-guard":
            results[name] = guard
        elif name == "api" and not api_ok:
            results[name] = "failure"
        else:
            results[name] = "success"
    return results


MAIN, PR = "refs/heads/main", "refs/pull/155/merge"
DEPLOYS = ("deploy-api", "deploy-web")


class EducationCiEventPathTests(unittest.TestCase):
    def assertValidated(self, r):
        for job in ("api", "web", "docker", "database-safety"):
            self.assertEqual(r[job], "success", f"{job} must run: {r}")

    def test_pull_request_validates_and_never_reaches_production(self):
        r = simulate("pull_request", PR)
        self.assertValidated(r)
        self.assertEqual([r[j] for j in ("changes", "schema-gate", *DEPLOYS)], ["skipped"] * 4)

    def test_push_to_main_validates_and_never_runs_the_production_gate_or_deploys(self):
        for gate in ("success", "failure"):  # even a would-be passing gate must not make an ordinary push deploy
            r = simulate("push", MAIN, gate=gate)
            self.assertValidated(r)
            self.assertEqual([r[j] for j in ("changes", "schema-gate", *DEPLOYS)], ["skipped"] * 4, r)

    def test_a_failing_test_still_fails_the_push_run(self):
        r = simulate("push", MAIN, api_ok=False)
        self.assertEqual(r["api"], "failure")
        self.assertEqual([r[j] for j in DEPLOYS], ["skipped", "skipped"])

    def test_dispatched_deploy_passes_through_the_schema_gate_before_any_deploy_job(self):
        r = simulate("workflow_dispatch", MAIN, action="deploy", gate="success")
        self.assertValidated(r)
        self.assertEqual((r["changes"], r["schema-gate"], r["deploy-api"], r["deploy-web"]), ("success",) * 4)

    def test_failed_schema_gate_blocks_both_deploy_jobs_even_for_a_dispatch(self):
        r = simulate("workflow_dispatch", MAIN, action="deploy", gate="failure")
        self.assertEqual(r["schema-gate"], "failure")
        self.assertEqual([r[j] for j in DEPLOYS], ["skipped", "skipped"])

    def test_gate_cannot_be_skipped_by_choosing_targets_or_disabling_it(self):
        self.assertEqual([simulate("workflow_dispatch", MAIN, action="deploy", aws_enabled="false")[j] for j in ("schema-gate", *DEPLOYS)], ["skipped"] * 3)
        no_targets = simulate("workflow_dispatch", MAIN, action="deploy", targets=("false", "false"))
        self.assertEqual([no_targets[j] for j in ("schema-gate", *DEPLOYS)], ["skipped"] * 3)

    def test_dispatch_from_a_branch_other_than_main_cannot_deploy(self):
        r = simulate("workflow_dispatch", "refs/heads/feat/anything", action="deploy")
        self.assertEqual([r[j] for j in ("changes", "schema-gate", *DEPLOYS)], ["skipped"] * 4)

    def test_rollback_needs_a_passing_rollback_guard_and_a_deploy_never_runs_it(self):
        ok = simulate("workflow_dispatch", MAIN, action="rollback", gate="failure", guard="success")
        self.assertEqual((ok["rollback-guard"], ok["deploy-api"]), ("success", "success"))
        blocked = simulate("workflow_dispatch", MAIN, action="rollback", gate="failure", guard="failure")   # schema outgrew the previous image
        self.assertEqual((blocked["rollback-guard"], blocked["deploy-api"], blocked["deploy-web"]), ("failure", "skipped", "skipped"))
        deploy = simulate("workflow_dispatch", MAIN, action="deploy", guard="failure")
        self.assertEqual((deploy["rollback-guard"], deploy["deploy-api"]), ("skipped", "success"))          # the guard is irrelevant to a gated deploy
        for event, ref in (("push", MAIN), ("pull_request", PR)):
            self.assertEqual(simulate(event, ref)["rollback-guard"], "skipped")
        self.assertEqual(simulate("workflow_dispatch", "refs/heads/feat/x", action="rollback")["rollback-guard"], "skipped")

    def test_rollback_is_the_only_path_that_does_not_need_the_schema_gate(self):
        r = simulate("workflow_dispatch", MAIN, action="rollback", gate="failure")
        self.assertEqual(r["schema-gate"], "skipped")
        self.assertEqual(r["deploy-api"], "success")      # rollback of the API to the previous, schema-compatible image
        self.assertEqual(r["deploy-web"], "skipped")      # the web never rolls back through this path

    def test_the_database_release_handoff_uses_the_same_gated_path(self):
        # production-database-release.yml runs `gh workflow run backend-ci.yml --ref main -f action=deploy` = a workflow_dispatch on main
        self.assertEqual(simulate("workflow_dispatch", MAIN, action="deploy", gate="success")["deploy-api"], "success")
        self.assertEqual(simulate("workflow_dispatch", MAIN, action="deploy", gate="failure")["deploy-api"], "skipped")

    def test_aws_demo_reviewer_environment_is_attached_to_every_deploying_job(self):
        jobs = _jobs(CI)
        for name in DEPLOYS:
            self.assertRegex(jobs[name], r"(?m)^    environment: aws-demo\s*$")


if __name__ == "__main__":
    unittest.main()
