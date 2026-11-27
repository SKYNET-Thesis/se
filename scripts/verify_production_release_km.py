#!/usr/bin/env python3
"""Read-only pre/post-flight checks for the K-L scope (authoring capabilities, restricted runtime role) and the later, separately released M scope
(PUBLIC TEMP revocation). Scope K-L is verified with `deferred TEMP` semantics: M must be absent and PUBLIC TEMP unchanged (a tracked residual risk).

Modes (every query runs inside `BEGIN READ ONLY`; nothing is ever written): --snapshot FILE (before), --verify FILE (after).
The connection comes from DATABASE_URL (never printed). The scope is additive: it must not change any existing row or table.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

try:
    from scripts import verify_production_release_d_i as base
except ModuleNotFoundError:  # executed as a script from the repository root
    import verify_production_release_d_i as base  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_ROLE = "vista_app_runtime"
# Representative route probes; the full table and sequence privilege matrix is parsed from migration L below.
RUNTIME_WRITABLE = ["learning_submission_files", "learning_submissions", "learning_assignment_attempts", "learning_courses", "learning_questions"]
RUNTIME_SELECT_ONLY = ["permissions", "roles", "role_permissions"]
RUNTIME_DENIED = ["vista_schema_migrations", "api_keys"]
M_VERSION = "20261116_m_revoke_public_temp_privilege"
L_VERSION_FILE = "database/migrations/20261116_l_runtime_role.sql"
PLATFORM_ROLES = ["postgres", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin", "authenticator", "anon", "authenticated", "service_role"]
TABLE_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")
SEQUENCE_PRIVILEGES = ("USAGE", "SELECT", "UPDATE")

K_CODES = "('learning.course.author','learning.course.publish')"
# Row digests that K-M must leave untouched. The RBAC tables are digested WITHOUT K's own two permissions and their grants:
# those are the only rows K is allowed to add, and they are asserted separately.
INVENTORY_SOURCES = {
    "learning_courses": "public.learning_courses", "learning_questions": "public.learning_questions", "learning_assessments": "public.learning_assessments",
    "learning_submissions": "public.learning_submissions", "memberships": "public.memberships", "roles": "public.roles",
    "permissions": f"(SELECT * FROM public.permissions WHERE code NOT IN {K_CODES})",
    "role_permissions": f"(SELECT * FROM public.role_permissions WHERE permission_id NOT IN (SELECT id FROM public.permissions WHERE code IN {K_CODES}))",
}


def inventory(url: str) -> dict:
    parts = ",".join(f"'{name}',(SELECT md5(COALESCE(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text),'')) FROM {source} x)" for name, source in INVENTORY_SOURCES.items())
    return base.query(url, f"SELECT json_build_object({parts})::text")


def preview(url: str) -> dict:
    return base.query(url, """SELECT json_build_object(
      'permissions',(SELECT count(*) FROM public.permissions),
      'runtime_role_exists',EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vista_app_runtime'),
      'public_has_temp',has_database_privilege('public',current_database(),'TEMP'))::text""")


def snapshot(url: str) -> dict:
    ledger = base.query(url, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    inv = inventory(url)
    return {"ledger": ledger, "inventory": inv, "preview": preview(url)}


def runtime_allowlist(root: Path) -> set[str]:
    """The frozen table allowlist declared by migration L (parsed from its SQL, so the verifier cannot drift from the migration)."""
    sql = (root / L_VERSION_FILE).read_text()
    block = sql[sql.index("ARRAY["):sql.index("]::text[]")]
    return set(re.findall(r"'([a-z_0-9]+)'", block))


def runtime_sequence_allowlist(root: Path) -> set[str]:
    """Sequence privileges granted by L, parsed from its SQL to keep postflight aligned with the migration."""
    sql = (root / L_VERSION_FILE).read_text()
    return set(re.findall(r"(?im)^\s*GRANT\s+[^;]+\s+ON\s+SEQUENCE\s+public\.([a-z_0-9]+)\s+TO\s+vista_app_runtime\s*;", sql))


# Later, separately released ADDITIVE migrations that add tables. They are NOT part of the frozen K-L/M policy, so a Production K-L/M
# verification still rejects their tables. Only the DISPOSABLE staged path (staged=True: migration M applied through
# apply_staged_migration_to_test_database.py, optionally followed by these) accepts them, and only with the EXACT grants their own SQL declares
# (parsed here, never hand-copied), RLS enabled and nothing for PUBLIC/anon/authenticated.
STAGED_EXTENSION_FILES = ["database/staged-migrations/20261120_r_device_provisioning.sql"]
# Additive tables created by LATER released scopes (not staged): once such a scope is applied its table legitimately holds runtime grants, so the K-L/K-M
# verifiers accept it (only when it exists, and only with the EXACT grants its own SQL declares). Scope S: classroom_lab_sessions.
RELEASED_EXTENSION_FILES = ["database/migrations/20261127_s_classroom_lab_sessions.sql"]


def staged_extension_privileges(root: Path, files: list[str] | None = None) -> dict[str, set[str]]:
    """{table: exact runtime privileges} declared by the staged additive migrations (single source of truth: their SQL)."""
    expected: dict[str, set[str]] = {}
    for name in (STAGED_EXTENSION_FILES if files is None else files):
        path = root / name
        if not path.exists():
            continue
        sql = path.read_text()
        for block in re.finditer(r"FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]\s+LOOP(.*?)END\s+LOOP", sql, re.S | re.I):
            grant = re.search(r"GRANT\s+([A-Z, ]+?)\s+ON\s+TABLE\s+public\.%I\s+TO\s+vista_app_runtime", block.group(2), re.I)
            if not grant:
                raise ValueError(f"{name}: a table loop without a runtime GRANT cannot be verified")
            privileges = {item.strip().upper() for item in grant.group(1).split(",") if item.strip()}
            for table in re.findall(r"'([a-z_0-9]+)'", block.group(1)):
                expected[table] = privileges
    return expected


def present_staged_extension(url: str, root: Path, staged: bool = True) -> dict[str, set[str]]:
    """The extension tables that exist in this database (an extension that was not applied is simply not expected). Released-scope extensions always
    count; staged ones only on the disposable staged path."""
    declared = {**(staged_extension_privileges(root) if staged else {}), **staged_extension_privileges(root, RELEASED_EXTENSION_FILES)}
    if not declared:
        return {}
    names = ",".join(f"'{name}'" for name in sorted(declared))
    found = base.query(url, f"SELECT COALESCE(json_agg(relname),'[]'::json)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ({names})")
    return {name: declared[name] for name in found}


def runtime_expected_table_privileges(root: Path, extension: dict[str, set[str]] | None = None) -> dict[str, set[str]]:
    """Exact table grants declared by L, including restrictive catalog/audit/token grants (plus the staged extension tables, when given)."""
    allow = runtime_allowlist(root)
    expected = {name: {"SELECT", "INSERT", "UPDATE", "DELETE"} for name in allow}
    for name in ("permissions", "roles", "role_permissions", "user_system_roles"):
        expected[name] = {"SELECT"}
    expected["audit_logs"] = {"INSERT"}
    expected["auth_tokens"] = {"SELECT", "INSERT", "UPDATE"}
    expected.update(extension or {})
    return expected


def runtime_grants_sql(root: Path, extension: dict[str, set[str]] | None = None) -> str:
    """Return a redacted aggregate ACL query for every public relation, sequence and function."""
    tables = runtime_expected_table_privileges(root, extension)
    seq_allow = sorted(runtime_sequence_allowlist(root))
    table_values = ",".join(
        f"('{name}',ARRAY[{','.join(repr(p) for p in sorted(privs))}]::text[])"
        for name, privs in sorted(tables.items())
    )
    table_privs = ",".join(repr(p) for p in TABLE_PRIVILEGES)
    seq_values = ",".join(repr(n) for n in seq_allow)
    seq_privs = ",".join(repr(p) for p in SEQUENCE_PRIVILEGES)
    return f"""WITH expected_tables(name, privileges) AS (VALUES {table_values})
    SELECT json_build_object(
      'table_missing_or_extra_privileges',(SELECT count(*) FROM (
        SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN expected_tables e ON e.name=c.relname
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND (
          (e.name IS NULL AND has_table_privilege('{RUNTIME_ROLE}',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) OR
          (e.name IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(ARRAY[{table_privs}]::text[]) p
            WHERE has_table_privilege('{RUNTIME_ROLE}',c.oid,p) IS DISTINCT FROM (p = ANY(e.privileges))))
        )
        UNION ALL
        SELECT NULL::oid FROM expected_tables e WHERE NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=e.name AND c.relkind IN ('r','p','v','m','f')
        )
      ) table_differences),
      'sequence_missing_or_extra_privileges',(SELECT count(*) FROM (
        SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='S' AND (
          (c.relname = ANY(ARRAY[{seq_values}]::text[]) AND EXISTS (
            SELECT 1 FROM unnest(ARRAY[{seq_privs}]::text[]) p
            WHERE has_sequence_privilege('{RUNTIME_ROLE}',c.oid,p) IS DISTINCT FROM (p = ANY(ARRAY['USAGE','SELECT']::text[]))
          )) OR
          (c.relname <> ALL(ARRAY[{seq_values}]::text[]) AND has_sequence_privilege('{RUNTIME_ROLE}',c.oid,'USAGE,SELECT,UPDATE'))
        )
        UNION ALL
        SELECT NULL::oid WHERE NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='S' AND c.relname=ANY(ARRAY[{seq_values}]::text[])
        )
      ) sequence_differences),
      'function_grants_outside_allowlist',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE n.nspname='public' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND a.privilege_type='EXECUTE'),
      'runtime_role_owns_objects',(SELECT count(*) FROM pg_shdepend sd WHERE sd.refobjid=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND sd.deptype='o'),
      'unexpected_role_memberships',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='{RUNTIME_ROLE}'),
      'runtime_role_inherit',COALESCE((SELECT rolinherit FROM pg_roles WHERE rolname='{RUNTIME_ROLE}'),true),
      'runtime_role_login',COALESCE((SELECT rolcanlogin FROM pg_roles WHERE rolname='{RUNTIME_ROLE}'),false))::text"""


def sequence_allowlist(root: Path) -> set[str]:
    """Sequences migration L grants to the runtime role (parsed from its SQL)."""
    return set(re.findall(r"ON SEQUENCE public\.([a-z_0-9]+)", (root / L_VERSION_FILE).read_text()))


SENSITIVE_SCHEMAS = ("auth", "storage", "vault", "pgbouncer", "realtime", "graphql", "graphql_public", "supabase_functions", "_realtime", "pgsodium", "pgsodium_masks")


def verify(url: str, pre: dict, root: Path | None = None, scope_name: str = "M", staged: bool = False) -> list[tuple[str, bool, str]]:
    """`staged=True` is for a DISPOSABLE database that received migration M through scripts/apply_staged_migration_to_test_database.py (never a release):
    that path writes no ledger row, so the ledger checks assert exactly that instead of expecting M."""
    root = Path(root) if root else ROOT
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())
    scope = json.loads((root / "database/release-scopes.json").read_text())["scopes"][scope_name]
    deferred_temp = M_VERSION not in scope["versions"] and M_VERSION not in scope["requiresApplied"]  # K-L: M is staged, not part of this release
    pinned = {e["version"]: e["sha256"] for e in manifest["migrations"]}
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))

    ledger = base.query(url, "SELECT COALESCE(json_agg(json_build_object('v',version,'sum',checksum,'prov',provenance) ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    by_version = {r["v"]: r for r in ledger}
    for version in ([] if staged else scope["versions"]):
        r = by_version.get(version)
        check(f"ledger {version}", bool(r) and r["sum"] == pinned.get(version) == scope["sha256"][version] and r["prov"] == "executed")
    for version in scope["requiresApplied"]:
        r = by_version.get(version)
        check(f"ledger keeps {version}", bool(r) and r["sum"] == pinned.get(version))
    if staged:
        check("staged application wrote no ledger row (M is not recorded as released)", set(pre["ledger"]) == set(by_version) and M_VERSION not in by_version)
    else:
        check(f"ledger gained exactly the {scope_name} versions", set(pre["ledger"]) | set(scope["versions"]) == set(by_version))
    if deferred_temp:
        check("staged migration M is NOT applied (not in the ledger)", M_VERSION not in by_version)

    role_codes = base.query(url, "SELECT COALESCE(json_agg(code ORDER BY code),'[]'::json)::text FROM public.roles WHERE code = ANY(ARRAY['instructor','school_admin','student'])")
    check("required canonical roles are present", role_codes == ["instructor", "school_admin", "student"], f"found {role_codes}")

    caps = base.query(url, """SELECT json_build_object(
      'author',EXISTS(SELECT 1 FROM public.permissions WHERE code='learning.course.author'),
      'publish',EXISTS(SELECT 1 FROM public.permissions WHERE code='learning.course.publish'),
      'instructor_author',(SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE r.code='instructor' AND p.code='learning.course.author'),
      'school_admin_author',(SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE r.code='school_admin' AND p.code='learning.course.author'),
      'instructor_publish',(SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE r.code='instructor' AND p.code='learning.course.publish'),
      'school_admin_publish',(SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE r.code='school_admin' AND p.code='learning.course.publish'),
      'student_author',(SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE r.code='student' AND p.code IN ('learning.course.author','learning.course.publish')))::text""")
    check("author permission exists and is granted to Instructor and School Admin", caps["author"] and caps["instructor_author"] == 1 and caps["school_admin_author"] == 1)
    check("publish permission exists and is granted only to Instructor", caps["publish"] and caps["instructor_publish"] == 1)
    check("School Admin never holds learning.course.publish", caps["school_admin_publish"] == 0)
    check("students hold no authoring or publishing permission", caps["student_author"] == 0)

    role = base.query(url, f"""SELECT json_build_object(
      'exists',EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{RUNTIME_ROLE}'),
      'unsafe',EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{RUNTIME_ROLE}' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)),
      'connect',has_database_privilege('{RUNTIME_ROLE}',current_database(),'CONNECT'),
      'create',has_database_privilege('{RUNTIME_ROLE}',current_database(),'CREATE'),
      'temp',has_database_privilege('{RUNTIME_ROLE}',current_database(),'TEMP'),
      'public_temp',has_database_privilege('public',current_database(),'TEMP'),
      'owner_temp',has_database_privilege((SELECT r.rolname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database()),current_database(),'TEMP'),
      'schema_create',has_schema_privilege('{RUNTIME_ROLE}','public','CREATE'))::text""")
    check("runtime role exists with no superuser/createdb/createrole/replication/bypassrls/inherit", role["exists"] and not role["unsafe"])
    if deferred_temp:
        check("runtime role can connect and cannot create in the database or in public", role["connect"] and not role["create"] and not role["schema_create"])
        check("PUBLIC TEMP unchanged from the pre-release state (M deferred; residual risk tracked)", role["public_temp"] == pre["preview"]["public_has_temp"],
              f"public_temp={role['public_temp']} before={pre['preview']['public_has_temp']}; the runtime role can still create session-local temporary tables until M is released")
        check("database owner retains TEMP", role["owner_temp"])
    else:
        check("runtime role can connect, cannot create or use temporary tables, cannot create in public", role["connect"] and not role["create"] and not role["temp"] and not role["schema_create"])
        check("TEMP is no longer inherited from PUBLIC", not role["public_temp"])
        check("database owner retains TEMP", role["owner_temp"])
    platform = base.query(url, "SELECT COALESCE(json_object_agg(rolname, json_build_object('exists',true,'temp',has_database_privilege(rolname,current_database(),'TEMP'))),'{}'::json)::text FROM pg_roles WHERE rolname = ANY(ARRAY[%s])" % ",".join(f"'{r}'" for r in PLATFORM_ROLES))
    check("available Supabase/platform roles retain TEMP", all(info.get("temp") for info in platform.values()))
    least = base.query(url, f"""SELECT json_build_object(
      'member_of',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='{RUNTIME_ROLE}'),
      'owns',(SELECT count(*) FROM pg_shdepend sd WHERE sd.refobjid=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND sd.deptype='o'),
      'explicit_outside_public',(SELECT count(*) FROM (
          SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND n.nspname<>'public'
          UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(c.relacl) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND n.nspname<>'public'
          UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND n.nspname<>'public') x),
      'public_tables_outside_allowlist',(SELECT COALESCE(json_agg(c.relname ORDER BY c.relname),'[]'::json) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege('{RUNTIME_ROLE}',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
      'audit_select',COALESCE(has_table_privilege('{RUNTIME_ROLE}','public.audit_logs','SELECT'),false),
      'audit_insert',COALESCE(has_table_privilege('{RUNTIME_ROLE}','public.audit_logs','INSERT'),false))::text""")
    extension = present_staged_extension(url, root, staged)
    allow = runtime_allowlist(root) | set(extension)
    outside = sorted(set(least["public_tables_outside_allowlist"]) - allow)
    check("runtime role is not a member of any role and owns nothing", least["member_of"] == 0 and least["owns"] == 0)
    check("runtime role holds no explicit privilege outside schema public (platform schemas untouched)", least["explicit_outside_public"] == 0, f"{least['explicit_outside_public']} found")
    check("runtime role has privileges only on the frozen table allowlist", not outside, ", ".join(outside[:5]))
    grants = base.query(url, runtime_grants_sql(root, extension))
    if extension:
        closed = base.query(url, "SELECT COALESCE(json_agg(c.relname),'[]'::json)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (%s) AND (NOT c.relrowsecurity OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee=0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))))" % ",".join(f"'{name}'" for name in sorted(extension)))
        check("staged additive tables have RLS enabled and no PUBLIC/anon/authenticated privilege", closed == [], ", ".join(closed))
    check("complete table allowlist has exactly the required privileges", grants["table_missing_or_extra_privileges"] == 0,
          f"{grants['table_missing_or_extra_privileges']} relation(s) differ")
    check("complete sequence allowlist has exactly the required privileges", grants["sequence_missing_or_extra_privileges"] == 0,
          f"{grants['sequence_missing_or_extra_privileges']} sequence(s) differ")
    check("runtime role has no function EXECUTE grants", grants["function_grants_outside_allowlist"] == 0,
          f"{grants['function_grants_outside_allowlist']} function(s) accessible")
    check("runtime role owns no database objects", grants["runtime_role_owns_objects"] == 0)
    check("runtime role has no role memberships", grants["unexpected_role_memberships"] == 0)
    check("runtime role is NOINHERIT and LOGIN", not grants["runtime_role_inherit"] and grants["runtime_role_login"])
    check("audit_logs is insert-only for the runtime role (no SELECT)", least["audit_insert"] and not least["audit_select"])
    effective = base.query(url, f"""SELECT json_build_object(
      'sequences',(SELECT COALESCE(json_agg(c.relname ORDER BY c.relname),'[]'::json) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('{RUNTIME_ROLE}',c.oid,'USAGE,SELECT,UPDATE') ELSE false END),
      'explicit_function_grants',(SELECT count(*) FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}')),
      'sensitive_schemas_usable',(SELECT COALESCE(json_agg(n.nspname ORDER BY n.nspname),'[]'::json) FROM pg_namespace n
          WHERE n.nspname = ANY(ARRAY[{",".join(repr(x) for x in SENSITIVE_SCHEMAS)}]) AND has_schema_privilege('{RUNTIME_ROLE}',n.nspname,'USAGE')),
      'database_create',has_database_privilege('{RUNTIME_ROLE}',current_database(),'CREATE'),
      'any_non_public_schema_create',EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname<>'public' AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege('{RUNTIME_ROLE}',n.nspname,'CREATE')))::text""")
    seq_allow = sequence_allowlist(root)
    check("runtime role can use exactly the allowlisted sequence(s) and no other sequence (effective privileges)", set(effective["sequences"]) == seq_allow, f"found {effective['sequences']}")
    check("runtime role holds no explicit EXECUTE (or other) privilege on any function", effective["explicit_function_grants"] == 0, f"{effective['explicit_function_grants']} found")
    check("runtime role cannot use platform/sensitive schemas that exist (auth, storage, vault, pgbouncer, realtime, ...)", not effective["sensitive_schemas_usable"], ", ".join(effective["sensitive_schemas_usable"]))
    check("runtime role cannot create in the database or in any non-public schema (effective privileges)", not effective["database_create"] and not effective["any_non_public_schema_create"])
    for table in RUNTIME_WRITABLE:
        ok = base.query(url, f"SELECT (has_table_privilege('{RUNTIME_ROLE}','public.{table}','SELECT') AND has_table_privilege('{RUNTIME_ROLE}','public.{table}','INSERT') AND has_table_privilege('{RUNTIME_ROLE}','public.{table}','UPDATE'))::text")
        check(f"runtime role can read and write {table}", ok in (True, "true"))
    for table in RUNTIME_SELECT_ONLY:
        ok = base.query(url, f"SELECT (has_table_privilege('{RUNTIME_ROLE}','public.{table}','SELECT') AND NOT has_table_privilege('{RUNTIME_ROLE}','public.{table}','INSERT'))::text")
        check(f"runtime role has SELECT only on {table}", ok in (True, "true"))
    for table in RUNTIME_DENIED:
        ok = base.query(url, f"SELECT (NOT has_table_privilege('{RUNTIME_ROLE}','public.{table}','SELECT'))::text")
        check(f"runtime role has no access to {table}", ok in (True, "true"))

    now = inventory(url)
    check("deterministic row digests unchanged (RBAC tables compared without K's own permissions and grants)", now == pre["inventory"], f"{json.dumps(now, sort_keys=True)} vs {json.dumps(pre['inventory'], sort_keys=True)}")
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--preview", action="store_true")
    group.add_argument("--snapshot", type=Path)
    group.add_argument("--verify", type=Path)
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    base._identity(url, "apply" if args.verify else "read")
    if args.preview:
        print(json.dumps(preview(url), indent=2, sort_keys=True))
        return 0
    if args.snapshot:
        args.snapshot.write_text(json.dumps(snapshot(url), indent=2))
        print("snapshot written")
        return 0
    results = verify(url, json.loads(args.verify.read_text()), scope_name=os.environ.get("VISTA_RELEASE_SCOPE", "M"))
    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
