"""Scope T-U (rubric level descriptors + staff first-login state): the postflight verifier against a real bootstrapped database (baseline + the whole manifest),
the rules it enforces, and the UPGRADE / compatibility behaviour of the two migrations on a schema that has the old shape and legacy data.
Needs VISTA_BOOTSTRAP_VERIFY_DATABASE_URL (the strict runner treats a skip as a failure). Every deliberate violation is reverted in `finally`; the upgrade
test runs entirely inside one transaction that is rolled back."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import verify_production_release_tu as tu

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("VISTA_BOOTSTRAP_VERIFY_DATABASE_URL")
T_SQL = ROOT / "database/migrations/20261128_t_rubric_level_descriptors.sql"
U_SQL = ROOT / "database/migrations/20261128_u_staff_password_change_required.sql"
ROLLBACK = """
ALTER TABLE public.learning_assessment_scores DROP CONSTRAINT IF EXISTS learning_assessment_scores_level_range;
ALTER TABLE public.learning_assessment_scores DROP COLUMN IF EXISTS level;
ALTER TABLE public.learning_rubric_criteria DROP CONSTRAINT IF EXISTS learning_rubric_criteria_descriptors_shape;
ALTER TABLE public.learning_rubric_criteria DROP COLUMN IF EXISTS descriptors;
ALTER TABLE public.users DROP COLUMN IF EXISTS temporary_password_expires_at, DROP COLUMN IF EXISTS password_changed_at, DROP COLUMN IF EXISTS password_change_required;
"""


class StaticTests(unittest.TestCase):
    def test_scope_t_u_is_reviewed_not_approved_pinned_and_has_a_registered_verifier(self):
        scopes = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())
        pins = {e["version"]: e["sha256"] for e in manifest["migrations"]}
        t = scopes["T-U"]
        self.assertEqual(t["versions"], ["20261128_t_rubric_level_descriptors", "20261128_u_staff_password_change_required"])
        self.assertEqual(t["requiresApplied"], scopes["S"]["requiresApplied"] + scopes["S"]["versions"])
        self.assertTrue(t["productionStatus"].startswith("PROPOSED, NOT APPROVED"))
        self.assertEqual({v: pins[v] for v in t["versions"]}, t["sha256"])
        self.assertEqual(t["expectedCatalogBefore"], t["expectedCatalogAfter"])                                # additive columns only
        self.assertEqual(t["excludedVersions"], ["20261116_m_revoke_public_temp_privilege"])
        self.assertEqual(t["verifier"], "tu")
        self.assertIn("T-U", (ROOT / ".github/workflows/production-database-release.yml").read_text())
        self.assertIn("verify_production_release_tu", (ROOT / "scripts/production_db_release.py").read_text())
        for name in ("20261128_t_rubric_level_descriptors.sql", "20261128_u_staff_password_change_required.sql"):
            self.assertFalse((ROOT / "database/staged-migrations" / name).exists())                            # promoted, not duplicated
        registered = [e["version"] for e in manifest["migrations"]]
        self.assertEqual(registered[-2:], t["versions"])

    def test_the_sql_is_additive_idempotent_and_transaction_free(self):
        for path in (T_SQL, U_SQL):
            text = path.read_text()
            for forbidden in ("DROP TABLE", "DELETE FROM", "TRUNCATE", "UPDATE public.", "INSERT INTO", "GRANT ", "REVOKE ", "CREATE POLICY", "CREATE TRIGGER", "CREATE TABLE"):
                self.assertNotIn(forbidden, "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("--")), f"{path.name}: {forbidden}")
            self.assertIn("IF NOT EXISTS", text)
            self.assertNotIn("\nBEGIN;", text); self.assertNotIn("\nCOMMIT;", text)                            # the runner owns the transaction


@unittest.skipUnless(URL, "requires a bootstrapped loopback vista_test_* database (whole manifest applied)")
class TuVerifierOnBootstrappedDatabaseTests(unittest.TestCase):
    def psql(self, sql: str, check: bool = True, file: Path | None = None):
        args = ["psql", URL.split("?")[0], "-X", "-q", "-v", "ON_ERROR_STOP=1"] + (["-f", str(file)] if file else ["-c", sql])
        done = subprocess.run(args, capture_output=True, text=True, env={**{k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG")}, "PGSSLMODE": "disable"})
        if check:
            self.assertEqual(done.returncode, 0, done.stderr[:300])
        return done

    def pre(self) -> dict:
        snap = tu.snapshot(URL)
        snap["ledger"] = [v for v in snap["ledger"] if v not in tu.VERSIONS]
        return snap

    def failed(self, pre: dict) -> list[str]:
        return [name for name, ok, _ in tu.verify(URL, pre, root=ROOT) if not ok]

    def test_every_check_passes_on_the_released_schema(self):
        self.assertEqual(self.failed(self.pre()), [])

    def test_a_restricted_user_a_written_descriptor_and_a_dropped_check_are_detected_and_reverted(self):
        pre = self.pre()
        self.psql("INSERT INTO public.users(email,full_name,status,signup_method,password_change_required) VALUES('tu-probe@example.test','Probe','active','admin_created',true)")
        try:
            self.assertTrue(any("nobody is forced" in n or "no user is restricted" in n for n in self.failed(pre)))
        finally:
            self.psql("DELETE FROM public.users WHERE email='tu-probe@example.test'")
        self.psql("ALTER TABLE public.learning_assessment_scores DROP CONSTRAINT learning_assessment_scores_level_range")
        try:
            self.assertTrue(any("level_range" in n for n in self.failed(pre)))
        finally:
            self.psql("ALTER TABLE public.learning_assessment_scores ADD CONSTRAINT learning_assessment_scores_level_range CHECK (level IS NULL OR level BETWEEN 0 AND 4)")
        self.assertEqual(self.failed(pre), [])

    def test_the_release_never_writes(self):
        before = tu.snapshot(URL)
        self.assertEqual(self.failed(self.pre()), [])
        self.assertEqual(tu.snapshot(URL)["counts"], before["counts"])

    def test_upgrade_from_the_old_shape_with_legacy_data_is_additive_idempotent_and_reversible(self):
        """Inside ONE rolled-back transaction: drop the five columns (the pre-T/U shape), add a legacy user, apply T then U twice, check the legacy row, the defaults,
        the constraints, what an OLD API statement (explicit column lists, no new columns) can still do, then run the documented rollback and re-apply."""
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / "upgrade.sql"
            script.write_text(f"""BEGIN;
{ROLLBACK}
INSERT INTO public.users(email,full_name,status,signup_method) VALUES('legacy-user@example.test','Legacy','active','admin_created');
\\i {T_SQL}
\\i {U_SQL}
\\i {T_SQL}
\\i {U_SQL}
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.users WHERE email='legacy-user@example.test' AND password_change_required=false AND password_changed_at IS NULL AND temporary_password_expires_at IS NULL AND full_name='Legacy' AND status='active';
  IF n <> 1 THEN RAISE EXCEPTION 'legacy user changed by the upgrade'; END IF;
  -- an old API statement: explicit column list, no new columns
  INSERT INTO public.users(email,full_name,status,signup_method) VALUES('old-api@example.test','Old API','invited','admin_created');
  SELECT count(*) INTO n FROM public.users WHERE email='old-api@example.test' AND password_change_required=false;
  IF n <> 1 THEN RAISE EXCEPTION 'old API insert not defaulted'; END IF;
  SELECT count(*) INTO n FROM public.learning_rubric_criteria WHERE descriptors IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'descriptors backfilled'; END IF;
  BEGIN
    UPDATE public.learning_rubric_criteria SET descriptors='["a","b","c"]'::jsonb WHERE id IN (SELECT id FROM public.learning_rubric_criteria LIMIT 1);
    IF FOUND THEN RAISE EXCEPTION 'three descriptors must be rejected'; END IF;
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
{ROLLBACK}
\\i {T_SQL}
\\i {U_SQL}
ROLLBACK;
""")
            self.psql("", file=script)
        self.assertEqual(self.failed(self.pre()), [])          # the rolled-back transaction left the shared database untouched


if __name__ == "__main__":
    unittest.main()
