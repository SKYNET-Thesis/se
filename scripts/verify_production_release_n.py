#!/usr/bin/env python3
"""Read-only preview and pre/post-flight checks for release scope N (student temporary password: five additive columns).

Modes (every query runs in an explicit `BEGIN READ ONLY` transaction via the shared helper; nothing is ever written):

  --preview          aggregate, non-sensitive counts describing the table the migration will alter (bound into the release plan)
  --snapshot FILE    record counts, the ledger and a content digest of education_school_user_profiles BEFORE the release
  --verify   FILE    after the release: assert the ledger entry, the pinned catalog, the exact column definitions, that nothing was backfilled
                     (every student keeps password_change_required = false) and that no existing row content or other table changed

The connection comes from DATABASE_URL (never printed). A loopback vista_test_* database may be used for rehearsals; anything else must be
the Production Supabase project.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from scripts import verify_production_release_d_i as base
except ModuleNotFoundError:  # executed as a script from the repository root
    import verify_production_release_d_i as base  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
VERSION = "20261118_n_student_password_change_required"
TABLE = "education_school_user_profiles"
NEW_COLUMNS = {  # name -> (data_type, is_nullable, column_default)
    "password_change_required": ("boolean", "NO", "false"),
    "password_changed_at": ("timestamp with time zone", "YES", None),
    "temporary_password_expires_at": ("timestamp with time zone", "YES", None),
    "provisioning_claim_token": ("uuid", "YES", None),
    "provisioning_lease_until": ("timestamp with time zone", "YES", None),
}
CATALOG_SQL = """SELECT json_build_object(
  'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'rls_enabled',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity),
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
  'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
  'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))::text"""
_STRIP = " ".join(f"- '{c}'" for c in NEW_COLUMNS)
# Content of every existing row ignoring the five new columns (before the release the columns do not exist, so nothing is removed).
ROW_DIGEST_SQL = f"SELECT md5(COALESCE(string_agg((to_jsonb(p) {_STRIP})::text, '|' ORDER BY p.user_id::text, p.organization_id::text), '')) FROM public.{TABLE} p"


def expected_catalog(root: Path, scope_name: str, applied_versions) -> dict:
    """The scope's pinned post-release catalog plus the pinned deltas of LATER released scopes that depend on it and are already applied (for example S adds a
    table). Keeps this verifier correct on a database that has moved on, without loosening what it checks at the scope's own release time."""
    scopes = json.loads((Path(root) / "database/release-scopes.json").read_text())["scopes"]
    expected = dict(scopes[scope_name]["expectedCatalogAfter"])
    mine = set(scopes[scope_name]["versions"])
    for name, other in scopes.items():
        if name == scope_name or "expectedCatalogBefore" not in other:
            continue
        if mine <= set(other.get("requiresApplied", [])) and set(other["versions"]) <= set(applied_versions):
            for key in expected:
                expected[key] += other["expectedCatalogAfter"][key] - other["expectedCatalogBefore"][key]
    return expected


def preview(url: str) -> dict:
    """What the migration will meet: counts only, no identifiers or content."""
    return base.query(url, f"""SELECT json_build_object(
      'profiles',(SELECT count(*) FROM public.{TABLE}),
      'students',(SELECT count(*) FROM public.{TABLE} WHERE person_type='student'),
      'teachers',(SELECT count(*) FROM public.{TABLE} WHERE person_type='teacher'),
      'new_columns_already_present',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='{TABLE}' AND column_name = ANY(ARRAY[{",".join(repr(c) for c in NEW_COLUMNS)}])))::text""")


def snapshot(url: str) -> dict:
    if int(base.query(url, base.RLS_BLOCKED_SQL) or 0):
        raise SystemExit("read-only role is subject to row level security on public tables (needs BYPASSRLS or ownership); counts would be wrong, refusing to snapshot")
    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in base.COUNT_TABLES)
    counts = base.query(url, f"SELECT json_build_object({parts})::text")
    ledger = base.query(url, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    digest = base.query(url, f"SELECT json_build_object('profiles_without_new_columns',({ROW_DIGEST_SQL}))::text")
    return {"counts": counts, "ledger": ledger, "digests": digest, "preview": preview(url)}


def verify(url: str, pre: dict, root: Path | None = None) -> list[tuple[str, bool, str]]:
    root = Path(root) if root else ROOT
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())
    scope = json.loads((root / "database/release-scopes.json").read_text())["scopes"]["N"]
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
    check("catalog counts equal the pinned post-release schema (a column-only change leaves them unchanged)", cat == expected_catalog(root, "N", by_version), f"found {json.dumps(cat, sort_keys=True)}")

    cols = {r["c"]: r for r in base.query(url, f"""SELECT COALESCE(json_agg(json_build_object('c',column_name,'t',data_type,'n',is_nullable,'d',column_default)),'[]'::json)::text
        FROM information_schema.columns WHERE table_schema='public' AND table_name='{TABLE}' AND column_name = ANY(ARRAY[{",".join(repr(c) for c in NEW_COLUMNS)}])""")}
    for name, (dtype, nullable, default) in NEW_COLUMNS.items():
        got = cols.get(name)
        check(f"column {name}: {dtype}, nullable={nullable}, default={default}", bool(got) and got["t"] == dtype and got["n"] == nullable and got["d"] == default,
              json.dumps(got) if got else "missing")

    data = base.query(url, f"""SELECT json_build_object(
      'profiles',(SELECT count(*) FROM public.{TABLE}),
      'forced',(SELECT count(*) FROM public.{TABLE} WHERE password_change_required),
      'any_other_value',(SELECT count(*) FROM public.{TABLE} WHERE password_changed_at IS NOT NULL OR temporary_password_expires_at IS NOT NULL OR provisioning_claim_token IS NOT NULL OR provisioning_lease_until IS NOT NULL))::text""")
    check("no existing student is forced to change their password (no backfill)", data["forced"] == 0, f"forced={data['forced']}")
    check("the other four columns are NULL on every row (no backfill)", data["any_other_value"] == 0, f"non-null rows={data['any_other_value']}")
    check("profile row count unchanged", data["profiles"] == pre["preview"]["profiles"], f"{pre['preview']['profiles']} -> {data['profiles']}")
    digest = base.query(url, f"SELECT json_build_object('profiles_without_new_columns',({ROW_DIGEST_SQL}))::text")
    check("content of every existing profile row unchanged (digest ignoring the new columns)", digest["profiles_without_new_columns"] == pre["digests"]["profiles_without_new_columns"])

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
