#!/usr/bin/env python3
"""Read-only preview and pre/post-flight checks for the production database release J (D03 Stage 2: one final submission per attempt).

Modes (every query runs inside an explicit `BEGIN READ ONLY` transaction; nothing is ever written):

  --preview          aggregate, non-sensitive counts that describe what Stage 2 will see (also embedded, hash-bound, in the release plan)
  --snapshot FILE    record counts, content digests and the ledger BEFORE the release
  --verify   FILE    after the release: compare against that snapshot and assert every Stage 2 object, checksum and data rule

The connection comes from DATABASE_URL (never printed). A loopback vista_test_* database may be used for rehearsals; anything else must
be the Production Supabase project. This tool never applies a migration. The grade-visibility rules asserted here are policy A:
unambiguous legacy grades stay visible (`legacy_visible`), uncertain ones are withheld for an explicit teacher release, nothing is rewritten.
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
VERSION = "20261114_j_one_submission_per_attempt"
LEGACY_UNIQUE = "learning_submissions_assignment_id_learner_user_id_key"
# Tables whose rows Stage 2 must never delete or rewrite (grading, evidence, reflections).
DIGEST_TABLES = ["learning_assessments", "learning_assessment_scores", "learning_feedback", "learning_reflections",
                 "learning_experiments", "learning_symbolic_evaluations"]
CATALOG_SQL = """SELECT json_build_object(
  'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'rls_enabled',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity),
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
  'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
  'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))::text"""

GRADED = """(EXISTS (SELECT 1 FROM public.learning_assessments x WHERE x.submission_id = s.id)
            OR EXISTS (SELECT 1 FROM public.learning_feedback f WHERE f.submission_id = s.id OR (s.attempt_id IS NOT NULL AND f.attempt_id = s.attempt_id))
            OR EXISTS (SELECT 1 FROM public.learning_reflections r WHERE r.submission_id = s.id))"""


def preview(url: str) -> dict:
    """What Stage 2 will meet in this database: counts only, no identifiers or content."""
    return base.query(url, f"""SELECT json_build_object(
      'submissions',(SELECT count(*) FROM public.learning_submissions),
      'submissions_with_program',(SELECT count(*) FROM public.learning_submissions WHERE program_id IS NOT NULL),
      'submissions_without_attempt',(SELECT count(*) FROM public.learning_submissions WHERE attempt_id IS NULL),
      'graded_without_attempt',(SELECT count(*) FROM public.learning_submissions s WHERE s.attempt_id IS NULL AND {GRADED}),
      'graded_with_attempt',(SELECT count(*) FROM public.learning_submissions s WHERE s.attempt_id IS NOT NULL AND {GRADED}),
      'audit_by_stage_class',(SELECT COALESCE(json_object_agg(stage||':'||classification,n),'{{}}'::json) FROM (SELECT stage,classification,count(*) n FROM public.learning_submission_backfill_audit GROUP BY 1,2) t),
      'uncertain_audit_rows',(SELECT count(*) FROM public.learning_submission_backfill_audit WHERE grading_attribution_uncertain),
      'attempts_finalized',(SELECT count(*) FROM public.learning_assignment_attempts WHERE status IN ('submitted','evaluated')),
      'attempts_finalized_without_submission',(SELECT count(*) FROM public.learning_assignment_attempts a WHERE a.status IN ('submitted','evaluated') AND a.program_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.learning_submissions s WHERE s.attempt_id = a.id)),
      'attempts_released_by_origin',(SELECT COALESCE(json_object_agg(o,n),'{{}}'::json) FROM (SELECT COALESCE(grading_release_origin,'none') o,count(*) n FROM public.learning_assignment_attempts WHERE grading_released_at IS NOT NULL GROUP BY 1) t),
      'legacy_unique_present',EXISTS(SELECT 1 FROM pg_constraint WHERE conname='{LEGACY_UNIQUE}'),
      'guard_trigger_present',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_learning_submission_attempt'))::text""")


def _digest(table: str) -> str:
    return f"'{table}',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text), '')) FROM public.{table} t)"


def snapshot(url: str) -> dict:
    if int(base.query(url, base.RLS_BLOCKED_SQL) or 0):
        raise SystemExit("read-only role is subject to row level security on public tables (needs BYPASSRLS or ownership); counts would be wrong, refusing to snapshot")
    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in base.COUNT_TABLES)
    counts = base.query(url, f"SELECT json_build_object({parts})::text")
    ledger = base.query(url, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    digests = base.query(url, "SELECT json_build_object(" + ",".join(_digest(t) for t in DIGEST_TABLES) + f""",
      'original_submissions',(SELECT md5(COALESCE(string_agg((to_jsonb(s) - 'attempt_id')::text, '|' ORDER BY s.id::text), '')) FROM public.learning_submissions s WHERE s.origin='original'),
      'attempts_without_release_columns',(SELECT md5(COALESCE(string_agg((to_jsonb(a) - 'grading_released_at' - 'grading_released_by' - 'grading_release_origin')::text, '|' ORDER BY a.id::text), '')) FROM public.learning_assignment_attempts a))::text""")
    return {"counts": counts, "ledger": ledger, "digests": digests, "preview": preview(url)}


def verify(url: str, pre: dict, root: Path | None = None) -> list[tuple[str, bool, str]]:
    root = Path(root) if root else ROOT
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())
    scope = json.loads((root / "database/release-scopes.json").read_text())["scopes"]["J"]
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
    check("ledger keeps every earlier version and gained only Stage 2", set(pre["ledger"]) | {VERSION} == set(by_version), f"{len(pre['ledger'])} -> {len(by_version)}")

    cat = base.query(url, CATALOG_SQL)
    expected = scope["expectedCatalogAfter"]
    check("catalog counts equal the pinned post-Stage-2 schema", cat == expected, f"found {json.dumps(cat, sort_keys=True)} expected {json.dumps(expected, sort_keys=True)}")

    obj = base.query(url, f"""SELECT json_build_object(
      'legacy_unique_gone',NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='{LEGACY_UNIQUE}'),
      'lookup_index',to_regclass('public.learning_submissions_assignment_learner_idx') IS NOT NULL,
      'lookup_not_unique',COALESCE((SELECT NOT indisunique FROM pg_index WHERE indexrelid=to_regclass('public.learning_submissions_assignment_learner_idx')),false),
      'attempt_unique_kept',COALESCE((SELECT indisunique FROM pg_index WHERE indexrelid=to_regclass('public.learning_submissions_attempt_id_key')),false),
      'guard_fn',EXISTS(SELECT 1 FROM pg_proc WHERE proname='guard_learning_submission_attempt' AND pronamespace='public'::regnamespace),
      'guard_trigger_enabled',COALESCE((SELECT tgenabled='O' FROM pg_trigger WHERE tgname='guard_learning_submission_attempt' AND tgrelid='public.learning_submissions'::regclass),false),
      'stage1',EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.learning_submissions') AND attname='attempt_id' AND NOT attisdropped)
        AND to_regclass('public.learning_submission_files') IS NOT NULL
        AND (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.learning_assignment_attempts') AND attname IN ('draft_response','draft_saved_at','grading_released_at','grading_released_by','grading_release_origin') AND NOT attisdropped)=5,
      'stage2',NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.learning_submissions') AND conname='{LEGACY_UNIQUE}')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.learning_submissions') AND tgname='guard_learning_submission_attempt'))::text""")
    check("legacy UNIQUE (assignment, learner) removed", obj["legacy_unique_gone"])
    check("plain lookup index replaces it", obj["lookup_index"] and obj["lookup_not_unique"])
    check("one-per-attempt unique index kept", obj["attempt_unique_kept"])
    check("guard function and enabled trigger present", obj["guard_fn"] and obj["guard_trigger_enabled"])
    check("D03 API capability probe: Stage 1 true and Stage 2 true", obj["stage1"] is True and obj["stage2"] is True)

    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in base.COUNT_TABLES)
    now = base.query(url, f"SELECT json_build_object({parts})::text")
    rec = base.query(url, f"""SELECT json_build_object(
      'reconstructed',(SELECT count(*) FROM public.learning_submissions WHERE origin='reconstructed'),
      'reconstructed_audit',(SELECT count(*) FROM public.learning_submission_backfill_audit WHERE stage='stage2' AND classification='reconstructed'),
      'reconstructed_with_dependents',(SELECT count(*) FROM public.learning_submissions s WHERE s.origin='reconstructed' AND {GRADED}),
      'reconstructed_unbound',(SELECT count(*) FROM public.learning_submissions s WHERE s.origin='reconstructed' AND (s.attempt_id IS NULL OR s.status<>'submitted' OR s.program_version_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.learning_assignment_attempts a WHERE a.id=s.attempt_id AND a.learner_user_id=s.learner_user_id))),
      'other_origins',(SELECT count(*) FROM public.learning_submissions WHERE origin NOT IN ('original','reconstructed')))::text""")
    for table in base.COUNT_TABLES:
        if table == "learning_submissions":
            check("learning_submissions grew only by reconstructed rows", now[table] == pre["counts"][table] + rec["reconstructed"], f"{pre['counts'][table]} + {rec['reconstructed']} -> {now[table]}")
        else:
            check(f"row count unchanged: {table}", now[table] == pre["counts"][table], f"{pre['counts'][table]} -> {now[table]}")
    check("every reconstructed row is audited, bound to its own finalized attempt and carries no grading", rec["reconstructed"] == rec["reconstructed_audit"] and rec["reconstructed_unbound"] == 0
          and rec["reconstructed_with_dependents"] == 0 and rec["other_origins"] == 0, json.dumps(rec, sort_keys=True))

    dig = base.query(url, "SELECT json_build_object(" + ",".join(_digest(t) for t in DIGEST_TABLES) + f""",
      'original_submissions',(SELECT md5(COALESCE(string_agg((to_jsonb(s) - 'attempt_id')::text, '|' ORDER BY s.id::text), '')) FROM public.learning_submissions s WHERE s.origin='original'),
      'attempts_without_release_columns',(SELECT md5(COALESCE(string_agg((to_jsonb(a) - 'grading_released_at' - 'grading_released_by' - 'grading_release_origin')::text, '|' ORDER BY a.id::text), '')) FROM public.learning_assignment_attempts a))::text""")
    for key, value in pre["digests"].items():
        check(f"content unchanged (digest): {key}", dig[key] == value)

    pol = base.query(url, f"""SELECT json_build_object(
      'withheld_but_released',(SELECT count(*) FROM public.learning_submission_backfill_audit au JOIN public.learning_assignment_attempts a ON a.id=au.attempt_id
          WHERE au.stage='stage2' AND au.classification='legacy_grading_withheld_uncertain' AND a.grading_released_at IS NOT NULL),
      'legacy_visible',(SELECT count(*) FROM public.learning_assignment_attempts WHERE grading_release_origin='legacy_visible'),
      'legacy_visible_audited',(SELECT count(*) FROM public.learning_submission_backfill_audit WHERE stage='stage2' AND classification='legacy_grading_released'),
      'legacy_visible_with_actor',(SELECT count(*) FROM public.learning_assignment_attempts WHERE grading_release_origin='legacy_visible' AND grading_released_by IS NOT NULL),
      'legacy_visible_uncertain',(SELECT count(*) FROM public.learning_assignment_attempts a WHERE a.grading_release_origin='legacy_visible'
          AND EXISTS (SELECT 1 FROM public.learning_submission_backfill_audit au WHERE au.attempt_id=a.id AND au.grading_attribution_uncertain)),
      'legacy_visible_ungraded',(SELECT count(*) FROM public.learning_assignment_attempts a WHERE a.grading_release_origin='legacy_visible'
          AND NOT EXISTS (SELECT 1 FROM public.learning_submissions s WHERE s.attempt_id=a.id AND {GRADED})),
      'released_by_origin',(SELECT COALESCE(json_object_agg(o,n),'{{}}'::json) FROM (SELECT COALESCE(grading_release_origin,'none') o,count(*) n FROM public.learning_assignment_attempts WHERE grading_released_at IS NOT NULL GROUP BY 1) t),
      'attemptless_with_program_unaudited',(SELECT count(*) FROM public.learning_submissions s WHERE s.attempt_id IS NULL AND s.program_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.learning_submission_backfill_audit au WHERE au.submission_id=s.id AND au.classification IN ('unmapped_no_attempt','ambiguous_multiple_attempts'))))::text""")
    check("policy A: uncertain grades stay withheld (unreleased)", pol["withheld_but_released"] == 0)
    check("policy A: unambiguous legacy grades released as legacy_visible, each audited, none attributed to a person", pol["legacy_visible"] == pol["legacy_visible_audited"] and pol["legacy_visible_with_actor"] == 0)
    check("policy A: no uncertain or ungraded attempt was released by the migration", pol["legacy_visible_uncertain"] == 0 and pol["legacy_visible_ungraded"] == 0)
    before_origin = pre["preview"]["attempts_released_by_origin"]
    after_origin = dict(pol["released_by_origin"])
    after_origin.pop("legacy_visible", None)
    check("system_auto and instructor releases are unchanged", {k: v for k, v in before_origin.items() if k != "legacy_visible"} == after_origin, f"{before_origin} -> {pol['released_by_origin']}")
    check("every attempt-less submission with a program stays audited", pol["attemptless_with_program_unaudited"] == 0)
    results.append(("INFO graded submissions that still have no attempt (cannot be released by a teacher)", True, str(base.query(url, f"SELECT count(*)::text FROM public.learning_submissions s WHERE s.attempt_id IS NULL AND {GRADED}"))))
    results.append(("INFO stage-2 audit rows by classification", True, json.dumps(base.query(url, "SELECT COALESCE(json_object_agg(classification,n),'{}'::json)::text FROM (SELECT classification,count(*) n FROM public.learning_submission_backfill_audit WHERE stage='stage2' GROUP BY 1) t"), sort_keys=True)))
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
