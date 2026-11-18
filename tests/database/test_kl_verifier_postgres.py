"""The K-L postflight verifier against a real bootstrapped database (baseline + D-L, migration M NOT applied): every check must pass and the
residual PUBLIC TEMP risk must be reported, not hidden. Needs VISTA_BOOTSTRAP_VERIFY_DATABASE_URL (the strict runner treats a skip as a failure)."""
import json
import os
import subprocess
import unittest
from pathlib import Path

from scripts import verify_production_release_d_i as base
from scripts import verify_production_release_km as km
from scripts import verify_production_release_kl as kl

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("VISTA_BOOTSTRAP_VERIFY_DATABASE_URL")
KL_VERSIONS = ["20261116_k_course_authoring_capabilities", "20261116_l_runtime_role"]


@unittest.skipUnless(URL, "requires a bootstrapped loopback vista_test_* database (K-L state, M not applied)")
class KlVerifierOnBootstrappedDatabaseTests(unittest.TestCase):
    def pre_release_snapshot(self) -> dict:
        ledger = base.query(URL, "SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json)::text FROM public.vista_schema_migrations")
        return {"ledger": [v for v in ledger if v not in KL_VERSIONS], "inventory": km.inventory(URL), "preview": km.preview(URL)}

    def test_every_kl_check_passes_and_deferred_temp_is_explicit(self):
        results = kl.verify(URL, self.pre_release_snapshot(), root=ROOT)
        failed = [(name, detail) for name, ok, detail in results if not ok]
        self.assertEqual(failed, [])
        names = [name for name, _, _ in results]
        self.assertIn("staged migration M is NOT applied (not in the ledger)", names)
        self.assertTrue(any(n.startswith("PUBLIC TEMP unchanged from the pre-release state") for n in names))
        self.assertIn("runtime role holds no explicit privilege outside schema public (platform schemas untouched)", names)
        self.assertIn("audit_logs is insert-only for the runtime role (no SELECT)", names)
        self.assertIn("runtime role can use exactly the allowlisted sequence(s) and no other sequence (effective privileges)", names)
        self.assertIn("runtime role holds no explicit EXECUTE (or other) privilege on any function", names)
        self.assertIn("runtime role cannot create in the database or in any non-public schema (effective privileges)", names)
        self.assertIn("complete table allowlist has exactly the required privileges", names)
        self.assertIn("complete sequence allowlist has exactly the required privileges", names)
        self.assertIn("runtime role has no function EXECUTE grants", names)
        self.assertIn("runtime role owns no database objects", names)
        self.assertIn("runtime role has no role memberships", names)
        self.assertFalse(any("TEMP is no longer inherited" in n for n in names))  # the M-only assertion must not be silently reused for K-L

    def test_a_changed_public_temp_state_fails_the_kl_verifier(self):
        pre = self.pre_release_snapshot()
        pre["preview"] = {**pre["preview"], "public_has_temp": not pre["preview"]["public_has_temp"]}
        failed = [name for name, ok, _ in kl.verify(URL, pre, root=ROOT) if not ok]
        self.assertTrue(any(n.startswith("PUBLIC TEMP unchanged") for n in failed), failed)

    def test_the_m_scope_verifier_would_reject_the_kl_state(self):
        # M's own postflight demands TEMP revoked; on a K-L database it must FAIL, proving K-L cannot be mistaken for M-complete
        pre = self.pre_release_snapshot()
        results = km.verify(URL, pre, root=ROOT, scope_name="M", staged=True)
        failed = [name for name, ok, _ in results if not ok]
        self.assertTrue(any("TEMP is no longer inherited" in n or "cannot create or use temporary tables" in n for n in failed), failed)


    # -- over-privilege detection: grant something extra to the runtime role, expect exactly that check to fail, always revert --------------------------
    def psql(self, sql: str) -> None:
        done = subprocess.run(["psql", URL.split("?")[0], "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True,
                              env={**{k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG")}, "PGSSLMODE": "disable"})
        self.assertEqual(done.returncode, 0, done.stderr.replace(URL, "<url>"))

    def failing_checks_with(self, grant: str, revert: str) -> list[str]:
        pre = self.pre_release_snapshot()
        self.psql(grant)
        try:
            return [name for name, ok, _ in kl.verify(URL, pre, root=ROOT) if not ok]
        finally:
            self.psql(revert)

    def test_extra_table_sequence_function_schema_and_role_privileges_are_each_detected(self):
        cases = {
            "table outside the allowlist": ("GRANT SELECT ON public.api_keys TO vista_app_runtime", "REVOKE ALL ON public.api_keys FROM vista_app_runtime",
                                            ("has privileges only on the frozen table allowlist", "has no access to api_keys")),
            "audit_logs readable": ("GRANT SELECT ON public.audit_logs TO vista_app_runtime", "REVOKE SELECT ON public.audit_logs FROM vista_app_runtime", ("audit_logs is insert-only",)),
            "extra sequence": ("CREATE SEQUENCE public.zz_probe_seq; GRANT USAGE ON SEQUENCE public.zz_probe_seq TO vista_app_runtime", "DROP SEQUENCE public.zz_probe_seq",
                               ("exactly the allowlisted sequence",)),
            "explicit function grant": ("GRANT EXECUTE ON FUNCTION public.set_updated_at() TO vista_app_runtime", "REVOKE ALL ON FUNCTION public.set_updated_at() FROM vista_app_runtime",
                                        ("no explicit EXECUTE",)),
            "platform schema usage": ("CREATE SCHEMA vault; GRANT USAGE ON SCHEMA vault TO vista_app_runtime", "DROP SCHEMA vault CASCADE", ("platform/sensitive schemas", "no explicit privilege outside schema public")),
            "database create": (f"GRANT CREATE ON DATABASE {URL.split('/')[-1].split('?')[0]} TO vista_app_runtime", f"REVOKE CREATE ON DATABASE {URL.split('/')[-1].split('?')[0]} FROM vista_app_runtime", ("cannot create in the database",)),
            "role membership": ("GRANT pg_monitor TO vista_app_runtime", "REVOKE pg_monitor FROM vista_app_runtime", ("not a member of any role",)),
        }
        for name, (grant, revert, expected) in cases.items():
            with self.subTest(name):
                failed = self.failing_checks_with(grant, revert)
                for fragment in expected:
                    self.assertTrue(any(fragment in f for f in failed), f"{name}: expected a failing check containing {fragment!r}, got {failed}")
        self.assertEqual([n for n, ok, _ in kl.verify(URL, self.pre_release_snapshot(), root=ROOT) if not ok], [], "the database must be restored to the clean K-L state")


if __name__ == "__main__":
    unittest.main()
