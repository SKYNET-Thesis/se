"""D03 migration tests: Stage 1 (additive) and Stage 2 (one submission per attempt).

Runs only against a disposable loopback PostgreSQL server. It clones a pristine template database (a bootstrapped
baseline + manifest migrations D-H that has NOT had Stage 1/2 applied) into a throwaway database per test and drops
it afterwards. Skipped unless VISTA_D03_MIGRATION_TEST_URL is set, e.g.

  VISTA_D03_MIGRATION_TEST_URL=postgresql://vista_test:<pw>@127.0.0.1:55432/postgres
  VISTA_D03_MIGRATION_TEMPLATE=vista_test_d03_pristine   (default; built on demand by scripts/build_d03_pristine_template.py)

It never connects to anything but a loopback host and refuses Supabase/Production-looking targets.
"""

from __future__ import annotations

import os
import subprocess
import sys
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
STAGE1 = ROOT / "database/migrations/20261113_i_attempt_submission_foundation.sql"
STAGE2 = ROOT / "database/migrations/20261114_j_one_submission_per_attempt.sql"
URL = os.environ.get("VISTA_D03_MIGRATION_TEST_URL", "")
TEMPLATE = os.environ.get("VISTA_D03_MIGRATION_TEMPLATE", "vista_test_d03_pristine")


def _target():
    parsed = urlparse(URL)
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or "supabase" in URL.lower():
        raise RuntimeError("D03 migration tests accept a loopback PostgreSQL server only")
    return parsed


@unittest.skipUnless(URL, "VISTA_D03_MIGRATION_TEST_URL is not set (disposable loopback PostgreSQL required)")
class AttemptSubmissionMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # The template is the schema BEFORE D03 Stage 1 (baseline + D-H). Build it once per server when it is missing.
        subprocess.run([sys.executable, str(ROOT / "scripts/build_d03_pristine_template.py"), "--admin-url", URL, "--template", TEMPLATE],
                       check=True, cwd=ROOT, env={**os.environ, "VISTA_DATABASE_PROJECT_REF": os.environ.get("VISTA_DATABASE_PROJECT_REF", "vista-course-builder-test")})

    def setUp(self):
        self.target = _target()
        self.db = f"d03_mig_{uuid.uuid4().hex[:10]}"
        self.psql_raw("postgres", f'CREATE DATABASE "{self.db}" TEMPLATE "{TEMPLATE}"')
        self.addCleanup(lambda: self.psql_raw("postgres", f'DROP DATABASE IF EXISTS "{self.db}" WITH (FORCE)'))

    # -- helpers ----------------------------------------------------------------------------------------------
    def psql_raw(self, database: str, sql: str, expect_error: bool = False) -> str:
        env = {**os.environ, "PGPASSWORD": self.target.password or ""}
        proc = subprocess.run(
            ["psql", "-h", self.target.hostname, "-p", str(self.target.port or 5432), "-U", self.target.username,
             "-d", database, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
            capture_output=True, text=True, env=env,
        )
        if expect_error:
            self.assertNotEqual(proc.returncode, 0, f"expected failure for: {sql[:120]}")
            return proc.stderr
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return proc.stdout.strip()

    def sql(self, sql: str) -> str:
        return self.psql_raw(self.db, sql)

    def fails(self, sql: str) -> str:
        return self.psql_raw(self.db, sql, expect_error=True)

    def apply_file(self, path: Path, expect_error: bool = False) -> str:
        env = {**os.environ, "PGPASSWORD": self.target.password or ""}
        proc = subprocess.run(
            ["psql", "-h", self.target.hostname, "-p", str(self.target.port or 5432), "-U", self.target.username,
             "-d", self.db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", str(path)],
            capture_output=True, text=True, env=env,
        )
        if expect_error:
            self.assertNotEqual(proc.returncode, 0)
            return proc.stderr
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return proc.stdout

    @staticmethod
    def uid() -> str:
        return str(uuid.uuid4())

    def world(self) -> dict:
        w = {k: self.uid() for k in ("org", "course", "lesson", "assignment", "offering", "classroom", "delivery")}
        s = uuid.uuid4().hex[:8]
        self.sql(f"""
          INSERT INTO organizations(id,name,type,segment) VALUES ('{w['org']}','o{s}','institution','education');
          INSERT INTO learning_courses(id,title,status) VALUES ('{w['course']}','c{s}','published');
          INSERT INTO learning_lessons(id,course_id,title,ordinal) VALUES ('{w['lesson']}','{w['course']}','L1',1);
          INSERT INTO learning_assignments(id,lesson_id,title,constraints) VALUES ('{w['assignment']}','{w['lesson']}','Program','{{"kind":"symbolic_program"}}');
          INSERT INTO learning_course_offerings(id,course_id,organization_id,code,status) VALUES ('{w['offering']}','{w['course']}','{w['org']}','of{s}','active');
          INSERT INTO learning_classrooms(id,organization_id,offering_id,name,code) VALUES ('{w['classroom']}','{w['org']}','{w['offering']}','r{s}','r{s}');
          INSERT INTO learning_classroom_assignments(id,classroom_id,assignment_id,status) VALUES ('{w['delivery']}','{w['classroom']}','{w['assignment']}','published');
        """)
        return w

    def user(self) -> str:
        u = self.uid()
        self.sql(f"INSERT INTO users(id,full_name,signup_method,status) VALUES ('{u}','L','admin_created','active')")
        return u

    def attempt(self, w: dict, learner: str, number: int, status: str, program: str | None, workspace='{}', robot='{}') -> str:
        a = self.uid()
        prog = f"'{program}'" if program else "NULL"
        self.sql(f"""INSERT INTO learning_assignment_attempts(id,classroom_assignment_id,learner_user_id,program_id,attempt_number,status,
                       workspace_snapshot,program_snapshot,submitted_at)
                     VALUES ('{a}','{w['delivery']}','{learner}',{prog},{number},'{status}','{workspace}'::jsonb,'{robot}'::jsonb,
                       {"now()" if status != "in_progress" else "NULL"})""")
        return a

    def program(self, learner: str, w: dict, workspace='{"b":1}', robot='{"s":1}') -> tuple[str, str]:
        p, v = self.uid(), self.uid()
        self.sql(f"""INSERT INTO learning_programs(id,owner_user_id,assignment_id) VALUES ('{p}','{learner}','{w['assignment']}');
                     INSERT INTO learning_program_versions(id,program_id,version_number,workspace_json,robot_program)
                     VALUES ('{v}','{p}',1,'{workspace}'::jsonb,'{robot}'::jsonb)""")
        return p, v

    def legacy_submission(self, w: dict, learner: str, program: str | None, version: str | None) -> str:
        s = self.uid()
        prog = f"'{program}'" if program else "NULL"
        ver = f"'{version}'" if version else "NULL"
        self.sql(f"""INSERT INTO learning_submissions(id,assignment_id,learner_user_id,program_id,program_version_id,status,submitted_at)
                     VALUES ('{s}','{w['assignment']}','{learner}',{prog},{ver},'submitted',now())""")
        return s

    def scalar(self, sql: str) -> str:
        return self.sql(sql)

    # -- legacy scenario shared by several tests -----------------------------------------------------------
    def legacy_world(self) -> dict:
        w = self.world()
        ctx: dict = {"w": w}
        # Learner A: two submitted attempts; the legacy UPSERT left one row (for attempt 2) with a grade attached.
        a = self.user()
        p1, v1 = self.program(a, w, '{"b":"one"}', '{"s":"one"}')
        p2, v2 = self.program(a, w, '{"b":"two"}', '{"s":"two"}')
        at1 = self.attempt(w, a, 1, "submitted", p1, '{"b":"one"}', '{"s":"one"}')
        at2 = self.attempt(w, a, 2, "submitted", p2, '{"b":"two"}', '{"s":"two"}')
        sub_a = self.legacy_submission(w, a, p2, v2)
        reviewer = self.user()
        self.sql(f"""INSERT INTO learning_assessments(submission_id,reviewer_user_id,overall_feedback,reviewed_at) VALUES ('{sub_a}','{reviewer}','good',now());
                     INSERT INTO learning_feedback(submission_id,author_user_id,content) VALUES ('{sub_a}','{reviewer}','nice');
                     INSERT INTO learning_reflections(submission_id,learner_user_id,prompt_key,prompt_text) VALUES ('{sub_a}','{a}','k','t')""")
        ctx.update(a=a, p1=p1, v1=v1, p2=p2, v2=v2, at1=at1, at2=at2, sub_a=sub_a, reviewer=reviewer)
        # Learner B: one attempt, one submission: cleanly mapped.
        b = self.user()
        pb, vb = self.program(b, w)
        atb = self.attempt(w, b, 1, "submitted", pb, '{"b":1}', '{"s":1}')
        sub_b = self.legacy_submission(w, b, pb, vb)
        ctx.update(b=b, atb=atb, sub_b=sub_b)
        # Learner C: submission whose program has no attempt.
        c = self.user()
        pc, vc = self.program(c, w)
        sub_c = self.legacy_submission(w, c, pc, vc)
        ctx.update(c=c, sub_c=sub_c)
        # Learner D: two attempts share one program: ambiguous.
        d = self.user()
        pd, vd = self.program(d, w)
        self.attempt(w, d, 1, "submitted", pd, '{"b":1}', '{"s":1}')
        self.attempt(w, d, 2, "submitted", pd, '{"b":1}', '{"s":1}')
        sub_d = self.legacy_submission(w, d, pd, vd)
        ctx.update(d=d, sub_d=sub_d)
        # Learner E: earlier attempt whose snapshots match no stored version (reconstruction must be skipped).
        e = self.user()
        pe1, _ = self.program(e, w, '{"b":"x"}', '{"s":"x"}')
        pe2, ve2 = self.program(e, w, '{"b":"y"}', '{"s":"y"}')
        ate1 = self.attempt(w, e, 1, "submitted", pe1, '{"b":"edited"}', '{"s":"edited"}')
        self.attempt(w, e, 2, "submitted", pe2, '{"b":"y"}', '{"s":"y"}')
        self.legacy_submission(w, e, pe2, ve2)
        ctx.update(e=e, ate1=ate1)
        # Learner F: one attempt, one submission with a grade that was visible before D03 (unambiguous attribution).
        fl = self.user()
        pf, vf = self.program(fl, w)
        atf = self.attempt(w, fl, 1, "submitted", pf, '{"b":1}', '{"s":1}')
        sub_f = self.legacy_submission(w, fl, pf, vf)
        self.sql(f"INSERT INTO learning_assessments(submission_id,reviewer_user_id,overall_feedback,reviewed_at) VALUES ('{sub_f}','{reviewer}','solid',now())")
        ctx.update(f=fl, atf=atf, sub_f=sub_f)
        # Auto-graded quiz attempt.
        q = self.user()
        quiz = self.uid()
        self.sql(f"""INSERT INTO learning_assignment_attempts(id,classroom_assignment_id,learner_user_id,attempt_number,status,workspace_snapshot,result_snapshot,score,submitted_at)
                     VALUES ('{quiz}','{w['delivery']}','{q}',1,'evaluated','{{"kind":"question_bank_quiz"}}','{{"passed":true}}',100,now())""")
        ctx.update(q=q, quiz=quiz)
        return ctx

    # -- tests ----------------------------------------------------------------------------------------------
    def test_stage1_maps_only_unambiguous_rows_and_preserves_everything(self):
        ctx = self.legacy_world()
        before = {t: self.scalar(f"SELECT count(*) FROM {t}") for t in
                  ("learning_submissions", "learning_assessments", "learning_feedback", "learning_reflections", "learning_assignment_attempts")}
        self.apply_file(STAGE1)
        after = {t: self.scalar(f"SELECT count(*) FROM {t}") for t in before}
        self.assertEqual(before, after, "Stage 1 must not add or remove any pre-existing row")
        self.assertEqual(self.scalar(f"SELECT attempt_id FROM learning_submissions WHERE id='{ctx['sub_a']}'"), ctx["at2"])
        self.assertEqual(self.scalar(f"SELECT attempt_id FROM learning_submissions WHERE id='{ctx['sub_b']}'"), ctx["atb"])
        self.assertEqual(self.scalar(f"SELECT coalesce(attempt_id::text,'NULL') FROM learning_submissions WHERE id='{ctx['sub_c']}'"), "NULL")
        self.assertEqual(self.scalar(f"SELECT coalesce(attempt_id::text,'NULL') FROM learning_submissions WHERE id='{ctx['sub_d']}'"), "NULL")
        audit = lambda sid: self.scalar(f"SELECT classification||'|'||grading_attribution_uncertain::text FROM learning_submission_backfill_audit WHERE submission_id='{sid}'")
        self.assertEqual(audit(ctx["sub_a"]), "mapped|true", "grade on a row that overwrote an earlier attempt must be flagged")
        self.assertEqual(audit(ctx["sub_b"]), "mapped|false")
        self.assertEqual(audit(ctx["sub_c"]), "unmapped_no_attempt|false")
        self.assertEqual(audit(ctx["sub_d"]), "ambiguous_multiple_attempts|false")
        self.assertEqual(self.scalar("SELECT count(*) FROM learning_submissions WHERE origin <> 'original'"), "0")
        # the quiz auto-grade is released by the system; the Blockly attempts are not
        self.assertEqual(self.scalar(f"SELECT (grading_released_at IS NOT NULL)::text||'|'||coalesce(grading_released_by::text,'system') FROM learning_assignment_attempts WHERE id='{ctx['quiz']}'"), "true|system")
        self.assertEqual(self.scalar(f"SELECT grading_released_at IS NULL FROM learning_assignment_attempts WHERE id='{ctx['at2']}'"), "t")
        # the legacy uniqueness is still in force during Stage 1
        self.fails(f"INSERT INTO learning_submissions(assignment_id,learner_user_id,status) VALUES ('{ctx['w']['assignment']}','{ctx['a']}','draft')")

    def test_stage1_files_table_enforces_scope_types_and_frozen_attempts(self):
        ctx = self.legacy_world()
        self.apply_file(STAGE1)
        w, a = ctx["w"], ctx["a"]
        open_attempt = self.attempt(w, a, 3, "in_progress", None)
        key = f"learning-media/submissions/{w['assignment']}/{a}/{open_attempt}/{self.uid()}.pdf"
        ins = lambda k, mime="application/pdf", size=10, attempt=open_attempt, learner=a: (
            f"INSERT INTO learning_submission_files(attempt_id,assignment_id,learner_user_id,object_key,original_filename,mime_type,size_bytes) "
            f"VALUES ('{attempt}','{w['assignment']}','{learner}','{k}','f.pdf','{mime}',{size})")
        self.sql(ins(key))
        self.fails(ins(f"learning-media/courses/{w['course']}/documents/{self.uid()}.pdf"))  # wrong prefix
        self.fails(ins(f"learning-media/submissions/{w['assignment']}/{a}/{self.uid()}/{self.uid()}.pdf"))  # wrong attempt segment
        self.fails(ins(f"learning-media/submissions/{w['assignment']}/{ctx['b']}/{open_attempt}/{self.uid()}.pdf"))  # wrong learner segment
        self.fails(ins(f"learning-media/submissions/{w['assignment']}/{a}/{open_attempt}/{self.uid()}.exe", mime="application/x-msdownload"))
        self.fails(ins(f"learning-media/submissions/{w['assignment']}/{a}/{open_attempt}/{self.uid()}.pdf", size=26214401))
        # another learner cannot attach to this attempt even with a matching key
        self.fails(ins(f"learning-media/submissions/{w['assignment']}/{ctx['b']}/{open_attempt}/{self.uid()}.pdf", learner=ctx["b"]))
        # identity columns immutable, status may move while open
        self.fails(f"UPDATE learning_submission_files SET object_key=object_key||'x' WHERE object_key='{key}'")
        self.sql(f"UPDATE learning_submission_files SET status='ready', ready_at=now() WHERE object_key='{key}'")
        # frozen once the attempt is no longer in progress
        self.sql(f"UPDATE learning_assignment_attempts SET status='submitted', submitted_at=now() WHERE id='{open_attempt}'")
        self.fails(f"UPDATE learning_submission_files SET status='removed' WHERE object_key='{key}'")
        self.fails(ins(f"learning-media/submissions/{w['assignment']}/{a}/{open_attempt}/{self.uid()}.pdf"))

    def test_stage2_requires_stage1(self):
        self.world()
        err = self.apply_file(STAGE2, expect_error=True)
        self.assertIn("Stage 1", err)

    def test_stage2_one_submission_per_attempt_and_history_is_preserved(self):
        ctx = self.legacy_world()
        self.apply_file(STAGE1)
        before = {t: self.scalar(f"SELECT count(*) FROM {t}") for t in
                  ("learning_assessments", "learning_feedback", "learning_reflections", "learning_assignment_attempts")}
        orig_sub = self.scalar(f"SELECT md5(s::text) FROM learning_submissions s WHERE id='{ctx['sub_a']}'")
        subs_before = int(self.scalar("SELECT count(*) FROM learning_submissions"))
        self.apply_file(STAGE2)
        # nothing dependent moved or vanished; the original row is byte-for-byte unchanged
        self.assertEqual(before, {t: self.scalar(f"SELECT count(*) FROM {t}") for t in before})
        self.assertEqual(orig_sub, self.scalar(f"SELECT md5(s::text) FROM learning_submissions s WHERE id='{ctx['sub_a']}'"))
        self.assertEqual(self.scalar(f"SELECT count(*) FROM learning_assessments WHERE submission_id='{ctx['sub_a']}'"), "1")
        # attempt 1 of learner A got a reconstructed row bound to its own program version, with NO grading attached
        rec = self.scalar(f"SELECT origin||'|'||program_version_id||'|'||status FROM learning_submissions WHERE attempt_id='{ctx['at1']}'")
        self.assertEqual(rec, f"reconstructed|{ctx['v1']}|submitted")
        rec_id = self.scalar(f"SELECT id FROM learning_submissions WHERE attempt_id='{ctx['at1']}'")
        for table in ("learning_assessments", "learning_feedback", "learning_reflections"):
            self.assertEqual(self.scalar(f"SELECT count(*) FROM {table} WHERE submission_id='{rec_id}'"), "0")
        self.assertEqual(self.scalar(f"SELECT classification FROM learning_submission_backfill_audit WHERE submission_id='{rec_id}' AND stage='stage2'"), "reconstructed")
        # learner E's earlier attempt cannot be matched to a stored version: skipped, never invented
        self.assertEqual(self.scalar(f"SELECT count(*) FROM learning_submissions WHERE attempt_id='{ctx['ate1']}'"), "0")
        self.assertEqual(self.scalar(f"SELECT classification FROM learning_submission_backfill_audit WHERE attempt_id='{ctx['ate1']}'"), "reconstruction_skipped")
        # ambiguous and unmapped legacy rows are untouched, and no reconstruction duplicated them
        self.assertEqual(self.scalar(f"SELECT count(*) FROM learning_submissions WHERE learner_user_id='{ctx['d']}'"), "1")
        self.assertEqual(self.scalar(f"SELECT count(*) FROM learning_submissions WHERE learner_user_id='{ctx['c']}'"), "1")
        self.assertGreater(int(self.scalar("SELECT count(*) FROM learning_submissions")), subs_before)
        self.assertEqual(self.scalar("SELECT count(*) FROM learning_submissions WHERE origin='original'"), str(subs_before))
        # the legacy uniqueness is gone: a later attempt can have its own submission, one per attempt
        w, a = ctx["w"], ctx["a"]
        p3, v3 = self.program(a, w, '{"b":"three"}', '{"s":"three"}')
        at3 = self.attempt(w, a, 3, "in_progress", p3)
        ins = f"INSERT INTO learning_submissions(assignment_id,learner_user_id,program_id,program_version_id,status,submitted_at,attempt_id) VALUES ('{w['assignment']}','{a}','{p3}','{v3}','submitted',now(),'{at3}')"
        self.sql(ins)
        self.fails(ins)  # a second final submission for the same attempt
        # attempt 1 / attempt 2 / attempt 3 stay independent and individually gradeable
        s3 = self.scalar(f"SELECT id FROM learning_submissions WHERE attempt_id='{at3}'")
        self.sql(f"INSERT INTO learning_assessments(submission_id,reviewer_user_id,overall_feedback) VALUES ('{s3}','{ctx['reviewer']}','third')")
        self.sql(f"INSERT INTO learning_assessments(submission_id,reviewer_user_id,overall_feedback) VALUES ('{rec_id}','{ctx['reviewer']}','first')")
        self.assertEqual(self.scalar(f"SELECT overall_feedback FROM learning_assessments WHERE submission_id='{ctx['sub_a']}'"), "good")
        # defense in depth
        self.fails(f"INSERT INTO learning_submissions(assignment_id,learner_user_id,status) VALUES ('{w['assignment']}','{a}','submitted')")  # final without attempt
        other_attempt = self.attempt(w, ctx["b"], 2, "in_progress", p3)
        self.fails(f"INSERT INTO learning_submissions(assignment_id,learner_user_id,program_id,status,attempt_id) VALUES ('{w['assignment']}','{a}','{p3}','submitted','{other_attempt}')")  # attempt of another learner
        # finalized submissions are immutable; reviewed transition is allowed; attempt rebind is not
        self.fails(f"UPDATE learning_submissions SET submitted_program='{{}}'::jsonb WHERE id='{s3}'")
        self.fails(f"UPDATE learning_submissions SET reflection='x' WHERE id='{s3}'")
        self.fails(f"UPDATE learning_submissions SET attempt_id='{ctx['at2']}' WHERE id='{s3}'")
        self.sql(f"UPDATE learning_submissions SET status='reviewed' WHERE id='{s3}'")
        self.fails(f"UPDATE learning_submissions SET status='submitted' WHERE id='{s3}'")

    def test_stage2_makes_the_legacy_upsert_conflict_target_invalid(self):
        """Why the old API must not run during Stage 2: its ON CONFLICT (assignment_id, learner_user_id) stops being valid."""
        ctx = self.legacy_world()
        legacy_upsert = (f"INSERT INTO learning_submissions(assignment_id,learner_user_id,status) VALUES ('{ctx['w']['assignment']}','{ctx['b']}','draft') "
                         "ON CONFLICT (assignment_id, learner_user_id) DO UPDATE SET status='submitted'")
        self.sql(legacy_upsert)  # valid while the legacy UNIQUE exists (before and after Stage 1)
        self.apply_file(STAGE1)
        self.sql(legacy_upsert)
        self.apply_file(STAGE2)
        err = self.fails(legacy_upsert)
        self.assertIn("no unique or exclusion constraint matching the ON CONFLICT specification", err)

    def capability_probe(self) -> str:
        """Runs the exact SQL the API uses (SchemaCompatibilityService.read) so the probe and the migrations cannot drift apart."""
        source = (ROOT / "services/education-api/src/modules/learning/schema-compatibility.service.ts").read_text()
        sql = source.split("$queryRaw<Array<{ stage1: boolean; stage2: boolean }>>`")[1].split("`;")[0]
        return self.sql(f"SELECT stage1::text||'|'||stage2::text FROM ({sql}) AS probe")

    def test_api_capability_probe_tracks_each_stage(self):
        self.assertEqual(self.capability_probe(), "false|false")  # pristine: the D03 API must refuse to start
        self.apply_file(STAGE1)
        self.assertEqual(self.capability_probe(), "true|false")  # Stage 1: starts, Stage-2 endpoints answer 503
        self.apply_file(STAGE2)
        self.assertEqual(self.capability_probe(), "true|true")

    def test_legacy_grading_visibility_transition(self):
        """Previously visible, unambiguous grades stay visible at cutover; uncertain ones are withheld and audited; nothing is deleted."""
        ctx = self.legacy_world()
        self.apply_file(STAGE1)
        released = lambda a: self.scalar(f"SELECT coalesce(grading_release_origin,'unreleased') FROM learning_assignment_attempts WHERE id='{a}'")
        self.assertEqual(released(ctx["quiz"]), "system_auto")           # auto-graded quiz results stay visible
        self.assertEqual(released(ctx["atf"]), "unreleased")             # Stage 1 alone changes nothing for programming grades
        self.fails(f"UPDATE learning_assignment_attempts SET grading_released_at=now() WHERE id='{ctx['atf']}'")  # a release must name its origin
        assessments = self.scalar("SELECT count(*) FROM learning_assessments")
        self.apply_file(STAGE2)
        self.assertEqual(released(ctx["atf"]), "legacy_visible")         # previously visible, certain attribution: preserved
        self.assertEqual(self.scalar(f"SELECT grading_released_by IS NULL FROM learning_assignment_attempts WHERE id='{ctx['atf']}'"), "t")
        self.assertEqual(released(ctx["at2"]), "unreleased")             # grade on a row that overwrote attempt 1: withheld
        self.assertEqual(released(ctx["atb"]), "unreleased")             # nothing was graded: nothing to preserve
        audit = lambda sid: self.scalar(f"SELECT string_agg(classification, ',' ORDER BY classification) FROM learning_submission_backfill_audit WHERE submission_id='{sid}' AND stage='stage2'")
        self.assertIn("legacy_grading_released", audit(ctx["sub_f"]))
        self.assertIn("legacy_grading_withheld_uncertain", audit(ctx["sub_a"]))
        self.assertEqual(self.scalar("SELECT count(*) FROM learning_assessments"), assessments)  # nothing deleted

    def test_stage2_rerun_of_backfill_maps_rows_written_between_stages(self):
        ctx = self.legacy_world()
        self.apply_file(STAGE1)
        # The old API keeps running after Stage 1: a new submission arrives without attempt_id.
        w = ctx["w"]
        n = self.user()
        pn, vn = self.program(n, w)
        atn = self.attempt(w, n, 1, "submitted", pn, '{"b":1}', '{"s":1}')
        late = self.legacy_submission(w, n, pn, vn)
        self.assertEqual(self.scalar(f"SELECT coalesce(attempt_id::text,'NULL') FROM learning_submissions WHERE id='{late}'"), "NULL")
        self.apply_file(STAGE2)
        self.assertEqual(self.scalar(f"SELECT attempt_id FROM learning_submissions WHERE id='{late}'"), atn)
        self.assertEqual(self.scalar(f"SELECT stage||'|'||classification FROM learning_submission_backfill_audit WHERE submission_id='{late}'"), "stage2|mapped")


if __name__ == "__main__":
    unittest.main()
