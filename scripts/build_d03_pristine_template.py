#!/usr/bin/env python3
"""Build a disposable, loopback-only "pristine" PostgreSQL database for the D03 migration tests.

The D03 migration tests need a database that is at the schema BEFORE D03 Stage 1: the verified baseline plus the
release migrations that precede it (D-H). The active manifest now also lists Stage 1 and Stage 2, so this script bootstraps a
throw-away copy of the repository inputs (git-initialised so the runner's sourceCommit provenance check still runs)
whose manifest excludes the D03 migration, into a new database named vista_test_*.

Refuses anything that is not a loopback server and a new, empty vista_test_* database. It never targets Supabase or
Production and never touches the real repository's manifest.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
EXCLUDED_VERSIONS = {"20261113_i_attempt_submission_foundation", "20261114_j_one_submission_per_attempt"}


def _psql(parsed, database: str, sql: str) -> str:
    env = {**os.environ, "PGPASSWORD": parsed.password or ""}
    proc = subprocess.run(
        ["psql", "-h", parsed.hostname, "-p", str(parsed.port or 5432), "-U", parsed.username, "-d", database,
         "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True, env=env,
    )
    if proc.returncode != 0:
        raise SystemExit(f"psql failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def _git(cwd: Path, *args: str) -> str:
    done = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if done.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {done.stderr.strip()}")
    return done.stdout.strip()


def build(admin_url: str, template_name: str) -> None:
    parsed = urlparse(admin_url)
    if parsed.hostname not in LOOPBACK or "supabase" in admin_url.lower():
        raise SystemExit("The D03 template builder accepts a loopback PostgreSQL server only")
    if not template_name.startswith("vista_test_") or not template_name.replace("_", "").isalnum():
        raise SystemExit("The template database name must look like vista_test_<name>")
    if _psql(parsed, "postgres", f"SELECT 1 FROM pg_database WHERE datname = '{template_name}'"):
        print(f"template {template_name} already exists; nothing to do")
        return
    manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text(encoding="utf-8"))
    kept = [e for e in manifest["migrations"] if e["version"] not in EXCLUDED_VERSIONS]
    for number, entry in enumerate(kept, start=1):
        entry["order"] = number
    work = Path(tempfile.mkdtemp(prefix="vista-d03-pristine-"))
    try:
        shutil.copytree(ROOT / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / "database/baselines", work / "database/baselines",
                        ignore=shutil.ignore_patterns("dev-schema-expectation.json"))  # the pinned fingerprint belongs to the full manifest
        (work / "database/migrations").mkdir(parents=True)
        for entry in kept:
            shutil.copy2(ROOT / entry["path"], work / entry["path"])
        manifest["migrations"] = kept
        manifest_path = work / "database/migrations/manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        _git(work, "init", "-q")
        _git(work, "config", "user.email", "ci@example.invalid")
        _git(work, "config", "user.name", "ci")
        _git(work, "add", "-A")
        _git(work, "commit", "-qm", "inputs")
        manifest["sourceCommit"] = _git(work, "rev-parse", "HEAD")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        _git(work, "add", "-A")
        _git(work, "commit", "-qm", "manifest")

        _psql(parsed, "postgres", f'CREATE DATABASE "{template_name}"')
        url = f"postgresql://{parsed.username}:{parsed.password}@{parsed.hostname}:{parsed.port or 5432}/{template_name}"
        env = {**os.environ, "VISTA_DEV_DATABASE_URL": url}
        env.setdefault("VISTA_DATABASE_PROJECT_REF", "vista-course-builder-test")
        done = subprocess.run([sys.executable, "scripts/bootstrap_dev_database.py", "--confirm-local-bootstrap"],
                              cwd=work, env=env, capture_output=True, text=True)
        if done.returncode != 0:
            _psql(parsed, "postgres", f'DROP DATABASE IF EXISTS "{template_name}" WITH (FORCE)')
            raise SystemExit("bootstrap of the pristine template failed:\n" + (done.stdout + done.stderr)[-2000:])
        print(f"template {template_name} built from baseline + {len(kept)} release migrations (D03 Stage 1 excluded)")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-url", default=os.environ.get("VISTA_D03_MIGRATION_TEST_URL", ""))
    parser.add_argument("--template", default=os.environ.get("VISTA_D03_MIGRATION_TEMPLATE", "vista_test_d03_pristine"))
    args = parser.parse_args()
    if not args.admin_url:
        raise SystemExit("VISTA_D03_MIGRATION_TEST_URL (or --admin-url) is required")
    build(args.admin_url, args.template)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
