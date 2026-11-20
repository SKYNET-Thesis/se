#!/usr/bin/env python3
"""Read-only preview and pre/post-flight checks for release scope O-P (WF-01 permission + LMS academic metadata columns).

Modes (every query runs in an explicit `BEGIN READ ONLY` transaction via the shared helper; nothing is ever written):
  --preview          aggregate, non-sensitive counts describing the tables the migrations will alter
  --snapshot FILE    record counts, the ledger and content digests of learning_courses / learning_assignments / learning_classrooms BEFORE the release
  --verify   FILE    after the release: ledger entries and checksums, pinned catalog, exact column definitions, the three level rows, the single
                     role grant, that nothing was backfilled and that no existing row content or other table changed
The connection comes from DATABASE_URL (never printed). A loopback vista_test_* database may be used for rehearsals; anything else must be the Production project.
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
VERSIONS = ("20261119_o_wf01_robot_allocation_permission", "20261119_p_course_level_tags_prerequisites_assignment_difficulty")
NEW_COLUMNS = {  # (table, column) -> (udt_name, is_nullable, column_default)
    ("learning_courses", "tags"): ("_text", "NO", "'{}'::text[]"),
    ("learning_courses", "prerequisite_course_ids"): ("_uuid", "NO", "'{}'::uuid[]"),
    ("learning_assignments", "difficulty"): ("text", "YES", None),
    ("learning_assignments", "assignment_type"): ("text", "YES", None),
    ("learning_assignments", "pass_score"): ("numeric", "YES", None),
    ("learning_assignments", "grading_method"): ("text", "YES", None),
    ("learning_assignments", "learning_objectives"): ("jsonb", "NO", "'[]'::jsonb"),
    ("learning_classrooms", "self_enrollment_open"): ("bool", "NO", "false"),
}
TABLES = ("learning_courses", "learning_assignments", "learning_classrooms")
LEVELS = ("BEGINNER", "INTERMEDIATE", "ADVANCED")
PERMISSION = "education.classroom.resource.allocate"


def _strip(table: str) -> str:
    return " ".join(f"- '{c}'" for (t, c) in NEW_COLUMNS if t == table)


def _digest(table: str) -> str:
    return f"SELECT md5(COALESCE(string_agg((to_jsonb(x) {_strip(table)})::text, '|' ORDER BY x.id::text), '')) FROM public.{table} x"


def preview(url: str) -> dict:
    cols = ",".join(repr(c) for (_, c) in NEW_COLUMNS)
    return base.query(url, f"""SELECT json_build_object(
      'courses',(SELECT count(*) FROM public.learning_courses),'assignments',(SELECT count(*) FROM public.learning_assignments),
      'classrooms',(SELECT count(*) FROM public.learning_classrooms),'levels',(SELECT count(*) FROM public.learning_levels),
      'new_columns_already_present',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY(ARRAY['learning_courses','learning_assignments','learning_classrooms']) AND column_name = ANY(ARRAY[{cols}])),
      'permission_present',(SELECT count(*) FROM public.permissions WHERE code='{PERMISSION}'))::text""")


def snapshot(url: str) -> dict:
    if int(base.query(url, base.RLS_BLOCKED_SQL) or 0):
        raise SystemExit("read-only role is subject to row level security on public tables (needs BYPASSRLS or ownership); counts would be wrong, refusing to snapshot")
    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in base.COUNT_TABLES)
    counts = base.query(url, f"SELECT json_build_object({parts})::text")
    ledger = base.query(url, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    digests = base.query(url, "SELECT json_build_object(" + ",".join(f"'{t}',({_digest(t)})" for t in TABLES) + ")::text")
    return {"counts": counts, "ledger": ledger, "digests": digests, "preview": preview(url)}


def verify(url: str, pre: dict, root: Path | None = None) -> list[tuple[str, bool, str]]:
    root = Path(root) if root else ROOT
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())
    scope = json.loads((root / "database/release-scopes.json").read_text())["scopes"]["O-P"]
    pinned = {e["version"]: e["sha256"] for e in manifest["migrations"]}
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))

    ledger = base.query(url, "SELECT COALESCE(json_agg(json_build_object('v',version,'sum',checksum,'prov',provenance,'src',source_commit) ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    by_version = {r["v"]: r for r in ledger}
    for version in VERSIONS:
        row = by_version.get(version)
        check(f"ledger {version}", bool(row) and row["sum"] == pinned.get(version) == scope["sha256"][version] and row["prov"] == "executed" and row["src"] == manifest["sourceCommit"],
              "present with the manifest and scope checksum, provenance executed and the pinned sourceCommit" if row else "missing")
    for version in scope["requiresApplied"]:
        r = by_version.get(version)
        check(f"ledger keeps {version}", bool(r) and r["sum"] == pinned.get(version) and r["prov"] == "executed")
    check("ledger kept every earlier version and gained only O and P", set(pre["ledger"]) | set(VERSIONS) == set(by_version), f"{len(pre['ledger'])} -> {len(by_version)}")
    cat = base.query(url, CATALOG_SQL)
    check("catalog counts equal the pinned post-release schema (column/constraint/index/row changes leave them unchanged)", cat == scope["expectedCatalogAfter"], f"found {json.dumps(cat, sort_keys=True)}")

    cols = {(r["t"], r["c"]): r for r in base.query(url, """SELECT COALESCE(json_agg(json_build_object('t',table_name,'c',column_name,'u',udt_name,'n',is_nullable,'d',column_default)),'[]'::json)::text
        FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY(ARRAY['learning_courses','learning_assignments','learning_classrooms'])""")}
    for (table, column), (udt, nullable, default) in NEW_COLUMNS.items():
        got = cols.get((table, column))
        check(f"column {table}.{column}: {udt}, nullable={nullable}, default={default}", bool(got) and got["u"] == udt and got["n"] == nullable and got["d"] == default, json.dumps(got) if got else "missing")
    constraints = base.query(url, "SELECT COALESCE(json_agg(conname ORDER BY conname),'[]'::json)::text FROM pg_constraint WHERE conname IN ('learning_courses_tags_limit','learning_assignments_academic_values')")
    check("both CHECK constraints exist", constraints == ["learning_assignments_academic_values", "learning_courses_tags_limit"], json.dumps(constraints))

    data = base.query(url, f"""SELECT json_build_object(
      'levels',(SELECT COALESCE(json_agg(code ORDER BY ordinal),'[]'::json) FROM public.learning_levels WHERE code = ANY(ARRAY['BEGINNER','INTERMEDIATE','ADVANCED'])),
      'grant',(SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE p.code='{PERMISSION}' AND r.code='school_admin' AND r.scope='organization'),
      'courses_with_values',(SELECT count(*) FROM public.learning_courses WHERE cardinality(tags)>0 OR cardinality(prerequisite_course_ids)>0),
      'assignments_with_values',(SELECT count(*) FROM public.learning_assignments WHERE difficulty IS NOT NULL OR assignment_type IS NOT NULL OR pass_score IS NOT NULL OR grading_method IS NOT NULL OR jsonb_array_length(learning_objectives)>0),
      'classrooms_open',(SELECT count(*) FROM public.learning_classrooms WHERE self_enrollment_open),
      'courses',(SELECT count(*) FROM public.learning_courses),'assignments',(SELECT count(*) FROM public.learning_assignments),'classrooms',(SELECT count(*) FROM public.learning_classrooms))::text""")
    check("the three canonical level rows exist", data["levels"] == list(LEVELS), json.dumps(data["levels"]))
    check("School Admin holds the WF-01 allocation permission exactly once", data["grant"] == 1, f"grants={data['grant']}")
    check("no course was given tags or prerequisites (no backfill)", data["courses_with_values"] == 0, f"rows={data['courses_with_values']}")
    check("no assignment was given academic values (no backfill)", data["assignments_with_values"] == 0, f"rows={data['assignments_with_values']}")
    check("no classroom is open for self-enrollment (default closed)", data["classrooms_open"] == 0, f"open={data['classrooms_open']}")
    for key, name in (("courses", "courses"), ("assignments", "assignments"), ("classrooms", "classrooms")):
        check(f"row count unchanged: {name}", data[key] == pre["preview"][key], f"{pre['preview'][key]} -> {data[key]}")
    digests = base.query(url, "SELECT json_build_object(" + ",".join(f"'{t}',({_digest(t)})" for t in TABLES) + ")::text")
    for table in TABLES:
        check(f"content of every existing {table} row unchanged (digest ignoring the new columns)", digests[table] == pre["digests"][table])
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
