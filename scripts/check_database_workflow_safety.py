#!/usr/bin/env python3
"""Fail if a GitHub Actions workflow can run a database migration command."""

from __future__ import annotations

import argparse
import re
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
        "psql migration file execution",
        re.compile(r"\bpsql\b[\s\S]{0,512}?(?:-f|--file)\s+[\s\S]{0,256}?database/migrations/", re.I),
    ),
)


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
        for label, pattern in FORBIDDEN:
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
