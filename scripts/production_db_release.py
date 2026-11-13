#!/usr/bin/env python3
"""Production database release orchestration (plan -> backup gate -> revalidated apply -> verification).

This is the ONLY code path allowed to apply migrations to Production, and only from the dedicated, approval-gated workflow
.github/workflows/production-database-release.yml (scripts/check_database_workflow_safety.py enforces that). It is a thin,
fail-closed layer over scripts/sql_migration_runner.py (manifest provenance, checksums, ledger rules, single transaction):

  plan          read-only: validate manifest/provenance/checksums, scope, project identity, ledger, catalog baseline;
                write a plan with a deterministic plan_hash (no secrets, no data)
  snapshot      read-only: pre-release row counts (non-sensitive aggregates)
  check-backup  verify with the Supabase Management API that a fresh backup / PITR exists (fails closed on anything unexpected)
  apply         revalidate everything immediately before applying (plan hash, backup evidence age), apply exactly the planned
                versions, then run the postflight verifier; exits non-zero if ANY step cannot be proven
  compat        read-only gate for API deployments: every migration the image's manifest requires must be in the ledger

Credentials come from the environment only (DATABASE_URL, SUPABASE_URL, SUPABASE_ACCESS_TOKEN) and are never printed or written.
Releases are defined explicitly in database/release-scopes.json (reviewed): exact versions, pinned SHA-256, what must already be applied,
what must never be present (Stage J for D-I) and the registered postflight verifier. Nothing outside a defined scope can be applied.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    from scripts import sql_migration_runner as runner_module
    from scripts import supabase_identity
    from scripts import verify_production_release_d_i as verifier
    from scripts.verify_schema_baseline import verify_baseline
except ModuleNotFoundError:  # executed as a script from the repository root
    import sql_migration_runner as runner_module  # type: ignore
    import supabase_identity  # type: ignore
    import verify_production_release_d_i as verifier  # type: ignore
    from verify_schema_baseline import verify_baseline  # type: ignore

MigrationRunner = runner_module.MigrationRunner
RunnerError = runner_module.RunnerError
PRODUCTION_REF = runner_module.PRODUCTION_PROJECT_REF
class ReleaseError(Exception):
    pass


SCOPE_FILE = "database/release-scopes.json"
VERIFIERS = {"d_i": verifier}  # registered postflight verifiers: a scope naming an unregistered one cannot be planned or applied


def load_scopes(root: Path) -> dict:
    try:
        data = json.loads((Path(root) / SCOPE_FILE).read_text())
    except (OSError, ValueError):
        raise ReleaseError(f"{SCOPE_FILE} is missing or unreadable; failing closed") from None
    scopes = data.get("scopes")
    if data.get("formatVersion") != 1 or not isinstance(scopes, dict) or not scopes:
        raise ReleaseError(f"{SCOPE_FILE} has an unexpected format")
    return scopes


def scope_definition(root: Path, name: str) -> dict:
    scopes = load_scopes(root)
    if name not in scopes:
        raise ReleaseError(f"Release scope {name!r} is not defined in {SCOPE_FILE}")
    d = scopes[name]
    for key in ("versions", "sha256", "requiresApplied", "excludedVersions", "verifier"):
        if key not in d:
            raise ReleaseError(f"Release scope {name!r} lacks {key!r}")
    if d["verifier"] not in VERIFIERS:
        raise ReleaseError(f"Release scope {name!r} names the unregistered postflight verifier {d['verifier']!r}")
    if set(d["sha256"]) != set(d["versions"]) or not d["versions"]:
        raise ReleaseError(f"Release scope {name!r} must pin a SHA-256 for exactly its versions")
    return d


try:  # the repository default; tests may point --repo-root elsewhere
    SCOPES = {name: list(d["versions"]) for name, d in load_scopes(Path(__file__).resolve().parents[1]).items()}
except ReleaseError:
    SCOPES = {}
CATALOG_KEYS = ("tables", "rls_enabled", "policies", "triggers", "functions")
BACKUP_EVIDENCE_MAX_AGE_MINUTES = 30
BACKUP_MAX_AGE_HOURS = 26
SUPABASE_API = "https://api.supabase.com"


def _root(args) -> Path:
    return Path(args.repo_root).resolve()


def _env_for(args) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG", "TMPDIR", "DATABASE_URL", "SUPABASE_URL", "VISTA_DATABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN")}
    return env


def _check_target(args, env: dict[str, str], operation: str) -> str:
    """Return the project reference to use. Production by default; a loopback vista_test_* database only with the explicit test flag.
    `operation` ("read" or "apply") fixes the database role that may be used (supabase_identity): the read-only role never applies,
    the owner role is never used for the read-only preflight/gate path."""
    ref = args.expected_project_ref
    parts = urlsplit(env.get("DATABASE_URL", ""))
    host = (parts.hostname or "").lower()
    local = host in {"127.0.0.1", "localhost", "::1"}
    if args.allow_local_test_database:
        if not local:
            raise ReleaseError("--allow-local-test-database requires a loopback database")
        if ref == PRODUCTION_REF:
            raise ReleaseError("The Production project reference cannot be used with a local database")
    else:
        if local:
            raise ReleaseError("A loopback database is not accepted for a Production release")
        if ref != PRODUCTION_REF:
            raise ReleaseError("Project reference differs from the Production project; refusing")
        try:
            supabase_identity.validate_hosted_role(host, unquote(parts.username or ""), ref, operation)
        except supabase_identity.IdentityError as exc:
            raise ReleaseError(f"DATABASE_URL is not an approved {operation} connection: {exc}") from None
    return ref


def _server_json(env: dict[str, str], sql: str):
    """One read-only query through the verifier's psql helper (its own BEGIN READ ONLY, no credentials in argv/output)."""
    try:
        return verifier.query(env["DATABASE_URL"], sql)
    except SystemExit as exc:
        raise ReleaseError(f"role check failed: {exc}") from None


def _require_reader_access(args, env: dict[str, str]) -> None:
    """The user name only selects a credential; ask the server what it really is. On Production the read path must run as the real
    `vista_backup_reader` with BYPASSRLS and no write path, otherwise RLS-protected tables (the migration ledger included) can read as empty."""
    if args.allow_local_test_database:
        return
    gaps = supabase_identity.reader_access_gaps(_server_json(env, supabase_identity.READER_ACCESS_SQL) or {}, strict=True)
    if gaps:
        raise ReleaseError("the read-only Production connection is not an acceptable backup reader: " + "; ".join(gaps))


def _require_apply_role(args, env: dict[str, str]) -> None:
    """Server-side confirmation that the apply connection really is the owner role (not, for example, the reader behind a look-alike URL)."""
    if args.allow_local_test_database:
        return
    info = _server_json(env, "SELECT json_build_object('role', current_user)::text") or {}
    if info.get("role") != supabase_identity.ROLE_APPLY:
        raise ReleaseError("the apply connection is not the approved apply role on the server side")


def _canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _last_json(output: str):
    lines = [line for line in output.strip().splitlines() if line.strip()]
    if not lines:
        raise ReleaseError("database returned no result")
    return json.loads(lines[-1])


def _catalog(runner: MigrationRunner, connection) -> dict:
    sql = """BEGIN READ ONLY; SELECT json_build_object(
      'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
      'rls_enabled',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity),
      'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
      'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
      'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))::text;"""
    return _last_json(runner._psql(connection, sql))


def build_plan(args, operation: str = "read") -> dict:
    root = _root(args)
    env = _env_for(args)
    ref = _check_target(args, env, operation)
    (_require_reader_access if operation == "read" else _require_apply_role)(args, env)
    runner = MigrationRunner(root, root / "database/migrations/manifest.json", env={**env}, baseline_evidence_path=None)
    try:
        manifest, entries, release_commit = runner._load()  # validates Git provenance, SHA-256 of every file, transactional SQL
        connection = runner_module.validate_project_identity(runner.env, ref, operation)  # Supabase project + role identity (or loopback label)
        state = runner._preflight(connection)  # identity, version, ledger shape; read-only SELECTs
        pending, already = runner._classify(entries, state["ledger_rows"])  # checksum/ordering/drift of the ledger
    except RunnerError as exc:
        raise ReleaseError(str(exc)) from None
    definition = scope_definition(root, args.scope)
    versions = [e["version"] for e in entries]
    expected = list(definition["requiresApplied"]) + list(definition["versions"])
    if versions != expected:
        raise ReleaseError(f"Manifest versions differ from the approved scope {args.scope} (anything else, such as Stage J, is excluded): {versions}")
    for entry in entries:
        if entry["version"] in definition["sha256"] and entry["sha256"] != definition["sha256"][entry["version"]]:
            raise ReleaseError(f"Manifest checksum for {entry['version']} differs from the one pinned by the approved scope")
    excluded = set(definition["excludedVersions"])
    present = {p.stem for p in (root / "database/migrations").glob("*.sql")}
    ledger_versions = {r["version"] for r in state["ledger_rows"]}
    if excluded & (set(versions) | present | ledger_versions):
        raise ReleaseError("An excluded migration (" + ", ".join(sorted(excluded & (set(versions) | present | ledger_versions))) + ") is present in the manifest, in database/migrations or in the ledger; refusing")
    if pending and [e["version"] for e in pending] != list(definition["versions"]):
        raise ReleaseError("The pending migrations are not exactly the approved release versions (partial or different state); refusing")
    if pending and already != list(definition["requiresApplied"]):
        raise ReleaseError("The migrations a scope requires to be applied are not exactly the applied ones; refusing")
    ledger_rows = sorted((r["version"], r["checksum"], r["provenance"]) for r in state["ledger_rows"])
    catalog = None
    if pending and definition.get("catalogBaseline") == "verified-2026-11-09":  # first release: the catalog must still equal the verified baseline
        evidence = json.loads((root / "database/baselines/production-baseline-evidence.json").read_text())
        baseline = root / "database/baselines/production-public-schema-20261109T172950Z.sql"
        check = verify_baseline(baseline, expected_sha256=evidence["sha256"], expected_size=evidence["fileSizeBytes"])
        if check["errors"]:
            raise ReleaseError("Baseline integrity validation failed")
        catalog = _catalog(runner, connection)
        drift = {k: (check["counts"].get(k), catalog[k]) for k in CATALOG_KEYS if check["counts"].get(k) != catalog[k]}
        if drift:
            raise ReleaseError("Catalog drift from the verified baseline (expected, found): " + _canonical(drift))
    plan = {
        "version": 1,
        "projectRef": ref,
        "sourceCommit": manifest["sourceCommit"],
        "releaseCommit": release_commit,
        "manifestSha256": hashlib.sha256((root / "database/migrations/manifest.json").read_bytes()).hexdigest(),
        "scope": args.scope,
        "pending": [{"version": e["version"], "sha256": e["sha256"]} for e in pending],
        "alreadyApplied": already,
        "ledgerDigest": _sha(_canonical(ledger_rows)),
        "catalog": catalog,
        "stageJ": "excluded",
        "status": "nothing_to_do" if not pending else "ready",
    }
    stable = {k: plan[k] for k in ("projectRef", "sourceCommit", "releaseCommit", "manifestSha256", "scope", "pending", "ledgerDigest", "catalog")}
    plan["planHash"] = _sha(_canonical(stable))
    plan["generatedAt"] = datetime.now(timezone.utc).isoformat()
    return plan


BACKUP_STATUSES = {"COMPLETED", "FAILED", "PENDING", "REMOVED", "ARCHIVED", "CANCELLED"}  # V1BackupsResponse in the public OpenAPI spec


def _parse_time(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, AttributeError):
        raise ReleaseError("Backup API returned an unparseable timestamp; failing closed") from None


def validate_backups_response(body, now: datetime) -> dict:
    """Validate the documented contract of GET /v1/projects/{ref}/database/backups (V1BackupsResponse) and derive recovery evidence.

    Fails closed on anything missing or mistyped. Accepts either (A) point-in-time recovery: pitr_enabled AND walg_enabled AND a
    consistent physical-backup window, or (B) a COMPLETED backup no older than BACKUP_MAX_AGE_HOURS.
    """
    if not isinstance(body, dict):
        raise ReleaseError("Unexpected backup API response; failing closed")
    types = {"region": str, "walg_enabled": bool, "pitr_enabled": bool, "backups": list, "physical_backup_data": dict}
    for key, kind in types.items():
        if key not in body or not isinstance(body[key], kind):
            raise ReleaseError(f"Backup API response lacks a valid {key!r}; failing closed")
    latest = None
    for item in body["backups"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), int) or not isinstance(item.get("is_physical_backup"), bool) \
                or item.get("status") not in BACKUP_STATUSES or not isinstance(item.get("inserted_at"), str):
            raise ReleaseError("Backup API response contains a malformed backup entry; failing closed")
        if item["status"] == "COMPLETED":
            when = _parse_time(item["inserted_at"])
            latest = when if latest is None or when > latest else latest
    window = body["physical_backup_data"]
    earliest_unix, latest_unix = window.get("earliest_physical_backup_date_unix"), window.get("latest_physical_backup_date_unix")
    pitr_window = None
    if isinstance(earliest_unix, int) and isinstance(latest_unix, int) and not isinstance(earliest_unix, bool):
        if earliest_unix <= latest_unix <= int(now.timestamp()) + 300:
            pitr_window = (datetime.fromtimestamp(earliest_unix, timezone.utc), datetime.fromtimestamp(latest_unix, timezone.utc))
    pitr_ok = body["pitr_enabled"] is True and body["walg_enabled"] is True and pitr_window is not None
    backup_ok = latest is not None and timedelta(0) <= now - latest <= timedelta(hours=BACKUP_MAX_AGE_HOURS)
    if not (pitr_ok or backup_ok):
        raise ReleaseError(f"No verified recovery point: need PITR (pitr_enabled, walg_enabled and a physical backup window) or a COMPLETED backup newer than {BACKUP_MAX_AGE_HOURS} h; refusing")
    return {"pitrEnabled": pitr_ok, "walgEnabled": body["walg_enabled"], "region": body["region"],
            "pitrEarliestRecoveryBase": pitr_window[0].isoformat() if pitr_window else None,
            "latestBackupAt": latest.isoformat() if latest else None,
            "latestBackupAgeHours": round((now - latest).total_seconds() / 3600, 2) if latest else None}


def check_backup(args) -> dict:
    env = _env_for(args)
    ref = args.expected_project_ref
    if not args.allow_local_test_database and ref != PRODUCTION_REF:
        raise ReleaseError("Project reference differs from the Production project; refusing")
    token = env.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise ReleaseError("SUPABASE_ACCESS_TOKEN is missing: backup/PITR evidence cannot be verified (failing closed)")
    base = args.api_base or SUPABASE_API
    host = urlsplit(base).hostname or ""
    if base != SUPABASE_API and not (args.allow_local_test_database and host in {"127.0.0.1", "localhost"}):
        raise ReleaseError("Only the Supabase Management API (or a loopback test double) may be queried")
    request = urllib.request.Request(f"{base}/v1/projects/{ref}/database/backups", headers={"Authorization": f"Bearer {token}", "User-Agent": "vista-db-release"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310 (fixed https host / loopback double)
            body = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise ReleaseError(f"Backup status could not be retrieved ({type(exc).__name__}); failing closed") from None
    now = datetime.now(timezone.utc)
    evidence = validate_backups_response(body, now)
    return {"projectRef": ref, **evidence, "checkedAt": now.isoformat(),
            "policy": f"(pitr_enabled AND walg_enabled AND physical backup window) OR COMPLETED backup <= {BACKUP_MAX_AGE_HOURS}h"}


def _load_json(path: Path, what: str) -> dict:
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        raise ReleaseError(f"{what} is missing or unreadable; failing closed") from None


LOGICAL_BINDING_KEYS = ("projectRef", "scope", "planHash", "manifestSha256", "releaseCommit", "sourceCommit")
LOGICAL_BACKUP_MAX_AGE_HOURS = 12  # keep equal to production_db_backup.MAX_EVIDENCE_AGE_HOURS


def _check_logical_evidence(backup: dict, approved: dict) -> None:
    """Logical-backup evidence (Supabase Free) must be bound to exactly this release, fresh, and prove a passed restore test."""
    for key in LOGICAL_BINDING_KEYS:
        if not approved.get(key) or backup.get(key) != approved[key]:
            raise ReleaseError(f"Logical backup evidence is bound to a different {key}; refusing")
    if backup.get("restoreTestPassed") is not True or not re.fullmatch(r"[0-9a-f]{64}", str(backup.get("dumpSha256", ""))) or not backup.get("versionId"):
        raise ReleaseError("Logical backup evidence lacks a passed restore test, the dump SHA-256 or the object version; refusing")
    try:
        created = datetime.fromisoformat(str(backup.get("createdAt")))
    except ValueError:
        raise ReleaseError("Logical backup evidence has no valid creation time; refusing") from None
    age = datetime.now(timezone.utc) - created
    if age < timedelta(minutes=-5) or age > timedelta(hours=LOGICAL_BACKUP_MAX_AGE_HOURS):
        raise ReleaseError(f"The logical backup is older than {LOGICAL_BACKUP_MAX_AGE_HOURS} hours (or from the future); take a new one")


def apply_release(args) -> dict:
    approved = _load_json(args.plan, "Approved plan")
    backup = _load_json(args.backup_evidence, "Backup evidence")
    if not args.approval_reference:
        raise ReleaseError("An approval reference is required")
    if approved.get("status") != "ready" or not approved.get("pending"):
        raise ReleaseError("The approved plan has nothing to apply")
    if approved.get("scope") != args.scope:
        raise ReleaseError("Approved plan scope differs from the requested scope")
    checked = datetime.fromisoformat(str(backup.get("checkedAt", "")).replace("Z", "+00:00")) if backup.get("checkedAt") else None
    if checked is None or datetime.now(timezone.utc) - checked > timedelta(minutes=BACKUP_EVIDENCE_MAX_AGE_MINUTES):
        raise ReleaseError(f"Backup evidence is missing or older than {BACKUP_EVIDENCE_MAX_AGE_MINUTES} minutes; re-run check-backup")
    if backup.get("projectRef") != approved.get("projectRef") or not (backup.get("pitrEnabled") or backup.get("latestBackupAt")):
        raise ReleaseError("Backup evidence does not match the approved project or proves no recovery point")
    mode = getattr(args, "backup_mode", "managed")
    if mode not in ("managed", "logical"):
        raise ReleaseError("Unknown backup mode; refusing")
    if (backup.get("kind") == "logical-pg_dump") != (mode == "logical"):
        raise ReleaseError(f"Backup evidence kind does not match the requested backup mode ({mode}); refusing")
    if mode == "logical":
        _check_logical_evidence(backup, approved)

    current = build_plan(args, "apply")  # revalidate EVERYTHING against the live database immediately before applying
    if current["planHash"] != approved["planHash"]:
        raise ReleaseError("State changed since the approved plan (manifest, ledger, catalog or commit drift); refusing to apply")

    root = _root(args)
    env = _env_for(args)
    ref = _check_target(args, env, "apply")
    _require_apply_role(args, env)
    os.environ["DATABASE_URL"] = env["DATABASE_URL"]
    check_module = VERIFIERS[scope_definition(root, args.scope)["verifier"]]
    pre = check_module.snapshot(env["DATABASE_URL"])
    runner = MigrationRunner(root, root / "database/migrations/manifest.json", env={**env})
    started = datetime.now(timezone.utc).isoformat()
    try:
        result = runner.apply(ref, operator_id=args.operator_id, approval_reference=args.approval_reference, approve_production=not args.allow_local_test_database)
    except RunnerError as exc:
        raise ReleaseError(f"Apply failed and was rolled back (single transaction): {exc}") from None
    applied = list(result.pending)
    if applied != [p["version"] for p in approved["pending"]]:
        raise ReleaseError(f"Applied versions {applied} differ from the approved plan")
    checks = check_module.verify(env["DATABASE_URL"], pre)
    failed = [name for name, ok, _ in checks if not ok]
    evidence = {"planHash": approved["planHash"], "applied": applied, "approvalReference": args.approval_reference, "operator": args.operator_id,
                "startedAt": started, "endedAt": datetime.now(timezone.utc).isoformat(), "postflight": {"passed": len(checks) - len(failed), "failed": failed}}
    if failed:
        raise ReleaseError("APPLIED, BUT POSTFLIGHT VERIFICATION FAILED: " + "; ".join(failed) + " | evidence: " + _canonical(evidence))
    return evidence


def compat(args) -> dict:
    """Gate for API/Web deployments: the image's manifest must be fully applied (names and checksums) in the target database."""
    root = _root(args)
    env = _env_for(args)
    ref = _check_target(args, env, "read")
    _require_reader_access(args, env)
    runner = MigrationRunner(root, root / "database/migrations/manifest.json", env={**env})
    try:
        manifest, entries, release_commit = runner._load()
        connection = runner_module.validate_project_identity(runner.env, ref, "read")
        state = runner._preflight(connection)
        pending, _ = runner._classify(entries, state["ledger_rows"])
    except RunnerError as exc:
        raise ReleaseError(str(exc)) from None
    if pending:
        raise ReleaseError("Schema is incompatible with this build: migrations not applied to the database: " + ", ".join(p["version"] for p in pending)
                           + ". Run the approved Production Database Release first; the running API was not touched.")
    return {"projectRef": ref, "releaseCommit": release_commit, "requiredMigrations": [e["version"] for e in entries], "status": "compatible"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[1]))
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p):
        p.add_argument("--expected-project-ref", required=True)
        p.add_argument("--allow-local-test-database", action="store_true", help="tests only: loopback vista_test_* database with a local label")

    p = sub.add_parser("plan"); common(p); p.add_argument("--scope", default="D-I"); p.add_argument("--output", type=Path)
    p = sub.add_parser("snapshot"); common(p); p.add_argument("--output", type=Path, required=True)
    p = sub.add_parser("check-backup"); common(p); p.add_argument("--output", type=Path); p.add_argument("--api-base")
    p = sub.add_parser("apply"); common(p); p.add_argument("--scope", default="D-I"); p.add_argument("--plan", type=Path, required=True)
    p.add_argument("--backup-evidence", type=Path, required=True); p.add_argument("--approval-reference", required=True)
    p.add_argument("--operator-id", required=True); p.add_argument("--output", type=Path)
    p.add_argument("--backup-mode", choices=["managed", "logical"], default="managed")
    p = sub.add_parser("compat"); common(p)
    args = parser.parse_args(argv)
    try:
        if args.command == "plan":
            out = build_plan(args)
        elif args.command == "snapshot":
            env = _env_for(args)
            _check_target(args, env, "read")
            _require_reader_access(args, env)
            out = verifier.snapshot(env["DATABASE_URL"])
        elif args.command == "check-backup":
            out = check_backup(args)
        elif args.command == "apply":
            out = apply_release(args)
        else:
            out = compat(args)
    except ReleaseError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(out, indent=2, sort_keys=True)
    if getattr(args, "output", None):
        args.output.write_text(text + "\n")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
