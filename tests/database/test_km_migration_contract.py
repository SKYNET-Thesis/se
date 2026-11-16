"""Static fail-closed contracts for K-M; PostgreSQL behavior is covered separately."""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class KmMigrationContractTests(unittest.TestCase):
    def test_k_keeps_author_and_publish_separate_and_requires_canonical_roles(self):
        sql = (ROOT / "database/migrations/20261116_k_course_authoring_capabilities.sql").read_text()
        self.assertIn("Required canonical RBAC roles are missing", sql)
        self.assertIn("learning.course.author", sql)
        self.assertIn("does not grant publishing", sql)
        self.assertIn("learning.course.publish", sql)
        self.assertIn("r.code IN ('instructor', 'school_admin')", sql)
        self.assertIn("r.code = 'instructor'", sql)
        self.assertIn("r.code <> 'instructor'", sql)
        self.assertNotIn("INSERT INTO public.roles", sql)

    def test_l_has_explicit_submission_file_allowlist_and_no_public_grant(self):
        sql = (ROOT / "database/migrations/20261116_l_runtime_role.sql").read_text()
        self.assertIn("'learning_submission_files'", sql)
        self.assertIn("REVOKE ALL PRIVILEGES ON ALL TABLES", sql)
        self.assertIn("CREATE POLICY vista_app_runtime_backend_access", sql)
        self.assertIn("Future public tables are denied by default", sql)
        self.assertNotRegex(sql, r"(?im)^\s*GRANT\s+[^;]+\s+TO\s+PUBLIC")

    def test_m_fails_closed_and_documents_platform_roles_and_recovery(self):
        sql = (ROOT / "database/migrations/20261116_m_revoke_public_temp_privilege.sql").read_text()
        for role in ("postgres", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin", "authenticator", "anon", "authenticated", "service_role"):
            self.assertIn(f"'{role}'", sql)
        self.assertIn("REVOKE TEMPORARY ON DATABASE", sql)
        self.assertIn("postflight failed", sql)
        self.assertIn("GRANT TEMPORARY ON DATABASE <db> TO PUBLIC", sql)
        self.assertIn("production-BLOCKED", sql)
        verifier = (ROOT / "scripts/verify_production_release_km.py").read_text()
        self.assertIn("database owner retains TEMP", verifier)
        self.assertIn("platform roles retain TEMP", verifier)

    def test_release_scope_requires_j_and_km_is_production_blocked(self):
        scopes = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]
        km, j = scopes["K-M"], scopes["J"]
        self.assertNotIn("20261114_j_one_submission_per_attempt", km["versions"])  # K-M never applies J itself
        self.assertEqual(km["requiresApplied"], j["requiresApplied"] + j["versions"])  # but J must already be applied
        self.assertIn("BLOCKED", km["productionStatus"])
        self.assertEqual(km["expectedCatalogBefore"], j["expectedCatalogAfter"])


if __name__ == "__main__":
    unittest.main()
