#!/usr/bin/env python3
"""Read-only pre/post-flight checks for release scope K-M (authoring capabilities, restricted runtime role, PUBLIC TEMP revocation).

Modes (every query runs inside `BEGIN READ ONLY`; nothing is ever written): --snapshot FILE (before), --verify FILE (after).
The connection comes from DATABASE_URL (never printed). The scope is additive: it must not change any existing row or table.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

try:
    from scripts import verify_production_release_d_i as base
except ModuleNotFoundError:  # executed as a script from the repository root
    import verify_production_release_d_i as base  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_ROLE = "vista_app_runtime"
# Tables the runtime role must be able to write (a representative allowlist incl. the submission-file table from migration I).
RUNTIME_WRITABLE = ["learning_submission_files", "learning_submissions", "learning_assignment_attempts", "learning_courses", "learning_questions"]
RUNTIME_SELECT_ONLY = ["permissions", "roles", "role_permissions"]
RUNTIME_DENIED = ["vista_schema_migrations", "api_keys"]
PLATFORM_ROLES = ["postgres", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin", "authenticator", "anon", "authenticated", "service_role"]

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


def verify(url: str, pre: dict, root: Path | None = None) -> list[tuple[str, bool, str]]:
    root = Path(root) if root else ROOT
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())
    scope = json.loads((root / "database/release-scopes.json").read_text())["scopes"]["K-M"]
    pinned = {e["version"]: e["sha256"] for e in manifest["migrations"]}
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))

    ledger = base.query(url, "SELECT COALESCE(json_agg(json_build_object('v',version,'sum',checksum,'prov',provenance) ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    by_version = {r["v"]: r for r in ledger}
    for version in scope["versions"]:
        r = by_version.get(version)
        check(f"ledger {version}", bool(r) and r["sum"] == pinned.get(version) == scope["sha256"][version] and r["prov"] == "executed")
    for version in scope["requiresApplied"]:
        r = by_version.get(version)
        check(f"ledger keeps {version}", bool(r) and r["sum"] == pinned.get(version))
    check("ledger gained exactly the K-M versions", set(pre["ledger"]) | set(scope["versions"]) == set(by_version))

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
    check("runtime role can connect, cannot create or use temporary tables, cannot create in public", role["connect"] and not role["create"] and not role["temp"] and not role["schema_create"])
    check("TEMP is no longer inherited from PUBLIC", not role["public_temp"])
    check("database owner retains TEMP", role["owner_temp"])
    platform = base.query(url, "SELECT COALESCE(json_object_agg(rolname, json_build_object('exists',true,'temp',has_database_privilege(rolname,current_database(),'TEMP'))),'{}'::json)::text FROM pg_roles WHERE rolname = ANY(ARRAY[" + ",".join("'"+r+"'" for r in PLATFORM_ROLES) + "]) ")
    check("available Supabase/platform roles retain TEMP", all(info.get("temp") for info in platform.values()))
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
    results = verify(url, json.loads(args.verify.read_text()))
    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
