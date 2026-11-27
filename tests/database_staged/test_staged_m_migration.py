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

    def _failed_checks(self):
        ledger = base.query(URL, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
        pre = {"ledger": ledger, "inventory": km.inventory(URL), "preview": {"public_has_temp": True}}
        return [n for n, ok, _ in km.verify(URL, pre, root=ROOT, scope_name="M", staged=True) if not ok]

    def _with_statement(self, statement: str, undo: str):
        base.query(URL, "SELECT 1")  # connectivity
        import subprocess
        def run(sql):
            subprocess.run(["psql", URL, "-v", "ON_ERROR_STOP=1", "-qc", sql], check=True, capture_output=True)
        run(statement)
        try:
            return self._failed_checks()
        finally:
            run(undo)

    def _extension_present(self):
        return bool(km.present_staged_extension(URL, ROOT))

    def test_staged_device_tables_are_verified_with_their_exact_grants_not_waved_through(self):
        if not self._extension_present():  # M-only database: apply the staged R through the same guarded disposable-database script (idempotent)
            import subprocess, sys
            subprocess.run([sys.executable, str(ROOT / "scripts/apply_staged_migration_to_test_database.py"), "--database-url", URL, str(ROOT / "database/staged-migrations/20261120_r_device_provisioning.sql")], check=True, capture_output=True, cwd=ROOT)
        self.assertEqual(km.staged_extension_privileges(ROOT)["robot_devices"], {"SELECT", "INSERT", "UPDATE"})
        # an extra privilege on a device table must fail the exact-grant check
        failed = self._with_statement("GRANT DELETE ON public.robot_devices TO vista_app_runtime", "REVOKE DELETE ON public.robot_devices FROM vista_app_runtime")
        self.assertIn("complete table allowlist has exactly the required privileges", failed)
        # a missing privilege too
        failed = self._with_statement("REVOKE UPDATE ON public.device_enrollment_challenges FROM vista_app_runtime", "GRANT UPDATE ON public.device_enrollment_challenges TO vista_app_runtime")
        self.assertIn("complete table allowlist has exactly the required privileges", failed)
        # exposure to PostgREST roles or disabled RLS must fail
        failed = self._with_statement("ALTER TABLE public.robot_devices DISABLE ROW LEVEL SECURITY", "ALTER TABLE public.robot_devices ENABLE ROW LEVEL SECURITY")
        self.assertIn("staged additive tables have RLS enabled and no PUBLIC/anon/authenticated privilege", failed)
        failed = self._with_statement("GRANT SELECT ON public.robot_devices TO PUBLIC", "REVOKE SELECT ON public.robot_devices FROM PUBLIC")
        self.assertIn("staged additive tables have RLS enabled and no PUBLIC/anon/authenticated privilege", failed)
        self.assertEqual(self._failed_checks(), [])

    def test_the_production_path_still_rejects_unknown_tables(self):
        import inspect
        source = inspect.getsource(km.verify)
        self.assertIn("present_staged_extension(url, root) if staged else {}", source)  # only the disposable staged path may extend the frozen allowlist

    def test_staged_application_never_marks_m_as_released(self):
        ledger = base.query(URL, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
        self.assertNotIn("20261116_m_revoke_public_temp_privilege", ledger)
        self.assertEqual([v for v in ledger if v.startswith("20261116")], KL_VERSIONS)


if __name__ == "__main__":
    unittest.main()
