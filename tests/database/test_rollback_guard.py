"""Rollback guard: once migration S (Classroom Lab Session / many-to-many allocation) is applied, a pre-S API image must not be redeployed."""
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import production_db_release as release  # noqa: E402


def run(facts):
    with mock.patch.object(release, "_env_for", return_value={"DATABASE_URL": "postgresql://x"}), mock.patch.object(release, "_check_target", return_value="ref"), \
         mock.patch.object(release, "_require_reader_access"), mock.patch.object(release, "_server_json", return_value=json.dumps(facts)):
        return release.rollback_guard(mock.Mock())


class RollbackGuardTests(unittest.TestCase):
    def test_rollback_is_allowed_before_migration_s(self):
        self.assertEqual(run({"lab_sessions_table": False, "multi_robot_classrooms": 0, "open_lab_sessions": 0})["status"], "rollback-allowed")

    def test_rollback_is_blocked_after_migration_s_even_without_many_to_many_data(self):
        with self.assertRaisesRegex(release.ReleaseError, "blocked: migration S is applied"):
            run({"lab_sessions_table": True, "multi_robot_classrooms": 0, "open_lab_sessions": 0})

    def test_the_message_reports_the_data_that_makes_the_old_api_unsafe(self):
        with self.assertRaisesRegex(release.ReleaseError, r"2 classroom\(s\) hold several robots, 1 Lab Session"):
            run({"lab_sessions_table": True, "multi_robot_classrooms": 2, "open_lab_sessions": 1})


if __name__ == "__main__":
    unittest.main()
