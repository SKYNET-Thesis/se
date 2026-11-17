"""Isolated test path for the STAGED migration M: it runs against a disposable database that received M through
scripts/apply_staged_migration_to_test_database.py (never a release). M's postflight checks must all pass there, and nothing may have been recorded in the ledger.
Needs VISTA_STAGED_M_DATABASE_URL; run with: python scripts/run_database_safety_tests.py --start-directory tests/database_staged"""
import os
import unittest
from pathlib import Path

from scripts import verify_production_release_d_i as base
from scripts import verify_production_release_km as km

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("VISTA_STAGED_M_DATABASE_URL")
KL_VERSIONS = ["20261116_k_course_authoring_capabilities", "20261116_l_runtime_role"]


@unittest.skipUnless(URL, "requires a disposable database after staged migration M was applied")
class StagedMigrationMTests(unittest.TestCase):
    def test_m_postflight_checks_all_pass_on_the_staged_database(self):
        ledger = base.query(URL, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
        pre = {"ledger": ledger, "inventory": km.inventory(URL), "preview": {"public_has_temp": True}}
        results = km.verify(URL, pre, root=ROOT, scope_name="M", staged=True)
        self.assertEqual([(n, d) for n, ok, d in results if not ok], [])
        names = [n for n, _, _ in results]
        self.assertIn("TEMP is no longer inherited from PUBLIC", names)
        self.assertIn("staged application wrote no ledger row (M is not recorded as released)", names)

    def test_staged_application_never_marks_m_as_released(self):
        ledger = base.query(URL, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
        self.assertNotIn("20261116_m_revoke_public_temp_privilege", ledger)
        self.assertEqual([v for v in ledger if v.startswith("20261116")], KL_VERSIONS)


if __name__ == "__main__":
    unittest.main()
