#!/usr/bin/env python3
"""Read-only Production catalog comparison against the isolated public baseline."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

try:
    from scripts.restore_schema_baseline_isolated import _inventory_sql
except ModuleNotFoundError:
    from restore_schema_baseline_isolated import _inventory_sql


PROJECT_REF = "ovijutkvaaxohauvuxbj"
EXPECTED_BASELINE_SHA256 = "5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962"
BASELINE_PATH = Path("/home/quangduc/vista-production-baseline/production-public-schema-20261109T172950Z.sql")
ISOLATED_INVENTORY_PATH = Path("/home/quangduc/vista-production-baseline/isolated-inventory.json")
OUTPUT_DIR = Path("/home/quangduc/vista-production-baseline")
ENV_PATH = Path(__file__).resolve().parents[1] / "services/education-api/.env"

# These differ by design between the schema-only isolated restore and Production.
NON_PARITY_FIELDS = {
    "database_name", "server_version", "prisma_ledger_rows", "sql_ledger_rows",
    "public_extension_dependencies",
}
BASELINE_EVIDENCE_FIELDS = {
    "baseline_sha256", "baseline_size", "dump_count_comparison", "dump_counts_match",
}
SUPABASE_MANAGED_SCHEMAS = {
    "auth", "extensions", "graphql", "graphql_public", "realtime", "storage",
}
RECOGNIZED_DEFAULT_PRIVILEGE_GRANTORS = {"supabase_admin", "supabase_auth_admin", "postgres"}
QUERY_ENV = {
    "application_name": "PGAPPNAME",
    "fallback_application_name": "PGFALLBACKAPPNAME",
    "client_encoding": "PGCLIENTENCODING",
    "connect_timeout": "PGCONNECT_TIMEOUT",
    "gssencmode": "PGGSSENCMODE",
    "krbsrvname": "PGKRBSRVNAME",
    "options": "PGOPTIONS",
    "require_auth": "PGREQUIREAUTH",
    "sslcert": "PGSSLCERT",
    "sslcrl": "PGSSLCRL",
    "sslcrldir": "PGSSLCRLDIR",
    "sslkey": "PGSSLKEY",
    "ssl_max_protocol_version": "PGSSL_MAX_PROTOCOL_VERSION",
    "ssl_min_protocol_version": "PGSSL_MIN_PROTOCOL_VERSION",
    "sslmode": "PGSSLMODE",
    "sslrootcert": "PGSSLROOTCERT",
    "sslsni": "PGSSLSNI",
    "target_session_attrs": "PGTARGETSESSIONATTRS",
    "channel_binding": "PGCHANNELBINDING",
}


def _dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        item = line.strip()
        if not item or item.startswith("#") or "=" not in item:
            continue
        key, raw = item.split("=", 1)
        key = key.strip()
        raw = raw.strip()
        if raw.startswith(("'", '"')) and raw.endswith(raw[0]):
            raw = raw[1:-1]
        values[key] = raw
    return values


def _validated_connection(env: dict[str, str]) -> tuple[dict[str, str], str]:
    supabase_url = urlparse(env.get("SUPABASE_URL", "").strip().rstrip("/"))
    supabase_host = supabase_url.hostname
    if supabase_url.scheme != "https" or supabase_host != f"{PROJECT_REF}.supabase.co":
        raise ValueError("SUPABASE_URL does not identify the approved Production project")

    direct_url = env.get("DIRECT_URL", "").strip()
    parsed = urlparse(direct_url)
    if parsed.scheme not in {"postgres", "postgresql"} or parsed.hostname != f"db.{PROJECT_REF}.supabase.co":
        raise ValueError("DIRECT_URL host does not exactly match the approved Production project")
    if not parsed.username or parsed.password is None or not parsed.path.strip("/"):
        raise ValueError("DIRECT_URL is missing required connection fields")
    query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
    unsupported = sorted(set(query) - set(QUERY_ENV) - {"host", "hostaddr", "port", "dbname", "user", "password"})
    if unsupported:
        raise ValueError("DIRECT_URL contains unsupported libpq query parameters: " + ", ".join(unsupported))
    if query.get("host", [parsed.hostname])[-1] != parsed.hostname:
        raise ValueError("DIRECT_URL query host conflicts with its project-verified host")
    if query.get("hostaddr"):
        raise ValueError("DIRECT_URL hostaddr override is disallowed by the project identity check")

    username = unquote(parsed.username)
    password = unquote(parsed.password)
    database = unquote(parsed.path.lstrip("/"))
    port = str(parsed.port or 5432)
    if (query.get("user", [username])[-1] != username
            or query.get("dbname", [database])[-1] != database
            or query.get("port", [port])[-1] != port):
        raise ValueError("DIRECT_URL query user, database, or port conflicts with its authority/path")
    if query.get("password", [password])[-1] != password:
        raise ValueError("DIRECT_URL query password conflicts with its authority credentials")
    if any("\n" in value or "\r" in value for value in (username, password, database)):
        raise ValueError("DIRECT_URL contains a line break in a connection field")

    settings = {
        "host": parsed.hostname,
        "port": port,
        "dbname": database,
        "user": username,
        "password": password,
        "query_options": {key: values[-1] for key, values in query.items() if key in QUERY_ENV},
    }
    return settings, supabase_host


def _pgpass_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(":", "\\:").replace("\n", "\\n").replace("\r", "\\r")


def _child_environment(parent: dict[str, str], settings: dict[str, object], passfile: Path) -> dict[str, str]:
    # Ambient libpq settings can silently alter routing, credentials, SSL, or
    # session options. Start clean, then apply only DIRECT_URL-derived values.
    child = {key: value for key, value in parent.items() if not key.startswith("PG")}
    child["PGPASSFILE"] = str(passfile)
    options = dict(settings["query_options"])
    options.setdefault("connect_timeout", "10")
    options.setdefault("application_name", "vista_readonly_catalog_audit")
    for key, value in options.items():
        child[QUERY_ENV[key]] = value
    return child


def _psql_command(settings: dict[str, object]) -> list[str]:
    return [
        "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse",
        "-h", str(settings["host"]), "-p", str(settings["port"]), "-U", str(settings["user"]),
        "-d", str(settings["dbname"]),
    ]


def _safe_psql_diagnostic(stderr: str | bytes, settings: dict[str, object]) -> str:
    text = stderr.decode("utf-8", errors="replace") if isinstance(stderr, bytes) else stderr
    text = text.strip()
    for secret in (str(settings.get("password", "")), str(settings.get("user", ""))):
        if secret:
            text = text.replace(secret, "[REDACTED]")
    text = re.sub(r"(?i)postgres(?:ql)?://\S+", "[CONNECTION URI REDACTED]", text)
    text = re.sub(r"(?i)(password\s*[=:]\s*)\S+", r"\1[REDACTED]", text)
    text = re.sub(r"(?i)((?:token|secret|api[_-]?key)\s*[=:]\s*)\S+", r"\1[REDACTED]", text)
    safe_lines = [line for line in text.splitlines() if not re.match(r"(?i)^\s*(context|statement|detail):", line)]
    return "\n".join(safe_lines[:8])[:1600] or "psql did not provide a diagnostic message"


def _byte_count(value: str | bytes) -> int:
    return len(value) if isinstance(value, bytes) else len(value.encode("utf-8", errors="replace"))


def _line_count(value: str | bytes) -> int:
    return len(value.splitlines())


def _output_diagnostics(stdout: str | bytes, stderr: str | bytes, exit_code: int, error_type: str, position: str) -> str:
    return (
        f"psql_exit_code={exit_code} "
        f"stdout_bytes={_byte_count(stdout)} "
        f"stderr_bytes={_byte_count(stderr)} "
        f"output_lines={_line_count(stdout)} "
        f"json_error_type={error_type} json_error_position={position}"
    )


def _parse_catalog_output(stdout: str | bytes, stderr: str | bytes = "", exit_code: int = 0) -> dict[str, object]:
    raw_stdout = stdout
    if isinstance(stdout, bytes):
        try:
            stdout = stdout.decode("utf-8")
        except UnicodeDecodeError as exc:
            position = f"{exc.start} (byte offset)"
            detail = _output_diagnostics(raw_stdout, stderr, exit_code, type(exc).__name__, position)
            raise RuntimeError(f"Production catalog JSON output is not UTF-8 ({detail})") from None
    lines = stdout.splitlines()
    if not lines:
        detail = _output_diagnostics(raw_stdout, stderr, exit_code, "EmptyOutputError", "n/a")
        raise RuntimeError(f"Production catalog JSON output is empty ({detail})")
    if len(lines) != 1:
        detail = _output_diagnostics(raw_stdout, stderr, exit_code, "OutputLineCountError", "n/a")
        raise RuntimeError(f"Production catalog JSON output must contain exactly one line ({detail})")
    try:
        payload = json.loads(lines[0])
    except json.JSONDecodeError as exc:
        position = f"{exc.pos} (line={exc.lineno}, column={exc.colno})"
        detail = _output_diagnostics(raw_stdout, stderr, exit_code, type(exc).__name__, position)
        raise RuntimeError(f"Production catalog JSON parsing failed ({detail})") from None
    if not isinstance(payload, dict):
        detail = _output_diagnostics(raw_stdout, stderr, exit_code, "JSONShapeError", "n/a")
        raise RuntimeError(f"Production catalog JSON root must be an object ({detail})")
    if not isinstance(payload.get("preflight"), dict) or not isinstance(payload.get("inventory"), dict):
        detail = _output_diagnostics(raw_stdout, stderr, exit_code, "JSONShapeError", "n/a")
        raise RuntimeError(f"Production catalog JSON is missing the expected object fields ({detail})")
    return payload


def _write_private(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    os.chmod(path, 0o600)


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _extension_reference_audit(inventory: dict[str, object]) -> dict[str, int]:
    public_objects = json.dumps({
        key: inventory.get(key)
        for key in ("tables", "constraints", "indexes", "functions", "triggers", "types")
    }, ensure_ascii=False).lower()
    patterns = {
        "uuid-ossp": r"\b(?:uuid_generate_[a-z0-9_]+|uuid_nil|uuid_ns_(?:dns|url|oid|x500))\b",
        "pgcrypto": r"\b(?:crypt|digest|hmac|gen_random_bytes|gen_salt|pgp_[a-z0-9_]+|armor|dearmor|fips_mode)\s*\(",
        "pg_stat_statements": r"\bpg_stat_statements\b",
        "supabase_vault": r"\bvault\s*\.",
    }
    refs = {name: len(re.findall(pattern, public_objects)) for name, pattern in patterns.items()}
    refs["plpgsql"] = len(re.findall(r"(?i)\blanguage\s+plpgsql\b", public_objects))
    refs["dynamic_sql_functions"] = sum(
        bool(re.search(r"(?i)\bEXECUTE\b", str(function.get("definition", ""))))
        for function in inventory.get("functions", [])
        if isinstance(function, dict)
    )
    # gen_random_uuid is core in PostgreSQL 17 and deliberately isn't attributed to pgcrypto.
    return refs


def _acl_map_for_roles(schema_acl: dict[str, object], roles: set[str]) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for entry in schema_acl.get("acl", []) if isinstance(schema_acl, dict) else []:
        grantee, _, rights_and_grantor = str(entry).partition("=")
        rights, _, _ = rights_and_grantor.partition("/")
        if grantee in roles:
            result[grantee] = rights
    return result


def _environment_inventory(isolated: dict[str, object], production: dict[str, object]) -> dict[str, object]:
    isolated_extensions = {x.get("name") for x in isolated.get("extensions", []) if isinstance(x, dict)}
    production_extensions = [x for x in production.get("extensions", []) if isinstance(x, dict)]
    dependencies_value = production.get("public_extension_dependencies")
    dependencies = dependencies_value if isinstance(dependencies_value, list) else None
    dependency_extensions = {
        str(row.get("extension"))
        for row in (dependencies or [])
        if isinstance(row, dict) and row.get("extension")
    }
    extra_defaults = [
        row for row in production.get("default_privileges", [])
        if row not in isolated.get("default_privileges", [])
    ]
    grouped_defaults: dict[str, int] = {}
    grantors: set[str] = set()
    for row in extra_defaults:
        schema = str(row.get("schema"))
        grantor = str(row.get("grantor"))
        group = f"{schema}/{grantor}"
        grouped_defaults[group] = grouped_defaults.get(group, 0) + 1
        grantors.add(grantor)
    public_roles = {"anon", "authenticated", "service_role"}
    prod_acl = production.get("schema_acl") if isinstance(production.get("schema_acl"), dict) else {}
    iso_acl = isolated.get("schema_acl") if isinstance(isolated.get("schema_acl"), dict) else {}
    prod_schema_acl = prod_acl.get("acl", [])
    iso_schema_acl = iso_acl.get("acl", [])
    roles_seen = set(grantors)
    for row in extra_defaults:
        for item in row.get("acl", []) or []:
            grantee = str(item).partition("=")[0]
            if grantee:
                roles_seen.add(grantee)
    return {
        "project_ref": PROJECT_REF,
        "database_name": production.get("database_name"),
        "server_version": production.get("server_version"),
        "extensions": production_extensions,
        "public_extension_dependencies_verified": dependencies is not None,
        "public_extension_dependencies": dependencies,
        "extension_dependencies": {
            extension["name"]: {
                "version": extension.get("version"),
                "public_reference_count": _extension_reference_audit(production).get(extension["name"], 0),
                "present_in_isolated_restore": extension["name"] in isolated_extensions,
                "required_by_observed_public_definitions": (
                    extension["name"] in dependency_extensions
                    or _extension_reference_audit(production).get(extension["name"], 0) > 0
                ),
                "catalog_dependency_observed": extension["name"] in dependency_extensions,
                "catalog_dependency_status": (
                    "UNVERIFIED" if dependencies is None
                    else "REQUIRED_BY_PUBLIC_OBJECT" if extension["name"] in dependency_extensions
                    else "NOT_OBSERVED"
                ),
            }
            for extension in production_extensions
        },
        "extension_names_absent_from_isolated_restore": sorted(
            x.get("name") for x in production_extensions if x.get("name") not in isolated_extensions
        ),
        "public_extension_reference_audit": _extension_reference_audit(production),
        "additional_default_privileges_count": len(extra_defaults),
        "additional_default_privileges_grouped_by_schema_and_grantor": dict(sorted(grouped_defaults.items())),
        "additional_default_privileges_rows": extra_defaults,
        "roles_named_in_additional_default_privileges": sorted(roles_seen),
        "all_extra_default_privileges_are_in_known_supabase_schemas": all(
            row.get("schema") in SUPABASE_MANAGED_SCHEMAS for row in extra_defaults
        ),
        "all_extra_default_privilege_grantors_are_recognized_roles": grantors <= RECOGNIZED_DEFAULT_PRIVILEGE_GRANTORS,
        "public_schema_acl": {
            "production": prod_acl,
            "isolated_restore": iso_acl,
            "public_schema_owner_principals": {
                "production": [entry.split("=", 1)[0] for entry in prod_schema_acl if "=UC/" in entry],
                "isolated_restore": [entry.split("=", 1)[0] for entry in iso_schema_acl if "=UC/" in entry],
            },
            "app_role_usage_rights": {
                "production": _acl_map_for_roles(prod_acl, public_roles),
                "isolated_restore": _acl_map_for_roles(iso_acl, public_roles),
            },
            "production_grants_usage_to_public": any(entry.startswith("=U/") for entry in prod_schema_acl),
            "isolated_restore_grants_usage_to_public": any(entry.startswith("=U/") for entry in iso_schema_acl),
            "semantic_note": (
                "Production's explicit PUBLIC USAGE grant is broader than the isolated restore's grants. "
                "The VISTA API roles have equal explicit USAGE in both catalogs, but this does not make the raw/effective ACLs identical."
            ),
        },
        "classification_evidence_sources": [
            {
                "url": "https://supabase.com/docs/guides/database/postgres/roles",
                "supports": "supabase_admin is an internal Supabase administrative role; supabase_auth_admin is used by Auth and scoped to auth.",
            },
            {
                "url": "https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema-448af9",
                "supports": "Supabase documents public default privileges for postgres and supabase_admin and explains Supabase reserves internal role memberships.",
            },
            {
                "url": "https://supabase.com/docs/guides/database/extensions",
                "supports": "Supabase documents extensions as managed database features and states most are installed under extensions.",
            },
            {
                "url": "https://supabase.com/docs/guides/graphql",
                "supports": "Supabase GraphQL is provided by pg_graphql and schema visibility follows Postgres schema/role permissions.",
            },
            {
                "url": "https://supabase.com/docs/guides/realtime/concepts",
                "supports": "The realtime schema contains Realtime-managed tables and migration tracking.",
            },
            {
                "url": "https://supabase.com/docs/guides/storage/schema/design",
                "supports": "Storage metadata is held in the dedicated storage schema and is managed by Supabase Storage.",
            },
            {
                "url": "https://www.postgresql.org/docs/17/predefined-roles.html",
                "supports": "pg_database_owner is a predefined role that initially owns the public schema so the database owner governs its use.",
            },
            {
                "url": "https://www.postgresql.org/docs/17/functions-uuid.html",
                "supports": "gen_random_uuid is built into PostgreSQL 17; uuid-ossp is for additional UUID algorithms.",
            },
        ],
        "limitations": [
            "The catalog snapshot does not include extension installation schemas or pg_namespace ownership for non-public schemas.",
            "Role attributes and membership are not present in this catalog snapshot.",
            "Extension dependency review scans captured public catalog definitions. It cannot prove dependencies hidden behind dynamic SQL, external code, or indirect extension dependencies.",
            "Default privilege grantor names and schema names are visible, but role attributes and ownership of the managed schemas are not independently captured.",
        ],
    }


def _classify_differences(isolated: dict[str, object], production: dict[str, object]) -> tuple[list[dict[str, object]], list[str], dict[str, object]]:
    classifications: list[dict[str, object]] = []
    compared_fields = sorted((set(isolated) & set(production)) - NON_PARITY_FIELDS - BASELINE_EVIDENCE_FIELDS)
    missing_fields = sorted(set(isolated) - set(production) - NON_PARITY_FIELDS - BASELINE_EVIDENCE_FIELDS)
    env = _environment_inventory(isolated, production)
    managed_defaults = env["all_extra_default_privileges_are_in_known_supabase_schemas"] and env["all_extra_default_privilege_grantors_are_recognized_roles"]
    public_defaults_match = sorted(
        (row for row in isolated.get("default_privileges", []) if row.get("schema") == "public"), key=_canonical
    ) == sorted(
        (row for row in production.get("default_privileges", []) if row.get("schema") == "public"), key=_canonical
    )
    extension_refs = env["public_extension_reference_audit"]
    isolated_extensions = {x.get("name") for x in isolated.get("extensions", []) if isinstance(x, dict)}
    production_extensions = {x.get("name") for x in production.get("extensions", []) if isinstance(x, dict)}
    dependency_extensions = {
        str(row.get("extension"))
        for row in (env["public_extension_dependencies"] or [])
        if isinstance(row, dict)
    }
    referenced_extension_names = {
        name for name, count in extension_refs.items()
        if count > 0 and name != "dynamic_sql_functions"
    }
    required_extension_missing = any(
        name not in production_extensions or name not in isolated_extensions
        for name in (dependency_extensions | referenced_extension_names)
    )
    dynamic_sql_present = extension_refs.get("dynamic_sql_functions", 0) > 0
    app_usage_equal = env["public_schema_acl"]["app_role_usage_rights"].get("production") == env["public_schema_acl"]["app_role_usage_rights"].get("isolated_restore")
    acl_restore_shape = (
        "pg_database_owner" in env["public_schema_acl"]["public_schema_owner_principals"].get("production", [])
        and "postgres" in env["public_schema_acl"]["public_schema_owner_principals"].get("isolated_restore", [])
    )

    for field in compared_fields:
        left, right = isolated[field], production[field]
        if _canonical(left) == _canonical(right):
            classifications.append({"field": field, "status": "MATCH", "reason": "Catalog values are equal."})
        elif field == "default_privileges" and public_defaults_match and managed_defaults:
            classifications.append({
                "field": field,
                "status": "EXPECTED_ENVIRONMENT_DIFFERENCE",
                "reason": (
                    f"All {sum(row.get('schema') == 'public' for row in isolated.get('default_privileges', []))} "
                    "public-schema default privilege rows match; additional rows are confined to known Supabase-managed schemas "
                    "and observed platform grantors."
                ),
                "evidence": env["additional_default_privileges_grouped_by_schema_and_grantor"],
            })
        elif field == "default_privileges":
            classifications.append({"field": field, "status": "REAL_SCHEMA_DRIFT" if not public_defaults_match else "UNVERIFIED", "reason": "Public defaults differ or additional rows are outside the documented platform schema/grantor set."})
        elif field == "extensions" and not env["public_extension_dependencies_verified"]:
            classifications.append({
                "field": field,
                "status": "UNVERIFIED",
                "reason": "The saved Production inventory predates the direct pg_depend extension audit; rerun the read-only verifier to capture it.",
                "public_reference_counts": extension_refs,
            })
        elif field == "extensions" and required_extension_missing:
            classifications.append({
                "field": field,
                "status": "REAL_SCHEMA_DRIFT",
                "reason": "A captured public object references a known extension that is absent from either Production or the isolated baseline restore.",
                "public_reference_counts": extension_refs,
            })
        elif field == "extensions" and dynamic_sql_present:
            classifications.append({
                "field": field,
                "status": "UNVERIFIED",
                "reason": "At least one public function uses dynamic SQL, so text scanning cannot establish the absence of extension dependencies.",
                "public_reference_counts": extension_refs,
            })
        elif field == "extensions" and not dynamic_sql_present and all(
            extension_refs.get(name, 0) == 0 and name not in dependency_extensions
            for name in (production_extensions - isolated_extensions)
        ):
            classifications.append({
                "field": field,
                "status": "EXPECTED_ENVIRONMENT_DIFFERENCE",
                "reason": "Production has additional installed extensions, but neither pg_depend nor the public-definition audit found dependencies from VISTA public objects; gen_random_uuid is core in PostgreSQL 17.",
                "production_extensions": sorted(production_extensions),
                "public_reference_counts": extension_refs,
            })
        elif field == "extensions":
            classifications.append({"field": field, "status": "UNVERIFIED", "reason": "Extension dependencies could not be established from the captured catalog."})
        elif field == "schema_acl" and app_usage_equal and acl_restore_shape:
            classifications.append({
                "field": field,
                "status": "EXPECTED_ENVIRONMENT_DIFFERENCE",
                "reason": "The raw ACL differs: Production public is owned by pg_database_owner and grants USAGE to PUBLIC; the generic isolated restore creates it under postgres. VISTA app-role USAGE grants are equal. The dump records CREATE SCHEMA with no owner and explicit app-role USAGE grants, so this is an environment/bootstrap ACL difference rather than a table/function/schema-object mismatch.",
                "evidence": env["public_schema_acl"],
            })
        elif field in {"tables", "constraints", "indexes", "functions", "triggers", "types", "policies", "rls", "sequences", "relations", "counts", "relation_acls"}:
            classifications.append({"field": field, "status": "REAL_SCHEMA_DRIFT", "reason": "A public schema object catalog differs from the verified baseline."})
        else:
            classifications.append({"field": field, "status": "UNVERIFIED", "reason": "A difference lacks an approved environment-specific interpretation."})

    for field in missing_fields:
        classifications.append({"field": field, "status": "UNVERIFIED", "reason": "A baseline catalog field is absent from Production output."})
    return classifications, missing_fields, env


def _run() -> int:
    if not BASELINE_PATH.is_file() or not ISOLATED_INVENTORY_PATH.is_file():
        raise ValueError("Baseline SQL or isolated inventory is missing at the configured persistent path")
    baseline_sha = hashlib.sha256(BASELINE_PATH.read_bytes()).hexdigest()
    if baseline_sha != EXPECTED_BASELINE_SHA256:
        raise ValueError("Baseline SHA-256 differs from the approved capture")
    isolated = json.loads(ISOLATED_INVENTORY_PATH.read_text(encoding="utf-8"))
    if isolated.get("baseline_sha256") != EXPECTED_BASELINE_SHA256 or isolated.get("dump_counts_match") is not True:
        raise ValueError("Isolated inventory is not bound to the verified baseline or its restored counts do not match")
    if isolated.get("baseline_size") != BASELINE_PATH.stat().st_size:
        raise ValueError("Isolated inventory baseline size differs from the local baseline file")

    env = _dotenv(ENV_PATH)
    settings, _ = _validated_connection(env)
    catalog_select = _inventory_sql().strip()
    if catalog_select.endswith(";"):
        catalog_select = catalog_select[:-1]
    if not catalog_select.startswith("SELECT "):
        raise ValueError("Catalog inventory SQL has an unexpected shape")
    sql = (
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        "SET LOCAL statement_timeout = '60s';\n"
        "SELECT json_build_object("
        "'preflight', json_build_object('database_name', current_database(), "
        "'server_version', current_setting('server_version'), "
        "'transaction_read_only', current_setting('transaction_read_only')), "
        "'inventory', (("
        + catalog_select
        + ")::json))::text;\n"
        + "ROLLBACK;\n"
    )
    with tempfile.TemporaryDirectory(prefix="vista-pg-audit-") as temp_dir:
        passfile = Path(temp_dir) / "pgpass"
        passline = ":".join(_pgpass_escape(str(settings[key])) for key in ("host", "port", "dbname", "user", "password")) + "\n"
        _write_private(passfile, passline)
        process_env = _child_environment(dict(os.environ), settings, passfile)
        completed = subprocess.run(
            _psql_command(settings),
            input=sql.encode("utf-8"), capture_output=True, env=process_env, timeout=90, check=False,
        )
    if completed.returncode != 0:
        stage = "connection" if completed.returncode == 2 else "read-only catalog SQL"
        diagnostic = _safe_psql_diagnostic(completed.stderr, settings)
        metrics = _output_diagnostics(completed.stdout, completed.stderr, completed.returncode, "n/a", "n/a")
        raise RuntimeError(f"Production {stage} failed ({metrics}):\n{diagnostic}")
    output = _parse_catalog_output(completed.stdout, completed.stderr, completed.returncode)
    preflight, production = output["preflight"], output["inventory"]
    if preflight.get("database_name") != "postgres" or not str(preflight.get("server_version", "")).startswith("17.6"):
        raise RuntimeError("Connected database identity/version does not match the confirmed Production database")
    if preflight.get("transaction_read_only") != "on":
        raise RuntimeError("Production session did not report transaction_read_only=on; no inventory was accepted")

    classifications, missing_fields, environment = _classify_differences(isolated, production)
    compared_fields = sorted(
        (set(isolated) & set(production)) - NON_PARITY_FIELDS - BASELINE_EVIDENCE_FIELDS
    )
    classification_by_field = {item["field"]: item for item in classifications}
    differences = []
    for field in compared_fields:
        left, right = isolated[field], production[field]
        if _canonical(left) != _canonical(right):
            differences.append({
                "field": field,
                "status": classification_by_field.get(field, {}).get("status", "UNVERIFIED"),
                "isolated_count": len(left) if isinstance(left, list) else None,
                "production_count": len(right) if isinstance(right, list) else None,
            })
    statuses = {item["status"] for item in classifications}
    if "REAL_SCHEMA_DRIFT" in statuses:
        overall_status = "REAL_SCHEMA_DRIFT"
    elif "UNVERIFIED" in statuses:
        overall_status = "UNVERIFIED"
    elif "EXPECTED_ENVIRONMENT_DIFFERENCE" in statuses:
        overall_status = "EXPECTED_ENVIRONMENT_DIFFERENCE"
    else:
        overall_status = "MATCH"
    report = {
        "project_ref": PROJECT_REF,
        "project_identity_verified_from_local_config": True,
        "baseline_sha256": baseline_sha,
        "isolated_inventory_path": str(ISOLATED_INVENTORY_PATH),
        "environment_inventory_path": str(OUTPUT_DIR / "supabase-environment-inventory.json"),
        "production_database_name": production.get("database_name"),
        "production_server_version": production.get("server_version"),
        "compared_fields": compared_fields,
        "catalog_classifications": classifications,
        "differences": differences,
        "missing_production_fields": missing_fields,
        "baseline_evidence_fields_excluded_from_catalog_comparison": sorted(
            set(isolated) & BASELINE_EVIDENCE_FIELDS
        ),
        "classification_counts": {
            status: sum(item["status"] == status for item in classifications)
            for status in ("MATCH", "EXPECTED_ENVIRONMENT_DIFFERENCE", "REAL_SCHEMA_DRIFT", "UNVERIFIED")
        },
        "environment_difference_summary": {
            "additional_default_privileges_count": environment["additional_default_privileges_count"],
            "additional_default_privileges_grouped_by_schema_and_grantor":
                environment["additional_default_privileges_grouped_by_schema_and_grantor"],
            "extensions": environment["extension_dependencies"],
            "public_schema_acl": environment["public_schema_acl"],
        },
        "migration_ledger_rows": {
            "_prisma_migrations": production.get("prisma_ledger_rows"),
            "vista_schema_migrations": production.get("sql_ledger_rows"),
        },
        "parity": overall_status,
        "note": (
            "Database/server metadata and migration ledger counts are reported separately. "
            "Baseline integrity evidence is not a Production catalog field and is excluded from missing-field checks."
        ),
    }
    _write_private(
        OUTPUT_DIR / "supabase-environment-inventory.json",
        json.dumps(environment, indent=2, sort_keys=True) + "\n",
    )
    _write_private(OUTPUT_DIR / "production-catalog-inventory.json", json.dumps(production, indent=2, sort_keys=True) + "\n")
    _write_private(OUTPUT_DIR / "production-catalog-parity-report.json", json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if overall_status in {"MATCH", "EXPECTED_ENVIRONMENT_DIFFERENCE"} else 2


if __name__ == "__main__":
    try:
        raise SystemExit(_run())
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
