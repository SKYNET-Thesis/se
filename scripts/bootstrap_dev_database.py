#!/usr/bin/env python3
"""Bootstrap an EMPTY, disposable, loopback PostgreSQL 17 database to the VISTA development schema.

Chain: verified historical baseline (database/baselines) -> release migrations in
database/migrations/manifest.json (applied by scripts/sql_migration_runner.py) -> verification.

Refuses anything that is not a loopback database named vista_test_* / vista_baseline_test_* whose
public schema is empty. It never targets Supabase or Production.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

try:
    from scripts.restore_schema_baseline_isolated import _acl_roles, _inventory_sql
    from scripts.sql_migration_runner import MigrationRunner, RunnerError, _parse_database_url
    from scripts.verify_schema_baseline import verify_baseline
except ModuleNotFoundError:
    from restore_schema_baseline_isolated import _acl_roles, _inventory_sql
    from sql_migration_runner import MigrationRunner, RunnerError, _parse_database_url
    from verify_schema_baseline import verify_baseline

BASELINE_FILE = "database/baselines/production-public-schema-20261109T172950Z.sql"
EVIDENCE_FILE = "database/baselines/production-baseline-evidence.json"
LOOPBACK = {"localhost", "127.0.0.1", "::1"}

EXPECTATION_FILE = "database/baselines/dev-schema-expectation.json"

# Objects the backend depends on: (label, SQL boolean, migration version that introduces it or None = baseline).
# Each must exist after bootstrap; none may be added by hand. Migration-specific checks run only when the
# manifest selects that migration.
REQUIRED_OBJECTS = [
    ("table learning_activity_progress", "to_regclass('public.learning_activity_progress') IS NOT NULL", None),
    ("table learning_sections", "to_regclass('public.learning_sections') IS NOT NULL", None),
    ("table learning_activities", "to_regclass('public.learning_activities') IS NOT NULL", None),
    ("table learning_questions", "to_regclass('public.learning_questions') IS NOT NULL", None),
    ("table vista_schema_migrations", "to_regclass('public.vista_schema_migrations') IS NOT NULL", None),
    ("unique classroom member (classroom_id,user_id)", "EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_classroom_members'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (classroom_id, user_id)')", None),
    ("unique lesson progress (learner_user_id,lesson_id)", "EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_lesson_progress'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (learner_user_id, lesson_id)')", None),
    ("unique enrollment (course_id,learner_user_id,classroom_id)", "EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_enrollments'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (course_id, learner_user_id, classroom_id)')", None),
    ("enrollment status allows revoked", "EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_enrollments'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%revoked%')", None),
    ("trigger check_learning_question_scope", "EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.learning_questions'::regclass AND tgname='check_learning_question_scope' AND NOT tgisinternal)", None),
    ("learning_activities.content jsonb (migration D)", "EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.learning_activities'::regclass AND attname='content' AND atttypid='jsonb'::regtype AND NOT attisdropped)", "20261110_d_activity_content"),
    ("table learning_media_assets (migration E)", "to_regclass('public.learning_media_assets') IS NOT NULL", "20261110_e_learning_media"),
    ("learning_media_assets row level security (migration E)", "COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.learning_media_assets')), false)", "20261110_e_learning_media"),
    ("learning_questions.organization_id nullable (migration F)", "EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.learning_questions'::regclass AND attname='organization_id' AND NOT attnotnull)", "20261111_f_global_question_scope"),
    ("global question code unique index (migration F)", "to_regclass('public.learning_questions_global_course_code_key') IS NOT NULL", "20261111_f_global_question_scope"),
    ("trigger check_learning_activity_progress_scope (migration G)", "EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.learning_activity_progress'::regclass AND tgname='check_learning_activity_progress_scope' AND NOT tgisinternal)", "20261111_g_activity_progress_scope_guard"),
    ("learning_media_assets MIME allowlist includes audio/mpeg (migration H)", "EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_media_assets'::regclass AND conname='learning_media_assets_mime_type' AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''audio/mpeg''%')", "20261112_h_learning_media_audio_mpeg"),
    ("learning_submissions.attempt_id (migration I)", "EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.learning_submissions'::regclass AND attname='attempt_id' AND NOT attisdropped)", "20261113_i_attempt_submission_foundation"),
    ("one submission per attempt unique index (migration I)", "to_regclass('public.learning_submissions_attempt_id_key') IS NOT NULL", "20261113_i_attempt_submission_foundation"),
    ("table learning_submission_files with row level security (migration I)", "COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.learning_submission_files')), false)", "20261113_i_attempt_submission_foundation"),
    ("attempt grading release columns (migration I)", "(SELECT count(*) FROM pg_attribute WHERE attrelid='public.learning_assignment_attempts'::regclass AND attname IN ('draft_response','draft_saved_at','grading_released_at','grading_released_by','grading_release_origin') AND NOT attisdropped)=5", "20261113_i_attempt_submission_foundation"),
    ("trigger guard_learning_submission_files (migration I)", "EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.learning_submission_files'::regclass AND tgname='guard_learning_submission_files')", "20261113_i_attempt_submission_foundation"),
    ("legacy UNIQUE (assignment_id, learner_user_id) removed (migration J)", "NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.learning_submissions'::regclass AND conname='learning_submissions_assignment_id_learner_user_id_key')", "20261114_j_one_submission_per_attempt"),
    ("lookup index learning_submissions_assignment_learner_idx (migration J)", "to_regclass('public.learning_submissions_assignment_learner_idx') IS NOT NULL", "20261114_j_one_submission_per_attempt"),
    ("trigger guard_learning_submission_attempt (migration J)", "EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.learning_submissions'::regclass AND tgname='guard_learning_submission_attempt' AND NOT tgisinternal)", "20261114_j_one_submission_per_attempt"),
]


def required_objects_sql(versions: set[str]) -> str:
    rows = ",\n    ".join(
        f"({MigrationRunner._literal(label)}, {expr})"
        for label, expr, version in REQUIRED_OBJECTS if version is None or version in versions
    )
    return f"""SELECT json_build_object(
  'missing', COALESCE((SELECT json_agg(name ORDER BY name) FROM (VALUES
    {rows}
  ) AS t(name, ok) WHERE NOT ok), '[]'::json)
)::text;
"""


LEDGER_SQL = """SELECT COALESCE(json_agg(json_build_object('version', version, 'checksum', checksum,
  'provenance', provenance) ORDER BY version), '[]'::json)::text FROM public.vista_schema_migrations;
"""


def validate_dev_target(database_url: str, env: dict[str, str]) -> tuple[tuple, str]:
    host, port, database, username, password, query = _parse_database_url(database_url)
    if host not in LOOPBACK:
        raise RunnerError("Development bootstrap accepts loopback database hosts only")
    if not re.fullmatch(r"(vista_test|vista_baseline_test)_[a-z0-9_]{1,48}", database):
        raise RunnerError("Development bootstrap database must be named vista_test_<suffix> (or vista_baseline_test_<suffix>)")
    if env.get("SUPABASE_URL"):
        raise RunnerError("SUPABASE_URL must not be set for a local development bootstrap")
    ref = env.get("VISTA_DATABASE_PROJECT_REF", "")
    if not re.fullmatch(r"[a-z0-9-]{3,64}", ref) or ref == "ovijutkvaaxohauvuxbj":
        raise RunnerError("VISTA_DATABASE_PROJECT_REF must be a local label (3-64 chars of [a-z0-9-]), never a Production reference")
    query = {"sslmode": "disable", **query}
    return (host, port, database, username, password, query), ref


def _fingerprint(inventory: dict) -> str:
    stable = {k: v for k, v in inventory.items() if k not in {"database_name", "server_version", "baseline_sha256", "baseline_size", "dump_count_comparison", "dump_counts_match"}}
    return hashlib.sha256(json.dumps(stable, sort_keys=True).encode()).hexdigest()


def _inventory(runner: MigrationRunner, connection: tuple) -> dict:
    return runner._one_json(runner._psql(connection, _inventory_sql()), "catalog inventory")


def verify_database(runner: MigrationRunner, connection: tuple, *, check_expectation: bool = True) -> dict:
    """Read-only: ledger == manifest, required objects exist. Returns a summary or raises RunnerError."""
    manifest, entries, _ = runner._load()
    rows = json.loads(runner._psql(connection, LEDGER_SQL).splitlines()[-1])
    expected = {e["version"]: e["sha256"] for e in entries}
    actual = {r["version"]: r for r in rows}
    problems = []
    for version, checksum in expected.items():
        row = actual.get(version)
        if row is None:
            problems.append(f"ledger is missing {version}")
        elif row["checksum"] != checksum or row["provenance"] != "executed":
            problems.append(f"ledger checksum/provenance mismatch for {version}")
    extra = sorted(set(actual) - set(expected))
    if extra:
        problems.append("ledger has versions outside the manifest: " + ", ".join(extra))
    missing = runner._one_json(runner._psql(connection, required_objects_sql(set(expected))), "required objects")["missing"]
    problems.extend(f"missing schema object: {name}" for name in missing)
    fingerprint = _fingerprint(_inventory(runner, connection))
    expectation_path = runner.repo_root / EXPECTATION_FILE
    if check_expectation and expectation_path.is_file():
        expectation = json.loads(expectation_path.read_text(encoding="utf-8"))
        if expectation.get("ledgerVersions") != list(expected):
            problems.append(f"{EXPECTATION_FILE} lists different migrations than the manifest; regenerate it")
        elif expectation.get("schemaFingerprint") != fingerprint:
            problems.append(f"schema fingerprint {fingerprint} differs from the pinned {expectation.get('schemaFingerprint')} (schema drift)")
    if problems:
        raise RunnerError("; ".join(problems))
    return {"ledger": [{"version": v, "checksum": c} for v, c in expected.items()], "schema_fingerprint": fingerprint}


def bootstrap(repo_root: Path, database_url: str, *, env: dict[str, str], confirmed: bool,
              operator_id: str = "local-dev-bootstrap", psql_binary: str = "psql") -> dict:
    connection, ref = validate_dev_target(database_url, env)
    if not confirmed:
        raise RunnerError("Pass --confirm-local-bootstrap to bootstrap the empty local database")
    evidence = json.loads((repo_root / EVIDENCE_FILE).read_text(encoding="utf-8"))
    manifest = json.loads((repo_root / "database/migrations/manifest.json").read_text(encoding="utf-8"))
    if evidence["sha256"] != manifest["baselineSha256"]:
        raise RunnerError("Manifest baselineSha256 differs from the baseline evidence")
    baseline = repo_root / BASELINE_FILE
    check = verify_baseline(baseline, expected_sha256=evidence["sha256"], expected_size=evidence["fileSizeBytes"])
    if check["errors"]:
        raise RunnerError("Baseline integrity validation failed: " + "; ".join(check["errors"]))
    sql = baseline.read_text(encoding="utf-8")

    # Loopback development servers do not offer TLS; the runner defaults to sslmode=require.
    runner_url = database_url if "sslmode=" in database_url else database_url + ("&" if "?" in database_url else "?") + "sslmode=disable"
    runner_env = {**env, "DATABASE_URL": runner_url}
    runner = MigrationRunner(repo_root, repo_root / "database/migrations/manifest.json", env=runner_env, psql_binary=psql_binary)
    preflight_sql = """SELECT json_build_object(
  'database_name', current_database(), 'major', current_setting('server_version_num')::integer / 10000,
  'objects', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
    + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
    + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'))::text;
"""
    state = runner._one_json(runner._psql(connection, preflight_sql), "target preflight")
    if state["database_name"] != connection[2]:
        raise RunnerError("Connected database name differs from the requested target")
    if state["major"] != 17:
        raise RunnerError(f"Development bootstrap requires PostgreSQL 17; target major is {state['major']}")
    if int(state["objects"]) != 0:
        raise RunnerError("Target public schema is not empty; bootstrap refused (use a new empty database)")

    roles = _acl_roles(sql)
    if roles:
        listed = ",".join(MigrationRunner._literal(role) for role in roles)
        existing = set(json.loads(runner._psql(connection, f"SELECT COALESCE(json_agg(rolname), '[]'::json)::text FROM pg_roles WHERE rolname IN ({listed});").splitlines()[-1]))
        create = [f'CREATE ROLE "{role}" NOLOGIN;' for role in roles if role not in existing]
        if create:
            runner._psql(connection, "\n".join(create) + "\n", single_transaction=True)

    # Step 1: historical baseline.
    runner._psql(connection, "DROP SCHEMA public;\n" + sql, single_transaction=True)
    baseline_inventory = _inventory(runner, connection)
    comparable = ("tables", "types", "views", "materialized_views", "foreign_tables", "columns", "constraints",
                  "indexes", "sequences", "functions", "triggers", "rls_enabled", "rls_forced", "policies")
    mismatched = [k for k in comparable if check["counts"].get(k) != baseline_inventory["counts"].get(k)]
    if mismatched:
        raise RunnerError("Restored baseline catalog counts differ from the dump for: " + ", ".join(mismatched))
    if baseline_inventory["prisma_ledger_rows"] or baseline_inventory["sql_ledger_rows"]:
        raise RunnerError("Restored baseline unexpectedly contains migration ledger rows")

    # Step 2: release migrations through the reviewed runner (ledger + checksums).
    result = runner.apply(ref, operator_id=operator_id, approval_reference="LOCAL-DEV-BOOTSTRAP")
    # Step 3: verification, including idempotent re-run.
    summary = verify_database(runner, connection)
    rerun = runner.apply(ref, operator_id=operator_id, approval_reference="LOCAL-DEV-BOOTSTRAP")
    if rerun.pending:
        raise RunnerError("Re-run reported pending migrations")
    final = _inventory(runner, connection)
    return {
        "database_name": connection[2],
        "server_version": final["server_version"],
        "baseline_sha256": evidence["sha256"],
        "baseline_counts": baseline_inventory["counts"],
        "final_counts": final["counts"],
        "applied": result.pending,
        "rerun_pending": rerun.pending,
        "ledger": summary["ledger"],
        "ledger_rows": final["sql_ledger_rows"],
        "schema_fingerprint": summary["schema_fingerprint"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-local-bootstrap", action="store_true")
    parser.add_argument("--verify-only", action="store_true", help="read-only check of an already bootstrapped local database")
    parser.add_argument("--write-expectation", action="store_true", help="with --verify-only: (re)write the pinned schema expectation after a reviewed manifest change")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--psql-binary", default="psql", help=argparse.SUPPRESS)
    args = parser.parse_args()
    database_url = os.environ.get("VISTA_DEV_DATABASE_URL", "")
    if not database_url:
        print("ERROR: VISTA_DEV_DATABASE_URL is required (loopback vista_test_* database)", file=sys.stderr)
        return 1
    root = args.repo_root.resolve()
    try:
        if args.verify_only:
            connection, ref = validate_dev_target(database_url, os.environ)
            runner = MigrationRunner(root, root / "database/migrations/manifest.json", env={**os.environ, "DATABASE_URL": database_url + ("&" if "?" in database_url else "?") + "sslmode=disable" if "sslmode=" not in database_url else database_url}, psql_binary=args.psql_binary)
            summary = verify_database(runner, connection, check_expectation=not args.write_expectation)
            if args.write_expectation:
                counts = _inventory(runner, connection)["counts"]
                (root / EXPECTATION_FILE).write_text(json.dumps({
                    "note": "Schema fingerprint of a fresh PostgreSQL 17 bootstrap (baseline + manifest migrations) for a database owned by user vista_test. Regenerate with --verify-only --write-expectation after a reviewed manifest change.",
                    "ledgerVersions": [item["version"] for item in summary["ledger"]],
                    "schemaFingerprint": summary["schema_fingerprint"],
                    "counts": counts,
                }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print(json.dumps(summary, indent=2, sort_keys=True))
        else:
            print(json.dumps(bootstrap(root, database_url, env=dict(os.environ), confirmed=args.confirm_local_bootstrap, psql_binary=args.psql_binary), indent=2, sort_keys=True))
    except (RunnerError, OSError, KeyError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
