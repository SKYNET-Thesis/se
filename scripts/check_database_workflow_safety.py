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
        if sub != "compat":
            problems.append(f"only the read-only 'compat' subcommand of production_db_release may be used here (found {sub or 'unknown'!r})")
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
