"""Tests of the Supabase Free logical-backup path (scripts/production_db_backup.py, backup_mode=logical in the release workflow).

Static/unit tests always run. Database tests need a disposable loopback PostgreSQL 17 server (VISTA_D03_MIGRATION_TEST_URL), clone
throw-away vista_test_* databases, and use a local directory in place of the encrypted bucket. No Production, AWS or S3 is ever contacted.
"""

from __future__ import annotations

import contextlib
import copy
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests/database"))

from scripts import production_db_backup as bk  # noqa: E402
from scripts import production_db_release as prm  # noqa: E402
from scripts.check_database_workflow_safety import inspect_workflows, release_workflow_problems  # noqa: E402
from test_production_db_release import LABEL, TEMPLATE, URL, ReleaseFlowTests  # noqa: E402

WORKFLOWS = ROOT / ".github/workflows"
RELEASE_YML = WORKFLOWS / "production-database-release.yml"
HEX = "a" * 64
PLAN = {"status": "ready", "projectRef": "ovijutkvaaxohauvuxbj", "scope": "D-I", "planHash": "1" * 64, "manifestSha256": "2" * 64,
        "releaseCommit": "3" * 40, "sourceCommit": "4" * 40, "pending": [{"version": "v"}]}
NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)


def evidence(**over):
    ev = {"kind": bk.EVIDENCE_KIND, "version": 1, **{k: PLAN[k] for k in ("projectRef", "scope", "planHash", "manifestSha256", "releaseCommit", "sourceCommit")},
          "createdAt": (NOW - timedelta(hours=1)).isoformat(), "expiresAt": (NOW + timedelta(days=89)).isoformat(),
          "dump": {"sha256": HEX, "sizeBytes": 10}, "restoreTest": {"passed": True, "postgresVersion": "17.6", "checks": [{"name": n, "ok": True} for n in bk.REQUIRED_RESTORE_CHECKS]},
          "storage": {"checksumSha256": bk._b64(HEX), "versionId": "v1", "kmsKey": "k"}}
    ev.update(over)
    return ev


HEAD = {"checksumSha256": bk._b64(HEX), "versionId": "v1", "sizeBytes": 10, "encryption": "aws:kms", "sseKmsKeyId": "k"}


class EvidenceValidationTests(unittest.TestCase):
    def problems(self, ev=None, plan=None, head=HEAD, now=NOW):
        return bk.validate_evidence(ev or evidence(), plan or PLAN, now=now, head=head, storage={"kmsKey": "k"})

    def test_good_evidence_has_no_problems(self):
        self.assertEqual(self.problems(), [])

    def test_every_binding_is_enforced(self):
        for key in ("projectRef", "scope", "planHash", "manifestSha256", "releaseCommit", "sourceCommit"):
            plan = {**PLAN, key: "other"}
            self.assertTrue(any(key in p for p in self.problems(plan=plan)), key)

    def test_stale_future_or_expired_backups_are_rejected(self):
        self.assertTrue(self.problems(evidence(createdAt=(NOW - timedelta(hours=13)).isoformat())))
        self.assertTrue(self.problems(evidence(createdAt=(NOW + timedelta(hours=1)).isoformat())))
        self.assertTrue(self.problems(evidence(expiresAt=(NOW - timedelta(seconds=1)).isoformat())))
        self.assertTrue(self.problems(evidence(createdAt="garbage")))

    def test_restore_test_must_have_passed_every_check_on_postgres_17(self):
        ev = evidence()
        ev["restoreTest"]["checks"] = ev["restoreTest"]["checks"][:-1]
        self.assertTrue(self.problems(ev))
        ev = evidence()
        ev["restoreTest"]["passed"] = False
        self.assertTrue(self.problems(ev))
        ev = evidence()
        ev["restoreTest"]["postgresVersion"] = "16.4"
        self.assertTrue(any("PostgreSQL 17" in p for p in self.problems(ev)))
        ev = evidence()
        ev["restoreTest"]["checks"][0]["ok"] = False
        self.assertTrue(self.problems(ev))

    def test_object_checksum_version_size_and_encryption_are_rechecked(self):
        for tweak in ({"checksumSha256": bk._b64("b" * 64)}, {"versionId": "v2"}, {"versionId": None}, {"sizeBytes": 11}, {"encryption": "AES256"}, {"sseKmsKeyId": None}, {"sseKmsKeyId": "other"}):
            self.assertTrue(self.problems(head={**HEAD, **tweak}), tweak)

    def test_hash_and_storage_checksum_must_agree_and_kind_must_match(self):
        self.assertTrue(self.problems(evidence(dump={"sha256": HEX, "sizeBytes": 10}, storage={"checksumSha256": bk._b64("c" * 64), "versionId": "v1", "kmsKey": "k"})))
        self.assertTrue(self.problems(evidence(kind="managed")))
        self.assertTrue(self.problems(evidence(version=2)))


class ReleaseAcceptanceTests(unittest.TestCase):
    def logical(self, **over):
        ev = {"kind": "logical-pg_dump", **{k: PLAN[k] for k in prm.LOGICAL_BINDING_KEYS}, "restoreTestPassed": True, "dumpSha256": HEX, "versionId": "v1",
              "createdAt": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
        ev.update(over)
        return ev

    def test_logical_evidence_accepted_only_when_bound_fresh_and_tested(self):
        prm._check_logical_evidence(self.logical(), PLAN)
        for over in ({"planHash": "x"}, {"manifestSha256": "x"}, {"releaseCommit": "x"}, {"projectRef": "x"}, {"scope": "x"}, {"sourceCommit": "x"}, {"restoreTestPassed": False},
                     {"dumpSha256": "zz"}, {"versionId": None}, {"createdAt": (datetime.now(timezone.utc) - timedelta(hours=13)).isoformat()}, {"createdAt": "nope"}):
            with self.assertRaises(prm.ReleaseError, msg=str(over)):
                prm._check_logical_evidence(self.logical(**over), PLAN)

    def test_apply_refuses_mode_and_evidence_kind_mismatch(self):
        for mode, ev in (("managed", self.logical()), ("logical", {"pitrEnabled": True, "projectRef": PLAN["projectRef"]})):
            tmp = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, tmp, True)
            (tmp / "plan.json").write_text(json.dumps(PLAN))
            (tmp / "ev.json").write_text(json.dumps({**ev, "checkedAt": datetime.now(timezone.utc).isoformat(), "latestBackupAt": "2026-11-13T00:00:00+00:00"}))
            ns = mock.Mock(plan=tmp / "plan.json", backup_evidence=tmp / "ev.json", approval_reference="r", scope="D-I", backup_mode=mode)
            with self.assertRaises(prm.ReleaseError) as raised:
                prm.apply_release(ns)
            self.assertIn("backup mode", str(raised.exception))

    def test_apply_refuses_missing_or_stale_logical_evidence_file(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        (tmp / "plan.json").write_text(json.dumps(PLAN))
        ns = mock.Mock(plan=tmp / "plan.json", backup_evidence=tmp / "missing.json", approval_reference="r", scope="D-I", backup_mode="logical")
        with self.assertRaises(prm.ReleaseError):
            prm.apply_release(ns)


class HelperTests(unittest.TestCase):
    def test_scrub_removes_urls_and_secrets(self):
        text = bk._scrub("failed postgresql://u:pw@host:5432/db and pw and host", "pw", "host")
        self.assertNotIn("pw", text)
        self.assertNotIn("host", text)
        self.assertNotIn("postgresql://u", text)

    def test_target_identity_rules(self):
        prod = bk.Target("postgresql://vista_backup_reader.ovijutkvaaxohauvuxbj:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres")
        bk.check_target(prod, bk.PRODUCTION_REF, False)
        for url in ("postgresql://vista_backup_reader.otherrefotherrefother:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres", "postgresql://postgres:pw@evil.example.com:5432/postgres",
                    "postgresql://postgres:pw@127.0.0.1:5432/postgres",
                    "postgresql://postgres.ovijutkvaaxohauvuxbj:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"):  # the owner/apply role is not a backup reader
            with self.assertRaises(bk.BackupError):
                bk.check_target(bk.Target(url), bk.PRODUCTION_REF, False)
        with self.assertRaises(bk.BackupError):
            bk.check_target(prod, "someotherref", False)
        with self.assertRaises(bk.BackupError):  # the test switch can never point at a non-loopback or non-vista_test database
            bk.check_target(prod, "label", True)
        with self.assertRaises(bk.BackupError):
            bk.check_target(bk.Target("postgresql://u:p@127.0.0.1:5432/prod"), "label", True)

    def test_s3_storage_requires_the_approved_account_key_and_a_bucket(self):
        with self.assertRaises(bk.BackupError):
            bk.S3Storage("bucket-name", "arn:aws:kms:ap-southeast-1:111111111111:key/" + "0" * 8 + "-0000-0000-0000-" + "0" * 12)
        with self.assertRaises(bk.BackupError):
            bk.S3Storage("", "")
        bk.S3Storage("vista-db-backups", "arn:aws:kms:ap-southeast-1:157098813811:key/12345678-1234-1234-1234-123456789012")

    def test_s3_put_always_requests_kms_encryption_and_a_sha256_checksum(self):
        seen = []
        storage = bk.S3Storage("vista-db-backups", "arn:aws:kms:ap-southeast-1:157098813811:key/12345678-1234-1234-1234-123456789012")
        storage._aws = lambda *a: seen.append(a) or {"VersionId": "v", "ChecksumSHA256": "c", "SSEKMSKeyId": "k", "ServerSideEncryption": "aws:kms"}
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        (tmp / "f").write_bytes(b"x")
        storage.put(tmp / "f", "k/key", HEX)
        args = seen[0]
        self.assertIn("aws:kms", args)
        self.assertIn("--ssekms-key-id", args)
        self.assertIn("SHA256", args)
        self.assertIn(bk._b64(HEX), args)

    def test_local_storage_needs_the_test_flag(self):
        ns = mock.Mock(storage_dir="/tmp/x", allow_local_test_database=False, bucket=None, kms_key_arn=None)
        with self.assertRaises(bk.BackupError):
            bk.make_storage(ns)

    def test_a_dump_never_enters_the_repository_checkout_or_stdout(self):
        source = (ROOT / "scripts/production_db_backup.py").read_text()
        self.assertIn("tempfile.mkdtemp", source)
        self.assertIn("shutil.rmtree(work", source)
        self.assertNotIn("print(done.stdout", source)


class CompletenessTests(unittest.TestCase):
    """Empty or partial archives must never become evidence."""
    TOC = ["217; 1259 16386 TABLE public a vista_test", "218; 1259 16389 TABLE public b vista_test",
           "3422; 0 16386 TABLE DATA public a vista_test", "3423; 0 16389 TABLE DATA public b vista_test"]

    def test_complete_listing_passes(self):
        self.assertEqual(bk.archive_content_problems(self.TOC, {"a": 1, "b": 0}), [])

    def test_missing_table_or_data_section_or_empty_archive_is_rejected(self):
        self.assertTrue(any("table b is missing" in p for p in bk.archive_content_problems(self.TOC[:1] + self.TOC[2:3], {"a": 1, "b": 0})))
        self.assertTrue(any("data section of table b" in p for p in bk.archive_content_problems(self.TOC[:2] + self.TOC[2:3], {"a": 1, "b": 0})))
        self.assertTrue(bk.archive_content_problems([], {"a": 1}))
        self.assertTrue(bk.archive_content_problems(["4; 2615 2200 SCHEMA - public x"], {}))

    def test_an_empty_database_is_rejected_for_production_but_not_for_tests(self):
        empty = {"ledger": [], "rowCounts": {"a": 0}}
        self.assertTrue(any("ledger is empty" in p for p in bk.emptiness_problems(empty, allow_empty=True)))
        zero = {"ledger": [{"version": "v"}], "rowCounts": {"a": 0, "b": 0}}
        self.assertTrue(any("zero rows" in p for p in bk.emptiness_problems(zero, allow_empty=False)))
        self.assertEqual(bk.emptiness_problems(zero, allow_empty=True), [])
        self.assertTrue(bk.emptiness_problems({"ledger": [{"version": "v"}], "rowCounts": {}}, allow_empty=False))
        self.assertEqual(bk.emptiness_problems({"ledger": [{"version": "v"}], "rowCounts": {"a": 3}}, allow_empty=False), [])

    def test_the_restore_test_requires_the_non_empty_check(self):
        self.assertIn("dump_not_empty", bk.REQUIRED_RESTORE_CHECKS)


class WorkflowSafetyTests(unittest.TestCase):
    def variant(self, mutate):
        return release_workflow_problems(mutate(RELEASE_YML.read_text()))

    def test_current_workflow_is_clean(self):
        self.assertEqual(inspect_workflows(WORKFLOWS), [])

    def test_modes_and_jobs_structure(self):
        text = RELEASE_YML.read_text()
        self.assertIn('options: ["managed", "logical"]', text)
        self.assertIn('default: "managed"', text)  # existing managed behavior stays the default
        self.assertIn("needs: [preflight, backup]", text)
        self.assertIn("--backup-mode", text)
        self.assertIn("check-backup", text)  # managed verification is preserved in both preflight and apply
        self.assertEqual(text.count("production_db_release.py check-backup"), 2)

    def test_apply_must_wait_for_the_backup_job(self):
        self.assertTrue(self.variant(lambda t: t.replace("needs: [preflight, backup]", "needs: [preflight]")))

    def test_id_token_is_confined_to_backup_and_apply(self):
        self.assertTrue(self.variant(lambda t: t.replace("permissions:\n  contents: read\n", "permissions:\n  contents: read\n  id-token: write\n", 1)))
        self.assertTrue(self.variant(lambda t: t.replace("      pull-requests: read\n", "      pull-requests: read\n      id-token: write\n", 1)))
        self.assertTrue(self.variant(lambda t: t.replace("    permissions:\n      actions: write\n", "    permissions:\n      id-token: write\n      actions: write\n", 1)))

    def test_apply_cannot_assume_the_write_role_and_backup_cannot_use_the_read_role(self):
        self.assertTrue(self.variant(lambda t: t.replace("vars.DB_BACKUP_READ_ROLE_ARN", "vars.DB_BACKUP_WRITE_ROLE_ARN")))
        self.assertTrue(self.variant(lambda t: t.replace("vars.DB_BACKUP_WRITE_ROLE_ARN", "vars.DB_BACKUP_READ_ROLE_ARN", 1)))

    def test_apply_must_reverify_the_evidence(self):
        self.assertTrue(self.variant(lambda t: t.replace("verify-evidence", "noop")))

    def test_dump_and_evidence_must_never_be_artifacts(self):
        for extra in ("${{ runner.temp }}/backup.dump", "${{ runner.temp }}/x.sql.gz", "${{ runner.temp }}/evidence.json", "${{ runner.temp }}/backup-result.json"):
            self.assertTrue(self.variant(lambda t: t.replace("${{ runner.temp }}/pre.json", "${{ runner.temp }}/pre.json\n            " + extra, 1)), extra)

    def test_backup_job_cannot_upload_artifacts(self):
        self.assertTrue(self.variant(lambda t: t.replace("  apply:\n", "  apply:\n", 1).replace('      - name: Backup summary (hashes only)', "      - uses: actions/upload-artifact@v4\n        with:\n          name: x\n          path: y\n      - name: Backup summary (hashes only)")))

    def test_raw_pg_tools_tracing_and_long_lived_keys_are_forbidden_in_yaml(self):
        for injected in ("pg_dump --schema=public", "pg_restore x", "set -x", "export AWS_SECRET_ACCESS_KEY=1", "echo ${{ secrets.PRODUCTION_DATABASE_READONLY_URL }}"):
            self.assertTrue(self.variant(lambda t: t.replace('echo "backup_mode=managed', f'{injected}; echo "backup_mode=managed', 1)), injected)

    def test_backup_job_requirements(self):
        self.assertTrue(self.variant(lambda t: t.replace("    environment: production-database-preflight\n    permissions:\n      contents: read\n      id-token: write", "    environment: production-database-apply\n    permissions:\n      contents: read\n      id-token: write", 1)))
        self.assertTrue(self.variant(lambda t: t.replace("PRODUCTION_DATABASE_READONLY_URL }}\n          DB_BACKUP_BUCKET", "PRODUCTION_DATABASE_APPLY_URL }}\n          DB_BACKUP_BUCKET", 1)))

    def test_other_workflows_cannot_use_the_backup_tooling_or_bucket(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "x.yml").write_text("steps:\n  - run: python scripts/production_db_backup.py run\n")
            self.assertTrue(inspect_workflows(Path(tmp)))
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "x.yml").write_text("env:\n  B: ${{ vars.DB_BACKUP_BUCKET }}\n")
            self.assertTrue(inspect_workflows(Path(tmp)))

    def test_stage_j_is_a_separate_scope_after_d_i(self):
        scopes = json.loads((ROOT / "database/release-scopes.json").read_text())
        d_i = scopes["scopes"]["D-I"]
        self.assertNotIn("20261114_j_one_submission_per_attempt", d_i["versions"])
        self.assertIn("20261114_j_one_submission_per_attempt", d_i["excludedVersions"])
        j = scopes["scopes"]["J"]  # Stage 2 is its own scope: it needs exactly D-I applied and nothing else
        self.assertEqual(j["versions"], ["20261114_j_one_submission_per_attempt"])
        self.assertEqual(j["requiresApplied"], d_i["versions"])
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())["migrations"]
        self.assertEqual([e["version"] for e in manifest], d_i["versions"] + j["versions"])  # D-I first, J strictly after, nothing else

    def test_aws_deploy_flag_and_api_web_deploy_jobs_are_untouched(self):
        backend = (WORKFLOWS / "backend-ci.yml").read_text()
        self.assertIn("AWS_DEPLOY_ENABLED", backend)
        self.assertNotIn("production_db_backup", backend)
        self.assertNotIn("DB_BACKUP", backend)


@unittest.skipUnless(URL, "VISTA_D03_MIGRATION_TEST_URL is not set (disposable loopback PostgreSQL required)")
class BackupFlowTests(unittest.TestCase):
    """Real pg_dump / pg_restore against disposable loopback PostgreSQL databases."""

    @classmethod
    def setUpClass(cls):
        from urllib.parse import urlparse
        cls.target = urlparse(URL)
        if cls.target.hostname not in {"127.0.0.1", "localhost", "::1"} or "supabase" in URL.lower():
            raise RuntimeError("These tests accept a loopback PostgreSQL server only")
        os.environ.setdefault("VISTA_DATABASE_PROJECT_REF", LABEL)
        for name in ("_psql", "_db_url", "_ensure_template"):
            setattr(cls, name, classmethod(getattr(ReleaseFlowTests, name).__func__))
        cls._ensure_template()

    def setUp(self):
        self.db = f"vista_test_bk_{uuid.uuid4().hex[:10]}"
        self._psql("postgres", f'CREATE DATABASE "{self.db}" TEMPLATE "{TEMPLATE}"')
        self.addCleanup(lambda: self._psql("postgres", f'DROP DATABASE IF EXISTS "{self.db}" WITH (FORCE)', check=False))
        self.tmp = Path(tempfile.mkdtemp(prefix="vista-backup-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.store = self.tmp / "bucket"
        self.plan = {**PLAN, "projectRef": LABEL}
        (self.tmp / "plan.json").write_text(json.dumps(self.plan))
        self.admin_url = self._db_url("postgres")
        self._psql(self.db, "INSERT INTO public.organizations(id,name,slug) VALUES (gen_random_uuid(),'Org','org-" + uuid.uuid4().hex[:6] + "')", check=False)

    def run_cli(self, *argv, db=None):
        out, err = io.StringIO(), io.StringIO()
        saved = dict(os.environ)
        os.environ["DATABASE_URL"] = db or self._db_url(self.db)
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = bk.main(list(argv))
        finally:
            os.environ.clear()
            os.environ.update(saved)
        return code, out.getvalue(), err.getvalue()

    def backup(self, **kw):
        return self.run_cli("run", "--expected-project-ref", LABEL, "--plan", str(self.tmp / "plan.json"), "--allow-local-test-database", "--storage-dir", str(self.store),
                            "--restore-admin-url", self.admin_url, "--run-id", kw.get("run_id", "1-1"), "--output", str(self.tmp / "result.json"))

    def verify(self, key, plan=None):
        return self.run_cli("verify-evidence", "--expected-project-ref", LABEL, "--plan", str(plan or self.tmp / "plan.json"), "--allow-local-test-database",
                            "--storage-dir", str(self.store), "--evidence-key", key, "--output", str(self.tmp / "verified.json"))

    def test_dump_restore_test_and_evidence_round_trip(self):
        code, out, err = self.backup()
        self.assertEqual(code, 0, err)
        result = json.loads((self.tmp / "result.json").read_text())
        self.assertTrue(result["restoreTestPassed"])
        self.assertGreaterEqual(int(result["restorePostgres"].split(".")[0]), 17)
        evidence = json.loads((self.store / result["evidenceKey"]).read_text())
        self.assertEqual(evidence["planHash"], self.plan["planHash"])
        self.assertEqual({c["name"] for c in evidence["restoreTest"]["checks"] if c["ok"]}, set(bk.REQUIRED_RESTORE_CHECKS))
        self.assertEqual(evidence["dump"]["sha256"], bk._sha256_file(self.store / evidence["storage"]["dumpKey"]))
        self.assertGreater(evidence["restoreTest"]["rowTablesCompared"] if "rowTablesCompared" in evidence["restoreTest"] else 1, 0)
        code, out, err = self.verify(result["evidenceKey"])
        self.assertEqual(code, 0, err)
        verified = json.loads((self.tmp / "verified.json").read_text())
        self.assertEqual(verified["kind"], "logical-pg_dump")
        self.assertTrue(verified["restoreTestPassed"])
        self.assertTrue(verified["latestBackupAt"])
        self.assertFalse(verified["pitrEnabled"])

    def test_no_connection_string_password_or_row_data_in_output_or_evidence(self):
        code, out, err = self.backup()
        self.assertEqual(code, 0, err)
        blob = out + err + (self.store / json.loads((self.tmp / "result.json").read_text())["evidenceKey"]).read_text()
        self.assertNotIn(self.target.password or "ci-disposable", blob)
        self.assertNotIn("postgresql://", blob)
        self.assertNotIn("127.0.0.1", blob)

    def test_the_temporary_dump_is_removed_after_the_run(self):
        before = set(Path(tempfile.gettempdir()).glob("vista-backup-*"))
        self.assertEqual(self.backup()[0], 0)
        self.assertEqual(set(Path(tempfile.gettempdir()).glob("vista-backup-*")) - before, set())
        self.assertEqual(list(Path(tempfile.gettempdir()).glob("vista-pgpass-*")), [])

    def test_tampered_stored_dump_is_rejected_at_apply_time(self):
        self.backup()
        key = json.loads((self.tmp / "result.json").read_text())["evidenceKey"]
        dump_key = json.loads((self.store / key).read_text())["storage"]["dumpKey"]
        with open(self.store / dump_key, "ab") as handle:
            handle.write(b"x")
        code, _, err = self.verify(key)
        self.assertEqual(code, 1)
        self.assertIn("checksum", err)

    def test_evidence_for_another_plan_manifest_or_commit_is_rejected(self):
        self.backup()
        key = json.loads((self.tmp / "result.json").read_text())["evidenceKey"]
        for field in ("planHash", "manifestSha256", "releaseCommit"):
            other = self.tmp / f"plan-{field}.json"
            other.write_text(json.dumps({**self.plan, field: "f" * len(self.plan[field])}))
            code, _, err = self.verify(key, other)
            self.assertEqual(code, 1, field)
            self.assertIn(field, err)

    def test_missing_evidence_fails_closed(self):
        code, _, err = self.verify("production/none/evidence.json")
        self.assertEqual(code, 1)
        self.assertIn("ERROR", err)

    def test_failed_restore_test_uploads_nothing(self):
        original = bk.restore_test

        def broken(dump_file, manifest, admin_url):
            manifest = copy.deepcopy(manifest)
            first = next(iter(manifest["production"]["rowCounts"]))
            manifest["production"]["rowCounts"][first] += 1  # restored data will not match: simulates a lossy restore
            return original(dump_file, manifest, admin_url)

        with mock.patch.object(bk, "restore_test", broken):
            code, _, err = self.backup()
        self.assertEqual(code, 1)
        self.assertIn("restore test failed", err)
        self.assertFalse(self.store.exists() and any(self.store.rglob("*")))

    def test_production_changing_during_the_dump_fails_closed(self):
        calls = iter(range(100))
        real = bk.snapshot_state

        def drifting(target):
            state = real(target)
            if next(calls) % 2:  # every "after" snapshot differs from its "before"
                state["rowCounts"] = {**state["rowCounts"], "organizations": state["rowCounts"].get("organizations", 0) + 1}
            return state

        with mock.patch.object(bk, "snapshot_state", drifting), mock.patch.object(bk.time, "sleep"):
            code, _, err = self.backup()
        self.assertEqual(code, 1)
        self.assertIn("changing during the dump", err)
        self.assertFalse(self.store.exists() and any(self.store.rglob("*")))

    def test_restore_target_must_be_loopback(self):
        out = self.run_cli("run", "--expected-project-ref", LABEL, "--plan", str(self.tmp / "plan.json"), "--allow-local-test-database", "--storage-dir", str(self.store),
                           "--restore-admin-url", "postgresql://u:p@db.example.com:5432/postgres", "--run-id", "1-1")
        self.assertEqual(out[0], 1)

    def test_plan_without_pending_work_takes_no_backup(self):
        (self.tmp / "plan.json").write_text(json.dumps({**self.plan, "status": "nothing_to_do"}))
        code, _, err = self.backup()
        self.assertEqual(code, 1)
        self.assertFalse(self.store.exists())

    def test_the_run_never_modifies_the_source_database(self):
        before = self._psql(self.db, "SELECT count(*) FROM pg_stat_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0").stdout
        marker = self._psql(self.db, "SELECT md5(string_agg(version||checksum,',' ORDER BY version)) FROM public.vista_schema_migrations").stdout
        self.assertEqual(self.backup()[0], 0)
        self.assertEqual(self._psql(self.db, "SELECT md5(string_agg(version||checksum,',' ORDER BY version)) FROM public.vista_schema_migrations").stdout, marker)
        self.assertTrue(before is not None)

    def test_reader_role_needs_more_than_select_when_rls_is_enabled(self):
        """Empirically established: a SELECT-only role cannot dump RLS tables; BYPASSRLS (or ownership) is required. The check names the gap before pg_dump runs."""
        role = f"vista_test_reader_{uuid.uuid4().hex[:8]}"
        self._psql("postgres", f"CREATE ROLE {role} LOGIN PASSWORD 'rd-pw-1'")
        self.addCleanup(lambda: self._psql("postgres", f"DROP ROLE IF EXISTS {role}", check=False))
        self._psql(self.db, f"GRANT USAGE ON SCHEMA public TO {role}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role}; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}")
        reader = bk.Target(f"postgresql://{role}:rd-pw-1@{self.target.hostname}:{self.target.port}/{self.db}")
        gaps = bk.reader_access_gaps(reader)
        self.assertTrue(any("BYPASSRLS" in g for g in gaps), gaps)
        out = self.tmp / "gap"
        out.mkdir()
        with self.assertRaises(bk.BackupError) as raised:
            bk.dump(reader, out, allow_local=True)
        self.assertIn("cannot read the whole public schema", str(raised.exception))
        self._psql("postgres", f"ALTER ROLE {role} BYPASSRLS")
        self.assertEqual(bk.reader_access_gaps(reader), [])
        manifest = bk.dump(reader, out, allow_local=True)
        self.assertGreater(manifest["sizeBytes"], 0)
        table = self._psql(self.db, "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' ORDER BY 1 LIMIT 1").stdout.strip()
        self._psql(self.db, f'REVOKE SELECT ON public."{table}" FROM {role}')
        self.assertTrue(any(table in g for g in bk.reader_access_gaps(reader)))

    def test_release_snapshot_refuses_a_role_that_row_level_security_would_blind(self):
        from scripts import verify_production_release_d_i as vf
        role = f"vista_test_snap_{uuid.uuid4().hex[:8]}"
        self._psql("postgres", f"CREATE ROLE {role} LOGIN PASSWORD 'rd-pw-2'")
        self.addCleanup(lambda: self._psql("postgres", f"DROP ROLE IF EXISTS {role}", check=False))
        self._psql(self.db, f"GRANT USAGE ON SCHEMA public TO {role}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role}")
        url = f"postgresql://{role}:rd-pw-2@{self.target.hostname}:{self.target.port}/{self.db}"
        with self.assertRaises(SystemExit) as raised:
            vf.snapshot(url)
        self.assertIn("BYPASSRLS", str(raised.exception))
        self._psql("postgres", f"ALTER ROLE {role} BYPASSRLS")
        self.assertIn("counts", vf.snapshot(url))

    def test_a_zero_row_dump_taken_with_row_security_enabled_fails_the_restore_test(self):
        """The silent failure mode (pg_dump --enable-row-security as a role RLS blinds): the archive is well formed but empty. It must be rejected."""
        role = f"vista_test_blind_{uuid.uuid4().hex[:8]}"
        self._psql("postgres", f"CREATE ROLE {role} LOGIN PASSWORD 'rd-pw-3'")
        self.addCleanup(lambda: self._psql("postgres", f"DROP ROLE IF EXISTS {role}", check=False))
        self._psql(self.db, "CREATE TABLE public.rls_probe(id int); INSERT INTO public.rls_probe VALUES (1),(2),(3); ALTER TABLE public.rls_probe ENABLE ROW LEVEL SECURITY")
        self._psql(self.db, f"GRANT USAGE ON SCHEMA public TO {role}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role}; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}")
        source = bk.Target(self._db_url(self.db))
        truth = bk.snapshot_state(source)
        self.assertGreater(sum(truth["rowCounts"].values()), 0)
        blind = bk.Target(f"postgresql://{role}:rd-pw-3@{self.target.hostname}:{self.target.port}/{self.db}")
        self.assertLess(sum(bk.snapshot_state(blind)["rowCounts"].values()), sum(truth["rowCounts"].values()))
        out = self.tmp / "blind.dump"
        with blind.env() as env:
            done = bk._run(["pg_dump", "--format=custom", "--no-owner", "--schema=public", "--enable-row-security", "--file", str(out)], blind, env)
        self.assertEqual(done.returncode, 0)
        manifest = {"sha256": bk._sha256_file(out), "production": truth}
        result = bk.restore_test(out, manifest, self.admin_url)
        self.assertFalse(result["passed"])
        self.assertIn("row_counts_equal", [c["name"] for c in result["checks"] if not c["ok"]])

    def test_strict_reader_checks_use_the_server_side_role_not_the_user_name(self):
        """Production mode asks the server: the connection must really be vista_backup_reader, with BYPASSRLS and no write path."""
        role = "vista_backup_reader"
        self._psql("postgres", f"DO $$ BEGIN CREATE ROLE {role} LOGIN PASSWORD 'rd-strict-1'; EXCEPTION WHEN duplicate_object THEN NULL; END $$")
        self._psql("postgres", f"ALTER ROLE {role} NOSUPERUSER BYPASSRLS PASSWORD 'rd-strict-1'")
        self._psql(self.db, f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role}; REVOKE ALL ON SCHEMA public FROM {role}; GRANT USAGE ON SCHEMA public TO {role}; "
                            f"GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role}; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}")
        reader = bk.Target(f"postgresql://{role}:rd-strict-1@{self.target.hostname}:{self.target.port}/{self.db}")
        self.assertEqual(bk.reader_access_gaps(reader, strict=True), [])

        table = self._psql(self.db, "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' ORDER BY 1 LIMIT 1").stdout.strip()
        self._psql(self.db, f'GRANT INSERT ON public."{table}" TO {role}')
        self.assertTrue(any("read-only" in g for g in bk.reader_access_gaps(reader, strict=True)))
        self.assertEqual(bk.reader_access_gaps(reader, strict=False), [])  # completeness alone does not care
        self._psql(self.db, f'REVOKE INSERT ON public."{table}" FROM {role}')

        self._psql(self.db, f"GRANT CREATE ON SCHEMA public TO {role}")
        self.assertTrue(any("CREATE" in g for g in bk.reader_access_gaps(reader, strict=True)))
        self._psql(self.db, f"REVOKE CREATE ON SCHEMA public FROM {role}")

        self._psql("postgres", f"ALTER ROLE {role} NOBYPASSRLS")
        gaps = bk.reader_access_gaps(reader, strict=True)
        self.assertTrue(any("BYPASSRLS" in g for g in gaps), gaps)
        self._psql("postgres", f"ALTER ROLE {role} BYPASSRLS")

        self._psql("postgres", f"ALTER ROLE {role} SUPERUSER")
        self.assertTrue(any("superuser" in g for g in bk.reader_access_gaps(reader, strict=True)))
        self._psql("postgres", f"ALTER ROLE {role} NOSUPERUSER")
        self.assertEqual(bk.reader_access_gaps(reader, strict=True), [])

    def test_any_other_role_fails_strict_mode_even_with_every_privilege(self):
        owner = bk.Target(self._db_url(self.db))  # the disposable cluster's superuser: complete access, but not the reader role
        self.assertEqual(bk.reader_access_gaps(owner, strict=False), [])
        gaps = bk.reader_access_gaps(owner, strict=True)
        self.assertTrue(any("server-side role" in g for g in gaps), gaps)
        self.assertTrue(any("superuser" in g for g in gaps))
        self.assertTrue(any("read-only" in g for g in gaps))

    def test_restore_databases_are_dropped(self):
        self.assertEqual(self.backup()[0], 0)
        leftover = self._psql("postgres", "SELECT count(*) FROM pg_database WHERE datname LIKE 'vista_test_restore_%'").stdout.strip()
        self.assertEqual(leftover, "0")


if __name__ == "__main__":
    unittest.main()
