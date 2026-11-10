#!/usr/bin/env python3
"""Restore the captured schema dump only into a named loopback test database."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    from scripts.sql_migration_runner import MigrationRunner, RunnerError, _parse_database_url
    from scripts.verify_schema_baseline import verify_baseline
except ModuleNotFoundError:
    from sql_migration_runner import MigrationRunner, RunnerError, _parse_database_url
    from verify_schema_baseline import verify_baseline


def validate_isolated_target(database_url: str) -> dict[str, object]:
    host, port, database, username, password, query = _parse_database_url(database_url)
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise RunnerError("Isolated restore accepts loopback database hosts only")
    if not re.fullmatch(r"vista_baseline_test_[a-z0-9_]{1,48}", database):
        raise RunnerError("Isolated restore database must be named vista_baseline_test_<suffix>")
    return {"host": host, "port": port, "database": database, "username": username, "password": password, "query": query}


def _acl_roles(sql: str) -> list[str]:
    roles: set[str] = set()
    patterns = (
        re.compile(r"(?im)^\s*(?:ALTER\s+DEFAULT\s+PRIVILEGES\b.*?)?\bGRANT\b.*?\bTO\s+(.+?);\s*$"),
        re.compile(r"(?im)^\s*REVOKE\b.*?\bFROM\s+(.+?);\s*$"),
        re.compile(r"(?im)^\s*ALTER\s+DEFAULT\s+PRIVILEGES\b.*?\bFOR\s+ROLE\s+(.+?)\s+IN\s+SCHEMA\b"),
    )
    for pattern in patterns:
        for match in pattern.finditer(sql):
            tail = re.split(r"\b(?:WITH\s+GRANT\s+OPTION|GRANTED\s+BY|CASCADE|RESTRICT)\b", match.group(1), maxsplit=1, flags=re.I)[0]
            for item in tail.split(","):
                token = item.strip()
                quoted = re.fullmatch(r'"((?:[^"]|"")+)"', token)
                if quoted:
                    name = quoted.group(1).replace('""', '"')
                elif re.fullmatch(r"[A-Za-z_][A-Za-z_0-9$]*", token):
                    name = token
                else:
                    continue
                if name.upper() != "PUBLIC":
                    roles.add(name)
    return sorted(roles)


def _inventory_sql() -> str:
    return """SELECT json_build_object(
  'database_name', current_database(),
  'server_version', current_setting('server_version'),
  'relations', (SELECT COALESCE(json_agg(json_build_object('name', c.relname,
    'kind', c.relkind, 'owner', pg_get_userbyid(c.relowner), 'acl', c.relacl,
    'row_security', c.relrowsecurity, 'force_row_security', c.relforcerowsecurity)
    ORDER BY c.relkind,c.relname), '[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f')),
  'types', (SELECT COALESCE(json_agg(json_build_object('name', t.typname,
    'kind', t.typtype, 'definition', format_type(t.oid,NULL), 'not_null', t.typnotnull,
    'default', t.typdefault, 'acl', t.typacl,
    'enum_labels', (SELECT COALESCE(json_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::json)
      FROM pg_enum e WHERE e.enumtypid=t.oid)) ORDER BY t.typname), '[]'::json)
    FROM pg_type t WHERE t.typnamespace='public'::regnamespace AND t.typrelid=0
      AND t.typelem=0 AND t.typtype<>'p'),
  'tables', (SELECT COALESCE(json_agg(json_build_object('name', c.relname, 'columns', (
    SELECT COALESCE(json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid,a.atttypmod),
      'nullable', NOT a.attnotnull, 'default', pg_get_expr(d.adbin,d.adrelid),
      'identity', a.attidentity, 'generated', a.attgenerated) ORDER BY a.attnum), '[]'::json)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.relname), '[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'constraints', (SELECT COALESCE(json_agg(json_build_object('table', conrelid::regclass::text, 'name', conname,
    'type', contype, 'definition', pg_get_constraintdef(oid,true)) ORDER BY conrelid::regclass::text, conname), '[]'::json)
    FROM pg_constraint WHERE connamespace='public'::regnamespace),
  'indexes', (SELECT COALESCE(json_agg(json_build_object('table', tablename, 'name', indexname, 'definition', indexdef) ORDER BY tablename,indexname), '[]'::json)
    FROM pg_indexes WHERE schemaname='public'),
  'sequences', (SELECT COALESCE(json_agg(json_build_object('name', c.relname, 'type', format_type(s.seqtypid,NULL),
    'start', s.seqstart, 'increment', s.seqincrement, 'minimum', s.seqmin, 'maximum', s.seqmax,
    'cache', s.seqcache, 'cycle', s.seqcycle) ORDER BY c.relname), '[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE n.nspname='public' AND c.relkind='S'),
  'functions', (SELECT COALESCE(json_agg(json_build_object('signature', p.oid::regprocedure::text,
    'definition', pg_get_functiondef(p.oid), 'security_definer', p.prosecdef, 'settings', p.proconfig, 'acl', p.proacl) ORDER BY p.oid::regprocedure::text), '[]'::json)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
  'triggers', (SELECT COALESCE(json_agg(json_build_object('table', c.relname, 'name', t.tgname,
    'definition', pg_get_triggerdef(t.oid,true)) ORDER BY c.relname,t.tgname), '[]'::json)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
  'rls', (SELECT COALESCE(json_agg(json_build_object('table', c.relname, 'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity) ORDER BY c.relname), '[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'policies', (SELECT COALESCE(json_agg(json_build_object('table', tablename, 'name', policyname,
    'permissive', permissive, 'roles', roles, 'command', cmd, 'using', qual, 'check', with_check) ORDER BY tablename,policyname), '[]'::json)
    FROM pg_policies WHERE schemaname='public'),
  'relation_acls', (SELECT COALESCE(json_agg(json_build_object('name', c.relname, 'kind', c.relkind, 'acl', c.relacl) ORDER BY c.relkind,c.relname), '[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relacl IS NOT NULL),
  'schema_acl', (SELECT json_build_object('name', n.nspname, 'acl', n.nspacl) FROM pg_namespace n WHERE n.nspname='public'),
  'default_privileges', (SELECT COALESCE(json_agg(json_build_object('grantor', defaclrole::regrole::text,
    'schema', NULLIF(defaclnamespace,0)::regnamespace::text, 'type', defaclobjtype, 'acl', defaclacl) ORDER BY defaclrole,defaclnamespace,defaclobjtype), '[]'::json)
    FROM pg_default_acl),
  'extensions', (SELECT COALESCE(json_agg(json_build_object('name', extname, 'version', extversion) ORDER BY extname), '[]'::json) FROM pg_extension),
  'public_extension_dependencies', (
    SELECT COALESCE(json_agg(json_build_object('extension', dependency.extension_name,
      'object_type', dependency.object_type, 'object_identity', dependency.object_identity)
      ORDER BY dependency.extension_name, dependency.object_type, dependency.object_identity), '[]'::json)
    FROM (
      SELECT DISTINCT e.extname AS extension_name, identified.type AS object_type,
        identified.identity AS object_identity
      FROM pg_depend dependency
      JOIN pg_depend membership
        ON membership.classid = dependency.refclassid
       AND membership.objid = dependency.refobjid
       AND membership.objsubid = dependency.refobjsubid
       AND membership.refclassid = 'pg_extension'::regclass
       AND membership.deptype = 'e'
      JOIN pg_extension e ON e.oid = membership.refobjid
      CROSS JOIN LATERAL pg_identify_object(
        dependency.classid, dependency.objid, dependency.objsubid
      ) identified
      WHERE identified.schema = 'public'
        AND dependency.deptype <> 'i'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_depend own_membership
          WHERE own_membership.classid = dependency.classid
            AND own_membership.objid = dependency.objid
            AND own_membership.objsubid = dependency.objsubid
            AND own_membership.refclassid = 'pg_extension'::regclass
            AND own_membership.deptype = 'e'
        )
    ) dependency
  ),
  'counts', json_build_object(
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
    'types', (SELECT count(*) FROM pg_type t WHERE t.typnamespace='public'::regnamespace
      AND t.typrelid=0 AND t.typelem=0 AND t.typtype<>'p'),
    'views', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'),
    'materialized_views', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='m'),
    'foreign_tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='f'),
    'columns', (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped),
    'constraints', (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
    'indexes', (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
    'sequences', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'),
    'functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
    'triggers', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
    'rls_enabled', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity),
    'rls_forced', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relforcerowsecurity),
    'policies', (SELECT count(*) FROM pg_policies WHERE schemaname='public')
  ),
  'prisma_ledger_rows', (SELECT count(*) FROM public._prisma_migrations),
  'sql_ledger_rows', (SELECT count(*) FROM public.vista_schema_migrations)
)::text;
"""


def restore_and_inventory(
    baseline: Path,
    database_url: str,
    expected_sha256: str,
    expected_size: int,
    inventory_out: Path,
    *,
    confirmed: bool,
    psql_binary: str = "psql",
) -> dict:
    target = validate_isolated_target(database_url)
    if not confirmed:
        raise RunnerError("Pass --confirm-isolated-restore to restore into the isolated test database")
    evidence = verify_baseline(baseline, expected_sha256=expected_sha256, expected_size=expected_size)
    if evidence["errors"]:
        raise RunnerError("Baseline integrity validation failed; restore was not attempted")
    repo_root = Path(__file__).resolve().parents[1]
    inventory_path = inventory_out.resolve()
    if inventory_path == repo_root or repo_root in inventory_path.parents:
        raise RunnerError("Catalog inventory output must be outside the repository")
    sql = baseline.read_text(encoding="utf-8")
    helper = MigrationRunner(repo_root, repo_root / "database/migrations/manifest.json", env={**os.environ, "DATABASE_URL": database_url}, psql_binary=psql_binary)
    connection = _parse_database_url(database_url)
    preflight_sql = """SELECT json_build_object(
  'database_name', current_database(),
  'server_version_num', current_setting('server_version_num')::integer,
  'public_objects', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
  'public_functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
  'public_types', (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
)::text;
"""
    state = helper._one_json(helper._psql(connection, preflight_sql), "isolated target preflight")
    if state.get("database_name") != target["database"]:
        raise RunnerError("Connected database name differs from the isolated target")
    major = int(state.get("server_version_num", 0)) // 10000
    if major != 17:
        raise RunnerError(f"Isolated restore requires PostgreSQL 17; target major is {major}")
    if any(int(state.get(key, -1)) != 0 for key in ("public_objects", "public_functions", "public_types")):
        raise RunnerError("Target public schema is not empty; restore refused")

    roles = _acl_roles(sql)
    role_sql = "SELECT COALESCE(json_agg(rolname ORDER BY rolname), '[]'::json)::text FROM pg_roles WHERE rolname IN (" + ",".join(MigrationRunner._literal(role) for role in roles) + ");\n" if roles else "SELECT '[]'::json::text;\n"
    existing_roles_output = helper._psql(connection, role_sql)
    try:
        existing_roles = set(json.loads(existing_roles_output.splitlines()[-1])) if existing_roles_output else set()
    except (json.JSONDecodeError, IndexError, TypeError):
        raise RunnerError("Could not inspect local ACL role prerequisites") from None
    missing_roles = sorted(set(roles) - existing_roles)
    if missing_roles:
        role_setup = "\n".join("CREATE ROLE " + '"' + role.replace('"', '""') + '" NOLOGIN;' for role in missing_roles) + "\n"
        helper._psql(connection, role_setup, single_transaction=True)

    helper._psql(connection, "DROP SCHEMA public;\n" + sql, single_transaction=True)
    output = helper._psql(connection, _inventory_sql())
    try:
        inventory = json.loads(output.splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        raise RunnerError("Restored catalog inventory did not return valid JSON") from None
    inventory["baseline_sha256"] = evidence["sha256"]
    inventory["baseline_size"] = evidence["size"]
    dump_counts = evidence.get("counts", {})
    comparable = ("tables", "types", "views", "materialized_views", "foreign_tables", "columns", "constraints", "indexes", "sequences", "functions", "triggers", "rls_enabled", "rls_forced", "policies")
    inventory["dump_count_comparison"] = {
        key: {"dump": dump_counts.get(key), "restored": inventory.get("counts", {}).get(key),
              "match": dump_counts.get(key) == inventory.get("counts", {}).get(key)}
        for key in comparable
    }
    inventory["dump_counts_match"] = all(item["match"] for item in inventory["dump_count_comparison"].values())
    inventory_path.parent.mkdir(parents=True, exist_ok=True)
    inventory_path.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(inventory_path, 0o600)
    if not inventory["dump_counts_match"]:
        raise RunnerError("Restored catalog object counts differ from dump counts; inventory was saved for review")
    return inventory


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--expected-size", required=True, type=int)
    parser.add_argument("--inventory-out", required=True, type=Path)
    parser.add_argument("--confirm-isolated-restore", action="store_true")
    parser.add_argument("--psql-binary", default="psql", help=argparse.SUPPRESS)
    args = parser.parse_args()
    database_url = os.environ.get("VISTA_BASELINE_TEST_DATABASE_URL", "")
    if not database_url:
        print("ERROR: VISTA_BASELINE_TEST_DATABASE_URL is required", file=sys.stderr)
        return 1
    try:
        result = restore_and_inventory(
            args.baseline, database_url, args.expected_sha256, args.expected_size,
            args.inventory_out, confirmed=args.confirm_isolated_restore,
            psql_binary=args.psql_binary,
        )
    except (RunnerError, OSError, UnicodeDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    summary = {
        "database_name": result.get("database_name"),
        "server_version": result.get("server_version"),
        "baseline_sha256": result.get("baseline_sha256"),
        "baseline_size": result.get("baseline_size"),
        "dump_counts_match": result.get("dump_counts_match"),
        "counts": result.get("counts"),
        "migration_ledger_rows": {
            "_prisma_migrations": result.get("prisma_ledger_rows"),
            "vista_schema_migrations": result.get("sql_ledger_rows"),
        },
        "detailed_inventory": str(args.inventory_out.resolve()),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
