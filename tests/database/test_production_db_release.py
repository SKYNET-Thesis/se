"""Tests of the production database release flow (scripts/production_db_release.py) and its workflow safeguards.

Static tests always run. The database tests need a disposable loopback PostgreSQL server:
  VISTA_D03_MIGRATION_TEST_URL=postgresql://vista_test:<pw>@127.0.0.1:55432/<any vista_* db>
They clone throw-away vista_test_* databases from a baseline-only template (built on demand), never touch anything else, and never use
Production credentials.
"""

from __future__ import annotations

import contextlib
import hashlib
import itertools
import http.server
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from scripts import production_db_release as prm  # noqa: E402
from scripts.check_database_workflow_safety import inspect_workflows, release_workflow_problems  # noqa: E402

URL = os.environ.get("VISTA_D03_MIGRATION_TEST_URL", "")
LABEL = "vista-course-builder-test"
TEMPLATE = "vista_test_release_baseline_only"
WORKFLOWS = ROOT / ".github/workflows"
J_VERSION = "20261114_j_one_submission_per_attempt"
J_CANDIDATES = [ROOT / "database/migrations" / f"{J_VERSION}.sql", ROOT / "database/staged-migrations" / f"{J_VERSION}.sql"]
J_SQL = next(p for p in J_CANDIDATES if p.exists())  # staged until the manifest activation, registered afterwards


def run_cli(argv: list[str], env: dict[str, str] | None = None) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    saved = dict(os.environ)
    try:
        if env is not None:
            for key in ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_ACCESS_TOKEN"):
                os.environ.pop(key, None)
            os.environ.update(env)
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = prm.main(argv)
            except SystemExit as exc:  # argparse
                code = int(exc.code or 0)
    finally:
        os.environ.clear()
        os.environ.update(saved)
    return code, out.getvalue(), err.getvalue()


def _in_apply_call(text: str, fragment: str) -> str:
    """Remove `fragment` from the production_db_release.py apply invocation only (earlier jobs use similar flags)."""
    head, tail = text.split("production_db_release.py apply", 1)
    return head + "production_db_release.py apply" + tail.replace(fragment, "", 1)


class StaticSafeguardTests(unittest.TestCase):
    def test_release_workflow_and_all_workflows_pass_the_safety_checker(self):
        self.assertEqual(inspect_workflows(WORKFLOWS), [])
        self.assertEqual(release_workflow_problems((WORKFLOWS / "production-database-release.yml").read_text()), [])

    def test_wrapper_apply_is_forbidden_in_every_other_workflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "other.yml").write_text("steps:\n  - run: python scripts/production_db_release.py apply --plan p\n")
            self.assertTrue(any("wrapper apply" in e.lower() for e in inspect_workflows(Path(tmp))))

    def test_runner_apply_is_still_forbidden_even_in_the_release_workflow_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            body = (WORKFLOWS / "production-database-release.yml").read_text() + "\n      - run: python scripts/sql_migration_runner.py --apply --expected-project-ref x\n"
            (Path(tmp) / "production-database-release.yml").write_text(body)
            self.assertTrue(any("runner apply" in e.lower() for e in inspect_workflows(Path(tmp))))

    def _variant(self, mutate) -> list[str]:
        return release_workflow_problems(mutate((WORKFLOWS / "production-database-release.yml").read_text()))

    def test_release_workflow_invariants_fail_closed(self):
        self.assertTrue(any("workflow_dispatch" in p for p in self._variant(lambda t: t.replace("on:\n  workflow_dispatch:", "on:\n  push:\n    branches: [main]\n  workflow_dispatch:"))))
        self.assertTrue(any("required reviewers" in p for p in self._variant(lambda t: t.replace("environment: production-database-apply", "environment: something-else"))))
        self.assertTrue(any("serialize" in p for p in self._variant(lambda t: t.replace("cancel-in-progress: false", "cancel-in-progress: true", 1))))
        self.assertTrue(any("privileged credential" in p for p in self._variant(lambda t: t.replace("secrets.PRODUCTION_DATABASE_READONLY_URL", "secrets.PRODUCTION_DATABASE_APPLY_URL", 1))))
        self.assertTrue(any("must not apply" in p for p in self._variant(lambda t: t.replace("production_db_release.py plan", "production_db_release.py apply", 1))))
        self.assertTrue(any("inputs may only" in p for p in self._variant(lambda t: t.replace('echo "status=', 'echo "${{ inputs.scope }}"; echo "status=', 1))))
        self.assertTrue(any("depend on preflight" in p for p in self._variant(lambda t: t.replace("needs: [preflight]", "needs: []", 1))))
        self.assertTrue(any("refs/heads/main" in p for p in self._variant(lambda t: t.replace("if: github.ref == 'refs/heads/main'", "if: always()", 1))))

    def test_environment_approval_cannot_be_replaced_by_workflow_inputs(self):
        text = (WORKFLOWS / "production-database-release.yml").read_text()
        inputs = re.search(r"(?ms)^    inputs:\n(.*?)^permissions:", text).group(1)
        self.assertEqual(re.findall(r"^      ([a-z_]+):", inputs, re.M), ["scope", "backup_mode", "expected_main_sha"])  # no approve/confirm/skip-backup style input
        apply_job = re.search(r"(?ms)^  apply:\n(.*?)^  resume-deployment:", text).group(1)
        self.assertIn("production-database-apply", apply_job)
        self.assertIn("PRODUCTION_DATABASE_APPLY_URL", apply_job)

    def test_api_and_web_deployments_wait_for_the_schema_gate_and_rollback_is_not_gated(self):
        text = (WORKFLOWS / "backend-ci.yml").read_text()

        def job(name: str) -> str:
            return re.search(rf"(?ms)^  {name}:\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)", text).group(1)

        gate, api, web = job("schema-gate"), job("deploy-api"), job("deploy-web")
        for body in (api, web):
            self.assertIn("schema-gate", re.search(r"needs: \[(.*?)\]", body).group(1))
            self.assertIn("needs.schema-gate.result == 'success'", body)
        self.assertIn("inputs.action == 'rollback'", api)  # rollback to the previous image stays possible
        self.assertIn("!(github.event_name == 'workflow_dispatch' && inputs.action == 'rollback')", gate)
        self.assertNotIn("aws-actions", gate)
        self.assertNotIn("send-command", gate.lower())
        self.assertNotIn("aws ssm", gate.lower())
        self.assertIn("production-database-preflight", gate)
        self.assertIn("production_db_release.py compat", gate)
        self.assertIn("AWS_DEPLOY_ENABLED", api)  # the automatic deployment switch is untouched

    def test_only_the_compat_subcommand_is_allowed_outside_the_release_workflow(self):
        bad = {
            "plan.yml": "steps:\n  - run: python scripts/production_db_release.py plan --expected-project-ref x\n",
            "module.yml": "steps:\n  - run: python -m scripts.production_db_release apply --plan p\n",
            "continued.yml": "steps:\n  - run: |\n      python scripts/production_db_release.py --repo-root . \\\n        apply --plan p\n",
            "snapshot.yml": "steps:\n  - run: python scripts/production_db_release.py snapshot --output o\n",
        }
        for name, body in bad.items():
            with tempfile.TemporaryDirectory() as tmp:
                (Path(tmp) / name).write_text(body)
                self.assertTrue(inspect_workflows(Path(tmp)), name)
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "gate.yml").write_text("steps:\n  - run: python scripts/production_db_release.py compat --expected-project-ref x\n")
            self.assertEqual(inspect_workflows(Path(tmp)), [])

    def test_no_other_workflow_may_read_the_privileged_secret_or_start_the_release(self):
        for body in ("steps:\n  - env: { DATABASE_URL: '${{ secrets.PRODUCTION_DATABASE_APPLY_URL }}' }\n    run: echo\n",
                     "steps:\n  - run: gh workflow run production-database-release.yml -f scope=D-I\n"):
            with tempfile.TemporaryDirectory() as tmp:
                (Path(tmp) / "other.yml").write_text(body)
                self.assertTrue(inspect_workflows(Path(tmp)), body)

    def test_release_workflow_cannot_be_weakened_by_comments_or_extra_keys(self):
        v = self._variant
        self.assertTrue(any("required reviewers" in p for p in v(lambda t: t.replace("    environment: production-database-apply\n", "    # environment: production-database-apply\n", 1))))
        self.assertTrue(any("ready plan" in p for p in v(lambda t: t.replace("if: needs.preflight.outputs.status == 'ready'", "if: always()", 1))))
        self.assertTrue(any("--plan" in p for p in v(lambda t: _in_apply_call(t, "--plan \"$RUNNER_TEMP/approved/plan.json\" "))))
        self.assertTrue(any("--backup-evidence" in p for p in v(lambda t: _in_apply_call(t, "--backup-evidence \"$RUNNER_TEMP/backup-apply.json\" "))))
        self.assertTrue(any("continue-on-error" in p for p in v(lambda t: t.replace("    timeout-minutes: 20\n    # Required", "    timeout-minutes: 20\n    continue-on-error: true\n    # Required", 1))))
        self.assertTrue(any("only workflow it may dispatch" in p for p in v(lambda t: t.replace("gh workflow run backend-ci.yml", "gh workflow run other.yml", 1))))

    def test_release_scopes_are_explicit_pinned_and_match_the_workflow_and_manifest(self):
        scopes = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())
        workflow = (WORKFLOWS / "production-database-release.yml").read_text()
        options = re.search(r"scope:\n(?:.*\n)*?        options: \[(.*?)\]", workflow).group(1)
        self.assertEqual(sorted(re.findall(r'"([^"]+)"', options)), sorted(scopes))  # the workflow can only offer reviewed scopes
        for name, definition in scopes.items():
            self.assertIn(definition["verifier"], prm.VERIFIERS, name)
            self.assertEqual(set(definition["sha256"]), set(definition["versions"]))
            for entry in manifest["migrations"]:
                if entry["version"] in definition["sha256"]:
                    self.assertEqual(entry["sha256"], definition["sha256"][entry["version"]], f"{name} pin differs from the manifest for {entry['version']}")
        d_i = scopes["D-I"]
        self.assertEqual(d_i["versions"], [e["version"] for e in manifest["migrations"]][: len(d_i["versions"])])
        self.assertIn("20261114_j_one_submission_per_attempt", d_i["excludedVersions"])  # Stage J can never ride along with D-I
        self.assertFalse(list((ROOT / "database/migrations").glob("*one_submission_per_attempt*")))

    def test_deploy_script_still_has_health_check_and_rollback(self):
        script = (ROOT / "infra/terraform/scripts/deploy-api.sh").read_text()
        self.assertIn("Health check failed", script)
        self.assertIn("Rolled back to", script)



class _Expr:
    """Minimal evaluator for the subset of GitHub Actions `if:` expressions used by the deploy jobs (always(), &&, ||, !, ==, !=, contexts)."""
    TOKEN = re.compile(r"\s*(\|\||&&|==|!=|!|\(|\)|'[^']*'|[A-Za-z_][A-Za-z0-9_.\-]*\(\)|[A-Za-z_][A-Za-z0-9_.\-]*)")

    def __init__(self, text, context):
        self.tokens, pos = [], 0
        text = text.strip()
        while pos < len(text):
            m = self.TOKEN.match(text, pos)
            if not m:
                raise ValueError(f"cannot tokenize {text[pos:pos + 30]!r}")
            self.tokens.append(m.group(1)); pos = m.end()
        self.i, self.ctx = 0, context

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def eat(self):
        self.i += 1
        return self.tokens[self.i - 1]

    def value(self):
        result = self.or_()
        if self.peek() is not None:
            raise ValueError("trailing tokens")
        return result

    def or_(self):
        left = self.and_()
        while self.peek() == "||":
            self.eat(); right = self.and_(); left = bool(left) or bool(right)
        return left

    def and_(self):
        left = self.eq()
        while self.peek() == "&&":
            self.eat(); right = self.eq(); left = bool(left) and bool(right)
        return left

    def eq(self):
        left = self.not_()
        while self.peek() in ("==", "!="):
            op = self.eat(); right = self.not_()
            same = str(left).lower() == str(right).lower()
            left = same if op == "==" else not same
        return left

    def not_(self):
        if self.peek() == "!":
            self.eat(); return not self.not_()
        return self.atom()

    def atom(self):
        token = self.eat()
        if token == "(":
            inner = self.or_(); assert self.eat() == ")"; return inner
        if token.startswith("'"):
            return token[1:-1]
        if token == "always()":
            return True
        node = self.ctx
        for part in token.split("."):
            node = node.get(part, "") if isinstance(node, dict) else ""
        return node


def _job_if(workflow: str, job: str) -> str:
    body = re.search(rf"(?ms)^  {job}:\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)", workflow).group(1)
    return re.search(r"(?m)^    if: (.*)$", body).group(1)


class DeploymentSemanticsTests(unittest.TestCase):
    """Evaluates the real job conditions of backend-ci.yml for every combination that matters (proof that a missing migration cannot reach SSM)."""
    RESULTS = ("success", "failure", "skipped", "cancelled")

    def setUp(self):
        self.text = (WORKFLOWS / "backend-ci.yml").read_text()

    def ctx(self, event, action, gate, deploy_api="skipped", aws="true", api=True, web=True, ref="refs/heads/main", other="success", changes="success"):
        needs = {"schema-gate": {"result": gate}, "deploy-api": {"result": deploy_api}, "changes": {"result": changes, "outputs": {"api": str(api).lower(), "web": str(web).lower()}},
                 **{name: {"result": other} for name in ("api", "web", "docker", "database-safety")}}
        return {"github": {"ref": ref, "event_name": event}, "vars": {"AWS_DEPLOY_ENABLED": aws}, "inputs": {"action": action}, "needs": needs}

    def run_if(self, job, **kw):
        return _Expr(_job_if(self.text, job), self.ctx(**kw)).value()

    def test_no_schema_gate_success_means_no_api_or_web_deployment(self):
        for event, action, gate, api, web, other in itertools.product(("push", "workflow_dispatch"), ("deploy", ""), ("failure", "skipped", "cancelled"),
                                                                       (True, False), (True, False), ("success", "failure", "skipped")):
            for deploy_api in self.RESULTS:
                kw = dict(event=event, action=action, gate=gate, api=api, web=web, other=other)
                self.assertFalse(self.run_if("deploy-api", **kw), f"deploy-api would run: {kw}")
                self.assertFalse(self.run_if("deploy-web", deploy_api=deploy_api, **kw), f"deploy-web would run: {kw} deploy_api={deploy_api}")

    def test_a_passing_gate_still_requires_every_existing_condition(self):
        ok = dict(event="push", action="", gate="success")
        self.assertTrue(self.run_if("deploy-api", **ok))
        self.assertTrue(self.run_if("deploy-web", deploy_api="success", **ok))
        self.assertFalse(self.run_if("deploy-api", aws="false", **ok))  # AWS_DEPLOY_ENABLED=false still disables deployment
        self.assertFalse(self.run_if("deploy-api", ref="refs/heads/develop", **ok))
        self.assertFalse(self.run_if("deploy-api", changes="failure", **ok))
        self.assertFalse(self.run_if("deploy-api", other="failure", **ok))
        self.assertFalse(self.run_if("deploy-web", deploy_api="failure", **ok))
        self.assertFalse(self.run_if("deploy-web", deploy_api="skipped", api=True, **ok))  # API change not deployed => web waits
        self.assertTrue(self.run_if("deploy-web", deploy_api="skipped", api=False, **ok))

    def test_rollback_to_the_previous_image_is_not_blocked_by_the_gate(self):
        for gate in self.RESULTS:
            self.assertTrue(self.run_if("deploy-api", event="workflow_dispatch", action="rollback", gate=gate), gate)
        self.assertFalse(_Expr(_job_if(self.text, "schema-gate"), self.ctx("workflow_dispatch", "rollback", "skipped")).value())  # the gate itself is skipped for rollback

    def test_the_gate_runs_exactly_when_a_deployment_could_follow(self):
        def gate_runs(**kw):
            return _Expr(_job_if(self.text, "schema-gate"), self.ctx(gate="skipped", **kw)).value()
        self.assertTrue(gate_runs(event="push", action=""))
        self.assertTrue(gate_runs(event="workflow_dispatch", action="deploy"))
        self.assertFalse(gate_runs(event="push", action="", aws="false"))
        self.assertFalse(gate_runs(event="push", action="", api=False, web=False))
        self.assertFalse(gate_runs(event="push", action="", ref="refs/heads/develop"))

    def test_merging_the_ci_changes_cannot_start_ssm_while_the_gate_cannot_pass(self):
        # Before the first release the gate fails (secrets missing or migrations pending): the push-to-main run must end without any SSM step.
        for gate in ("failure", "skipped"):
            self.assertFalse(self.run_if("deploy-api", event="push", action="", gate=gate))
            self.assertFalse(self.run_if("deploy-web", event="push", action="", gate=gate, deploy_api="skipped"))
        deploy = re.search(r"(?ms)^  deploy-api:\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)", self.text).group(1)
        gate_body = re.search(r"(?ms)^  schema-gate:\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)", self.text).group(1)
        self.assertIn("aws ssm", deploy)  # SSM lives only in the gated deploy job
        self.assertNotIn("aws ssm", gate_body)
        self.assertNotIn("aws-actions", gate_body)
        self.assertNotIn("id-token", gate_body)  # the gate has no AWS credentials at all


class _FakeSupabase(http.server.BaseHTTPRequestHandler):
    payload: object = {}

    def do_GET(self):  # noqa: N802
        body = json.dumps(self.payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class BackupGateTests(unittest.TestCase):
    """The fixtures follow V1BackupsResponse of the public Supabase Management API OpenAPI spec (captured in fixtures/)."""

    def _serve(self, payload):
        handler = type("H", (_FakeSupabase,), {"payload": payload})
        server = http.server.HTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f"http://127.0.0.1:{server.server_port}"

    def _check(self, payload, token="t", flags=None):
        base = self._serve(payload)
        env = {"SUPABASE_ACCESS_TOKEN": token} if token else {}
        return run_cli(["check-backup", "--expected-project-ref", LABEL, "--allow-local-test-database", "--api-base", base, *(flags or [])], env)

    @staticmethod
    def _iso(hours_ago):
        return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()

    @classmethod
    def body(cls, pitr=True, walg=True, backups=None, window=True):
        now = int(datetime.now(timezone.utc).timestamp())
        return {"region": "ap-southeast-1", "walg_enabled": walg, "pitr_enabled": pitr, "backups": backups if backups is not None else [],
                "physical_backup_data": {"earliest_physical_backup_date_unix": now - 7 * 86400, "latest_physical_backup_date_unix": now - 3600} if window else {}}

    @classmethod
    def backup(cls, hours_ago, status="COMPLETED", physical=False):
        return {"id": 1, "is_physical_backup": physical, "status": status, "inserted_at": cls._iso(hours_ago)}

    def test_the_fixture_shape_is_the_documented_contract(self):
        schema = json.loads((Path(__file__).parent / "fixtures/supabase_v1_backups_response.schema.json").read_text())
        self.assertEqual(set(schema["required"]), {"region", "walg_enabled", "pitr_enabled", "backups", "physical_backup_data"})
        self.assertEqual(set(self.body()), set(schema["required"]))
        self.assertEqual(set(schema["properties"]["backups"]["items"]["properties"]["status"]["enum"]), prm.BACKUP_STATUSES)

    def test_missing_token_fails_closed(self):
        code, _, err = self._check(self.body(), token="")
        self.assertEqual(code, 1)
        self.assertIn("SUPABASE_ACCESS_TOKEN", err)

    def test_pitr_with_walg_and_a_physical_window_passes(self):
        code, out, _ = self._check(self.body())
        self.assertEqual(code, 0)
        self.assertTrue(json.loads(out)["pitrEnabled"])

    def test_a_fresh_completed_backup_passes_without_pitr(self):
        code, out, _ = self._check(self.body(pitr=False, walg=False, backups=[self.backup(3)], window=False))
        self.assertEqual(code, 0)
        self.assertFalse(json.loads(out)["pitrEnabled"])

    def test_weak_or_missing_recovery_evidence_is_refused(self):
        refused = [
            self.body(pitr=True, walg=False),                                   # PITR flag without WAL-G
            self.body(pitr=True, walg=True, window=False),                      # PITR flag without a physical backup window
            self.body(pitr=False, walg=False, backups=[], window=False),        # nothing at all
            self.body(pitr=False, backups=[self.backup(80)], window=False),     # stale backup
            self.body(pitr=False, backups=[self.backup(1, "FAILED")], window=False),
            self.body(pitr=False, backups=[self.backup(1, "PENDING")], window=False),
            self.body(pitr=False, backups=[self.backup(-5)], window=False),     # "future" backup timestamp
        ]
        for payload in refused:
            self.assertEqual(self._check(payload)[0], 1, payload)

    def test_contract_violations_fail_closed(self):
        good = self.body()
        for key in good:
            broken = {k: v for k, v in good.items() if k != key}
            self.assertEqual(self._check(broken)[0], 1, f"missing {key}")
        self.assertEqual(self._check({**good, "pitr_enabled": "true"})[0], 1)
        self.assertEqual(self._check({**good, "backups": [{"id": 1}]})[0], 1)
        self.assertEqual(self._check({**good, "backups": [{"id": 1, "is_physical_backup": False, "status": "WEIRD", "inserted_at": self._iso(1)}]})[0], 1)
        self.assertEqual(self._check({**good, "backups": [{"id": 1, "is_physical_backup": False, "status": "COMPLETED", "inserted_at": "yesterday"}]})[0], 1)
        self.assertEqual(self._check([])[0], 1)
        self.assertEqual(self._check({})[0], 1)

    def test_unreachable_api_fails_closed(self):
        code, _, err = run_cli(["check-backup", "--expected-project-ref", LABEL, "--allow-local-test-database", "--api-base", "http://127.0.0.1:9"], {"SUPABASE_ACCESS_TOKEN": "t"})
        self.assertEqual(code, 1)
        self.assertIn("failing closed", err)

    def test_only_the_supabase_api_or_a_loopback_double_may_be_queried(self):
        code, _, err = run_cli(["check-backup", "--expected-project-ref", prm.PRODUCTION_REF, "--api-base", "http://127.0.0.1:1"], {"SUPABASE_ACCESS_TOKEN": "t"})
        self.assertEqual(code, 1)
        self.assertIn("Management API", err)

    def test_wrong_project_reference_is_refused(self):
        code, _, err = run_cli(["check-backup", "--expected-project-ref", "someotherprojectref"], {"SUPABASE_ACCESS_TOKEN": "t"})
        self.assertEqual(code, 1)
        self.assertIn("Production project", err)


@unittest.skipUnless(URL, "VISTA_D03_MIGRATION_TEST_URL is not set (disposable loopback PostgreSQL required)")
class ReleaseFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.target = urlparse(URL)
        if cls.target.hostname not in {"127.0.0.1", "localhost", "::1"} or "supabase" in URL.lower():
            raise RuntimeError("These tests accept a loopback PostgreSQL server only")
        os.environ.setdefault("VISTA_DATABASE_PROJECT_REF", LABEL)
        cls._ensure_template()

    @classmethod
    def _psql(cls, database, sql, check=True):
        env = {**os.environ, "PGPASSWORD": cls.target.password or ""}
        proc = subprocess.run(["psql", "-h", cls.target.hostname, "-p", str(cls.target.port or 5432), "-U", cls.target.username, "-d", database,
                               "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, env=env)
        if check and proc.returncode:
            raise AssertionError(proc.stderr)
        return proc

    @classmethod
    def _db_url(cls, database):
        return f"postgresql://{cls.target.username}:{cls.target.password}@{cls.target.hostname}:{cls.target.port or 5432}/{database}"

    @classmethod
    def _ensure_template(cls):
        """Baseline-only database (the Production schema before D) with the seven earlier ledger rows."""
        if cls._psql("postgres", f"SELECT 1 FROM pg_database WHERE datname='{TEMPLATE}'").stdout.strip():
            return
        import bootstrap_dev_database as boot
        from sql_migration_runner import MigrationRunner
        cls._psql("postgres", f'CREATE DATABASE "{TEMPLATE}"')
        url = cls._db_url(TEMPLATE)
        try:
            connection, _ = boot.validate_dev_target(url, dict(os.environ))
            runner = MigrationRunner(ROOT, ROOT / "database/migrations/manifest.json", env={**os.environ, "DATABASE_URL": url + "?sslmode=disable"})
            sql = (ROOT / boot.BASELINE_FILE).read_text()
            for role in boot._acl_roles(sql):
                cls._psql("postgres", f'DO $$ BEGIN CREATE ROLE "{role}" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;')
            runner._psql(connection, "DROP SCHEMA public;\n" + sql, single_transaction=True)
            versions = ["20261104_curriculum_foundation", "20261105_question_bank_foundation", "20261106_classroom_enrollment_lifecycle",
                        "20261106_iot_lifecycle_foundation", "20261106_iot_publish_intent", "20261106_question_bank_quiz_attempt",
                        "20261108_iot_lifecycle_access_restrictions"]
            values = ",".join(f"('{v}','legacy-{i}','legacy','legacy','legacy','executed')" for i, v in enumerate(versions))
            cls._psql(TEMPLATE, f"INSERT INTO public.vista_schema_migrations(version,checksum,release_id,source_commit,operator_id,provenance) VALUES {values}")
        except Exception:
            cls._psql("postgres", f'DROP DATABASE IF EXISTS "{TEMPLATE}" WITH (FORCE)', check=False)
            raise

    def setUp(self):
        self.db = f"vista_test_rel_{uuid.uuid4().hex[:10]}"
        self._psql("postgres", f'CREATE DATABASE "{self.db}" TEMPLATE "{TEMPLATE}"')
        self.addCleanup(lambda: self._psql("postgres", f'DROP DATABASE IF EXISTS "{self.db}" WITH (FORCE)', check=False))
        self.url = self._db_url(self.db) + "?sslmode=disable"  # the runner defaults to sslmode=require; loopback test servers have no TLS
        self.tmp = Path(tempfile.mkdtemp(prefix="vista-release-test-"))
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))
        # Once Stage J is registered in the real manifest, the D-I scenarios run against a copy without it (as Production's D-I did).
        self.d_i_repo = self.release_repo() if any(e["version"] == J_VERSION for e in json.loads((ROOT / "database/migrations/manifest.json").read_text())["migrations"]) else None

    # -- helpers --------------------------------------------------------------------------------------------
    def sql(self, statement):
        return self._psql(self.db, statement).stdout.strip()

    def cli(self, *argv, repo=None, db_url=None, extra_env=None):
        repo = repo or self.d_i_repo
        base = ["--repo-root", str(repo)] if repo else []
        env = {"DATABASE_URL": db_url or self.url}
        env.update(extra_env or {})
        return run_cli([*base, *argv], env)

    def plan(self, repo=None, ref=LABEL, local=True, name="plan.json"):
        out = self.tmp / name
        args = ["plan", "--scope", "D-I", "--expected-project-ref", ref, "--output", str(out)] + (["--allow-local-test-database"] if local else [])
        code, stdout, stderr = self.cli(*args, repo=repo)
        return code, stderr, (json.loads(out.read_text()) if code == 0 else None), out

    def backup(self, age_minutes=1, pitr=True, project=LABEL):
        path = self.tmp / "backup.json"
        path.write_text(json.dumps({"projectRef": project, "pitrEnabled": pitr, "latestBackupAt": None if pitr else datetime.now(timezone.utc).isoformat(),
                                    "checkedAt": (datetime.now(timezone.utc) - timedelta(minutes=age_minutes)).isoformat()}))
        return path

    def apply(self, plan_path, backup_path, repo=None, db_url=None, reference="test-approval"):
        return self.cli("apply", "--scope", "D-I", "--expected-project-ref", LABEL, "--allow-local-test-database", "--plan", str(plan_path),
                        "--backup-evidence", str(backup_path), "--approval-reference", reference, "--operator-id", "tester",
                        "--output", str(self.tmp / "evidence.json"), repo=repo, db_url=db_url)

    def ledger(self):
        return json.loads(self.sql("SELECT json_agg(version ORDER BY version)::text FROM public.vista_schema_migrations"))

    def release_repo(self, mutate=None, extra_migration=None, repin_scopes=True, with_j=False):
        """A throw-away Git copy of the release inputs whose manifest is re-pinned after `mutate(repo_path)` (the real repo is never touched)."""
        repo = self.tmp / f"repo-{uuid.uuid4().hex[:6]}"
        shutil.copytree(ROOT / "scripts", repo / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / "database/baselines", repo / "database/baselines")
        shutil.copytree(ROOT / "database/migrations", repo / "database/migrations")
        shutil.copy2(ROOT / "database/release-scopes.json", repo / "database/release-scopes.json")
        if mutate:
            mutate(repo)
        manifest_path = repo / "database/migrations/manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["migrations"] = [e for e in manifest["migrations"] if e["version"] != J_VERSION]  # D-I scenarios never see Stage J
        (repo / "database/migrations" / f"{J_VERSION}.sql").unlink(missing_ok=True)
        if with_j:
            shutil.copy2(J_SQL, repo / "database/migrations" / f"{J_VERSION}.sql")
            manifest["migrations"].append({"version": J_VERSION, "path": f"database/migrations/{J_VERSION}.sql", "sha256": "x", "order": len(manifest["migrations"]) + 1})
        if extra_migration:
            manifest["migrations"].append(extra_migration(repo, len(manifest["migrations"]) + 1))
        for entry in manifest["migrations"]:
            entry["sha256"] = __import__("hashlib").sha256((repo / entry["path"]).read_bytes()).hexdigest()
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        if repin_scopes:
            scopes_path = repo / "database/release-scopes.json"
            scopes = json.loads(scopes_path.read_text())
            for definition in scopes["scopes"].values():
                for version in list(definition["sha256"]):
                    entry = next((e for e in manifest["migrations"] if e["version"] == version), None)
                    if entry:
                        definition["sha256"][version] = entry["sha256"]
            scopes_path.write_text(json.dumps(scopes, indent=2) + "\n")
        git = lambda *a: subprocess.run(["git", *a], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()  # noqa: E731
        git("init", "-q"); git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t")
        git("add", "-A"); git("commit", "-qm", "inputs")
        manifest["sourceCommit"] = git("rev-parse", "HEAD")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        git("add", "-A"); git("commit", "-qm", "manifest")
        return repo

    # -- scenarios ------------------------------------------------------------------------------------------
    def test_d_to_i_pending_produces_a_secret_free_deterministic_plan(self):
        code, err, plan, _ = self.plan()
        self.assertEqual(code, 0, err)
        self.assertEqual(plan["status"], "ready")
        self.assertEqual([p["version"] for p in plan["pending"]], prm.SCOPES["D-I"])
        self.assertEqual(plan["stageJ"], "excluded")
        self.assertEqual(plan["alreadyApplied"], [])
        self.assertNotIn(self.target.password or "x-none", json.dumps(plan))
        code2, _, plan2, _ = self.plan(name="plan2.json")
        self.assertEqual(plan["planHash"], plan2["planHash"])

    def test_no_pending_migrations(self):
        first = self.plan()
        self.assertEqual(self.apply(first[3], self.backup())[0], 0)
        code, err, plan, plan_path = self.plan(name="again.json")
        self.assertEqual(code, 0, err)
        self.assertEqual(plan["status"], "nothing_to_do")
        self.assertEqual(plan["pending"], [])
        code, _, err = self.apply(plan_path, self.backup())
        self.assertEqual(code, 1)
        self.assertIn("nothing to apply", err)

    def test_wrong_supabase_project_is_refused(self):
        self.assertEqual(self.plan(ref="a-different-local-label")[0], 1)
        code, err, _, _ = self.plan(ref=prm.PRODUCTION_REF)  # Production ref with a loopback database
        self.assertEqual(code, 1)
        self.assertIn("Production", err)
        code, err, _, _ = self.plan(local=False)  # loopback database without the explicit test flag
        self.assertEqual(code, 1)
        self.assertIn("loopback", err.lower())

    def test_invalid_checksum_in_the_ledger_or_the_source_is_refused(self):
        self.sql("INSERT INTO public.vista_schema_migrations(version,checksum,release_id,source_commit,operator_id,provenance) "
                 "VALUES ('20261110_d_activity_content','not-the-manifest-checksum','x','x','x','executed')")
        code, err, _, _ = self.plan()
        self.assertEqual(code, 1)
        self.assertIn("checksum mismatch", err)

    def test_tampered_migration_source_is_refused(self):
        repo = self.release_repo()
        (repo / "database/migrations/20261110_d_activity_content.sql").write_text("ALTER TABLE public.users ADD COLUMN pwned int;\n")  # not re-pinned
        code, err, _, _ = self.plan(repo=repo)
        self.assertEqual(code, 1)
        self.assertRegex(err.lower(), r"manifest|checksum|sha")

    def test_missing_or_stale_backup_evidence_blocks_apply(self):
        _, _, plan, plan_path = self.plan()
        missing = self.apply(plan_path, self.tmp / "no-such-backup.json")
        self.assertEqual(missing[0], 1)
        self.assertIn("Backup evidence", missing[2])
        stale = self.apply(plan_path, self.backup(age_minutes=120))
        self.assertEqual(stale[0], 1)
        self.assertIn("older than", stale[2])
        wrong_project = self.apply(plan_path, self.backup(project="another-project"))
        self.assertEqual(wrong_project[0], 1)
        no_recovery = self.tmp / "norecovery.json"
        no_recovery.write_text(json.dumps({"projectRef": LABEL, "pitrEnabled": False, "latestBackupAt": None, "checkedAt": datetime.now(timezone.utc).isoformat()}))
        self.assertEqual(self.apply(plan_path, no_recovery)[0], 1)
        self.assertEqual(self.ledger().__len__(), 7)  # nothing was applied

    def test_apply_without_the_approved_plan_or_privileged_credential_fails_closed(self):
        _, _, plan, plan_path = self.plan()
        self.assertEqual(self.apply(self.tmp / "no-plan.json", self.backup())[0], 1)
        code, _, err = run_cli(["apply", "--scope", "D-I", "--expected-project-ref", LABEL, "--allow-local-test-database", "--plan", str(plan_path),
                                "--backup-evidence", str(self.backup()), "--approval-reference", "r", "--operator-id", "o"], {})  # no DATABASE_URL
        self.assertEqual(code, 1)
        tampered = json.loads(plan_path.read_text()); tampered["planHash"] = "0" * 64
        bad = self.tmp / "tampered.json"; bad.write_text(json.dumps(tampered))
        code, _, err = self.apply(bad, self.backup())
        self.assertEqual(code, 1)
        self.assertIn("State changed", err)
        code, _, _ = run_cli(["apply", "--scope", "D-I", "--expected-project-ref", LABEL, "--allow-local-test-database", "--plan", str(plan_path),
                              "--backup-evidence", str(self.backup()), "--operator-id", "o"], {"DATABASE_URL": self.url})  # an approval reference is mandatory
        self.assertEqual(code, 2)
        self.assertEqual(self.ledger().__len__(), 7)

    def test_schema_or_ledger_drift_before_or_after_the_plan_blocks_apply(self):
        self.sql("CREATE TABLE public.surprise_table(id int)")
        code, err, _, _ = self.plan()
        self.assertEqual(code, 1)
        self.assertIn("Catalog drift", err)
        self.sql("DROP TABLE public.surprise_table")
        _, _, plan, plan_path = self.plan()
        self.sql("CREATE TABLE public.surprise_after_plan(id int)")
        code, _, err = self.apply(plan_path, self.backup())
        self.assertEqual(code, 1)
        self.assertRegex(err, "State changed|Catalog drift")  # revalidation refuses either way
        self.sql("DROP TABLE public.surprise_after_plan")
        self.sql("INSERT INTO public.vista_schema_migrations(version,checksum,release_id,source_commit,operator_id,provenance) VALUES ('20270101_unmanifested','z','x','x','x','executed')")
        self.assertEqual(self.apply(plan_path, self.backup())[0], 1)
        self.assertEqual(self.sql("SELECT to_regclass('public.learning_media_assets') IS NULL"), "t")

    def test_failed_migration_rolls_back_everything(self):
        repo = self.release_repo(mutate=lambda r: (r / "database/migrations/20261113_i_attempt_submission_foundation.sql").write_text("SELECT 1/0;\n"))
        code, err, plan, plan_path = self.plan(repo=repo)
        self.assertEqual(code, 0, err)
        code, _, err = self.apply(plan_path, self.backup(), repo=repo)
        self.assertEqual(code, 1)
        self.assertIn("rolled back", err)
        self.assertEqual(len(self.ledger()), 7)  # D-H were rolled back together with I
        self.assertEqual(self.sql("SELECT to_regclass('public.learning_media_assets') IS NULL"), "t")
        self.assertEqual(self.sql("SELECT count(*) FROM pg_attribute WHERE attrelid='public.learning_activities'::regclass AND attname='content' AND NOT attisdropped"), "0")

    def test_successful_d_to_i_release_is_verified_and_stage_j_is_not_applied(self):
        self.sql("SET session_replication_role=replica; INSERT INTO public.learning_programs(id,owner_user_id) VALUES (gen_random_uuid(),gen_random_uuid())")
        _, _, plan, plan_path = self.plan()
        code, stdout, err = self.apply(plan_path, self.backup())
        self.assertEqual(code, 0, err)
        evidence = json.loads((self.tmp / "evidence.json").read_text())
        self.assertEqual(evidence["applied"], prm.SCOPES["D-I"])
        self.assertEqual(evidence["postflight"]["failed"], [])
        self.assertEqual(evidence["planHash"], plan["planHash"])
        self.assertEqual(len(self.ledger()), 13)
        self.assertEqual(self.sql("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_learning_submission_attempt')"), "f")  # Stage J absent
        self.assertEqual(self.sql("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_submissions_assignment_id_learner_user_id_key')"), "t")
        self.assertNotIn(self.target.password or "x-none", json.dumps(evidence))

    def test_stage_j_cannot_enter_the_release(self):
        def add_j(repo, order):
            src = ROOT / "database/staged-migrations/20261114_j_one_submission_per_attempt.sql"
            target = repo / "database/migrations/20261114_j_one_submission_per_attempt.sql"
            shutil.copy2(src, target)
            return {"version": "20261114_j_one_submission_per_attempt", "path": "database/migrations/20261114_j_one_submission_per_attempt.sql", "sha256": "x", "order": order}
        repo = self.release_repo(extra_migration=add_j)
        code, err, _, _ = self.plan(repo=repo)
        self.assertEqual(code, 1)
        self.assertRegex(err, r"Stage J|approved scope")

    # -- extensibility ----------------------------------------------------------------------------------------
    def test_unknown_unpinned_or_unverified_scopes_cannot_be_planned(self):
        code, _, err = self.cli("plan", "--scope", "K", "--expected-project-ref", LABEL, "--allow-local-test-database")
        self.assertEqual(code, 1)
        self.assertIn("not defined", err)

        def unverified(repo):
            path = repo / "database/release-scopes.json"
            data = json.loads(path.read_text()); data["scopes"]["D-I"]["verifier"] = "nobody"; path.write_text(json.dumps(data))
        code, err, _, _ = self.plan(repo=self.release_repo(mutate=unverified))
        self.assertEqual(code, 1)
        self.assertIn("unregistered postflight verifier", err)

        def repinned_wrong(repo):
            path = repo / "database/release-scopes.json"
            data = json.loads(path.read_text()); data["scopes"]["D-I"]["sha256"]["20261110_d_activity_content"] = "0" * 64; path.write_text(json.dumps(data))
        code, err, _, _ = self.plan(repo=self.release_repo(mutate=repinned_wrong, repin_scopes=False))
        self.assertEqual(code, 1)
        self.assertIn("pinned", err)

    def test_changed_migration_bytes_cannot_ride_under_an_approved_scope(self):
        def edit(repo):
            path = repo / "database/migrations/20261110_d_activity_content.sql"
            path.write_text(path.read_text() + "\n-- a reviewed-looking comment\n")
        code, err, _, _ = self.plan(repo=self.release_repo(mutate=edit, repin_scopes=False))  # manifest re-pinned, scope pins not
        self.assertEqual(code, 1)
        self.assertIn("pinned by the approved scope", err)

    def test_a_future_migration_needs_its_own_reviewed_scope_and_leaves_d_i_untouched(self):
        def add_k(repo, order):
            (repo / "database/migrations/20261201_k_future_example.sql").write_text("CREATE TABLE public.future_example(id int);\n")
            return {"version": "20261201_k_future_example", "path": "database/migrations/20261201_k_future_example.sql", "sha256": "x", "order": order}

        def define_k(repo):
            path = repo / "database/release-scopes.json"
            data = json.loads(path.read_text())
            data["scopes"]["K"] = {"description": "test", "requiresApplied": list(data["scopes"]["D-I"]["versions"]), "versions": ["20261201_k_future_example"],
                                   "sha256": {"20261201_k_future_example": "x"}, "excludedVersions": ["20261114_j_one_submission_per_attempt"], "verifier": "test_k"}
            path.write_text(json.dumps(data))
        class StubVerifier:
            snapshot = staticmethod(lambda url: {})
            verify = staticmethod(lambda url, pre, root=None: [("future table exists", True, "")])
        prm.VERIFIERS["test_k"] = StubVerifier
        self.addCleanup(prm.VERIFIERS.pop, "test_k", None)
        repo = self.release_repo(mutate=define_k, extra_migration=add_k)
        # D-I no longer matches a manifest that has a further migration: it cannot be (re)used for anything but D-I itself
        code, err, _, _ = self.plan(repo=repo)
        self.assertEqual(code, 1)
        self.assertIn("approved scope", err)
        # K requires D-I to be applied first
        code, _, err = self.cli("plan", "--scope", "K", "--expected-project-ref", LABEL, "--allow-local-test-database", repo=repo)
        self.assertEqual(code, 1)
        self.assertRegex(err, "pending migrations are not exactly|requires")
        # bring D-I in through the real flow, then K is plannable and applicable with its own (registered) verifier
        _, _, _, plan_path = self.plan()
        self.assertEqual(self.apply(plan_path, self.backup())[0], 0)
        out = self.tmp / "k-plan.json"
        code, _, err = self.cli("plan", "--scope", "K", "--expected-project-ref", LABEL, "--allow-local-test-database", "--output", str(out), repo=repo)
        self.assertEqual(code, 0, err)
        plan = json.loads(out.read_text())
        self.assertEqual([p["version"] for p in plan["pending"]], ["20261201_k_future_example"])
        self.assertEqual(plan["alreadyApplied"], prm.SCOPES["D-I"])
        self.assertIsNone(plan["catalog"])  # the 2026-11-09 baseline comparison only applies to the first release

        code, _, err = self.cli("apply", "--scope", "K", "--expected-project-ref", LABEL, "--allow-local-test-database", "--plan", str(out), "--backup-evidence", str(self.backup()),
                                "--approval-reference", "k-release", "--operator-id", "tester", "--output", str(self.tmp / "k-evidence.json"), repo=repo)
        self.assertEqual(code, 0, err)
        self.assertEqual(self.sql("SELECT to_regclass('public.future_example') IS NOT NULL"), "t")
        self.assertEqual(self.sql("SELECT count(*) FROM public.vista_schema_migrations"), "14")

    def test_api_deployment_is_blocked_until_the_schema_is_released(self):
        code, _, err = self.cli("compat", "--expected-project-ref", LABEL, "--allow-local-test-database")
        self.assertEqual(code, 1)
        self.assertIn("incompatible", err)
        self.assertIn("running API was not touched", err)
        _, _, _, plan_path = self.plan()
        self.assertEqual(self.apply(plan_path, self.backup())[0], 0)
        code, out, err = self.cli("compat", "--expected-project-ref", LABEL, "--allow-local-test-database")
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)["status"], "compatible")

    # -- Stage 2 (scope J) --------------------------------------------------------------------------------------
    def j_repo(self, mutate=None, repin_scopes=True):
        return self.release_repo(mutate=mutate, with_j=True, repin_scopes=repin_scopes)

    def j_plan(self, repo, name="j-plan.json"):
        out = self.tmp / name
        code, _, err = self.cli("plan", "--scope", "J", "--expected-project-ref", LABEL, "--allow-local-test-database", "--output", str(out), repo=repo)
        return code, err, (json.loads(out.read_text()) if code == 0 else None), out

    def j_apply(self, plan_path, backup_path, repo, reference="j-approval"):
        return self.cli("apply", "--scope", "J", "--expected-project-ref", LABEL, "--allow-local-test-database", "--plan", str(plan_path), "--backup-evidence", str(backup_path),
                        "--approval-reference", reference, "--operator-id", "tester", "--output", str(self.tmp / "j-evidence.json"), repo=repo)

    def uid(self):
        return str(uuid.uuid4())

    def seed_legacy_world(self):
        """Pre-D03 data as the old API left it (baseline schema): one overwritten attempt with a grade (uncertain), one clean graded row,
        one clean ungraded row, and an earlier attempt whose own row was overwritten but whose snapshots match one stored version."""
        w = {k: self.uid() for k in ("org", "course", "lesson", "assignment", "offering", "classroom", "delivery")}
        s = uuid.uuid4().hex[:8]
        self.sql(f"""
          INSERT INTO organizations(id,name,type,segment) VALUES ('{w['org']}','o{s}','institution','education');
          INSERT INTO learning_courses(id,title,status) VALUES ('{w['course']}','c{s}','published');
          INSERT INTO learning_lessons(id,course_id,title,ordinal) VALUES ('{w['lesson']}','{w['course']}','L1',1);
          INSERT INTO learning_assignments(id,lesson_id,title,constraints) VALUES ('{w['assignment']}','{w['lesson']}','Program','{{"kind":"symbolic_program"}}');
          INSERT INTO learning_course_offerings(id,course_id,organization_id,code,status) VALUES ('{w['offering']}','{w['course']}','{w['org']}','of{s}','active');
          INSERT INTO learning_classrooms(id,organization_id,offering_id,name,code) VALUES ('{w['classroom']}','{w['org']}','{w['offering']}','r{s}','r{s}');
          INSERT INTO learning_classroom_assignments(id,classroom_id,assignment_id,status) VALUES ('{w['delivery']}','{w['classroom']}','{w['assignment']}','published');""")

        def user():
            u = self.uid(); self.sql(f"INSERT INTO users(id,full_name,signup_method,status) VALUES ('{u}','L','admin_created','active')"); return u

        def program(learner, workspace, robot):
            p, v = self.uid(), self.uid()
            self.sql(f"""INSERT INTO learning_programs(id,owner_user_id,assignment_id) VALUES ('{p}','{learner}','{w['assignment']}');
                         INSERT INTO learning_program_versions(id,program_id,version_number,workspace_json,robot_program) VALUES ('{v}','{p}',1,'{workspace}'::jsonb,'{robot}'::jsonb)""")
            return p, v

        def attempt(learner, number, prog, workspace, robot):
            a = self.uid()
            self.sql(f"""INSERT INTO learning_assignment_attempts(id,classroom_assignment_id,learner_user_id,program_id,attempt_number,status,workspace_snapshot,program_snapshot,submitted_at)
                         VALUES ('{a}','{w['delivery']}','{learner}','{prog}',{number},'submitted','{workspace}'::jsonb,'{robot}'::jsonb,now())""")
            return a

        def submission(learner, prog, version):
            sid = self.uid()
            self.sql(f"INSERT INTO learning_submissions(id,assignment_id,learner_user_id,program_id,program_version_id,status,submitted_at) VALUES ('{sid}','{w['assignment']}','{learner}','{prog}','{version}','submitted',now())")
            return sid

        reviewer = user()
        a = user(); p1, v1 = program(a, '{"b":"one"}', '{"s":"one"}'); p2, v2 = program(a, '{"b":"two"}', '{"s":"two"}')
        at1 = attempt(a, 1, p1, '{"b":"one"}', '{"s":"one"}'); at2 = attempt(a, 2, p2, '{"b":"two"}', '{"s":"two"}')
        sub_a = submission(a, p2, v2)
        self.sql(f"""INSERT INTO learning_assessments(submission_id,reviewer_user_id,overall_feedback,reviewed_at) VALUES ('{sub_a}','{reviewer}','good',now());
                     INSERT INTO learning_feedback(submission_id,author_user_id,content) VALUES ('{sub_a}','{reviewer}','nice')""")
        f = user(); pf, vf = program(f, '{"b":1}', '{"s":1}'); atf = attempt(f, 1, pf, '{"b":1}', '{"s":1}'); sub_f = submission(f, pf, vf)
        self.sql(f"INSERT INTO learning_assessments(submission_id,reviewer_user_id,overall_feedback,reviewed_at) VALUES ('{sub_f}','{reviewer}','solid',now())")
        b = user(); pb, vb = program(b, '{"b":2}', '{"s":2}'); atb = attempt(b, 1, pb, '{"b":2}', '{"s":2}'); sub_b = submission(b, pb, vb)
        return {"w": w, "at1": at1, "at2": at2, "atf": atf, "atb": atb, "sub_a": sub_a, "sub_f": sub_f, "sub_b": sub_b}

    def release_d_i(self):
        _, _, _, plan_path = self.plan()
        code, _, err = self.apply(plan_path, self.backup())
        self.assertEqual(code, 0, err)

    def test_j_is_a_separate_reviewed_scope_and_cannot_be_planned_before_its_prerequisites_or_activation(self):
        code, err, _, _ = self.j_plan(self.j_repo())  # D-I not applied yet
        self.assertEqual(code, 1)
        self.assertRegex(err, "pending migrations are not exactly|requires")
        self.release_d_i()
        code, err, _, _ = self.j_plan(None)  # manifest without J (the state before the activation phase)
        self.assertEqual(code, 1)
        self.assertIn("approved scope", err)

    def test_stage_1_to_stage_2_transition_through_the_release_tooling_preserves_history_and_applies_policy_a(self):
        seeded = self.seed_legacy_world()
        self.release_d_i()  # Stage 1 backfill runs inside D-I
        repo = self.j_repo()
        code, err, plan, plan_path = self.j_plan(repo)
        self.assertEqual(code, 0, err)
        self.assertEqual(plan["status"], "ready")
        self.assertEqual([p["version"] for p in plan["pending"]], [J_VERSION])
        self.assertEqual(plan["alreadyApplied"], prm.SCOPES["D-I"])
        self.assertEqual(plan["stageJ"], "in-scope")
        self.assertEqual(plan["catalog"], {"tables": 91, "rls_enabled": 49, "policies": 0, "triggers": 21, "functions": 14})  # strict fingerprint before
        self.assertEqual(plan["dataPreview"]["graded_without_attempt"], 0)
        self.assertEqual(plan["dataPreview"]["submissions"], 3)
        self.assertEqual(plan["dataPreview"]["attempts_finalized_without_submission"], 1)  # the overwritten earlier attempt
        self.assertEqual(self.sql("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_submissions_assignment_id_learner_user_id_key')"), "t")
        code, _, err = self.j_apply(plan_path, self.backup(), repo)
        self.assertEqual(code, 0, err)
        evidence = json.loads((self.tmp / "j-evidence.json").read_text())
        self.assertEqual(evidence["applied"], [J_VERSION])
        self.assertEqual(evidence["postflight"]["failed"], [])
        self.assertGreaterEqual(evidence["postflight"]["passed"], 30)
        self.assertEqual(len(self.ledger()), 14)
        self.assertEqual(self.sql("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_submissions_assignment_id_learner_user_id_key')"), "f")
        self.assertEqual(self.sql("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_learning_submission_attempt' AND tgenabled='O')"), "t")
        self.assertEqual(self.sql("SELECT count(*) FROM learning_submissions"), "4")  # 3 original + the one reconstructed earlier attempt
        self.assertEqual(self.sql("SELECT count(*) FROM learning_submissions WHERE origin='reconstructed' AND attempt_id='%s'" % seeded["at1"]), "1")
        self.assertEqual(self.sql("SELECT count(*) FROM learning_assessments"), "2")  # nothing deleted
        # policy A: the clean grade stays visible, the uncertain one is held, the ungraded attempt is untouched
        rel = lambda a: self.sql(f"SELECT COALESCE(grading_release_origin,'none')||'|'||(grading_released_by IS NULL) FROM learning_assignment_attempts WHERE id='{a}'")
        self.assertEqual(rel(seeded["atf"]), "legacy_visible|true")
        self.assertEqual(rel(seeded["at2"]), "none|true")
        self.assertEqual(rel(seeded["atb"]), "none|true")
        self.assertEqual(self.sql(f"SELECT classification FROM learning_submission_backfill_audit WHERE stage='stage2' AND classification='legacy_grading_withheld_uncertain' AND submission_id='{seeded['sub_a']}'"), "legacy_grading_withheld_uncertain")
        # the approval is spent: a new plan has nothing to do and the old plan cannot be replayed
        _, _, again, _ = self.j_plan(repo, name="j-again.json")
        self.assertEqual(again["status"], "nothing_to_do")
        code, _, err = self.j_apply(plan_path, self.backup(), repo)
        self.assertEqual(code, 1)

    def test_j_apply_needs_fresh_backup_evidence_and_the_approved_plan(self):
        self.release_d_i()
        repo = self.j_repo()
        _, _, _, plan_path = self.j_plan(repo)
        code, _, err = self.j_apply(plan_path, self.backup(age_minutes=45), repo)
        self.assertEqual(code, 1)
        self.assertIn("older than", err)
        missing = self.tmp / "nope.json"
        self.assertEqual(self.j_apply(plan_path, missing, repo)[0], 1)
        self.assertEqual(self.j_apply(self.tmp / "missing-plan.json", self.backup(), repo)[0], 1)
        d_i_plan = self.tmp / "d-i-plan.json"
        d_i_plan.write_text(json.dumps({**json.loads(plan_path.read_text()), "scope": "D-I"}))
        code, _, err = self.j_apply(d_i_plan, self.backup(), repo)
        self.assertEqual(code, 1)
        self.assertIn("scope differs", err)
        self.assertEqual(len(self.ledger()), 13)  # nothing was applied by any refusal

    def test_j_plan_fails_on_catalog_drift_or_unreviewed_graded_rows_and_apply_on_data_drift(self):
        self.release_d_i()
        repo = self.j_repo()
        self.sql("CREATE TABLE public.stray_table(id int)")
        code, err, _, _ = self.j_plan(repo)
        self.assertEqual(code, 1)
        self.assertIn("Catalog differs", err)
        self.sql("DROP TABLE public.stray_table")
        seeded = self.seed_legacy_world()  # written after Stage 1, so the rows have no attempt_id yet
        code, err, _, _ = self.j_plan(repo)
        self.assertEqual(code, 1)
        self.assertIn("have no attempt", err)
        self.sql("DELETE FROM learning_assessments; DELETE FROM learning_feedback")  # ungraded rows are fine
        code, err, _, plan_path = self.j_plan(repo)
        self.assertEqual(code, 0, err)
        self.sql(f"INSERT INTO learning_submissions(assignment_id,learner_user_id,status,submitted_at) VALUES ('{seeded['w']['assignment']}','{self.sql('SELECT id FROM users LIMIT 1')}','submitted',now())")
        code, _, err = self.j_apply(plan_path, self.backup(), repo)
        self.assertEqual(code, 1)
        self.assertIn("State changed", err)

    def test_j_tampered_or_failing_migration_cannot_ride_or_leaves_no_partial_state(self):
        self.release_d_i()

        code, err, _, _ = self.j_plan(self.j_repo(), name="ok.json")
        self.assertEqual(code, 0, err)
        # bytes edited after the scope pinned them: the manifest is re-pinned, the scope is not
        repo = self.release_repo(with_j=True, repin_scopes=False)
        (repo / f"database/migrations/{J_VERSION}.sql").write_text((repo / f"database/migrations/{J_VERSION}.sql").read_text() + "\n-- x\n")
        subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True); subprocess.run(["git", "-C", str(repo), "commit", "-qm", "edit"], check=True)
        code, err, _, _ = self.j_plan(repo, name="tampered.json")
        self.assertEqual(code, 1)
        self.assertRegex(err, "Checksum mismatch|pinned by the approved scope")  # the manifest/Git provenance check or the scope pin, whichever sees it first

        # a migration that fails at its very end rolls back as a whole: still Stage 1, ledger untouched
        sabotaged = self.release_repo(with_j=True)
        path = sabotaged / f"database/migrations/{J_VERSION}.sql"
        path.write_text(path.read_text() + "\nSELECT 1/0;\n")
        manifest_path = sabotaged / "database/migrations/manifest.json"
        manifest = json.loads(manifest_path.read_text())
        for entry in manifest["migrations"]:
            entry["sha256"] = hashlib.sha256((sabotaged / entry["path"]).read_bytes()).hexdigest()
        scopes_path = sabotaged / "database/release-scopes.json"
        scopes = json.loads(scopes_path.read_text()); scopes["scopes"]["J"]["sha256"][J_VERSION] = next(e["sha256"] for e in manifest["migrations"] if e["version"] == J_VERSION)
        scopes_path.write_text(json.dumps(scopes, indent=2) + "\n"); manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        git = lambda *a: subprocess.run(["git", "-C", str(sabotaged), *a], capture_output=True, text=True, check=True).stdout.strip()  # noqa: E731
        git("add", "-A"); git("commit", "-qm", "sabotage")
        manifest["sourceCommit"] = git("rev-parse", "HEAD"); manifest_path.write_text(json.dumps(manifest, indent=2) + "\n"); git("add", "-A"); git("commit", "-qm", "pin")
        code, err, _, plan_path = self.j_plan(sabotaged, name="sab.json")
        self.assertEqual(code, 0, err)
        code, _, err = self.j_apply(plan_path, self.backup(), sabotaged)
        self.assertEqual(code, 1)
        self.assertIn("rolled back", err)
        self.assertEqual(len(self.ledger()), 13)
        self.assertEqual(self.sql("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_submissions_assignment_id_learner_user_id_key')"), "t")
        self.assertEqual(self.sql("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_learning_submission_attempt')"), "f")

    def test_j_postflight_detects_rewritten_grades_and_policy_violations(self):
        from scripts import verify_production_release_j as vj
        seeded = self.seed_legacy_world()
        self.release_d_i()
        repo = self.j_repo()
        pre = vj.snapshot(self.url)
        _, _, _, plan_path = self.j_plan(repo)
        self.assertEqual(self.j_apply(plan_path, self.backup(), repo)[0], 0)
        self.assertEqual([r for r in vj.verify(self.url, pre, root=repo) if not r[1]], [])
        self.sql("UPDATE learning_assessments SET overall_feedback='rewritten'")
        failed = [r[0] for r in vj.verify(self.url, pre, root=repo) if not r[1]]
        self.assertIn("content unchanged (digest): learning_assessments", failed)
        self.sql("UPDATE learning_assessments SET overall_feedback='good' WHERE overall_feedback='rewritten' AND submission_id='%s'" % seeded["sub_a"])
        self.sql(f"UPDATE learning_assessments SET overall_feedback='solid' WHERE submission_id='{seeded['sub_f']}'")
        self.sql(f"UPDATE learning_assignment_attempts SET grading_released_at=now(), grading_release_origin='legacy_visible' WHERE id='{seeded['at2']}'")  # an uncertain grade leaks
        failed = [r[0] for r in vj.verify(self.url, pre, root=repo) if not r[1]]
        self.assertIn("policy A: uncertain grades stay withheld (unreleased)", failed)

    def test_schema_gate_blocks_deployments_until_j_is_applied_and_then_passes(self):
        self.release_d_i()
        repo = self.j_repo()  # the manifest of the build being deployed already lists J
        code, _, err = self.cli("compat", "--expected-project-ref", LABEL, "--allow-local-test-database", repo=repo)
        self.assertEqual(code, 1)
        self.assertIn(J_VERSION, err)
        self.assertIn("running API was not touched", err)
        code, err_, _, plan_path = self.j_plan(repo)
        self.assertEqual(self.j_apply(plan_path, self.backup(), repo)[0], 0)
        code, out, err = self.cli("compat", "--expected-project-ref", LABEL, "--allow-local-test-database", repo=repo)
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)["status"], "compatible")

    def test_j_scope_is_pinned_to_the_file_that_will_be_released(self):
        scope = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]["J"]
        self.assertEqual(scope["sha256"][J_VERSION], hashlib.sha256(J_SQL.read_bytes()).hexdigest())
        self.assertEqual(scope["requiresApplied"], json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]["D-I"]["versions"])
        self.assertEqual(scope["excludedVersions"], [])
        self.assertEqual(sum(p.exists() for p in J_CANDIDATES), 1)  # staged XOR registered, never both


if __name__ == "__main__":
    unittest.main()
