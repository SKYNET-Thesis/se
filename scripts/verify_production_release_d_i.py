#!/usr/bin/env python3
"""Read-only pre/post-flight checks for the production database release D-I (D03 Stage 1 included, Stage 2 / J excluded).

Modes (every query runs inside an explicit `BEGIN READ ONLY` transaction; nothing is ever written):

  --snapshot FILE   record row counts and the identity/ledger state BEFORE the release
  --verify   FILE   after the release: compare against that snapshot and assert every D-I object, checksum and backfill rule

The connection comes from DATABASE_URL (never printed). A loopback vista_test_* database may be used for rehearsals; anything
else must be the Production Supabase project (host/user identify ovijutkvaaxohauvuxbj). This tool does not apply migrations.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PROD_REF = "ovijutkvaaxohauvuxbj"
RELEASE = [
    "20261110_d_activity_content", "20261110_e_learning_media", "20261111_f_global_question_scope",
    "20261111_g_activity_progress_scope_guard", "20261112_h_learning_media_audio_mpeg", "20261113_i_attempt_submission_foundation",
]
COUNT_TABLES = ["learning_submissions", "learning_assessments", "learning_assessment_scores", "learning_feedback", "learning_reflections",
                "learning_assignment_attempts", "learning_programs", "learning_program_versions", "learning_experiments",
                "learning_symbolic_evaluations", "learning_classroom_assignments", "learning_courses", "learning_lessons",
                "learning_questions", "learning_activities", "learning_activity_progress", "learning_enrollments", "users"]


def _identity(url: str) -> None:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    database = parsed.path.lstrip("/")
    if host in {"127.0.0.1", "localhost", "::1"}:
        if not database.startswith("vista_test_"):
            raise SystemExit("Loopback targets must be vista_test_* databases")
    elif not (host.endswith(".pooler.supabase.com") and (parsed.username or "") == f"postgres.{PROD_REF}") and host not in {f"db.{PROD_REF}.supabase.co", f"{PROD_REF}.supabase.co"}:
        raise SystemExit("DATABASE_URL does not identify the Production project or a local test database")


def query(url: str, sql: str):
    env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG", "TMPDIR")}
    env["PGCONNECT_TIMEOUT"] = "12"
    env["PGSSLMODE"] = "disable" if urlsplit(url).hostname in {"127.0.0.1", "localhost", "::1"} else "require"
    base = url.split("?")[0]
    done = subprocess.run(["psql", base, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", "BEGIN READ ONLY; " + sql],
                          capture_output=True, text=True, env=env)
    if done.returncode:
        raise SystemExit("query failed: " + done.stderr.replace(url, "<url>").strip()[:300])
    out = done.stdout.strip().splitlines()
    return json.loads(out[-1]) if out and out[-1][:1] in "[{" else (out[-1] if out else None)


RLS_BLOCKED_SQL = """SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
      AND NOT (SELECT r.rolbypassrls OR r.rolsuper FROM pg_roles r WHERE r.rolname=current_user)
      AND (c.relforcerowsecurity OR NOT pg_has_role(current_user, c.relowner, 'MEMBER')))::text"""


def snapshot(url: str) -> dict:
    # count(*) through a role that is subject to row level security silently returns 0; such a snapshot would be meaningless and would
    # make the post-release comparison fail. A SELECT grant alone is not enough: the read-only role must be BYPASSRLS (or own the tables).
    if int(query(url, RLS_BLOCKED_SQL) or 0):
        raise SystemExit("read-only role is subject to row level security on public tables (needs BYPASSRLS or ownership); row counts would be wrong, refusing to snapshot")
    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in COUNT_TABLES)
    counts = query(url, f"SELECT json_build_object({parts})::text")
    ledger = query(url, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    extra = query(url, """SELECT json_build_object(
      'evaluated_quiz_attempts',(SELECT count(*) FROM public.learning_assignment_attempts WHERE status='evaluated' AND workspace_snapshot->>'kind'='question_bank_quiz'),
      'submissions_with_program',(SELECT count(*) FROM public.learning_submissions WHERE program_id IS NOT NULL),
      'prisma_ledger_rows',(SELECT count(*) FROM public._prisma_migrations),
      'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'))::text""")
    return {"counts": counts, "ledger": ledger, "extra": extra}


def verify(url: str, pre: dict) -> list[tuple[str, bool, str]]:
    manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())
    expected = {e["version"]: e["sha256"] for e in manifest["migrations"]}
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))

    ledger = query(url, "SELECT COALESCE(json_agg(json_build_object('v',version,'sum',checksum,'prov',provenance,'src',source_commit) ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
    by_version = {r["v"]: r for r in ledger}
    for version in RELEASE:
        row = by_version.get(version)
        check(f"ledger {version}", bool(row) and row["sum"] == expected[version] and row["prov"] == "executed" and row["src"] == manifest["sourceCommit"],
              "present with manifest checksum, provenance executed and the pinned sourceCommit" if row else "missing")
    check("ledger keeps every earlier version", set(pre["ledger"]) <= set(by_version), f"{len(by_version)} rows")
    check("stage J is NOT applied (not in the ledger)", not any("one_submission_per_attempt" in v for v in by_version))

    cat = query(url, """SELECT json_build_object(
      'd_content',(SELECT data_type||'/'||is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_activities' AND column_name='content'),
      'e_table',to_regclass('public.learning_media_assets') IS NOT NULL,
      'e_rls',COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.learning_media_assets')),false),
      'e_scope_check',EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_media_assets_object_scope'),
      'h_audio',EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_media_assets_mime_type' AND pg_get_constraintdef(oid) LIKE '%audio/mpeg%'),
      'f_q_org_nullable',(SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_questions' AND column_name='organization_id'),
      'f_index',to_regclass('public.learning_questions_global_course_code_key') IS NOT NULL,
      'f_fn_null_safe',(SELECT prosrc LIKE '%IS NOT DISTINCT FROM NEW.organization_id%' FROM pg_proc WHERE proname='check_learning_question_scope' AND pronamespace='public'::regnamespace),
      'g_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='check_learning_activity_progress_scope' AND tgrelid='public.learning_activity_progress'::regclass),
      'i_attempt_id',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.learning_submissions'::regclass AND attname='attempt_id' AND NOT attisdropped),
      'i_origin_default',(SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_submissions' AND column_name='origin'),
      'i_attempt_unique',to_regclass('public.learning_submissions_attempt_id_key') IS NOT NULL,
      'i_attempt_cols',(SELECT count(*) FROM pg_attribute WHERE attrelid='public.learning_assignment_attempts'::regclass AND attname IN ('draft_response','draft_saved_at','grading_released_at','grading_released_by','grading_release_origin') AND NOT attisdropped),
      'i_release_check',EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_assignment_attempts_release_origin'),
      'i_files_table',to_regclass('public.learning_submission_files') IS NOT NULL,
      'i_files_rls',COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.learning_submission_files')),false),
      'i_files_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_learning_submission_files'),
      'i_audit_table',to_regclass('public.learning_submission_backfill_audit') IS NOT NULL,
      'i_audit_rls',COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.learning_submission_backfill_audit')),false),
      'legacy_unique_kept',EXISTS(SELECT 1 FROM pg_constraint WHERE conname='learning_submissions_assignment_id_learner_user_id_key'),
      'j_guard_absent',NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_learning_submission_attempt'),
      'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'))::text""")
    check("D learning_activities.content jsonb NOT NULL", cat["d_content"] == "jsonb/NO", cat["d_content"] or "missing")
    check("E learning_media_assets exists with RLS and object-scope check", cat["e_table"] and cat["e_rls"] and cat["e_scope_check"])
    check("H audio/mpeg allowed", cat["h_audio"])
    check("F organization_id nullable, global index and NULL-safe scope function", cat["f_q_org_nullable"] == "YES" and cat["f_index"] and cat["f_fn_null_safe"])
    check("G activity-progress scope trigger", cat["g_trigger"])
    check("I submissions.attempt_id, origin default and one-per-attempt unique index", cat["i_attempt_id"] and (cat["i_origin_default"] or "").startswith("'original'") and cat["i_attempt_unique"])
    check("I attempt draft/release columns and release-origin check", cat["i_attempt_cols"] == 5 and cat["i_release_check"])
    check("I submission files table, RLS and frozen-attachment trigger", cat["i_files_table"] and cat["i_files_rls"] and cat["i_files_trigger"])
    check("I backfill audit table with RLS", cat["i_audit_table"] and cat["i_audit_rls"])
    check("J excluded: legacy UNIQUE kept and no per-attempt guard trigger", cat["legacy_unique_kept"] and cat["j_guard_absent"])
    check("no RLS policies were added (zero before, zero after)", cat["policies"] == 0, str(cat["policies"]))

    parts = ",".join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in COUNT_TABLES)
    now = query(url, f"SELECT json_build_object({parts})::text")
    for table in COUNT_TABLES:
        check(f"row count unchanged: {table}", now[table] == pre["counts"][table], f"{pre['counts'][table]} -> {now[table]}")

    audit = query(url, """SELECT json_build_object(
      'by_class',(SELECT COALESCE(json_object_agg(classification,n),'{}'::json) FROM (SELECT classification,count(*) n FROM public.learning_submission_backfill_audit WHERE stage='stage1' GROUP BY 1) t),
      'uncertain',(SELECT count(*) FROM public.learning_submission_backfill_audit WHERE stage='stage1' AND grading_attribution_uncertain),
      'sub_with_program_unaudited',(SELECT count(*) FROM public.learning_submissions s WHERE s.program_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.learning_submission_backfill_audit a WHERE a.submission_id=s.id AND a.stage='stage1')),
      'mapped_without_attempt',(SELECT count(*) FROM public.learning_submission_backfill_audit a JOIN public.learning_submissions s ON s.id=a.submission_id WHERE a.stage='stage1' AND a.classification='mapped' AND s.attempt_id IS NULL),
      'unmapped_with_attempt',(SELECT count(*) FROM public.learning_submission_backfill_audit a JOIN public.learning_submissions s ON s.id=a.submission_id WHERE a.stage='stage1' AND a.classification<>'mapped' AND s.attempt_id IS NOT NULL),
      'reconstructed_rows',(SELECT count(*) FROM public.learning_submissions WHERE origin<>'original'),
      'released_quiz_system',(SELECT count(*) FROM public.learning_assignment_attempts WHERE grading_release_origin='system_auto'),
      'released_other',(SELECT count(*) FROM public.learning_assignment_attempts WHERE grading_released_at IS NOT NULL AND COALESCE(grading_release_origin,'')<>'system_auto'),
      'orphan_attempt_ids',(SELECT count(*) FROM public.learning_submissions s WHERE s.attempt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.learning_assignment_attempts a WHERE a.id=s.attempt_id AND a.learner_user_id=s.learner_user_id)))::text""")
    total_audited = sum(audit["by_class"].values())
    check("every submission with a program has exactly one stage-1 audit row", audit["sub_with_program_unaudited"] == 0 and total_audited == pre["extra"]["submissions_with_program"], f"audited {total_audited} of {pre['extra']['submissions_with_program']}: {audit['by_class']}")
    check("only unambiguous submissions got an attempt_id; others untouched", audit["mapped_without_attempt"] == 0 and audit["unmapped_with_attempt"] == 0)
    check("mapped submissions belong to their own learner's attempt", audit["orphan_attempt_ids"] == 0)
    check("no reconstructed submissions yet (Stage 2 only)", audit["reconstructed_rows"] == 0)
    check("only auto-graded quizzes were released, exactly the ones evaluated before", audit["released_quiz_system"] == pre["extra"]["evaluated_quiz_attempts"] and audit["released_other"] == 0,
          f"system_auto={audit['released_quiz_system']} expected={pre['extra']['evaluated_quiz_attempts']}")
    results.append(("INFO uncertain grading attribution rows (review before Stage 2)", True, str(audit["uncertain"])))

    api = query(url, """SELECT json_build_object('stage1',
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.learning_submissions') AND attname='attempt_id' AND NOT attisdropped)
        AND to_regclass('public.learning_submission_files') IS NOT NULL
        AND (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.learning_assignment_attempts') AND attname IN ('draft_response','draft_saved_at','grading_released_at','grading_released_by','grading_release_origin') AND NOT attisdropped)=5,
      'stage2',NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.learning_submissions') AND conname='learning_submissions_assignment_id_learner_user_id_key')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.learning_submissions') AND tgname='guard_learning_submission_attempt'))::text""")
    check("D03 API capability probe: Stage 1 true, Stage 2 false (final submit answers 503 until Stage J)", api["stage1"] is True and api["stage2"] is False)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--snapshot", type=Path)
    group.add_argument("--verify", type=Path)
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    _identity(url)
    if args.snapshot:
        data = snapshot(url)
        args.snapshot.write_text(json.dumps(data, indent=2))
        print(f"snapshot written ({len(data['ledger'])} ledger versions, {sum(data['counts'].values())} rows counted)")
        return 0
    pre = json.loads(args.verify.read_text())
    results = verify(url, pre)
    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
