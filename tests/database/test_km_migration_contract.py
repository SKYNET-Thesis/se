"""Static fail-closed contracts for K-L (released scope) and the staged migration M; PostgreSQL behavior is covered separately."""

import hashlib
import json
import re
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
        # hosted-compatible revision: privilege changes only in the application schema, and a fail-closed assertion for everything else
        self.assertIn("WHERE nspname = 'public'", sql)
        self.assertNotIn("NOT IN ('pg_catalog','information_schema')", sql)
        self.assertIn("holds explicit privileges outside schema public", sql)
        code = "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("--"))  # the header comment explains the incident and names them
        self.assertNotRegex(code, r"(?i)(pgbouncer|vault|supabase_)")  # executable SQL never names platform-managed objects
        self.assertRegex(sql, r"(?is)NOLOGIN|LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE\s+NOINHERIT NOREPLICATION NOBYPASSRLS")
        self.assertIn("CREATE POLICY vista_app_runtime_backend_access", sql)
        self.assertIn("Future public tables are denied by default", sql)
        self.assertNotRegex(sql, r"(?im)^\s*GRANT\s+[^;]+\s+TO\s+PUBLIC")

    def test_m_fails_closed_and_documents_platform_roles_and_recovery(self):
        sql = (ROOT / "database/staged-migrations/20261116_m_revoke_public_temp_privilege.sql").read_text()
        for role in ("postgres", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin", "authenticator", "anon", "authenticated", "service_role"):
            self.assertIn(f"'{role}'", sql)
        self.assertIn("REVOKE TEMPORARY ON DATABASE", sql)
        self.assertIn("postflight failed", sql)
        self.assertIn("GRANT TEMPORARY ON DATABASE <db> TO PUBLIC", sql)
        self.assertIn("production-BLOCKED", sql)
        verifier = (ROOT / "scripts/verify_production_release_km.py").read_text()
        self.assertIn("database owner retains TEMP", verifier)
        self.assertIn("platform roles retain TEMP", verifier)

    def test_release_scopes_k_l_and_m_are_separate_ordered_and_production_blocked(self):
        scopes = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]
        self.assertNotIn("K-M", scopes)  # the composite scope no longer exists: K-L now, M separately
        kl, m, j = scopes["K-L"], scopes["M"], scopes["J"]
        self.assertEqual(kl["versions"], ["20261116_k_course_authoring_capabilities", "20261116_l_runtime_role"])  # K before L
        self.assertEqual(kl["requiresApplied"], j["requiresApplied"] + j["versions"])  # J stays a hard prerequisite and is never applied here
        self.assertEqual(kl["excludedVersions"], ["20261116_m_revoke_public_temp_privilege"])  # M must be absent from manifest, migrations dir and ledger
        self.assertEqual(kl["verifier"], "kl")
        self.assertIn("residualRisk", kl)  # PUBLIC TEMP stays an explicitly tracked residual risk
        self.assertTrue(kl["productionStatus"].startswith("READY"))
        self.assertEqual(kl["expectedCatalogBefore"], j["expectedCatalogAfter"])
        self.assertEqual(m["versions"], ["20261116_m_revoke_public_temp_privilege"])
        self.assertEqual(m["requiresApplied"], kl["requiresApplied"] + kl["versions"])  # M requires K-L applied first
        self.assertIn("BLOCKED", m["productionStatus"])

    def test_manifest_ends_with_n_after_l_and_m_is_staged_byte_identical_and_never_manifested(self):
        manifest = json.loads((ROOT / "database/migrations/manifest.json").read_text())["migrations"]
        versions = [e["version"] for e in manifest]
        self.assertEqual(versions[-3:], ["20261116_k_course_authoring_capabilities", "20261116_l_runtime_role", "20261118_n_student_password_change_required"])  # N (additive student columns) follows L; M stays staged
        self.assertNotIn("20261116_m_revoke_public_temp_privilege", versions)
        self.assertFalse((ROOT / "database/migrations/20261116_m_revoke_public_temp_privilege.sql").exists())  # not in the manifest directory either
        staged = (ROOT / "database/staged-migrations/20261116_m_revoke_public_temp_privilege.sql").read_bytes()
        # the bytes that were reviewed for K-M: moving the file must never edit it
        self.assertEqual(hashlib.sha256(staged).hexdigest(), "80619e7d76e86db4eb29a819d3b9003e0684161c248a2a9b47a411b51bc39f38")
        scopes = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]
        self.assertEqual(scopes["M"]["sha256"]["20261116_m_revoke_public_temp_privilege"], hashlib.sha256(staged).hexdigest())
        pins = {e["version"]: e["sha256"] for e in manifest}
        for version, checksum in scopes["K-L"]["sha256"].items():
            self.assertEqual(pins[version], checksum)  # the scope pins exactly what the manifest pins

    def test_kl_verifier_reports_deferred_temp_explicitly_instead_of_skipping_it(self):
        km = (ROOT / "scripts/verify_production_release_km.py").read_text()
        for text in ("staged migration M is NOT applied", "PUBLIC TEMP unchanged from the pre-release state", "residual risk tracked",
                     "runtime role holds no explicit privilege outside schema public", "audit_logs is insert-only for the runtime role",
                     "runtime role has privileges only on the frozen table allowlist"):
            self.assertIn(text, km)
        kl = (ROOT / "scripts/verify_production_release_kl.py").read_text()
        self.assertIn('scope_name=SCOPE', kl)
        self.assertIn('SCOPE = "K-L"', kl)

    def test_runtime_grant_verifier_covers_exact_full_table_sequence_and_function_acl(self):
        verifier = (ROOT / "scripts/verify_production_release_km.py").read_text()
        for text in ("runtime_expected_table_privileges", "runtime_grants_sql", "table_missing_or_extra_privileges",
                     "sequence_missing_or_extra_privileges", "function_grants_outside_allowlist",
                     "complete table allowlist has exactly the required privileges",
                     "complete sequence allowlist has exactly the required privileges", "runtime role owns no database objects",
                     "runtime role has no role memberships", "runtime role is NOINHERIT and LOGIN"):
            self.assertIn(text, verifier)
        from scripts import verify_production_release_km as km
        self.assertEqual(km.runtime_sequence_allowlist(ROOT), {"learning_experiment_events_id_seq"})
        self.assertIn("learning_submission_files", km.runtime_allowlist(ROOT))

    def test_kl_rollback_script_is_explicit_scoped_and_never_edits_the_ledger(self):
        sql = (ROOT / "docs/operations/sql/k-l-rollback.sql").read_text()
        code = "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("--"))
        self.assertIn("c.relkind IN ('r','p','v','m','f')", code)  # sequences use the separate REVOKE ALL ON ALL SEQUENCES statement
        self.assertIn("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public", code)
        self.assertNotRegex(code, r"(?i)DROP OWNED BY")  # refused to the apply role on PostgreSQL 17
        self.assertNotRegex(code, r"(?i)vista_schema_migrations|TRUNCATE|DROP (TABLE|SCHEMA|DATABASE)")  # no ledger edits, no data loss
        self.assertEqual(len(re.findall(r"(?i)DROP ROLE", code)), 1)
        self.assertIn("DROP ROLE vista_app_runtime", code)
        self.assertIn("still owns objects or holds privileges; refusing to drop it", code)
        self.assertIn("learning.course.author", code)
        self.assertNotIn("learning.course.%", code)  # only the two exact K permission codes

    def test_hosted_blocked_scopes_cannot_be_unblocked_by_metadata(self):
        source = (ROOT / "scripts/production_db_release.py").read_text()
        self.assertRegex(source, r'HOSTED_BLOCKED_SCOPES = \("M",\)')
        self.assertIn("cannot be unblocked by release metadata", source)
        self.assertIn("is marked production BLOCKED", source)


if __name__ == "__main__":
    unittest.main()


class HostedBlockedScopesRefuseBeforeAnyConnectionTests(unittest.TestCase):
    """plan / snapshot / apply for K-L and M against a hosted-looking target must stop in code BEFORE any database connection is attempted."""

    HOSTED = "postgresql://vista_backup_reader.ovijutkvaaxohauvuxbj:never-used@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

    def run_main(self, argv):
        import contextlib
        import io
        import os
        from unittest import mock
        from scripts import production_db_release as prm
        err = io.StringIO()
        with mock.patch.dict(os.environ, {"DATABASE_URL": self.HOSTED, "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co"}), \
                mock.patch("subprocess.run", side_effect=AssertionError("a database connection (psql) was attempted")), \
                mock.patch("urllib.request.urlopen", side_effect=AssertionError("a network request was attempted")), \
                contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            code = prm.main(argv)
        return code, err.getvalue()

    def test_plan_snapshot_and_apply_are_refused_for_k_l_and_m(self):
        for scope in ("M",):
            for argv in (["plan", "--scope", scope], ["snapshot", "--scope", scope, "--output", "/tmp/never.json"],
                         ["apply", "--scope", scope, "--plan", "/tmp/none.json", "--backup-evidence", "/tmp/none2.json", "--approval-reference", "X", "--operator-id", "x"]):
                with self.subTest(scope=scope, command=argv[0]):
                    code, err = self.run_main([*argv[:1], "--expected-project-ref", "ovijutkvaaxohauvuxbj", *argv[1:]])
                    self.assertEqual(code, 1)  # any connection attempt would have raised AssertionError from the mocks instead
                    if argv[0] != "apply":  # apply reads its local evidence files first (missing here); the blocked check precedes its first connection
                        self.assertIn("is marked production BLOCKED", err)

    def test_the_old_composite_scope_is_unknown_and_unreviewed_scopes_are_refused(self):
        code, err = self.run_main(["plan", "--expected-project-ref", "ovijutkvaaxohauvuxbj", "--scope", "K-M"])
        self.assertEqual(code, 1)
        self.assertIn("is not defined", err)
