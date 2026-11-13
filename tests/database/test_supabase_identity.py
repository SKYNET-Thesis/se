"""Role + project identity of hosted-Supabase connections (scripts/supabase_identity.py and its four call sites).

Pure unit tests: nothing connects anywhere, every URL below is a dummy. The checks run before any connection is attempted.
"""

from __future__ import annotations

import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from scripts import production_db_backup as bk  # noqa: E402
from scripts import production_db_release as prm  # noqa: E402
from scripts import sql_migration_runner as runner  # noqa: E402
from scripts import supabase_identity as ident  # noqa: E402
from scripts import verify_production_release_d_i as vf  # noqa: E402

REF = ident.PRODUCTION_REF
OTHER = "abcdefghijklmnopqrst"
POOLER = "aws-0-ap-southeast-1.pooler.supabase.com"
DIRECT = f"db.{REF}.supabase.co"
PW = "s3cr3t-Pa55word"
SUPABASE_URL = f"https://{REF}.supabase.co"


def url(user: str, host: str = POOLER, password: str = PW, port: int = 5432) -> str:
    return f"postgresql://{user}:{password}@{host}:{port}/postgres?sslmode=require"


READER_POOLER = url(f"{ident.ROLE_READ}.{REF}")
APPLY_POOLER = url(f"{ident.ROLE_APPLY}.{REF}")
READER_DIRECT = url(ident.ROLE_READ, DIRECT)
APPLY_DIRECT = url(ident.ROLE_APPLY, DIRECT)


class RoleTableTests(unittest.TestCase):
    def test_roles_are_fixed_and_disjoint(self):
        self.assertEqual(ident.OPERATION_ROLES["apply"], frozenset({"postgres"}))
        self.assertEqual(ident.OPERATION_ROLES["read"], frozenset({"vista_backup_reader"}))
        self.assertFalse(ident.OPERATION_ROLES["apply"] & ident.OPERATION_ROLES["read"])
        self.assertEqual(set(ident.OPERATION_ROLES), {"apply", "read"})


class HelperTests(unittest.TestCase):
    def ok(self, host, user, op):
        return ident.validate_hosted_role(host, user, REF, op)

    def bad(self, host, user, op="read", ref=REF):
        with self.assertRaises(ident.IdentityError) as raised:
            ident.validate_hosted_role(host, user, ref, op)
        return str(raised.exception)

    def test_correct_roles_and_projects_are_accepted(self):
        self.assertEqual(self.ok(POOLER, f"vista_backup_reader.{REF}", "read"), "vista_backup_reader")
        self.assertEqual(self.ok(POOLER, f"postgres.{REF}", "apply"), "postgres")
        self.assertEqual(self.ok(DIRECT, "vista_backup_reader", "read"), "vista_backup_reader")
        self.assertEqual(self.ok(DIRECT, "postgres", "apply"), "postgres")
        self.assertEqual(self.ok(POOLER.upper(), f"postgres.{REF}", "apply"), "postgres")  # host names are case-insensitive

    def test_each_role_is_rejected_for_the_other_operation(self):
        for host, reader, owner in ((POOLER, f"vista_backup_reader.{REF}", f"postgres.{REF}"), (DIRECT, "vista_backup_reader", "postgres")):
            self.assertIn("not permitted", self.bad(host, owner, "read"))
            self.assertIn("not permitted", self.bad(host, reader, "apply"))

    def test_arbitrary_and_look_alike_roles_are_rejected(self):
        for role in ("admin", "service_role", "authenticator", "supabase_admin", "postgres_", "Postgres", "vista_backup_reader2", "vista_backup_writer",
                     "pg_read_all_data", "anon"):
            for op in ("read", "apply"):
                self.bad(POOLER, f"{role}.{REF}", op)
                self.bad(DIRECT, role, op)

    def test_wrong_or_missing_project_reference_is_rejected(self):
        for user in (f"vista_backup_reader.{OTHER}", "vista_backup_reader", f"vista_backup_reader.{REF}x", f"vista_backup_reader.{REF[:-1]}",
                     f"vista_backup_reader.{REF.upper()}", f"vista_backup_reader.{REF}.extra", f"vista_backup_reader.{REF}.", f".{REF}", f"vista_backup_reader..{REF}"):
            self.bad(POOLER, user)
        self.bad(f"db.{OTHER}.supabase.co", "vista_backup_reader")
        self.bad(POOLER, f"vista_backup_reader.{REF}", "read", ref=OTHER)
        self.bad(POOLER, f"vista_backup_reader.{REF}", "read", ref="")
        self.bad(POOLER, f"vista_backup_reader.{REF}", "read", ref="UPPER")

    def test_malformed_user_names_are_rejected(self):
        for user in ("", " ", f" vista_backup_reader.{REF}", f"vista_backup_reader.{REF} ", f"vista_backup_reader.{REF}\n", f"vista_backup_reader.{REF}\x00",
                     f"vista_backup_reader.{REF}@evil", f"vista_backup_reader:{REF}", f"vista_backup_reader/{REF}", "vista_backup_reader%2e" + REF,
                     f"VISTA_BACKUP_READER.{REF}", f"vista-backup-reader.{REF}", f"1vista.{REF}", "x" * 80 + f".{REF}"):
            self.bad(POOLER, user)
        for user in ("", " postgres", "postgres\n", "postgres.extra", "Postgres", "vista_backup_reader "):
            self.bad(DIRECT, user, "apply")

    def test_only_supabase_hosts_are_accepted(self):
        user = f"vista_backup_reader.{REF}"
        for host in ("", "localhost", "127.0.0.1", "example.com", "db.example.com", f"{POOLER}.evil.com", f"evil{POOLER}x.com", "pooler.supabase.com",
                     f".pooler.supabase.com", f"a.b.pooler.supabase.com", f"db.{REF}.supabase.co.evil.com", f"evil.{REF}.supabase.co", f"db.{REF}.supabase.com",
                     f"{REF}.supabase.com", "10.0.0.5"):
            self.bad(host, user)

    def test_unknown_operations_are_rejected(self):
        for op in ("", "write", "admin", "READ", "backup", None):
            with self.assertRaises(ident.IdentityError):
                ident.validate_hosted_role(POOLER, f"vista_backup_reader.{REF}", REF, op)  # type: ignore[arg-type]

    def test_error_messages_never_echo_the_input(self):
        needles = ("secretrole", OTHER, "evilhost", "evil.example")
        cases = [(POOLER, f"secretrole.{REF}", "read", REF), (POOLER, f"vista_backup_reader.{OTHER}", "read", REF), ("evilhost.example.com", "secretrole", "read", REF),
                 (POOLER, "secretrole", "read", REF), (DIRECT, "secretrole", "apply", REF), (f"db.{OTHER}.supabase.co", "vista_backup_reader", "read", REF),
                 ("evil.example", f"secretrole.{REF}", "read", REF)]
        for host, user, op, ref in cases:
            with self.assertRaises(ident.IdentityError) as raised:
                ident.validate_hosted_role(host, user, ref, op)
            text = str(raised.exception)
            for needle in needles:
                self.assertNotIn(needle, text)


class RunnerTests(unittest.TestCase):
    def env(self, database_url, supabase_url=SUPABASE_URL):
        return {"DATABASE_URL": database_url, "SUPABASE_URL": supabase_url}

    def test_apply_default_accepts_only_the_owner_role(self):
        for good in (APPLY_POOLER, APPLY_DIRECT):
            runner.validate_project_identity(self.env(good), REF)
            runner.validate_project_identity(self.env(good), REF, "apply")
        for bad in (READER_POOLER, READER_DIRECT, url(f"service_role.{REF}"), url(f"postgres.{OTHER}"), url("postgres", POOLER), url(f"postgres.{REF}", "evil.example.com")):
            with self.assertRaises(runner.RunnerError, msg=bad):
                runner.validate_project_identity(self.env(bad), REF)

    def test_read_accepts_only_the_reader_role(self):
        for good in (READER_POOLER, READER_DIRECT):
            runner.validate_project_identity(self.env(good), REF, "read")
        for bad in (APPLY_POOLER, APPLY_DIRECT, url(f"vista_backup_reader.{OTHER}"), url("vista_backup_reader", POOLER)):
            with self.assertRaises(runner.RunnerError, msg=bad):
                runner.validate_project_identity(self.env(bad), REF, "read")

    def test_supabase_url_must_match_and_expected_ref_is_exact(self):
        other_url = f"https://{OTHER}.supabase.co"
        for op, good in (("read", READER_POOLER), ("apply", APPLY_POOLER), ("read", READER_DIRECT), ("apply", APPLY_DIRECT)):
            with self.assertRaises(runner.RunnerError):
                runner.validate_project_identity(self.env(good, other_url), REF, op)
            with self.assertRaises(runner.RunnerError):
                runner.validate_project_identity(self.env(good), OTHER, op)
            with self.assertRaises(runner.RunnerError):  # a missing SUPABASE_URL is not an identity
                runner.validate_project_identity({"DATABASE_URL": good}, REF, op)

    def test_malformed_urls_and_https_url_shapes_are_rejected(self):
        for bad in ("", "not a url", "mysql://u:p@x/db", "postgresql://", f"postgresql://:{PW}@{POOLER}/postgres", f"postgresql://postgres.{REF}@{POOLER}/",
                    READER_POOLER + "&options=-c%20role%3Dpostgres", f"postgresql://vista_backup_reader.{REF}:{PW}@{POOLER}:99999/postgres"):
            with self.assertRaises(runner.RunnerError, msg=bad):
                runner.validate_project_identity(self.env(bad), REF, "read")
        for bad_supabase in (f"postgresql://x@db.{REF}.supabase.co/postgres", f"http://{REF}.supabase.co", "https://example.com"):
            with self.assertRaises(runner.RunnerError):
                runner.validate_project_identity(self.env(READER_POOLER, bad_supabase), REF, "read")

    def test_percent_encoded_user_is_decoded_before_the_check(self):
        encoded_ok = url(f"vista_backup_reader%2E{REF}")  # %2E == "." -> the real <role>.<ref> form
        runner.validate_project_identity(self.env(encoded_ok), REF, "read")
        with self.assertRaises(runner.RunnerError):
            runner.validate_project_identity(self.env(url(f"vista_backup_reader%2E{REF}%0A")), REF, "read")

    def test_errors_do_not_leak_credentials(self):
        for bad in (url(f"secretrole.{REF}"), url(f"postgres.{OTHER}"), url(f"vista_backup_reader.{REF}", "evilhost.example.com")):
            with self.assertRaises(runner.RunnerError) as raised:
                runner.validate_project_identity(self.env(bad), REF, "read")
            text = str(raised.exception)
            for needle in (PW, "secretrole", "evilhost", "postgresql://"):
                self.assertNotIn(needle, text)


class ReleaseScriptTests(unittest.TestCase):
    def args(self, **over):
        return SimpleNamespace(**{"expected_project_ref": REF, "allow_local_test_database": False, **over})

    def check(self, database_url, op, **over):
        return prm._check_target(self.args(**over), {"DATABASE_URL": database_url}, op)

    def test_operation_selects_the_role(self):
        self.assertEqual(self.check(READER_POOLER, "read"), REF)
        self.assertEqual(self.check(APPLY_POOLER, "apply"), REF)
        for bad_url, op in ((APPLY_POOLER, "read"), (APPLY_DIRECT, "read"), (READER_POOLER, "apply"), (READER_DIRECT, "apply"), (url("postgres", POOLER), "apply"),
                            (url(f"anything.{REF}"), "read"), (url(f"anything.{REF}"), "apply")):
            with self.assertRaises(prm.ReleaseError, msg=f"{bad_url} {op}"):
                self.check(bad_url, op)

    def test_project_loopback_and_malformed_rules_still_apply(self):
        for bad in (url(f"vista_backup_reader.{OTHER}"), "postgresql://vista_test:p@127.0.0.1:5432/vista_test_x", "garbage", ""):
            with self.assertRaises(prm.ReleaseError):
                self.check(bad, "read")
        with self.assertRaises(prm.ReleaseError):
            self.check(READER_POOLER, "read", expected_project_ref=OTHER)

    def test_cli_snapshot_refuses_the_owner_role_before_connecting(self):
        out, err = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"DATABASE_URL": APPLY_POOLER, "SUPABASE_URL": SUPABASE_URL}), \
                mock.patch.object(prm.verifier, "snapshot", side_effect=AssertionError("must not connect")), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = prm.main(["snapshot", "--expected-project-ref", REF, "--output", str(Path(tmp) / "pre.json")])
        self.assertNotEqual(code, 0)
        for needle in (PW, "postgresql://", REF + ":"):
            self.assertNotIn(needle, out.getvalue() + err.getvalue())

    def test_cli_compat_refuses_the_owner_role(self):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"DATABASE_URL": APPLY_DIRECT, "SUPABASE_URL": SUPABASE_URL}), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = prm.main(["compat", "--expected-project-ref", REF])
        self.assertNotEqual(code, 0)
        self.assertNotIn(PW, out.getvalue() + err.getvalue())

    def test_apply_path_refuses_the_reader_role(self):
        env = {"DATABASE_URL": READER_POOLER, "SUPABASE_URL": SUPABASE_URL}
        with mock.patch.dict(os.environ, env):
            with self.assertRaises(prm.ReleaseError):
                prm.build_plan(self.args(scope="D-I", repo_root=str(ROOT)), "apply")


class BackupScriptTests(unittest.TestCase):
    def target(self, database_url):
        return bk.Target(database_url)

    def test_backup_accepts_only_the_reader_role(self):
        bk.check_target(self.target(READER_POOLER), REF, False)
        bk.check_target(self.target(READER_DIRECT), REF, False)
        for bad in (APPLY_POOLER, APPLY_DIRECT, url(f"vista_backup_reader.{OTHER}"), url(f"service_role.{REF}"), url("vista_backup_reader", POOLER),
                    url(f"vista_backup_reader.{REF}", "evil.example.com"), url(f"vista_backup_reader.{REF}", "127.0.0.1")):
            with self.assertRaises(bk.BackupError, msg=bad):
                bk.check_target(self.target(bad), REF, False)

    def test_backup_rejects_another_project_reference(self):
        with self.assertRaises(bk.BackupError):
            bk.check_target(self.target(READER_POOLER), OTHER, False)

    def test_malformed_urls_fail_closed(self):
        for bad in ("", "garbage", "postgresql://", "postgresql://:pw@host/db", f"postgresql://vista_backup_reader.{REF}@/db"):
            with self.assertRaises(bk.BackupError, msg=bad):
                bk.check_target(self.target(bad), REF, False)

    def test_errors_do_not_leak_credentials(self):
        for bad in (APPLY_POOLER, url(f"secretrole.{REF}"), url(f"vista_backup_reader.{REF}", "evilhost.example.com")):
            with self.assertRaises(bk.BackupError) as raised:
                bk.check_target(self.target(bad), REF, False)
            text = str(raised.exception)
            for needle in (PW, "secretrole", "evilhost", "postgresql://"):
                self.assertNotIn(needle, text)
            self.assertNotIn(PW, bk._scrub(text, *self.target(bad).secrets()))

    def test_cli_refuses_the_owner_role_without_touching_the_network(self):
        plan = {"status": "ready", "projectRef": REF, "scope": "D-I", "planHash": "1" * 64, "manifestSha256": "2" * 64, "releaseCommit": "3" * 40, "sourceCommit": "4" * 40}
        out, err = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            plan_file = Path(tmp) / "plan.json"
            plan_file.write_text(__import__("json").dumps(plan))
            with mock.patch.dict(os.environ, {"DATABASE_URL": APPLY_POOLER}), mock.patch.object(bk, "dump", side_effect=AssertionError("must not dump")), \
                    contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = bk.main(["run", "--expected-project-ref", REF, "--plan", str(plan_file), "--restore-admin-url", "postgresql://u:p@127.0.0.1:5432/postgres", "--run-id", "1-1"])
        self.assertEqual(code, 1)
        for needle in (PW, "postgresql://", "aws-0-ap-southeast-1"):
            self.assertNotIn(needle, out.getvalue() + err.getvalue())


class VerifierTests(unittest.TestCase):
    def test_snapshot_is_a_read_operation_and_verify_an_apply_operation(self):
        vf._identity(READER_POOLER, "read")
        vf._identity(APPLY_POOLER, "apply")
        vf._identity(READER_DIRECT, "read")
        for bad_url, op in ((APPLY_POOLER, "read"), (READER_POOLER, "apply"), (url(f"vista_backup_reader.{OTHER}"), "read"), (url(f"postgres.{OTHER}"), "apply"),
                            (url("vista_backup_reader", "example.com"), "read"), ("garbage", "read"), ("", "apply")):
            with self.assertRaises(SystemExit, msg=f"{bad_url} {op}"):
                vf._identity(bad_url, op)

    def test_loopback_test_databases_remain_allowed_only_as_vista_test(self):
        vf._identity("postgresql://u:p@127.0.0.1:5432/vista_test_x", "read")
        with self.assertRaises(SystemExit):
            vf._identity("postgresql://u:p@127.0.0.1:5432/production", "read")

    def test_cli_picks_the_operation_from_the_mode(self):
        for argv, database_url in ((["--snapshot", "x.json"], APPLY_POOLER), (["--verify", "x.json"], READER_POOLER)):
            with mock.patch.object(sys, "argv", ["verify"] + argv), mock.patch.dict(os.environ, {"DATABASE_URL": database_url}):
                with self.assertRaises(SystemExit) as raised:
                    vf.main()
                self.assertNotIn(PW, str(raised.exception.code))
                self.assertIn("approved", str(raised.exception.code))

GOOD_INFO = {"currentUser": ident.ROLE_READ, "superuser": False, "bypassRls": True, "schemaUsage": True, "createInPublic": False, "memberOfOwnerRole": False,
             "noSelect": [], "noSequenceRead": [], "writable": [], "rlsBlocked": []}


class ServerSideRoleChecksTests(unittest.TestCase):
    """The user name only selects a credential; these checks are about what the server says the connection actually is."""

    def gaps(self, strict=True, **over):
        return ident.reader_access_gaps({**GOOD_INFO, **over}, strict=strict)

    def test_a_proper_reader_has_no_gaps(self):
        self.assertEqual(self.gaps(), [])
        self.assertEqual(self.gaps(strict=False), [])

    def test_every_defect_is_reported_in_strict_mode(self):
        for over, needle in (({"currentUser": "postgres"}, "not vista_backup_reader"), ({"currentUser": None}, "not vista_backup_reader"), ({"bypassRls": False}, "BYPASSRLS"),
                             ({"superuser": True}, "superuser"), ({"createInPublic": True}, "CREATE"), ({"memberOfOwnerRole": True}, "member of the owner"),
                             ({"writable": ["users"]}, "read-only"), ({"schemaUsage": False}, "USAGE"), ({"noSelect": ["t1"]}, "SELECT on tables"),
                             ({"noSequenceRead": ["s1"]}, "sequences"), ({"rlsBlocked": ["t1"]}, "row-level-security")):
            self.assertTrue(any(needle in g for g in self.gaps(**over)), over)

    def test_the_owner_role_is_never_an_acceptable_reader(self):
        owner = {"currentUser": "postgres", "writable": ["users", "learning_courses"], "createInPublic": True, "bypassRls": True}
        self.assertGreaterEqual(len(self.gaps(**owner)), 3)

    def test_test_databases_only_need_completeness(self):
        self.assertEqual(self.gaps(strict=False, currentUser="vista_test", superuser=True, writable=["x"], createInPublic=True), [])
        self.assertTrue(self.gaps(strict=False, noSelect=["x"]))

    def test_the_server_reported_role_is_not_echoed(self):
        for gap in self.gaps(currentUser="secretrole", writable=["secretrole"]):
            self.assertNotIn("secretrole", gap.replace("(e.g. secretrole)", ""))


class ReleaseServerChecksTests(unittest.TestCase):
    def args(self, **over):
        return SimpleNamespace(**{"expected_project_ref": REF, "allow_local_test_database": False, "scope": "D-I", "repo_root": str(ROOT), **over})

    def test_read_access_requires_the_real_reader_role(self):
        env = {"DATABASE_URL": READER_POOLER}
        with mock.patch.object(prm, "_server_json", return_value=GOOD_INFO):
            prm._require_reader_access(self.args(), env)
        for over in ({"currentUser": "postgres"}, {"bypassRls": False}, {"writable": ["users"]}, {"rlsBlocked": ["users"]}):
            with mock.patch.object(prm, "_server_json", return_value={**GOOD_INFO, **over}), self.assertRaises(prm.ReleaseError, msg=str(over)):
                prm._require_reader_access(self.args(), env)

    def test_local_test_databases_skip_the_server_checks(self):
        with mock.patch.object(prm, "_server_json", side_effect=AssertionError("must not query")):
            prm._require_reader_access(self.args(allow_local_test_database=True), {})
            prm._require_apply_role(self.args(allow_local_test_database=True), {})

    def test_apply_requires_the_real_owner_role(self):
        with mock.patch.object(prm, "_server_json", return_value={"role": "postgres"}):
            prm._require_apply_role(self.args(), {})
        for role in ("vista_backup_reader", "service_role", None):
            with mock.patch.object(prm, "_server_json", return_value={"role": role}), self.assertRaises(prm.ReleaseError):
                prm._require_apply_role(self.args(), {})

    def test_a_failing_role_query_fails_closed_without_leaking(self):
        with mock.patch.object(prm.verifier, "query", side_effect=SystemExit("query failed: <url>")), self.assertRaises(prm.ReleaseError) as raised:
            prm._require_reader_access(self.args(), {"DATABASE_URL": READER_POOLER})
        self.assertNotIn(PW, str(raised.exception))

    def test_every_read_entry_point_runs_the_reader_check_and_apply_runs_the_apply_check(self):
        env = {"DATABASE_URL": READER_POOLER, "SUPABASE_URL": SUPABASE_URL}
        for command, argv in (("compat", ["compat", "--expected-project-ref", REF]), ("snapshot", ["snapshot", "--expected-project-ref", REF, "--output", "/nonexistent/x.json"])):
            with mock.patch.dict(os.environ, env), mock.patch.object(prm, "_require_reader_access", side_effect=prm.ReleaseError("blind role")) as guard, \
                    mock.patch.object(prm.verifier, "snapshot", side_effect=AssertionError("must not read data")), \
                    contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertNotEqual(prm.main(argv), 0, command)
            guard.assert_called_once()
        calls = []

        def stop(label):
            def fail(*_args):
                calls.append(label)
                raise prm.ReleaseError("stop")
            return fail

        for operation, database_url in (("read", READER_POOLER), ("apply", APPLY_POOLER)):
            with mock.patch.dict(os.environ, {"DATABASE_URL": database_url, "SUPABASE_URL": SUPABASE_URL}), \
                    mock.patch.object(prm, "_require_reader_access", side_effect=stop("read")), mock.patch.object(prm, "_require_apply_role", side_effect=stop("apply")):
                with self.assertRaises(prm.ReleaseError):
                    prm.build_plan(self.args(), operation)
        self.assertEqual(calls, ["read", "apply"])


if __name__ == "__main__":
    unittest.main()
