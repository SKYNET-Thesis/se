#!/usr/bin/env python3
"""Read-only preview and pre/post-flight checks for release scope S (Classroom Lab Session, many-to-many robot allocation).

Modes (every query runs in an explicit `BEGIN READ ONLY` transaction via the shared helper; nothing is ever written):

  --preview          aggregate, non-sensitive counts describing what the migration will meet (bound into the release plan)
  --snapshot FILE    record counts, the ledger and a content digest of learning_classroom_robot_allocations BEFORE the release
  --verify   FILE    after the release: assert the ledger entry, the pinned catalog delta, the exact table/index/constraint/privilege/RLS definitions,
                     the permission grant, that no existing allocation (or any other table) changed and that classroom_lab_sessions starts empty

The connection comes from DATABASE_URL (never printed). A loopback vista_test_* database may be used for rehearsals; anything else must be
the Production Supabase project. Release ordering is NOT checked here: the Lab-Session-aware API must be deployed first (see the scope's productionStatus).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from scripts import verify_production_release_d_i as base
    from scripts.verify_production_release_n import CATALOG_SQL
except ModuleNotFoundError:  # executed as a script from the repository root
    import verify_production_release_d_i as base  # type: ignore
    from verify_production_release_n import CATALOG_SQL  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
VERSION = "20261127_s_classroom_lab_sessions"
TABLE = "classroom_lab_sessions"
ALLOCATIONS = "learning_classroom_robot_allocations"
COLUMNS = {  # name -> (data_type, is_nullable)
    "id": ("uuid", "NO"), "organization_id": ("uuid", "NO"), "classroom_id": ("uuid", "NO"), "robot_id": ("uuid", "NO"), "instructor_user_id": ("uuid", "NO"),
    "state": ("text", "NO"), "started_at": ("timestamp with time zone", "NO"), "expires_at": ("timestamp with time zone", "NO"), "extension_count": ("integer", "NO"),
    "terminating_at": ("timestamp with time zone", "YES"), "ended_at": ("timestamp with time zone", "YES"), "ended_by_user_id": ("uuid", "YES"),
    "ended_by_role": ("text", "YES"), "end_reason": ("text", "YES"), "created_at": ("timestamp with time zone", "NO"),
}
PERMISSION = "education.lab_session.manage"
ALLOCATION_DIGEST_SQL = f"SELECT md5(COALESCE(string_agg(a::text, '|' ORDER BY a.id::text), '')) FROM public.{ALLOCATIONS} a"


def preview(url: str) -> dict:
    """What the migration will meet: counts only, no identifiers or content."""
    return base.query(url, f"""SELECT json_build_object(
      'allocations',(SELECT count(*) FROM public.{ALLOCATIONS}),
      'classrooms_with_allocation',(SELECT count(DISTINCT classroom_id) FROM public.{ALLOCATIONS}),
      'lab_sessions_table_already_present',(to_regclass('public.{TABLE}') IS NOT NULL),
      'old_classroom_unique_present',EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.{ALLOCATIONS}'::regclass AND conname='{ALLOCATIONS}_classroom_id_key'),
      'instructor_role_present',EXISTS (SELECT 1 FROM public.roles WHERE code='instructor' AND scope='organization'))::text""")


def snapshot(url: str) -> dict:
    if int(base.query(url, base.RLS_BLOCKED_SQL) or 0):
        raise SystemExit("read-only role is subject to row level security on public tables (needs BYPASSRLS or ownership); counts would be wrong, refusing to snapshot")
    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in base.COUNT_TABLES)
    counts = base.query(url, f"SELECT json_build_object({parts})::text")
    ledger = base.query(url, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    digest = base.query(url, f"SELECT json_build_object('allocations',({ALLOCATION_DIGEST_SQL}))::text")
    return {"counts": counts, "ledger": ledger, "digests": digest, "preview": preview(url)}


def verify(url: str, pre: dict, root: Path | None = None) -> list[tuple[str, bool, str]]:
    root = Path(root) if root else ROOT
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())
    scope = json.loads((root / "database/release-scopes.json").read_text())["scopes"]["S"]
    pinned = {e["version"]: e["sha256"] for e in manifest["migrations"]}
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))

    ledger = base.query(url, "SELECT COALESCE(json_agg(json_build_object('v',version,'sum',checksum,'prov',provenance,'src',source_commit) ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    by_version = {r["v"]: r for r in ledger}
    row = by_version.get(VERSION)
    check(f"ledger {VERSION}", bool(row) and row["sum"] == pinned.get(VERSION) == scope["sha256"][VERSION] and row["prov"] == "executed" and row["src"] == manifest["sourceCommit"],
          "present with the manifest and scope checksum, provenance executed and the pinned sourceCommit" if row else "missing")
    for version in scope["requiresApplied"]:
        r = by_version.get(version)
        check(f"ledger keeps {version}", bool(r) and r["sum"] == pinned.get(version) and r["prov"] == "executed")
    check("ledger kept every earlier version and gained only this one", set(pre["ledger"]) | {VERSION} == set(by_version), f"{len(pre['ledger'])} -> {len(by_version)}")

    cat = base.query(url, CATALOG_SQL)
    check("catalog counts equal the pinned post-release schema (+1 table, +1 RLS table, +1 backend policy)", cat == scope["expectedCatalogAfter"], f"found {json.dumps(cat, sort_keys=True)}")

    cols = {r["c"]: r for r in base.query(url, f"""SELECT COALESCE(json_agg(json_build_object('c',column_name,'t',data_type,'n',is_nullable)),'[]'::json)::text
        FROM information_schema.columns WHERE table_schema='public' AND table_name='{TABLE}'""")}
    check(f"{TABLE} has exactly the pinned columns", set(cols) == set(COLUMNS), f"found {sorted(cols)}")
    for name, (dtype, nullable) in COLUMNS.items():
        got = cols.get(name)
        check(f"column {TABLE}.{name}: {dtype}, nullable={nullable}", bool(got) and got["t"] == dtype and got["n"] == nullable, json.dumps(got) if got else "missing")

    idx = {r["n"]: r["d"] for r in base.query(url, f"""SELECT COALESCE(json_agg(json_build_object('n',indexname,'d',indexdef)),'[]'::json)::text FROM pg_indexes WHERE schemaname='public' AND tablename='{TABLE}'""")}
    one_open = idx.get("ux_classroom_lab_sessions_one_open_per_robot", "")
    check("partial UNIQUE index: one open reservation per robot", "UNIQUE" in one_open and "(robot_id)" in one_open and "terminating" in one_open and "quarantined" in one_open and "'active'" in one_open, one_open or "missing")
    check("lookup indexes present", "ix_classroom_lab_sessions_classroom" in idx and "ix_classroom_lab_sessions_open_expiry" in idx)

    cons = base.query(url, f"""SELECT COALESCE(json_agg(conname),'[]'::json)::text FROM pg_constraint WHERE conrelid='public.{ALLOCATIONS}'::regclass AND contype='u'""")
    check("allocations: UNIQUE(classroom_id, robot_id) present and UNIQUE(classroom_id) gone", f"{ALLOCATIONS}_classroom_robot_key" in cons and f"{ALLOCATIONS}_classroom_id_key" not in cons, json.dumps(cons))
    state_check = base.query(url, f"SELECT count(*)::text FROM pg_constraint WHERE conrelid='public.{TABLE}'::regclass AND contype='c'")
    check("the state/validity CHECK constraints exist", int(state_check) >= 3, str(state_check))

    sec = base.query(url, f"""SELECT json_build_object('rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.{TABLE}'::regclass),
      'public_or_exposed',(SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='{TABLE}' AND grantee IN ('PUBLIC','anon','authenticated')),
      'runtime',(SELECT COALESCE(json_agg(privilege_type ORDER BY privilege_type),'[]'::json) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='{TABLE}' AND grantee='vista_app_runtime'),
      'policy',(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='{TABLE}' AND policyname='vista_app_runtime_backend_access'))::text""")
    check("RLS enabled and nothing granted to PUBLIC/anon/authenticated", sec["rls"] is True and sec["public_or_exposed"] == 0, json.dumps(sec))
    check("runtime role has exactly SELECT, INSERT, UPDATE (no DELETE) and one backend policy", sec["runtime"] == ["INSERT", "SELECT", "UPDATE"] and sec["policy"] == 1, json.dumps(sec))

    perm = base.query(url, f"""SELECT json_build_object('exists',EXISTS (SELECT 1 FROM public.permissions WHERE code='{PERMISSION}'),
      'roles',(SELECT COALESCE(json_agg(r.code ORDER BY r.code),'[]'::json) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE p.code='{PERMISSION}'))::text""")
    check(f"permission {PERMISSION} exists and is granted only to the instructor role", perm["exists"] is True and perm["roles"] == ["instructor"], json.dumps(perm))

    data = base.query(url, f"SELECT json_build_object('sessions',(SELECT count(*) FROM public.{TABLE}),'allocations',(SELECT count(*) FROM public.{ALLOCATIONS}),'digest',({ALLOCATION_DIGEST_SQL}))::text")
    check("classroom_lab_sessions starts empty (nothing is backfilled)", data["sessions"] == 0, f"rows={data['sessions']}")
    check("allocation row count unchanged", data["allocations"] == pre["preview"]["allocations"], f"{pre['preview']['allocations']} -> {data['allocations']}")
    check("content of every existing allocation unchanged (digest)", data["digest"] == pre["digests"]["allocations"])

    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in base.COUNT_TABLES)
    now = base.query(url, f"SELECT json_build_object({parts})::text")
    for table in base.COUNT_TABLES:
        check(f"row count unchanged: {table}", now[table] == pre["counts"][table], f"{pre['counts'][table]} -> {now[table]}")
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
    sys.exit(main())
