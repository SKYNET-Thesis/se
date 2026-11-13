#!/usr/bin/env python3
"""Logical (pg_dump) backup, restore test and evidence for the Production database release on Supabase Free.

Supabase Free has no managed backups or PITR, so before a Production migration the release workflow takes a consistent logical backup,
proves it restores into a disposable PostgreSQL 17, stores it encrypted in a private bucket, and binds the evidence to the exact project,
release scope, manifest, reviewed main SHA and approved plan. The apply job re-verifies that evidence immediately before applying.

  run              dump -> integrity hash -> restore test (disposable local PostgreSQL) -> encrypted upload -> evidence   (preflight env)
  verify-evidence  apply side: fetch evidence, check bindings, freshness, encryption and the stored object's checksum

Nothing is ever printed that contains a connection string, credential, host, or data: output is hashes, sizes, identifiers and check names.
Dumps are written only under a private temporary directory, uploaded to the bucket, and deleted; they are never workflow artifacts.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    from scripts import sql_migration_runner as runner_module
    from scripts import supabase_identity
except ModuleNotFoundError:  # executed as a script from the repository root
    import sql_migration_runner as runner_module  # type: ignore
    import supabase_identity  # type: ignore

PRODUCTION_REF = runner_module.PRODUCTION_PROJECT_REF
EVIDENCE_KIND = "logical-pg_dump"
EVIDENCE_VERSION = 1
MAX_EVIDENCE_AGE_HOURS = 12  # a restore loses everything written after the dump: keep the window short
VERIFIED_EVIDENCE_MAX_AGE_MINUTES = 30
RETENTION_DAYS = 90
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
# Roles referenced by Supabase ACLs; created NOLOGIN in the disposable restore target so GRANT statements in the dump can replay.
SUPABASE_ROLES = ("anon", "authenticated", "service_role", "authenticator", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin", "dashboard_user", "pgbouncer")
CRITICAL_TABLES = ("users", "learning_courses", "learning_lessons", "learning_assignments", "learning_classroom_assignments", "learning_assignment_attempts",
                   "learning_submissions", "learning_assessments", "learning_programs", "learning_program_versions", "vista_schema_migrations", "organizations", "memberships")
REQUIRED_RESTORE_CHECKS = ("integrity_sha256", "pg_restore_clean_exit", "catalog_counts_equal", "row_counts_equal", "ledger_equal", "critical_tables_present", "dump_not_empty")
KMS_ARN = re.compile(r"^arn:aws:kms:[a-z0-9-]+:157098813811:key/[0-9a-f-]{36}$")
BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{2,62}$")


class BackupError(Exception):
    pass


def _scrub(text: str, *secrets: str) -> str:
    for value in secrets:
        if value:
            text = text.replace(value, "<redacted>")
    return re.sub(r"(postgres(?:ql)?://)\S+", r"\1<redacted>", text)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _b64(hex_digest: str) -> str:
    return base64.b64encode(bytes.fromhex(hex_digest)).decode()


# ---------------------------------------------------------------------------------------------------------------- database access
class Target:
    """A parsed database URL. Credentials stay in memory and in a 0600 passfile; they never reach argv, logs or evidence."""

    def __init__(self, url: str):
        try:
            u = urlsplit(url)
            self.host, self.port, self.user = (u.hostname or "").lower(), u.port or 5432, unquote(u.username or "")
            self.password, self.database = unquote(u.password or ""), unquote(u.path.lstrip("/"))
        except ValueError:
            raise BackupError("database URL is not valid") from None
        if not (self.host and self.user and self.database):
            raise BackupError("database URL is not valid")
        self.url = url
        self.local = self.host in LOOPBACK

    def secrets(self) -> tuple[str, ...]:
        return tuple(x for x in (self.url, self.password, self.host, self.user) if x)

    @contextmanager
    def env(self):
        fd, passfile = tempfile.mkstemp(prefix="vista-pgpass-")
        os.fchmod(fd, 0o600)
        esc = lambda v: v.replace("\\", "\\\\").replace(":", "\\:")  # noqa: E731
        with os.fdopen(fd, "w") as handle:
            handle.write(":".join(esc(x) for x in (self.host, str(self.port), self.database, self.user, self.password)) + "\n")
        base = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG", "TMPDIR", "LD_LIBRARY_PATH")}
        base.update({"PGHOST": self.host, "PGPORT": str(self.port), "PGUSER": self.user, "PGDATABASE": self.database, "PGPASSFILE": passfile,
                     "PGSSLMODE": "disable" if self.local else "require", "PGCONNECT_TIMEOUT": "15", "PGAPPNAME": "vista-db-backup"})
        try:
            yield base
        finally:
            with contextlib_suppress():
                os.unlink(passfile)


@contextmanager
def contextlib_suppress():
    try:
        yield
    except OSError:
        pass


def check_target(target: Target, expected_ref: str, allow_local: bool, env_label: str | None = None) -> None:
    """Production project identity (pooler user / host) or, for tests only, a loopback vista_test_* database."""
    if allow_local:
        if not target.local or not target.database.startswith("vista_test_") or expected_ref == PRODUCTION_REF:
            raise BackupError("--allow-local-test-database requires a loopback vista_test_* database and a non-Production label")
        return
    if target.local:
        raise BackupError("A loopback database is not accepted for a Production backup")
    if expected_ref != PRODUCTION_REF:
        raise BackupError("Project reference differs from the Production project; refusing")
    try:  # the backup always runs with the read-only backup reader role, never with the owner/apply role
        supabase_identity.validate_hosted_role(target.host, target.user, PRODUCTION_REF, "read")
    except supabase_identity.IdentityError as exc:
        raise BackupError(f"DATABASE_URL is not an approved backup reader connection for the Production project: {exc}") from None


def _run(cmd: list[str], target: Target, env: dict, *, stdin: str | None = None, timeout: int = 1800) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, input=stdin, capture_output=True, text=True, env=env, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BackupError(f"{Path(cmd[0]).name} could not run ({type(exc).__name__})") from None


def psql_json(target: Target, sql: str):
    with target.env() as env:
        done = _run(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", "BEGIN READ ONLY; " + sql], target, env, timeout=300)
    if done.returncode:
        raise BackupError("query failed: " + _scrub(done.stderr, *target.secrets()).strip()[:200])
    lines = [line for line in done.stdout.strip().splitlines() if line.strip()]
    return json.loads(lines[-1]) if lines else None


INVENTORY_SQL = """SELECT json_build_object(
  'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'columns',(SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public'),
  'indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname='public'),
  'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
  'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
  'rls_enabled',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity),
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
  'sequences',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'))::text"""
ROWS_SQL = """SELECT COALESCE(json_object_agg(table_name,(xpath('/row/c/text()',query_to_xml(format('select count(*) as c from %I.%I',table_schema,table_name),false,true,'')))[1]::text::bigint),'{}'::json)::text
  FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"""
LEDGER_SQL = "SELECT COALESCE(json_agg(json_build_object('version',version,'checksum',checksum) ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations"


# What pg_dump --schema=public needs from the connecting role (and, on Production, what the read-only role must NOT be able to do) is defined
# in supabase_identity (shared with the release script). A plain SELECT grant is NOT enough on a database whose tables have row level security
# enabled (Production: 46 tables, no policies): pg_dump aborts, and count(*) silently returns 0 for such a role.
ACCESS_SQL = supabase_identity.READER_ACCESS_SQL


def reader_access_gaps(target: Target, *, strict: bool = False) -> list[str]:
    """Return what is missing for a complete, read-only dump (empty = fine). Names only, no data."""
    return supabase_identity.reader_access_gaps(psql_json(target, ACCESS_SQL) or {}, strict=strict)


def archive_content_problems(toc_lines: list[str], row_counts: dict) -> list[str]:
    """The archive listing must contain a table definition and a data section for every public table seen in the database (names only)."""
    tables = {m.group(1) for line in toc_lines if (m := re.search(r"\bTABLE public (\S+) ", line))}
    data = {m.group(1) for line in toc_lines if (m := re.search(r"\bTABLE DATA public (\S+) ", line))}
    problems = []
    if not tables:
        problems.append("the archive contains no table definitions")
    for name in sorted(set(row_counts) - tables):
        problems.append(f"table {name} is missing from the archive")
    for name in sorted(set(row_counts) - data):
        problems.append(f"data section of table {name} is missing from the archive")
    return problems[:10]


def emptiness_problems(state: dict, *, allow_empty: bool) -> list[str]:
    """A Production database is never empty: an empty ledger or zero rows everywhere means the backup role could not see the data. Names/counts only."""
    problems = []
    if not state.get("ledger"):
        problems.append("the migration ledger is empty")
    if not state.get("rowCounts"):
        problems.append("no public tables were found")
    elif not allow_empty and sum(int(v or 0) for v in state["rowCounts"].values()) == 0:
        problems.append("every public table has zero rows")
    return problems


def snapshot_state(target: Target) -> dict:
    return {"catalog": psql_json(target, INVENTORY_SQL), "rowCounts": psql_json(target, ROWS_SQL), "ledger": psql_json(target, LEDGER_SQL)}


def tool_major(name: str) -> int:
    done = subprocess.run([name, "--version"], capture_output=True, text=True)
    m = re.search(r"(\d+)(?:\.\d+)?", done.stdout or "")
    if done.returncode or not m:
        raise BackupError(f"{name} is not available")
    return int(m.group(1))


# ---------------------------------------------------------------------------------------------------------------- dump
def dump(target: Target, out_dir: Path, *, allow_local: bool, attempts: int = 3) -> dict:
    server_major = int(psql_json(target, "SELECT (current_setting('server_version_num')::int/10000)::text::json::text") or 0)
    pg_dump_major = tool_major("pg_dump")
    if (not allow_local and pg_dump_major != server_major) or pg_dump_major < server_major:
        raise BackupError(f"pg_dump major {pg_dump_major} does not match the server major {server_major}; install the matching PostgreSQL client")
    gaps = reader_access_gaps(target, strict=not allow_local)  # Production: the server must confirm the real reader role, BYPASSRLS and no write path
    if gaps:
        raise BackupError("backup role cannot read the whole public schema: " + "; ".join(gaps))
    server_version = psql_json(target, "SELECT to_json(current_setting('server_version'))::text")
    last_error = "database changed during the dump window"
    for attempt in range(1, attempts + 1):
        before = snapshot_state(target)
        path = out_dir / "backup.dump"
        with target.env() as env:
            done = _run(["pg_dump", "--format=custom", "--compress=6", "--no-owner", "--schema=public", "--lock-wait-timeout=60s", "--file", str(path)], target, env)
        if done.returncode:
            raise BackupError("pg_dump failed: " + _scrub(done.stderr, *target.secrets()).strip()[:300])
        after = snapshot_state(target)
        if before == after:
            break
        last_error = f"attempt {attempt}: production changed during the dump (catalog, row counts or ledger differ before/after); retrying" if attempt < attempts else \
            "production kept changing during the dump window; retry when it is quiet"
        path.unlink(missing_ok=True)
        if attempt == attempts:
            raise BackupError(last_error)
        time.sleep(2)
    toc = subprocess.run(["pg_restore", "--list", str(path)], capture_output=True, text=True)
    if toc.returncode or not toc.stdout.strip():
        raise BackupError("the dump archive cannot be listed; failing closed")
    entries = [line for line in toc.stdout.splitlines() if line and not line.startswith(";")]
    content = archive_content_problems(entries, before["rowCounts"]) + emptiness_problems(before, allow_empty=allow_local)
    if content:
        path.unlink(missing_ok=True)
        raise BackupError("the backup is empty or incomplete: " + "; ".join(content))
    return {"format": "custom", "schemas": ["public"], "file": path.name, "sizeBytes": path.stat().st_size, "sha256": _sha256_file(path),
            "pgDumpMajor": pg_dump_major, "serverVersion": server_version, "tocEntries": len(entries),
            "tocSha256": hashlib.sha256("\n".join(entries).encode()).hexdigest(), "production": before, "allowEmpty": allow_local}


# ---------------------------------------------------------------------------------------------------------------- restore test
def restore_test(dump_file: Path, manifest: dict, admin_url: str) -> dict:
    """Restore into a throw-away database on a loopback PostgreSQL and compare it with what production looked like at dump time."""
    admin = Target(admin_url)
    if not admin.local:
        raise BackupError("The restore test must run on a loopback (disposable) PostgreSQL server")
    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str = "") -> bool:
        checks.append({"name": name, "ok": bool(ok), "detail": detail})
        return bool(ok)

    started = time.time()
    if not check("integrity_sha256", _sha256_file(dump_file) == manifest["sha256"], "sha-256 of the dump file equals the recorded hash"):
        return {"passed": False, "checks": checks}
    name = f"vista_test_restore_{uuid.uuid4().hex[:10]}"
    restore_target = Target(admin_url.rsplit("/", 1)[0] + "/" + name)
    postgres_version = None
    try:
        with admin.env() as env:
            env = {**env, "PGDATABASE": "postgres"}
            for role in SUPABASE_ROLES:
                _run(["psql", "-X", "-q", "-c", f'DO $$ BEGIN CREATE ROLE "{role}" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;'], admin, env, timeout=60)
            created = _run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", f'CREATE DATABASE "{name}"'], admin, env, timeout=60)
            if created.returncode:
                raise BackupError("could not create the disposable restore database")
        with restore_target.env() as env:  # Supabase keeps pgcrypto in the `extensions` schema, which a public-only dump does not carry; the archive itself creates `public`, so the empty default one is dropped
            _run(["psql", "-X", "-q", "-c", "CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions; DROP SCHEMA IF EXISTS public CASCADE;"], restore_target, env, timeout=60)
        postgres_version = psql_json(restore_target, "SELECT to_json(current_setting('server_version'))::text")
        if int(str(postgres_version).split(".")[0]) < 17:
            raise BackupError("the disposable restore server must be PostgreSQL 17 or newer")
        with restore_target.env() as env:
            done = _run(["pg_restore", "--exit-on-error", "--no-owner", "--single-transaction", "--dbname", name, str(dump_file)], restore_target, env)
        if not check("pg_restore_clean_exit", done.returncode == 0, "" if done.returncode == 0 else _scrub(done.stderr, *restore_target.secrets()).strip()[:300]):
            return {"passed": False, "checks": checks, "postgresVersion": postgres_version}
        restored = snapshot_state(restore_target)
        prod = manifest["production"]
        check("catalog_counts_equal", restored["catalog"] == prod["catalog"], "" if restored["catalog"] == prod["catalog"] else f"expected {prod['catalog']} found {restored['catalog']}")
        diff = sorted(t for t in set(prod["rowCounts"]) | set(restored["rowCounts"]) if prod["rowCounts"].get(t) != restored["rowCounts"].get(t))
        check("row_counts_equal", not diff, "" if not diff else "differs for: " + ", ".join(diff[:10]))
        check("ledger_equal", restored["ledger"] == prod["ledger"], f"{len(restored['ledger'])} ledger rows")
        missing = [t for t in CRITICAL_TABLES if t not in restored["rowCounts"]]
        check("critical_tables_present", not missing, "" if not missing else "missing: " + ", ".join(missing))
        empty = emptiness_problems(restored, allow_empty=manifest.get("allowEmpty", False))
        check("dump_not_empty", not empty, "; ".join(empty))
    except BackupError as exc:
        check("restore_environment", False, str(exc))
    finally:
        with admin.env() as env:
            _run(["psql", "-X", "-q", "-c", f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'], admin, {**env, "PGDATABASE": "postgres"}, timeout=60)
    names = {c["name"] for c in checks if c["ok"]}
    return {"passed": all(c["ok"] for c in checks) and set(REQUIRED_RESTORE_CHECKS) <= names, "checks": checks, "postgresVersion": postgres_version,
            "durationSeconds": round(time.time() - started, 1), "rowTablesCompared": len(manifest["production"]["rowCounts"])}


# ---------------------------------------------------------------------------------------------------------------- storage
class S3Storage:
    """Private bucket access through the AWS CLI with the job's short-lived OIDC credentials. SSE-KMS and an S3 SHA-256 checksum are mandatory."""
    backend = "s3"

    def __init__(self, bucket: str, kms_key_arn: str, aws: str = "aws"):
        if not BUCKET.match(bucket or "") or not KMS_ARN.match(kms_key_arn or ""):
            raise BackupError("backup bucket or KMS key is not configured correctly (expected the approved account's key ARN)")
        self.bucket, self.kms, self.aws = bucket, kms_key_arn, aws

    def _aws(self, *args: str) -> dict:
        done = subprocess.run([self.aws, "s3api", *args, "--output", "json"], capture_output=True, text=True, timeout=1800)
        if done.returncode:
            raise BackupError("object storage request failed: " + _scrub(done.stderr, self.bucket, self.kms).strip()[:200])
        return json.loads(done.stdout or "{}")

    def put(self, path: Path, key: str, sha256: str) -> dict:
        out = self._aws("put-object", "--bucket", self.bucket, "--key", key, "--body", str(path), "--server-side-encryption", "aws:kms", "--ssekms-key-id", self.kms,
                        "--checksum-algorithm", "SHA256", "--checksum-sha256", _b64(sha256))
        return {"versionId": out.get("VersionId"), "checksumSha256": out.get("ChecksumSHA256"), "sseKmsKeyId": out.get("SSEKMSKeyId"), "encryption": out.get("ServerSideEncryption")}

    def head(self, key: str) -> dict:
        out = self._aws("head-object", "--bucket", self.bucket, "--key", key, "--checksum-mode", "ENABLED")
        return {"versionId": out.get("VersionId"), "checksumSha256": out.get("ChecksumSHA256"), "sseKmsKeyId": out.get("SSEKMSKeyId"),
                "encryption": out.get("ServerSideEncryption"), "sizeBytes": out.get("ContentLength")}

    def get_json(self, key: str) -> dict:
        with tempfile.TemporaryDirectory(prefix="vista-evidence-") as tmp:
            self._aws("get-object", "--bucket", self.bucket, "--key", key, str(Path(tmp) / "evidence.json"))
            return json.loads((Path(tmp) / "evidence.json").read_text())

    def describe(self) -> dict:
        return {"backend": "s3", "bucket": self.bucket, "kmsKey": self.kms}


class LocalStorage:
    """Tests only: a directory that behaves like the encrypted bucket (it records the same metadata)."""
    backend = "local-test"

    def __init__(self, root: Path):
        self.root = Path(root)

    def _meta(self, key: str) -> Path:
        return self.root / (key + ".meta.json")

    def put(self, path: Path, key: str, sha256: str) -> dict:
        target = self.root / key
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        meta = {"versionId": uuid.uuid4().hex, "checksumSha256": _b64(sha256), "sseKmsKeyId": "arn:aws:kms:local:157098813811:key/00000000-0000-0000-0000-000000000000", "encryption": "aws:kms", "sizeBytes": path.stat().st_size}
        self._meta(key).write_text(json.dumps(meta))
        return {k: meta[k] for k in ("versionId", "checksumSha256", "sseKmsKeyId", "encryption")}

    def head(self, key: str) -> dict:
        if not self._meta(key).exists():
            raise BackupError("object storage request failed: not found")
        meta = json.loads(self._meta(key).read_text())
        file = self.root / key
        digest = _b64(_sha256_file(file))  # the bucket verifies the checksum on upload; the double recomputes it
        return {**meta, "checksumSha256": digest, "sizeBytes": file.stat().st_size}

    def get_json(self, key: str) -> dict:
        try:
            return json.loads((self.root / key).read_text())
        except (OSError, ValueError):
            raise BackupError("evidence is missing or unreadable; failing closed") from None

    def describe(self) -> dict:
        return {"backend": "local-test", "bucket": "local", "kmsKey": "local"}


def make_storage(args):
    if args.storage_dir:
        if not args.allow_local_test_database:
            raise BackupError("a local storage directory is for tests only")
        return LocalStorage(Path(args.storage_dir))
    return S3Storage(args.bucket or os.environ.get("DB_BACKUP_BUCKET", ""), args.kms_key_arn or os.environ.get("DB_BACKUP_KMS_KEY_ARN", ""))


# ---------------------------------------------------------------------------------------------------------------- evidence
def _binding(plan: dict) -> dict:
    keys = ("projectRef", "scope", "planHash", "manifestSha256", "releaseCommit", "sourceCommit")
    missing = [k for k in keys if not plan.get(k)]
    if missing:
        raise BackupError("the approved plan lacks " + ", ".join(missing))
    return {k: plan[k] for k in keys}


def validate_evidence(evidence: dict, plan: dict, *, now: datetime, head: dict | None, storage: dict | None, max_age_hours: float = MAX_EVIDENCE_AGE_HOURS) -> list[str]:
    """Return the list of problems (empty = the evidence proves a restorable, encrypted, fresh backup bound to this exact release)."""
    problems: list[str] = []
    if evidence.get("kind") != EVIDENCE_KIND or evidence.get("version") != EVIDENCE_VERSION:
        return ["unexpected evidence kind or version"]
    for key, value in _binding(plan).items():
        if evidence.get(key) != value:
            problems.append(f"evidence is bound to a different {key}")
    try:
        created = datetime.fromisoformat(evidence["createdAt"])
        expires = datetime.fromisoformat(evidence["expiresAt"])
    except (KeyError, ValueError):
        return problems + ["evidence timestamps are missing or invalid"]
    if now - created > timedelta(hours=max_age_hours):
        problems.append(f"backup is older than {max_age_hours} hours; take a new one")
    if created > now + timedelta(minutes=5) or expires <= now:
        problems.append("backup evidence has expired or lies in the future")
    restore = evidence.get("restoreTest") or {}
    names = {c.get("name") for c in restore.get("checks", []) if c.get("ok") is True}
    if restore.get("passed") is not True or not set(REQUIRED_RESTORE_CHECKS) <= names:
        problems.append("the restore test did not pass every required check")
    if int(str(restore.get("postgresVersion", "0")).split(".")[0] or 0) < 17:
        problems.append("the restore test did not run on PostgreSQL 17 or newer")
    dump_info, stor = evidence.get("dump") or {}, evidence.get("storage") or {}
    sha = dump_info.get("sha256", "")
    if not re.fullmatch(r"[0-9a-f]{64}", sha) or stor.get("checksumSha256") != (_b64(sha) if re.fullmatch(r"[0-9a-f]{64}", sha) else None):
        problems.append("recorded dump hash and storage checksum disagree")
    if head is not None:
        if head.get("checksumSha256") != stor.get("checksumSha256"):
            problems.append("the stored object's checksum differs from the evidence")
        if head.get("versionId") != stor.get("versionId") or not head.get("versionId"):
            problems.append("the stored object's version differs from the evidence")
        if head.get("sizeBytes") != dump_info.get("sizeBytes"):
            problems.append("the stored object's size differs from the evidence")
        if head.get("encryption") != "aws:kms" or not head.get("sseKmsKeyId"):
            problems.append("the stored object is not encrypted with a KMS key")
        if storage and storage.get("kmsKey") not in (None, "local") and head.get("sseKmsKeyId") != storage["kmsKey"]:
            problems.append("the stored object uses a different KMS key than the approved one")
    return problems


def cmd_run(args) -> dict:
    plan = json.loads(Path(args.plan).read_text())
    binding = _binding(plan)
    if plan.get("status") != "ready":
        raise BackupError("the plan has nothing to release; no backup is taken")
    source = Target(os.environ.get("DATABASE_URL", ""))
    check_target(source, binding["projectRef"], args.allow_local_test_database)
    if binding["projectRef"] != args.expected_project_ref:
        raise BackupError("plan project reference differs from the requested one")
    storage = make_storage(args)
    work = Path(tempfile.mkdtemp(prefix="vista-backup-"))
    os.chmod(work, 0o700)
    try:
        manifest = dump(source, work, allow_local=args.allow_local_test_database)
        result = restore_test(work / "backup.dump", manifest, args.restore_admin_url)
        if not result["passed"]:
            failed = [c["name"] for c in result["checks"] if not c["ok"]]
            detail = "; ".join(c["detail"] for c in result["checks"] if not c["ok"] and c.get("detail"))
            raise BackupError("restore test failed (" + ", ".join(failed) + (": " + detail[:300] if detail else "") + "); nothing is uploaded")
        created = datetime.now(timezone.utc)
        prefix = f"production/{binding['projectRef']}/{binding['scope']}/{binding['releaseCommit']}/{created.strftime('%Y%m%dT%H%M%SZ')}-{args.run_id}"
        dump_key, evidence_key = f"{prefix}/backup.dump", f"{prefix}/evidence.json"
        stored = storage.put(work / "backup.dump", dump_key, manifest["sha256"])
        evidence = {"kind": EVIDENCE_KIND, "version": EVIDENCE_VERSION, **binding, "createdAt": created.isoformat(), "expiresAt": (created + timedelta(days=RETENTION_DAYS)).isoformat(),
                    "runId": args.run_id, "dump": {k: v for k, v in manifest.items() if k not in ("production", "file", "allowEmpty")}, "production": manifest["production"],
                    "restoreTest": result, "storage": {**storage.describe(), "dumpKey": dump_key, "evidenceKey": evidence_key, **stored}}
        evidence["storage"].pop("bucket", None)  # location details stay in the private evidence copy only, see below
        evidence["storage"]["bucket"] = storage.describe()["bucket"]
        head = storage.head(dump_key)
        problems = validate_evidence(evidence, plan, now=datetime.now(timezone.utc), head=head, storage={"kmsKey": storage.describe()["kmsKey"]})
        if problems:
            raise BackupError("uploaded backup failed verification: " + "; ".join(problems))
        evidence_file = work / "evidence.json"
        evidence_file.write_text(json.dumps(evidence, indent=2, sort_keys=True))
        storage.put(evidence_file, evidence_key, _sha256_file(evidence_file))
        return {"status": "backed-up", "evidenceKey": evidence_key, "dumpSha256": manifest["sha256"], "sizeBytes": manifest["sizeBytes"], "versionId": stored["versionId"],
                "createdAt": evidence["createdAt"], "restoreTestPassed": True, "restorePostgres": result["postgresVersion"], "pgDumpMajor": manifest["pgDumpMajor"],
                "tablesCompared": result["rowTablesCompared"], "retentionDays": RETENTION_DAYS}
    finally:
        shutil.rmtree(work, ignore_errors=True)  # the dump never outlives the job and is never an artifact


def cmd_verify(args) -> dict:
    plan = json.loads(Path(args.plan).read_text())
    storage = make_storage(args)
    evidence = storage.get_json(args.evidence_key)
    if evidence.get("storage", {}).get("evidenceKey") != args.evidence_key:
        raise BackupError("evidence key mismatch; failing closed")
    head = storage.head(evidence["storage"]["dumpKey"])
    now = datetime.now(timezone.utc)
    problems = validate_evidence(evidence, plan, now=now, head=head, storage={"kmsKey": storage.describe()["kmsKey"]})
    if problems:
        raise BackupError("backup evidence rejected: " + "; ".join(problems))
    summary = {"kind": EVIDENCE_KIND, "projectRef": evidence["projectRef"], "scope": evidence["scope"], "planHash": evidence["planHash"],
               "manifestSha256": evidence["manifestSha256"], "releaseCommit": evidence["releaseCommit"], "sourceCommit": evidence["sourceCommit"],
               "dumpSha256": evidence["dump"]["sha256"], "versionId": evidence["storage"]["versionId"], "createdAt": evidence["createdAt"],
               "restoreTestPassed": True, "checkedAt": now.isoformat(), "pitrEnabled": False, "latestBackupAt": evidence["createdAt"]}
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p):
        p.add_argument("--expected-project-ref", required=True)
        p.add_argument("--plan", required=True)
        p.add_argument("--allow-local-test-database", action="store_true")
        p.add_argument("--storage-dir", help="tests only")
        p.add_argument("--bucket")
        p.add_argument("--kms-key-arn")
        p.add_argument("--output")

    p = sub.add_parser("run"); common(p); p.add_argument("--restore-admin-url", required=True); p.add_argument("--run-id", required=True)
    p = sub.add_parser("verify-evidence"); common(p); p.add_argument("--evidence-key", required=True)
    args = parser.parse_args(argv)
    try:
        out = cmd_run(args) if args.command == "run" else cmd_verify(args)
    except (BackupError, KeyError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {_scrub(str(exc), os.environ.get('DATABASE_URL', ''), args.restore_admin_url if hasattr(args, 'restore_admin_url') else '')}", file=sys.stderr)
        return 1
    text = json.dumps(out, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(text + "\n")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
