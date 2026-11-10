#!/usr/bin/env python3
"""Controlled, transaction-only SQL migration runner for VISTA Supabase."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

try:
    from scripts.validate_database_migration_manifest import validate_manifest
except ModuleNotFoundError:
    from validate_database_migration_manifest import validate_manifest

PRODUCTION_PROJECT_REF = "ovijutkvaaxohauvuxbj"
LOCK_NAME = "vista:production-schema-migrations:v1"
EXPECTED_LEDGER_COLUMNS = {
    "version", "checksum", "release_id", "source_commit", "operator_id",
    "applied_at", "provenance",
}
LEGACY_SQL_VERSIONS = {
    "20261104_curriculum_foundation",
    "20261105_question_bank_foundation",
    "20261106_question_bank_quiz_attempt",
    "20261106_classroom_enrollment_lifecycle",
    "20261106_iot_lifecycle_foundation",
    "20261106_iot_publish_intent",
    "20261108_iot_lifecycle_access_restrictions",
}


class RunnerError(RuntimeError):
    """Expected validation, approval, or database failure."""


@dataclass
class RunResult:
    project_ref: str
    database_name: str | None
    source_commit: str
    release_commit: str
    pending: list[str]
    already_applied: list[str]
    dry_run: bool


def validate_transactional_sql(sql: str) -> None:
    if not sql.strip():
        raise RunnerError("Migration SQL file is empty")
    if re.search(r"(?m)^\s*\\", sql):
        raise RunnerError("Migration SQL contains a psql meta-command")
    try:
        from scripts.verify_schema_baseline import _mask_non_sql_code
    except ModuleNotFoundError:
        from verify_schema_baseline import _mask_non_sql_code

    masked = _mask_non_sql_code(sql)
    for statement in masked.split(";"):
        first = re.sub(r"(?m)^\s*(?:(?:--[^\n]*\n)|(?:/\*.*?\*/\s*))*", "", statement, flags=re.S).strip()
        if re.match(r"(?i)^(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b", first):
            raise RunnerError("Migration SQL must be transactional and must not manage transaction boundaries; runner owns the transaction")
        if re.match(
            r"(?i)^(?:VACUUM\b|CREATE\s+DATABASE\b|DROP\s+DATABASE\b|ALTER\s+SYSTEM\b|"
            r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b|DROP\s+INDEX\s+CONCURRENTLY\b|"
            r"REINDEX\b[^;]*\bCONCURRENTLY\b|REFRESH\s+MATERIALIZED\s+VIEW\s+CONCURRENTLY\b|"
            r"CREATE\s+TABLESPACE\b|DROP\s+TABLESPACE\b|PREPARE\s+TRANSACTION\b)",
            first,
        ):
            raise RunnerError("Migration contains non-transactional SQL; this runner accepts transactional SQL only")


def _parse_database_url(value: str) -> tuple[str, int, str, str, str | None, dict[str, str]]:
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
            raise ValueError
        username = unquote(parsed.username or "")
        password = unquote(parsed.password) if parsed.password is not None else None
        database = unquote(parsed.path.lstrip("/"))
        if not username or not database:
            raise ValueError
        query_lists = parse_qs(parsed.query, keep_blank_values=True)
        if any(len(items) != 1 for items in query_lists.values()):
            raise ValueError
        query = {key: values[0] for key, values in query_lists.items()}
        if set(query) - {"sslmode", "connect_timeout", "application_name"}:
            raise RunnerError("DATABASE_URL contains unsupported query parameters")
        port = parsed.port or 5432
        return parsed.hostname.lower(), port, database, username, password, query
    except RunnerError:
        raise
    except (ValueError, UnicodeError):
        raise RunnerError("DATABASE_URL is not a valid PostgreSQL connection URI") from None


def _project_from_supabase_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    match = re.fullmatch(r"([a-z0-9-]+)\.supabase\.co", host)
    if parsed.scheme != "https" or not match:
        raise RunnerError("SUPABASE_URL is not a standard HTTPS Supabase project URL")
    return match.group(1)


def validate_project_identity(
    env: dict[str, str], expected_project_ref: str
) -> tuple[str, int, str, str, str | None, dict[str, str]]:
    if not re.fullmatch(r"[a-z0-9-]{3,64}", expected_project_ref):
        raise RunnerError("Expected project reference has invalid format")
    database_url = env.get("DATABASE_URL", "")
    host, port, database, username, password, query = _parse_database_url(database_url)
    supabase_ref = _project_from_supabase_url(env.get("SUPABASE_URL"))
    direct_match = re.fullmatch(r"(?:db\.)?([a-z0-9-]+)\.supabase\.co", host)
    pooler_match = host.endswith(".pooler.supabase.com")
    if direct_match:
        bound_ref = direct_match.group(1)
        if supabase_ref != bound_ref or bound_ref != expected_project_ref:
            raise RunnerError("Project identity mismatch: SUPABASE_URL and DATABASE_URL do not identify the expected project")
    elif pooler_match:
        user_match = re.fullmatch(r"postgres\.([a-z0-9-]+)", username)
        if not user_match or supabase_ref != user_match.group(1) or user_match.group(1) != expected_project_ref:
            raise RunnerError("Project identity mismatch: Supabase pooler user and URL do not identify the expected project")
    elif host in {"localhost", "127.0.0.1", "::1"}:
        if expected_project_ref == PRODUCTION_PROJECT_REF:
            raise RunnerError("Production project identity cannot use a loopback database connection")
        if env.get("VISTA_DATABASE_PROJECT_REF") != expected_project_ref:
            raise RunnerError("Project identity mismatch: local isolated database label differs from the expected project reference")
        if not database.startswith(("vista_test_", "vista_baseline_test_")):
            raise RunnerError("Loopback migration runner connections are restricted to vista_test_* databases")
        if supabase_ref is not None:
            raise RunnerError("Local database connection must not be paired with a Supabase Production URL")
    else:
        raise RunnerError("Database host is not an identifiable Supabase project endpoint or loopback test database")
    sslmode = query.get("sslmode", "require")
    if host not in {"localhost", "127.0.0.1", "::1"} and sslmode not in {"require", "verify-ca", "verify-full"}:
        raise RunnerError("Remote Supabase connections require TLS")
    return host, port, database, username, password, query


def _pgpass_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(":", "\\:").replace("\n", "")


class MigrationRunner:
    def __init__(
        self,
        repo_root: Path,
        manifest_path: Path,
        *,
        env: dict[str, str] | None = None,
        psql_binary: str = "psql",
        expected_server_major: int = 17,
        baseline_evidence_path: Path | None = None,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.manifest_path = manifest_path if manifest_path.is_absolute() else self.repo_root / manifest_path
        self.env = dict(os.environ if env is None else env)
        self.psql_binary = psql_binary
        self.expected_server_major = expected_server_major
        self.baseline_evidence_path = baseline_evidence_path or (self.repo_root / "database/baselines/production-baseline-evidence.json")

    def _load(self) -> tuple[dict, list[dict], str]:
        errors = validate_manifest(self.repo_root, self.manifest_path, release=True)
        if errors:
            raise RunnerError("Manifest validation failed: " + "; ".join(errors))
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        entries = sorted(manifest["migrations"], key=lambda item: item["order"])
        for entry in entries:
            try:
                sql = (self.repo_root / entry["path"]).read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                raise RunnerError(f"Migration source is not readable UTF-8 SQL: {entry['version']}") from None
            validate_transactional_sql(sql)
            entry["_sql"] = sql
        release = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=self.repo_root,
            text=True, capture_output=True, check=False,
        )
        if release.returncode:
            raise RunnerError("Cannot identify the current Git release commit")
        return manifest, entries, release.stdout.strip()

    def _psql(self, connection: tuple, sql: str, *, single_transaction: bool = False) -> str:
        host, port, database, username, password, query = connection
        pass_through = {"PATH", "HOME", "TMPDIR", "TEMP", "LANG", "LC_ALL", "SYSTEMROOT", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH"}
        child_env = {key: value for key, value in self.env.items() if key in pass_through or key.startswith("FAKE_")}
        if password is None and self.env.get("PGPASSFILE"):
            configured_passfile = Path(self.env["PGPASSFILE"])
            try:
                mode = configured_passfile.stat().st_mode & 0o777
            except OSError:
                raise RunnerError("Configured PGPASSFILE is not readable") from None
            if mode & 0o077:
                raise RunnerError("Configured PGPASSFILE permissions must be 0600")
            child_env["PGPASSFILE"] = str(configured_passfile)
        child_env.update({
            "PGHOST": host,
            "PGPORT": str(port),
            "PGDATABASE": database,
            "PGUSER": username,
            "PGSSLMODE": query.get("sslmode", "require"),
            "PGCONNECT_TIMEOUT": query.get("connect_timeout", "5"),
            "PGAPPNAME": query.get("application_name", "vista-sql-migration-runner"),
        })
        args = [self.psql_binary, "-X", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1"]
        if single_transaction:
            args.append("--single-transaction")
        passfile_path: str | None = None
        try:
            if password is not None:
                fd, passfile_path = tempfile.mkstemp(prefix="vista-pgpass-")
                os.fchmod(fd, 0o600)
                with os.fdopen(fd, "w", encoding="utf-8") as passfile:
                    passfile.write(":".join(map(_pgpass_escape, [host, str(port), database, username, password])) + "\n")
                child_env["PGPASSFILE"] = passfile_path
            try:
                result = subprocess.run(
                    args, input=sql, text=True, capture_output=True, env=child_env,
                    cwd=self.repo_root, check=False,
                )
            except OSError:
                raise RunnerError("psql executable could not be started") from None
            if result.returncode:
                action = "transaction aborted and rolled back" if single_transaction else "database preflight failed"
                raise RunnerError(f"PostgreSQL {action} (psql exit {result.returncode}); connection output suppressed")
            return result.stdout.strip()
        finally:
            if passfile_path:
                try:
                    os.unlink(passfile_path)
                except OSError:
                    pass

    @staticmethod
    def _one_json(output: str, label: str) -> dict:
        for line in reversed(output.splitlines()):
            try:
                item = json.loads(line)
                if isinstance(item, dict):
                    return item
            except json.JSONDecodeError:
                continue
        raise RunnerError(f"PostgreSQL {label} returned no valid JSON result")

    def _preflight(self, connection: tuple) -> dict:
        identity_sql = """SELECT json_build_object(
  'database_name', current_database(),
  'server_version_num', current_setting('server_version_num')::integer,
  'transaction_read_only', current_setting('transaction_read_only') = 'on',
  'in_recovery', pg_is_in_recovery(),
  'ledger_exists', to_regclass('public.vista_schema_migrations') IS NOT NULL
)::text;
"""
        identity = self._one_json(self._psql(connection, identity_sql), "identity preflight")
        try:
            major = int(identity["server_version_num"]) // 10000
        except (KeyError, TypeError, ValueError):
            raise RunnerError("Could not verify PostgreSQL server version") from None
        if major != self.expected_server_major:
            raise RunnerError(f"PostgreSQL server major {major} does not match expected {self.expected_server_major}")
        if not identity.get("ledger_exists"):
            raise RunnerError("public.vista_schema_migrations is missing; runner will not bootstrap or alter the ledger")
        if identity.get("in_recovery"):
            raise RunnerError("Database is a read replica; migration execution is not allowed")
        ledger_sql = """SELECT json_build_object(
  'columns', COALESCE((
    SELECT json_agg(a.attname ORDER BY a.attnum)
    FROM pg_attribute a
    WHERE a.attrelid = 'public.vista_schema_migrations'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  ), '[]'::json),
  'primary_key', (
    SELECT pg_get_constraintdef(c.oid, true)
    FROM pg_constraint c
    WHERE c.conrelid = 'public.vista_schema_migrations'::regclass AND c.contype = 'p'
  ),
  'rows', COALESCE((
    SELECT json_agg(json_build_object('version', version, 'checksum', checksum, 'provenance', provenance) ORDER BY version)
    FROM public.vista_schema_migrations
  ), '[]'::json)
)::text;
"""
        ledger = self._one_json(self._psql(connection, ledger_sql), "ledger preflight")
        columns = set(ledger.get("columns") or [])
        if columns != EXPECTED_LEDGER_COLUMNS:
            raise RunnerError("Migration ledger columns differ from the reviewed schema contract")
        if str(ledger.get("primary_key", "")).upper() != "PRIMARY KEY (VERSION)":
            raise RunnerError("Migration ledger does not have the expected primary key on version")
        identity["ledger_rows"] = ledger.get("rows") or []
        return identity

    def _require_verified_production_baseline(self, manifest: dict) -> None:
        try:
            evidence = json.loads(self.baseline_evidence_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raise RunnerError("Production baseline evidence is missing or unreadable; apply is blocked") from None
        if evidence.get("projectRef") != PRODUCTION_PROJECT_REF:
            raise RunnerError("Production baseline evidence identifies a different project")
        if evidence.get("sha256") != manifest.get("baselineSha256"):
            raise RunnerError("Manifest baseline fingerprint does not match verified baseline evidence")
        if evidence.get("captureIntegrityStatus") != "verified":
            raise RunnerError("Production baseline capture integrity is not verified")
        if evidence.get("isolatedRestoreStatus") != "verified":
            raise RunnerError("Production apply is blocked until the isolated PostgreSQL 17 restore is verified")
        if evidence.get("captureCatalogComparisonStatus") != "verified":
            raise RunnerError("Production apply is blocked until capture catalog definitions and permissions are compared")

    @staticmethod
    def _classify(entries: list[dict], rows: list[dict]) -> tuple[list[dict], list[str]]:
        ledger_by_version: dict[str, dict] = {}
        for row in rows:
            version = row.get("version")
            if not isinstance(version, str):
                raise RunnerError("Migration ledger returned an invalid version")
            if version in ledger_by_version:
                raise RunnerError(f"Migration ledger has duplicate version rows: {version}")
            ledger_by_version[version] = row
        entry_versions = {entry["version"] for entry in entries}
        first_version = min(entry_versions)
        unexpected_new = [
            version for version in ledger_by_version
            if version not in entry_versions and version not in LEGACY_SQL_VERSIONS
            and version >= first_version
        ]
        if unexpected_new:
            raise RunnerError("Migration ledger contains unmanifested current-stream versions: " + ", ".join(sorted(unexpected_new)))
        pending: list[dict] = []
        already: list[str] = []
        gap_seen = False
        later_recorded = False
        for entry in entries:
            row = ledger_by_version.get(entry["version"])
            if row is None:
                gap_seen = True
                pending.append(entry)
                continue
            if row.get("checksum") != entry["sha256"]:
                raise RunnerError(f"Migration ledger checksum mismatch for {entry['version']}")
            if row.get("provenance") != "executed":
                raise RunnerError(f"Migration {entry['version']} has non-executed provenance; operator review required")
            if gap_seen:
                later_recorded = True
            already.append(entry["version"])
        if later_recorded:
            raise RunnerError("Migration ledger has a later manifest version recorded while an earlier version is missing")
        return pending, already

    def dry_run(self, expected_project_ref: str) -> RunResult:
        manifest, entries, release_commit = self._load()
        if not entries:
            raise RunnerError("Release inventory is empty; no database connection was made")
        connection = validate_project_identity(self.env, expected_project_ref)
        state = self._preflight(connection)
        pending, already = self._classify(entries, state["ledger_rows"])
        return RunResult(expected_project_ref, state.get("database_name"), manifest["sourceCommit"], release_commit, [e["version"] for e in pending], already, True)

    def apply(
        self,
        expected_project_ref: str,
        *,
        operator_id: str,
        approval_reference: str | None = None,
        approve_production: bool = False,
    ) -> RunResult:
        if not operator_id or not re.fullmatch(r"[A-Za-z0-9._@+-]{1,128}", operator_id):
            raise RunnerError("A valid operator_id is required")
        manifest, entries, release_commit = self._load()
        if not entries:
            raise RunnerError("Release inventory is empty; no database connection was made")
        connection = validate_project_identity(self.env, expected_project_ref)
        if expected_project_ref == PRODUCTION_PROJECT_REF and not approve_production:
            raise RunnerError("Production execution requires explicit Production approval (--approve-production)")
        if expected_project_ref == PRODUCTION_PROJECT_REF and not approval_reference:
            raise RunnerError("Production execution requires an approval reference")
        if expected_project_ref == PRODUCTION_PROJECT_REF and not re.fullmatch(r"[A-Za-z0-9._/-]{3,128}", approval_reference):
            raise RunnerError("Production approval reference has invalid format")
        if expected_project_ref == PRODUCTION_PROJECT_REF:
            self._require_verified_production_baseline(manifest)
        state = self._preflight(connection)
        pending, already = self._classify(entries, state["ledger_rows"])
        if not pending:
            return RunResult(expected_project_ref, state.get("database_name"), manifest["sourceCommit"], release_commit, [], already, False)
        if not approval_reference or not re.fullmatch(r"[A-Za-z0-9._/-]{3,128}", approval_reference):
            raise RunnerError("An explicit approval reference is required before applying migrations")
        if state.get("transaction_read_only"):
            raise RunnerError("Database session is read-only; migration apply is not allowed")
        sql = self._build_apply_sql(pending, release_commit, manifest["sourceCommit"], operator_id)
        self._psql(connection, sql, single_transaction=True)
        return RunResult(expected_project_ref, state.get("database_name"), manifest["sourceCommit"], release_commit, [entry["version"] for entry in pending], already, False)

    @staticmethod
    def _literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    @classmethod
    def _build_apply_sql(cls, entries: list[dict], release_commit: str, source_commit: str, operator_id: str) -> str:
        lock_key = int.from_bytes(hashlib.sha256(LOCK_NAME.encode()).digest()[:8], "big", signed=True)
        versions = ", ".join(cls._literal(entry["version"]) for entry in entries)
        first_version = cls._literal(entries[0]["version"])
        legacy_versions = ", ".join(cls._literal(version) for version in sorted(LEGACY_SQL_VERSIONS))
        lines = [
            "SET LOCAL lock_timeout = '5s';",
            "SET LOCAL statement_timeout = '1800000ms';",
            f"SELECT pg_advisory_xact_lock({lock_key});",
            "DO $vista_runner_guard$ BEGIN",
            "  IF to_regclass('public.vista_schema_migrations') IS NULL THEN",
            "    RAISE EXCEPTION 'VISTA migration ledger is missing';",
            "  END IF;",
            f"  IF EXISTS (SELECT 1 FROM public.vista_schema_migrations WHERE version IN ({versions})) THEN",
            "    RAISE EXCEPTION 'VISTA migration ledger changed after preflight; rerun dry-run';",
            "  END IF;",
            "  IF EXISTS (SELECT 1 FROM public.vista_schema_migrations "
            f"WHERE version >= {first_version} AND provenance = 'executed' AND version NOT IN ({legacy_versions})) THEN",
            "    RAISE EXCEPTION 'A newer migration appeared after preflight; rerun dry-run';",
            "  END IF;",
            "END $vista_runner_guard$;",
        ]
        for entry in entries:
            lines.append(f"-- VISTA migration {entry['version']} sha256={entry['sha256']}")
            lines.append(entry["_sql"].rstrip())
            lines.append(
                "INSERT INTO public.vista_schema_migrations "
                "(version, checksum, release_id, source_commit, operator_id, provenance) VALUES ("
                + ", ".join(map(cls._literal, [entry["version"], entry["sha256"], release_commit, source_commit, operator_id, "executed"]))
                + ");"
            )
        expected = ", ".join(
            f"({cls._literal(entry['version'])}, {cls._literal(entry['sha256'])})"
            for entry in entries
        )
        lines.extend([
            "DO $vista_runner_postflight$ BEGIN",
            f"  IF EXISTS (SELECT 1 FROM (VALUES {expected}) AS expected(version, checksum) "
            "LEFT JOIN public.vista_schema_migrations actual USING (version) "
            "WHERE actual.version IS NULL OR actual.checksum <> expected.checksum OR actual.provenance <> 'executed') THEN",
            "    RAISE EXCEPTION 'VISTA migration ledger postflight failed';",
            "  END IF;",
            "END $vista_runner_postflight$;",
        ])
        return "\n".join(lines) + "\n"


def _print_result(result: RunResult) -> None:
    print(json.dumps({
        "mode": "dry-run" if result.dry_run else "apply",
        "project_ref": result.project_ref,
        "database_name": result.database_name,
        "source_commit": result.source_commit,
        "release_commit": result.release_commit,
        "pending": result.pending,
        "already_applied": result.already_applied,
    }, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="perform only read-only project, ledger, and plan checks")
    mode.add_argument("--apply", action="store_true", help="apply pending transactional migrations; requires explicit approval")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--manifest", type=Path, default=Path("database/migrations/manifest.json"))
    parser.add_argument("--baseline-evidence", type=Path)
    parser.add_argument("--expected-project-ref")
    parser.add_argument("--operator-id")
    parser.add_argument("--approval-reference")
    parser.add_argument("--approve-production", action="store_true")
    parser.add_argument("--psql-binary", default="psql", help=argparse.SUPPRESS)
    args = parser.parse_args()
    root = args.repo_root.resolve()
    manifest = args.manifest if args.manifest.is_absolute() else root / args.manifest
    try:
        if args.dry_run or args.apply:
            if not args.expected_project_ref:
                raise RunnerError("--expected-project-ref is required for database operations")
            evidence_path = args.baseline_evidence
            if evidence_path is not None and not evidence_path.is_absolute():
                evidence_path = root / evidence_path
            runner = MigrationRunner(root, manifest, psql_binary=args.psql_binary, baseline_evidence_path=evidence_path)
            if args.apply:
                if not args.operator_id:
                    raise RunnerError("--operator-id is required for apply")
                result = runner.apply(
                    args.expected_project_ref,
                    operator_id=args.operator_id,
                    approval_reference=args.approval_reference,
                    approve_production=args.approve_production,
                )
            else:
                result = runner.dry_run(args.expected_project_ref)
            _print_result(result)
        else:
            errors = validate_manifest(root, manifest, release=False)
            if errors:
                raise RunnerError("Manifest validation failed: " + "; ".join(errors))
            print("Manifest and Git provenance validation passed; no database connection was made")
    except RunnerError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
