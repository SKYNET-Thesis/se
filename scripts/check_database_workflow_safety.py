#!/usr/bin/env python3
"""Fail if a GitHub Actions workflow can run a database migration command.

The single exception is the approval-gated production-database-release.yml calling scripts/production_db_release.py apply; its
structure (manual trigger, main only, reviewer-gated environment, privileged secret scoped to the apply job, serialized, inputs only
via env) is verified here, and any other workflow that tries to apply migrations still fails.
"""

from __future__ import annotations

import argparse
import re
import shlex
import sys
from pathlib import Path

FORBIDDEN = (
    ("Prisma Migrate", re.compile(r"\bprisma\s+migrate(?:\s+(?:deploy|dev|resolve|reset))?\b", re.I)),
    ("Prisma Migrate package script", re.compile(r"\bprisma:migrate\b", re.I)),
    ("Prisma db push", re.compile(r"\bprisma\s+db\s+push\b", re.I)),
    ("Supabase db push", re.compile(r"\bsupabase\s+db\s+push\b", re.I)),
    ("SQL migration runner apply", re.compile(r"\bsql_migration_runner(?:\.py)?\b[\s\S]{0,512}?\s--apply\b", re.I)),
    (
        "SQL migration runner execution",
        re.compile(r"\b(?:run|apply|execute)[-_](?:sql[-_]?)?migrations?\b|\b(?:run|apply)[-_]database[-_]migrations?\b", re.I),
    ),
    (
        "Production release wrapper apply",
        re.compile(r"\bproduction_db_release(?:\.py)?\b[^\n]{0,160}?\bapply\b", re.I),
    ),
    (
        "psql migration file execution",
        re.compile(r"\bpsql\b[\s\S]{0,512}?(?:-f|--file)\s+[\s\S]{0,256}?database/migrations/", re.I),
    ),
)


RELEASE_WORKFLOW = "production-database-release.yml"
CI_WORKFLOW = "backend-ci.yml"
AUTO_DEPLOY_WORKFLOW = "auto-deploy.yml"
EVIDENCE_WORKFLOW = "production-readiness-evidence.yml"

def _logical_end(content: str, pos: int) -> int:
    """End index of the shell command line that continues at `pos` (following backslash continuations)."""
    while True:
        newline = content.find("\n", pos)
        if newline == -1:
            return len(content)
        if content[pos:newline].rstrip().endswith("\\"):
            pos = newline + 1
            continue
        return newline


def wrapper_subcommands(content: str) -> list[str]:
    """Subcommands of every production_db_release invocation (script or module form), following line continuations."""
    found: list[str] = []
    for match in re.finditer(r"production_db_release(?:\.py)?\b", content):
        line_end = _logical_end(content, match.end())
        try:
            tokens = shlex.split(content[match.end():line_end].replace("\\\n", " "), comments=True)
        except ValueError:
            tokens = []
        subcommand, skip = "", False
        for token in tokens:
            if skip:
                skip = False
            elif token == "--repo-root":
                skip = True
            elif token.startswith("--"):
                continue
            else:
                subcommand = token
                break
        found.append(subcommand)
    return found


def other_workflow_problems(content: str) -> list[str]:
    """Every workflow except the release workflow: no apply path, no privileged secret, no way to start the release."""
    problems = []
    for sub in wrapper_subcommands(content):
        if sub not in ("compat", "evidence", "rollback-guard"):
            problems.append(f"only the read-only compat, evidence and rollback-guard subcommands of production_db_release may be used here (found {sub or 'unknown'!r})")
    if "PRODUCTION_DATABASE_APPLY_URL" in content:
        problems.append("the privileged production database credential may only be referenced by the release workflow")
    if BACKUP_SCRIPT in content or "DB_BACKUP_" in content:
        problems.append("the logical backup tooling and its bucket configuration may only be used by the release workflow")
    if "production-database-release" in content:
        problems.append("only a human may start the production database release: other workflows must not reference or dispatch it")
    return problems



def _jobs(content: str) -> dict[str, str]:
    section = re.search(r"(?ms)^jobs:\n(.*)\Z", content)
    if not section:
        return {}
    return {m.group(1): m.group(2) for m in re.finditer(r"(?ms)^  ([a-z0-9-]+):\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)", section.group(1))}


BACKUP_SCRIPT = "production_db_backup.py"


def _backup_problems(content: str, jobs: dict[str, str], apply_job: str) -> list[str]:
    """Invariants of the Supabase Free logical-backup path (backup_mode=logical)."""
    problems: list[str] = []
    top = content.split("\njobs:\n", 1)[0]
    if "id-token" in top:
        problems.append("id-token may only be granted to the backup and apply jobs, never workflow-wide")
    for name, body in jobs.items():
        if "id-token" in body and name not in ("backup", "apply"):
            problems.append(f"job {name} must not request id-token (OIDC is only for the backup and apply jobs)")
        if re.search(r"id-token:\s*(?!write\b)\S+", body):
            problems.append(f"job {name}: id-token may only be 'write'")
        if name not in ("backup", "apply") and (BACKUP_SCRIPT in body or "DB_BACKUP_" in body or "configure-aws-credentials" in body):
            problems.append(f"job {name} must not touch the backup bucket or AWS credentials")
    backup = jobs.get("backup", "")
    if not backup:
        problems.append("the workflow must contain the backup job (logical backup path)")
        return problems
    if not re.search(r"(?m)^    environment: production-database-preflight\s*$", backup):
        problems.append("the backup job must use the read-only production-database-preflight environment")
    if not re.search(r"(?m)^    needs: \[preflight\]\s*$", backup) or not re.search(r"(?m)^    if: needs\.preflight\.outputs\.status == 'ready'\s*$", backup):
        problems.append("the backup job must depend on preflight and run only for a ready plan (no always())")
    if "PRODUCTION_DATABASE_APPLY_URL" in backup or "DB_BACKUP_READ_ROLE_ARN" in backup or "apply" in re.findall(r"production_db_release\.py (\w+)", backup):
        problems.append("the backup job must only hold the read-only database credential and the write role")
    if "vars.DB_BACKUP_WRITE_ROLE_ARN" not in backup:
        problems.append("the backup job must assume the dedicated write role via vars.DB_BACKUP_WRITE_ROLE_ARN")
    if "vars.DB_BACKUP_READ_ROLE_ARN" not in apply_job or "DB_BACKUP_WRITE_ROLE_ARN" in apply_job:
        problems.append("the apply job must assume only the read role (vars.DB_BACKUP_READ_ROLE_ARN), never the write role")
    if "verify-evidence" not in apply_job:
        problems.append("the apply job must re-verify the backup evidence before applying")
    for secret in ("secrets.AWS_", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        if secret in content:
            problems.append("long-lived AWS keys are not allowed; use OIDC roles")
    if re.search(r"\bpg_dump\b|\bpg_restore\b", content.replace(BACKUP_SCRIPT, "")):
        problems.append("pg_dump/pg_restore run only inside scripts/production_db_backup.py (output scrubbing); not from the workflow")
    if re.search(r"set -[a-z]*x|xtrace|ACTIONS_STEP_DEBUG|--debug|echo[^\n]*\$\{\{\s*secrets\.", content):
        problems.append("shell tracing / debug output / echoing secrets is not allowed in the release workflow")
    for block in re.finditer(r"(?ms)uses: actions/upload-artifact@.*?(?=^      - |^  \S|\Z)", content):
        if re.search(r"\.dump\b|\.sql\b|\.gz\b|\.pgpass|backup-result|(?<!release-)evidence\.json", block.group(0)):
            problems.append("a backup, dump or evidence file must never be a workflow artifact (public repositories expose artifacts)")
    if any(re.search(r"upload-artifact", b) for n, b in jobs.items() if n == "backup"):
        problems.append("the backup job must not upload artifacts")
    return problems


def release_workflow_problems(content: str) -> list[str]:
    """Structural invariants of the one workflow that may apply Production migrations. Any violation is a CI failure."""
    problems: list[str] = []
    on_block = re.search(r"(?ms)^on:\n(.*?)(?=^\S)", content)
    triggers = re.findall(r"^  ([a-z_]+):", on_block.group(1), re.M) if on_block else []
    if triggers != ["workflow_dispatch"]:
        problems.append(f"must be triggered only by workflow_dispatch (found {triggers})")
    for forbidden in ("pull_request_target", "workflow_run", "contents: write", "secrets: inherit"):
        if forbidden in content:
            problems.append(f"must not contain {forbidden!r}")
    if not re.search(r"(?ms)^concurrency:\n\s+group: production-database-release\n\s+cancel-in-progress: false", content):
        problems.append("must serialize releases (concurrency group production-database-release, cancel-in-progress: false)")
    jobs = _jobs(content)
    pre, apply_job = jobs.get("preflight", ""), jobs.get("apply", "")
    # job-level keys are anchored at their indentation so a comment or a step-level key cannot satisfy them
    if not re.search(r"(?m)^    environment: production-database-preflight\s*$", pre) or not re.search(r"(?m)^    if: github\.ref == 'refs/heads/main'\s*$", pre):
        problems.append("preflight must use the production-database-preflight environment and run only on refs/heads/main")
    if not re.search(r"(?m)^    environment: production-database-apply\s*$", apply_job):
        problems.append("the apply job must use the production-database-apply environment (required reviewers)")
    if not re.search(r"(?m)^    needs: \[preflight, backup\]\s*$", apply_job):
        problems.append("the apply job must depend on preflight and backup (backup and restore test finish before human approval is requested)")
    if not re.search(r"(?m)^    if: needs\.preflight\.outputs\.status == 'ready'\s*$", apply_job) or re.search(r"(?m)^    if:.*always\(\)", apply_job):
        problems.append("the apply job may only run when preflight reports a ready plan (no always())")
    call = re.search(r"production_db_release\.py apply", apply_job)
    if not call:
        problems.append("the apply job must call production_db_release.py apply")
    else:
        invocation = apply_job[call.start():_logical_end(apply_job, call.end())]
        for flag in ("--plan", "--backup-evidence", "--backup-mode", "--approval-reference", "--expected-project-ref ovijutkvaaxohauvuxbj"):
            if flag not in invocation:
                problems.append(f"the apply invocation must pass {flag}")
    problems.extend(_backup_problems(content, jobs, apply_job))
    if "continue-on-error" in content:
        problems.append("must not use continue-on-error")
    dispatches = re.findall(r"gh workflow run (\S+)", content)
    if any(target != "backend-ci.yml" for target in dispatches):
        problems.append("the only workflow it may dispatch is backend-ci.yml")
    for name, body in jobs.items():
        if name != "apply" and re.search(r"production_db_release(?:\.py)?\b[^\n]{0,160}?\bapply\b", body):
            problems.append(f"job {name} must not apply migrations")
        if name != "apply" and "PRODUCTION_DATABASE_APPLY_URL" in body:
            problems.append(f"the privileged credential may only be referenced by the apply job (found in {name})")
    for line in content.splitlines():
        if "${{ inputs." in line and not re.match(r"^\s+[A-Z_]+: \$\{\{ inputs\.[a-z_]+ \}\}\s*$", line):
            problems.append("workflow inputs may only be passed through env: " + line.strip())
    return problems



def _job_if(body: str) -> str:
    match = re.search(r"(?m)^    if: (.*)$", body)
    return match.group(1) if match else ""


def backend_ci_problems(content: str) -> list[str]:
    """Education CI keeps validation (PR/push) apart from Production deployment (explicit dispatch only, behind schema-gate and a reviewer).

    A push or pull request must be unable to start the Production schema preflight or a deployment; a dispatched deployment must not be
    able to skip the schema gate (only the rollback to the previous image is exempt) or the aws-demo reviewer approval.
    """
    problems: list[str] = []
    on_block = re.search(r"(?ms)^on:\n(.*?)(?=^\S)", content)
    triggers = re.findall(r"^  ([a-z_]+):", on_block.group(1), re.M) if on_block else []
    for required in ("pull_request", "push", "workflow_dispatch"):
        if required not in triggers:
            problems.append(f"Education CI must keep validating on {required} (found triggers {triggers})")
    for extra in set(triggers) - {"pull_request", "push", "workflow_dispatch"}:
        problems.append(f"Education CI must not add the {extra} trigger")
    for forbidden in ("pull_request_target", "workflow_run", "contents: write", "secrets: inherit"):
        if forbidden in content:
            problems.append(f"Education CI must not contain {forbidden!r}")
    if "continue-on-error" in content:
        problems.append("Education CI must not use continue-on-error (a failing check must stay failing)")
    concurrency = re.search(r"(?ms)^concurrency:\n(.*?)(?=^\S)", content)
    if not concurrency or "github.event_name == 'workflow_dispatch'" not in concurrency.group(1) or not re.search(r"cancel-in-progress: false", concurrency.group(1)):
        problems.append("deployments must use their own non-cancelling concurrency group, separate from validation runs")
    jobs = _jobs(content)
    production_jobs = {"changes", "schema-gate", "rollback-guard", "deploy-api", "deploy-web"}
    for name in ("api", "web", "docker", "database-safety"):
        body = jobs.get(name)
        if body is None:
            problems.append(f"validation job {name} is missing")
            continue
        condition = _job_if(body)
        if condition and "github.event_name != 'workflow_dispatch'" not in condition:
            problems.append(f"validation job {name} must keep running on push and pull_request (its if: may only exclude a rollback dispatch)")
    for name, body in jobs.items():
        if name in production_jobs:
            continue
        for marker in ("AWS_DEPLOY_ENABLED", "configure-aws-credentials", "PRODUCTION_", "id-token", "environment:"):
            if marker in body:
                problems.append(f"job {name} must not reference {marker}: only changes, schema-gate and the deploy jobs may reach Production")
    changes = jobs.get("changes", "")
    changes_if = _job_if(changes)
    if "github.event_name == 'workflow_dispatch'" not in changes_if or "'push'" in changes_if or "pull_request" in changes_if:
        problems.append("the changes job (Production target selection) must run only for workflow_dispatch on main, never for push or pull_request")
    if "refs/heads/main" not in changes_if:
        problems.append("the changes job must be restricted to refs/heads/main")
    gate = jobs.get("schema-gate", "")
    gate_if = _job_if(gate)
    if not re.search(r"(?m)^    needs: \[changes\]\s*$", gate) or "needs.changes.result == 'success'" not in gate_if:
        problems.append("schema-gate must depend on the changes job and require its success")
    if not re.search(r"(?m)^    environment: production-database-preflight\s*$", gate):
        problems.append("schema-gate must use the read-only production-database-preflight environment")
    if not re.search(r"production_db_release\.py compat\b", gate):
        problems.append("schema-gate must run the read-only production_db_release.py compat check")
    if "github.event_name == 'push'" in gate_if or "pull_request" in gate_if:
        problems.append("schema-gate must not be started by push or pull_request")
    rollback = "(github.event_name == 'workflow_dispatch' && inputs.action == 'rollback' && needs.rollback-guard.result == 'success')"
    guard = jobs.get("rollback-guard", "")
    guard_if = _job_if(guard)
    if not guard:
        problems.append("the rollback-guard job is missing: a rollback must be refused once the Production schema has outgrown the previous image")
    else:
        if not re.search(r"(?m)^    needs: \[changes\]\s*$", guard) or "needs.changes.result == 'success'" not in guard_if:
            problems.append("rollback-guard must depend on the changes job and require its success")
        if not re.search(r"(?m)^    environment: production-database-preflight\s*$", guard):
            problems.append("rollback-guard must use the read-only production-database-preflight environment")
        if not re.search(r"production_db_release\.py rollback-guard\b", guard):
            problems.append("rollback-guard must run the read-only production_db_release.py rollback-guard check")
        for clause in ("github.ref == 'refs/heads/main'", "vars.AWS_DEPLOY_ENABLED == 'true'", "github.event_name == 'workflow_dispatch'", "inputs.action == 'rollback'"):
            if clause not in guard_if:
                problems.append(f"rollback-guard must require {clause}")
        if "github.event_name == 'push'" in guard_if or "pull_request" in guard_if:
            problems.append("rollback-guard must not be started by push or pull_request")
    for name in ("deploy-api", "deploy-web"):
        body = jobs.get(name, "")
        condition = _job_if(body)
        if not body:
            problems.append(f"{name} job is missing")
            continue
        if not re.search(r"(?m)^    environment: aws-demo\s*$", body):
            problems.append(f"{name} must use the reviewer-gated aws-demo environment")
        needs = re.search(r"(?m)^    needs: \[(.*)\]\s*$", body)
        needed = {n.strip() for n in needs.group(1).split(",")} if needs else set()
        for dependency in ("changes", "schema-gate", "database-safety") + (("rollback-guard",) if name == "deploy-api" else ()):
            if dependency not in needed:
                problems.append(f"{name} must depend on {dependency}")
        for clause in ("github.ref == 'refs/heads/main'", "vars.AWS_DEPLOY_ENABLED == 'true'", "needs.changes.result == 'success'", "needs.database-safety.result == 'success'"):
            if clause not in condition:
                problems.append(f"{name} must require {clause}")
        if "needs.schema-gate.result == 'success'" not in condition:
            problems.append(f"{name} must require a successful schema-gate")
        # the only way past a failed/skipped schema-gate is the rollback to the previous image, and only for the API
        stripped = condition.replace(f"(needs.schema-gate.result == 'success' || {rollback})", "SCHEMA_GATE_OR_ROLLBACK")
        if name == "deploy-web" and "SCHEMA_GATE_OR_ROLLBACK" in stripped or (name == "deploy-api" and re.search(r"schema-gate.result[^&]*\|\|", stripped)):
            problems.append(f"{name} may bypass schema-gate only through the API rollback exemption")
        if "github.event_name == 'push'" in condition or "pull_request" in condition:
            problems.append(f"{name} must not be started by push or pull_request")
    # a deployed commit must be validated in the same run, current (not superseded) after approval, and observable afterwards
    api, web = jobs.get("deploy-api", ""), jobs.get("deploy-web", "")
    if api.count("ci_required_checks.py is-head") < 2 or web.count("ci_required_checks.py is-head") < 1:
        problems.append("the deploy jobs must refuse a superseded commit after the reviewer approval (ci_required_checks.py is-head)")
    if "api/v1/version" not in api or "GITHUB_SHA" not in api.split("api/v1/version", 1)[-1]:
        problems.append("deploy-api must verify the deployed Git SHA through /api/v1/version")
    if "> dist/version.json" not in web or "skynex.best/version.json" not in web or "GITHUB_SHA" not in web.split("skynex.best/version.json", 1)[-1]:
        problems.append("deploy-web must publish and verify version.json with the deployed Git SHA")
    if "--build-arg GIT_SHA" not in api or "--build-arg GIT_SHA" not in jobs.get("docker", ""):
        problems.append("the images must be built with --build-arg GIT_SHA so the deployed commit is observable")
    if "workflow_dispatch" not in content.split("\njobs:\n", 1)[0] or "run-name:" not in content.split("\njobs:\n", 1)[0]:
        problems.append("a dispatched deployment must be reported as its own, identifiable run (run-name)")
    return problems


def auto_deploy_problems(content: str) -> list[str]:
    """auto-deploy.yml may only START the gated deployment path after a verified, still-current, successful push run of main.

    It must hold no cloud or Production credential and must not be able to deploy, roll back, migrate or release by itself.
    """
    problems: list[str] = []
    on_block = re.search(r"(?ms)^on:\n(.*?)(?=^\S)", content)
    triggers = re.findall(r"^  ([a-z_]+):", on_block.group(1), re.M) if on_block else []
    if triggers != ["workflow_run"]:
        problems.append(f"Auto Deploy must be triggered only by workflow_run of Education CI (found {triggers})")
    if on_block and not re.search(r'workflows: \["Education CI"\]', on_block.group(1)):
        problems.append("Auto Deploy must listen only to the Education CI workflow")
    if on_block and not re.search(r"types: \[completed\]", on_block.group(1)):
        problems.append("Auto Deploy must run only when Education CI completed")
    if on_block and not re.search(r"branches: \[main\]", on_block.group(1)):
        problems.append("Auto Deploy must be limited to the main branch")
    for forbidden in ("pull_request", "workflow_dispatch", "secrets.", "id-token", "configure-aws-credentials", "environment:", "continue-on-error", "contents: write", "secrets: inherit",
                      "production_db_release", "sql_migration_runner", "aws ssm", "aws ecr", "docker "):
        if forbidden in content:
            problems.append(f"Auto Deploy must not contain {forbidden!r}: it only starts the gated deployment")
    permissions = re.search(r"(?ms)^permissions:\n(.*?)(?=^\S)", content)
    granted = dict(re.findall(r"^  ([a-z-]+): (\w+)", permissions.group(1), re.M)) if permissions else {}
    if granted != {"contents": "read", "actions": "write", "checks": "read"}:
        problems.append(f"Auto Deploy permissions must be exactly contents: read, actions: write, checks: read (found {granted})")
    concurrency = re.search(r"(?ms)^concurrency:\n(.*?)(?=^\S)", content)
    if not concurrency or "group: auto-deploy-main" not in concurrency.group(1) or "cancel-in-progress: true" not in concurrency.group(1):
        problems.append("Auto Deploy must cancel superseded dispatchers (concurrency group auto-deploy-main, cancel-in-progress: true)")
    jobs = _jobs(content)
    dispatch = jobs.get("dispatch", "")
    condition = re.search(r"(?ms)^    if: >-\n(.*?)(?=^    [a-z-]+:)", dispatch)
    text = " ".join(condition.group(1).split()) if condition else _job_if(dispatch)
    for clause in ("github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.event == 'push'", "github.event.workflow_run.head_branch == 'main'",
                   "github.event.workflow_run.head_repository.full_name == github.repository", "vars.AWS_DEPLOY_ENABLED == 'true'"):
        if clause not in text:
            problems.append(f"the dispatch job must require {clause}")
    if set(jobs) != {"dispatch"}:
        problems.append(f"Auto Deploy must contain only the dispatch job (found {sorted(jobs)})")
    if "ci_required_checks.py checks" not in dispatch or dispatch.count("ci_required_checks.py is-head") < 2:
        problems.append("the dispatch job must verify the required checks and re-check that the commit is still the head of main before and after waiting")
    runs = re.findall(r"gh workflow run (\S+)(.*)", dispatch)
    if len(runs) != 1 or runs[0][0] != "backend-ci.yml" or "-f action=deploy" not in runs[0][1] or "--ref main" not in runs[0][1]:
        problems.append("the only thing Auto Deploy may start is: gh workflow run backend-ci.yml --ref main -f action=deploy")
    start = dispatch.rfind("gh workflow run")
    if "steps.fresh.outputs.superseded == 'false'" not in dispatch[:start][dispatch[:start].rfind("- name:"):] + dispatch[start - 400:start]:
        problems.append("the dispatch step must be skipped when the commit was superseded")
    return problems


def evidence_workflow_problems(content: str) -> list[str]:
    """production-readiness-evidence.yml: manual, main-only, read-only, redacted, no artifacts, no apply/plan/deploy."""
    problems: list[str] = []
    on_block = re.search(r"(?ms)^on:\n(.*?)(?=^\S)", content)
    triggers = re.findall(r"^  ([a-z_]+):", on_block.group(1), re.M) if on_block else []
    if triggers != ["workflow_dispatch"]:
        problems.append(f"the evidence workflow must be triggered only by workflow_dispatch (found {triggers})")
    jobs = _jobs(content)
    if set(jobs) != {"evidence"}:
        problems.append(f"the evidence workflow must contain only the evidence job (found {sorted(jobs)})")
    job = jobs.get("evidence", "")
    if not re.search(r"(?m)^    environment: production-database-preflight\s*$", job) or not re.search(r"(?m)^    if: github\.ref == 'refs/heads/main'\s*$", job):
        problems.append("the evidence job must use the production-database-preflight environment and run only on refs/heads/main")
    for forbidden in ("upload-artifact", "id-token", "configure-aws-credentials", "continue-on-error", "set -x", "xtrace", "PRODUCTION_DATABASE_APPLY_URL", "SUPABASE_ACCESS_TOKEN",
                      "production_db_backup", "DB_BACKUP_", "sql_migration_runner", "aws ", "docker ", "gh workflow", "secrets: inherit", "pull_request", "contents: write", "actions: write"):
        if forbidden in content:
            problems.append(f"the evidence workflow must not contain {forbidden!r}")
    used = set(re.findall(r"secrets\.([A-Z_]+)", content))
    if used != {"PRODUCTION_DATABASE_READONLY_URL", "PRODUCTION_SUPABASE_URL"}:
        problems.append(f"the evidence workflow may use only the two read-only Production secrets (found {sorted(used)})")
    if wrapper_subcommands(content) != ["evidence"]:
        problems.append("the evidence workflow may run only: production_db_release.py evidence")
    permissions = re.search(r"(?ms)^permissions:\n(.*?)(?=^\S)", content)
    granted = dict(re.findall(r"^  ([a-z-]+): (\w+)", permissions.group(1), re.M)) if permissions else {}
    if granted != {"contents": "read"}:
        problems.append(f"the evidence workflow permissions must be exactly contents: read (found {granted})")
    return problems


def inspect_workflows(directory: Path) -> list[str]:
    errors: list[str] = []
    if not directory.is_dir():
        return [f"Workflow directory does not exist: {directory}"]
    repo_root = directory.resolve().parent.parent
    paths = sorted(path.resolve() for path in [*directory.glob("*.yml"), *directory.glob("*.yaml")])
    paths.extend(
        path for path in (
            repo_root / "infra/terraform/scripts/deploy-api.sh",
            repo_root / "services/education-api/package.json",
        ) if path.is_file()
    )
    for path in paths:
        try:
            content = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"Cannot read workflow {path}: {exc}")
            continue
        is_release_workflow = path.name == RELEASE_WORKFLOW
        if is_release_workflow:
            errors.extend(f"{path.relative_to(repo_root)}: {problem}" for problem in release_workflow_problems(content))
        if not is_release_workflow:
            errors.extend(f"{path.relative_to(repo_root)}: {problem}" for problem in other_workflow_problems(content))
        if path.name == CI_WORKFLOW:
            errors.extend(f"{path.relative_to(repo_root)}: {problem}" for problem in backend_ci_problems(content))
        if path.name == EVIDENCE_WORKFLOW:
            errors.extend(f"{path.relative_to(repo_root)}: {problem}" for problem in evidence_workflow_problems(content))
        if path.name == AUTO_DEPLOY_WORKFLOW:
            errors.extend(f"{path.relative_to(repo_root)}: {problem}" for problem in auto_deploy_problems(content))
        elif re.search(r"(?m)^\s*workflow_run:", content) and not is_release_workflow:
            errors.append(f"{path.relative_to(repo_root)}: workflow_run triggers are reserved for {AUTO_DEPLOY_WORKFLOW}")
        for label, pattern in FORBIDDEN:
            if is_release_workflow and label == "Production release wrapper apply":
                continue  # the single allowlisted entry point; its structure is verified above
            match = pattern.search(content)
            if match:
                line_number = content.count("\n", 0, match.start()) + 1
                errors.append(f"{path.relative_to(repo_root)}:{line_number}: forbidden {label} command")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=Path(".github/workflows"))
    args = parser.parse_args()
    errors = inspect_workflows(args.directory)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Workflow safety check passed: no database migration execution commands found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
