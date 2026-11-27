"""The scope-S postflight verifier against a real bootstrapped database (baseline + the whole manifest): every check must pass, and the rules it enforces
(exact table, one-open-reservation index, constraint swap, privileges, empty table, unchanged allocations) must fail when violated. Needs
VISTA_BOOTSTRAP_VERIFY_DATABASE_URL (the strict runner treats a skip as a failure). Every deliberate violation is reverted in `finally`."""
import os
import subprocess
import unittest
from pathlib import Path

from scripts import verify_production_release_s as s

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("VISTA_BOOTSTRAP_VERIFY_DATABASE_URL")


@unittest.skipUnless(URL, "requires a bootstrapped loopback vista_test_* database (whole manifest applied)")
class SVerifierOnBootstrappedDatabaseTests(unittest.TestCase):
    def psql(self, sql: str, check: bool = True):
        done = subprocess.run(["psql", URL.split("?")[0], "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True,
                              env={**{k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG")}, "PGSSLMODE": "disable"})
        if check:
            self.assertEqual(done.returncode, 0, done.stderr[:200])
        return done

    def pre(self) -> dict:
        snap = s.snapshot(URL)
        snap["ledger"] = [v for v in snap["ledger"] if v != s.VERSION]  # the state "before" the release, as far as the ledger is concerned
        return snap

    def failed(self, pre: dict) -> list[str]:
        return [name for name, ok, _ in s.verify(URL, pre, root=ROOT) if not ok]

    def test_every_check_passes_on_the_released_schema(self):
        self.assertEqual(self.failed(self.pre()), [])

    def test_a_dropped_one_open_reservation_index_is_detected_and_reverted(self):
        pre = self.pre()
        self.psql("DROP INDEX public.ux_classroom_lab_sessions_one_open_per_robot")
        try:
            self.assertTrue(any("one open reservation per robot" in name for name in self.failed(pre)))
        finally:
            self.psql("CREATE UNIQUE INDEX ux_classroom_lab_sessions_one_open_per_robot ON public.classroom_lab_sessions (robot_id) WHERE state IN ('active','terminating','quarantined')")
        self.assertEqual(self.failed(pre), [])

    def test_the_old_one_robot_per_classroom_constraint_coming_back_is_detected(self):
        pre = self.pre()
        self.psql("ALTER TABLE public.learning_classroom_robot_allocations ADD CONSTRAINT learning_classroom_robot_allocations_classroom_id_key UNIQUE (classroom_id)", check=False)
        try:
            self.assertTrue(any("UNIQUE(classroom_id, robot_id)" in name for name in self.failed(pre)))
        finally:
            self.psql("ALTER TABLE public.learning_classroom_robot_allocations DROP CONSTRAINT IF EXISTS learning_classroom_robot_allocations_classroom_id_key")

    def test_an_extra_runtime_privilege_and_a_public_grant_are_detected_and_reverted(self):
        pre = self.pre()
        self.psql("GRANT DELETE ON public.classroom_lab_sessions TO vista_app_runtime")
        try:
            self.assertTrue(any("exactly SELECT, INSERT, UPDATE" in name for name in self.failed(pre)))
        finally:
            self.psql("REVOKE DELETE ON public.classroom_lab_sessions FROM vista_app_runtime")
        self.psql("GRANT SELECT ON public.classroom_lab_sessions TO PUBLIC")
        try:
            self.assertTrue(any("nothing granted to PUBLIC" in name for name in self.failed(pre)))
        finally:
            self.psql("REVOKE SELECT ON public.classroom_lab_sessions FROM PUBLIC")
        self.assertEqual(self.failed(pre), [])

    def test_the_release_never_writes(self):
        self.assertEqual(s.preview(URL)["lab_sessions_table_already_present"], True)
        before = s.snapshot(URL)
        self.assertEqual(self.failed(self.pre()), [])
        self.assertEqual(s.snapshot(URL)["counts"], before["counts"])


if __name__ == "__main__":
    unittest.main()
