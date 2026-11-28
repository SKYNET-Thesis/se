#!/usr/bin/env python3
"""Read-only preview and pre/post-flight checks for release scope T-U (rubric level descriptors + staff first-login password state).

Migration T: learning_rubric_criteria.descriptors jsonb NULL (exactly four strings) and learning_assessment_scores.level smallint NULL (0..4).
Migration U: public.users.password_change_required boolean NOT NULL DEFAULT false, password_changed_at / temporary_password_expires_at timestamptz NULL.
Both are additive: no backfill, no row is rewritten, no table/policy/trigger/function is created. Nothing is enabled by the release itself:
the API reads the U columns only while STAFF_TEMP_PASSWORD_ENABLED=true and the T columns only for assignments that were given descriptors/levels.

Modes (every query runs in an explicit `BEGIN READ ONLY` transaction via the shared helper; nothing is ever written):

  --preview          aggregate, non-sensitive counts describing what the migrations will meet (bound into the release plan)
  --snapshot FILE    record counts, the ledger and content digests (over the PRE-EXISTING columns only) BEFORE the release
  --verify   FILE    after the release: ledger entries, the pinned (unchanged) catalog, exact column/constraint definitions, no restricted user, no
                     descriptor/level written, existing rows byte-identical on their pre-existing columns

The connection comes from DATABASE_URL (never printed). A loopback vista_test_* database may be used for rehearsals.
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
VERSIONS = ["20261128_t_rubric_level_descriptors", "20261128_u_staff_password_change_required"]
COLUMNS = {  # (table, column) -> (data_type, is_nullable)
    ("learning_rubric_criteria", "descriptors"): ("jsonb", "YES"),
    ("learning_assessment_scores", "level"): ("smallint", "YES"),
    ("users", "password_change_required"): ("boolean", "NO"),
    ("users", "password_changed_at"): ("timestamp with time zone", "YES"),
    ("users", "temporary_password_expires_at"): ("timestamp with time zone", "YES"),
}
CONSTRAINTS = {"learning_rubric_criteria_descriptors_shape": "learning_rubric_criteria", "learning_assessment_scores_level_range": "learning_assessment_scores"}
# Digests over the columns that existed BEFORE the release, so they are comparable after it.
DIGEST_SQL = {
    "users": "SELECT md5(COALESCE(string_agg(concat_ws('|',id,auth_user_id,email,full_name,status,signup_method,email_verified_at), E'\\n' ORDER BY id::text), '')) FROM public.users",
    "rubric_criteria": "SELECT md5(COALESCE(string_agg(concat_ws('|',id,assignment_id,title,description,max_points,ordinal), E'\\n' ORDER BY id::text), '')) FROM public.learning_rubric_criteria",
    "assessment_scores": "SELECT md5(COALESCE(string_agg(concat_ws('|',assessment_id,criterion_id,awarded_points,comment), E'\\n' ORDER BY assessment_id::text, criterion_id::text), '')) FROM public.learning_assessment_scores",
}


def preview(url: str) -> dict:
    """What the migrations will meet: counts only, no identifiers or content."""
    return base.query(url, """SELECT json_build_object(
      'users',(SELECT count(*) FROM public.users),
      'rubric_criteria',(SELECT count(*) FROM public.learning_rubric_criteria),
      'assessment_scores',(SELECT count(*) FROM public.learning_assessment_scores),
      'columns_already_present',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name IN ('password_change_required','password_changed_at','temporary_password_expires_at')) OR (table_name='learning_rubric_criteria' AND column_name='descriptors') OR (table_name='learning_assessment_scores' AND column_name='level'))))::text""")


def snapshot(url: str) -> dict:
    if int(base.query(url, base.RLS_BLOCKED_SQL) or 0):
        raise SystemExit("read-only role is subject to row level security on public tables (needs BYPASSRLS or ownership); counts would be wrong, refusing to snapshot")
    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in base.COUNT_TABLES)
    counts = base.query(url, f"SELECT json_build_object({parts})::text")
    ledger = base.query(url, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json) ::text FROM public.vista_schema_migrations")
    digests = base.query(url, "SELECT json_build_object(" + ",".join(f"'{k}',({sql})" for k, sql in DIGEST_SQL.items()) + ")::text")
    return {"counts": counts, "ledger": ledger, "digests": digests, "preview": preview(url)}


def verify(url: str, pre: dict, root: Path | None = None) -> list[tuple[str, bool, str]]:
    root = Path(root) if root else ROOT
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())
    scope = json.loads((root / "database/release-scopes.json").read_text())["scopes"]["T-U"]
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
    check("ledger kept every earlier version and gained only T and U", set(pre["ledger"]) | set(VERSIONS) == set(by_version), f"{len(pre['ledger'])} -> {len(by_version)}")

    cat = base.query(url, CATALOG_SQL)
    check("catalog counts unchanged (no table, policy, trigger or function added)", cat == scope["expectedCatalogAfter"] == scope["expectedCatalogBefore"], f"found {json.dumps(cat, sort_keys=True)}")

    found = {(r["t"], r["c"]): r for r in base.query(url, """SELECT COALESCE(json_agg(json_build_object('t',table_name,'c',column_name,'d',data_type,'n',is_nullable,'def',column_default)),'[]'::json)::text
        FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name IN ('password_change_required','password_changed_at','temporary_password_expires_at'))
          OR (table_name='learning_rubric_criteria' AND column_name='descriptors') OR (table_name='learning_assessment_scores' AND column_name='level'))""")}
    check("exactly the five pinned columns exist", set(found) == set(COLUMNS), f"found {sorted(found)}")
    for (table, column), (dtype, nullable) in COLUMNS.items():
        got = found.get((table, column))
        check(f"column {table}.{column}: {dtype}, nullable={nullable}", bool(got) and got["d"] == dtype and got["n"] == nullable, json.dumps(got) if got else "missing")
    got = found.get(("users", "password_change_required"))
    check("users.password_change_required defaults to false", bool(got) and got["def"] == "false", json.dumps(got) if got else "missing")

    cons = {r["n"]: r for r in base.query(url, """SELECT COALESCE(json_agg(json_build_object('n',conname,'t',conrelid::regclass::text,'d',pg_get_constraintdef(oid))),'[]'::json)::text FROM pg_constraint WHERE contype='c'
        AND conname IN ('learning_rubric_criteria_descriptors_shape','learning_assessment_scores_level_range')""")}
    for name, table in CONSTRAINTS.items():
        got = cons.get(name)
        check(f"CHECK {name} on {table}", bool(got) and got["t"].endswith(table), json.dumps(got) if got else "missing")
    check("descriptors CHECK demands exactly four array elements", "jsonb_array_length" in cons.get("learning_rubric_criteria_descriptors_shape", {}).get("d", "") and "4" in cons.get("learning_rubric_criteria_descriptors_shape", {}).get("d", ""))
    check("level CHECK is 0..4", "0" in cons.get("learning_assessment_scores_level_range", {}).get("d", "") and "4" in cons.get("learning_assessment_scores_level_range", {}).get("d", ""))

    data = base.query(url, """SELECT json_build_object('restricted',(SELECT count(*) FROM public.users WHERE password_change_required OR password_changed_at IS NOT NULL OR temporary_password_expires_at IS NOT NULL),
      'descriptors',(SELECT count(*) FROM public.learning_rubric_criteria WHERE descriptors IS NOT NULL),'levels',(SELECT count(*) FROM public.learning_assessment_scores WHERE level IS NOT NULL))::text""")
    check("no user is restricted by the release (nobody is forced to change a password)", data["restricted"] == 0, f"restricted={data['restricted']}")
    check("legacy criteria keep NULL descriptors and legacy scores keep NULL level (no backfill)", data["descriptors"] == 0 and data["levels"] == 0, json.dumps(data))
    digests = base.query(url, "SELECT json_build_object(" + ",".join(f"'{k}',({sql})" for k, sql in DIGEST_SQL.items()) + ")::text")
    for key in DIGEST_SQL:
        check(f"content of every existing row unchanged on its pre-existing columns: {key}", digests[key] == pre["digests"][key])

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
