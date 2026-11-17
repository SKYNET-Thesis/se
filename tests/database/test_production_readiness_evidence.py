"""Hosted readiness evidence: SELECT-only, redacted (booleans/counts), fail-closed. Logic is tested without a database; one test runs it for real."""
import json
import os
import re
import unittest
from pathlib import Path
from unittest import mock

from scripts import production_readiness_evidence as ev
from scripts.check_database_workflow_safety import evidence_workflow_problems, inspect_workflows

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("VISTA_BOOTSTRAP_VERIFY_DATABASE_URL")
SCOPES = json.loads((ROOT / "database/release-scopes.json").read_text())["scopes"]
MANIFEST = {e["version"]: e["sha256"] for e in json.loads((ROOT / "database/migrations/manifest.json").read_text())["migrations"]}
D_J = SCOPES["K-L"]["requiresApplied"]


def healthy_raw() -> dict:
    before = SCOPES["K-L"]["expectedCatalogBefore"]
    raw = {k: 0 for k in ev.INTEGER_KEYS}
    raw.update({k: False for k in ev.BOOLEAN_KEYS})
    raw.update({"database_owner_is_apply_role": True, "apply_role_exists_and_cannot_be_superuser": True, "apply_role_can_create_roles": True, "reader_role_exists": True,
                "runtime_role_safe_if_present": True, "public_has_temp": True, "database_owner_has_temp": True,
                "rbac_roles_present": 3, "ledger_rows": len(D_J), "ledger_versions": list(D_J), "ledger_checksums": {v: MANIFEST[v] for v in D_J},
                "catalog_tables": before["tables"], "catalog_rls_enabled": before["rls_enabled"], "catalog_policies": before["policies"],
                "catalog_triggers": before["triggers"], "catalog_functions": before["functions"]})
    return raw


class EvidenceLogicTests(unittest.TestCase):
    def test_the_expected_production_state_has_no_blocking_finding(self):
        result = ev.evaluate(healthy_raw(), ROOT)
        self.assertEqual(result["blocking"], [])
        self.assertEqual(result["status"], "complete")
        self.assertTrue(all(result["checks"].values()))

    def test_each_blocking_condition_is_detected(self):
        cases = {
            "database_owner_is_apply_role": {"database_owner_is_apply_role": False},
            "apply_role_is_not_superuser": {"apply_role_exists_and_cannot_be_superuser": False},
            "reader_role_exists": {"reader_role_exists": False},
            "canonical_rbac_roles_present": {"rbac_roles_present": 2},
            "authoring_permissions_not_yet_present": {"authoring_permissions_present": 1},
            "runtime_role_absent_or_safe": {"runtime_role_exists": True, "runtime_role_safe_if_present": False},
            "runtime_role_has_no_privileges_outside_public": {"runtime_role_holds_explicit_privileges_outside_public": 1},
            "runtime_role_has_no_memberships": {"runtime_role_memberships": 1},
            "runtime_role_owns_no_objects": {"runtime_role_owned_objects": 1},
            "runtime_role_has_no_inherited_role_access": {"runtime_role_inherited_access_outside_public": 1},
            "runtime_role_has_no_function_execute_grants": {"runtime_role_function_execute_count": 1},
            "runtime_role_has_no_public_object_access_before_release": {"runtime_role_public_table_effective_privilege_count": 1},
            "apply_role_can_use_every_schema": {"apply_role_schemas_without_usage": 1},
            "apply_role_holds_a_privilege_on_every_public_object": {"apply_role_public_objects_without_privilege": 1},
            "catalog_matches_the_scope_before_state": {"catalog_tables": 1},
            "ledger_is_exactly_d_to_j": {"ledger_versions": list(D_J)[:-1]},
            "k_and_l_not_yet_applied": {"ledger_versions": list(D_J) + [SCOPES["K-L"]["versions"][0]]},
            "m_not_applied": {"ledger_versions": list(D_J) + [SCOPES["M"]["versions"][0]]},
            "d_to_j_checksums_match_manifest": {"ledger_checksums": {**healthy_raw()["ledger_checksums"], D_J[0]: "0" * 64}},
        }
        for name, change in cases.items():
            with self.subTest(name):
                self.assertIn(name, ev.evaluate({**healthy_raw(), **change}, ROOT)["blocking"])

    def test_platform_gaps_and_temp_dependencies_are_informational_not_blocking(self):
        raw = {**healthy_raw(), "apply_role_platform_objects_without_privilege": 3, "roles_relying_on_public_temp_not_in_m_allowlist": 5, "reader_role_relies_on_public_temp": True}
        result = ev.evaluate(raw, ROOT)
        self.assertEqual(result["blocking"], [])  # revised L touches only `public`; the facts are reported for the M decision
        self.assertEqual(result["informational"]["roles_that_would_lose_temp_if_m_were_released"], 5)
        self.assertTrue(result["informational"]["reader_role_would_lose_temp_if_m_were_released"])

    def test_the_result_is_redacted_booleans_counts_and_identifiers_only(self):
        result = ev.evaluate({**healthy_raw(), "ledger_checksums": {"a": "secretish"}}, ROOT)
        ev.assert_redacted(result)
        text = json.dumps(result)
        for forbidden in ("vista_app_runtime", "vista_backup_reader", "postgres", "supabase_", "pgbouncer", "vault", "password", "postgresql://"):
            self.assertNotIn(forbidden, text)
        with self.assertRaises(ev.EvidenceIncomplete):
            ev.assert_redacted({"status": "complete", "free text": True})
        with self.assertRaises(ev.EvidenceIncomplete):
            ev.assert_redacted({"checks": {"x": 1.5}})
        with self.assertRaises(ev.EvidenceIncomplete):
            ev.assert_redacted({"blocking": ["a role name with spaces"]})

    def test_incomplete_or_malformed_evidence_fails_closed(self):
        good = healthy_raw()
        for mutate in (lambda r: r.pop("catalog_tables"), lambda r: r.update(extra=1), lambda r: r.update(public_has_temp="yes"), lambda r: r.update(ledger_rows=True),
                       lambda r: r.update(database_owner_is_apply_role=None)):
            raw = json.loads(json.dumps(good))
            mutate(raw)
            with mock.patch.object(ev.base, "query", return_value=raw), self.assertRaises(ev.EvidenceIncomplete):
                ev.collect("postgresql://x/y")
        with mock.patch.object(ev.base, "query", side_effect=SystemExit("query failed: boom")), self.assertRaises(ev.EvidenceIncomplete):
            ev.collect("postgresql://x/y")
        with mock.patch.object(ev.base, "query", return_value=None), self.assertRaises(ev.EvidenceIncomplete):
            ev.collect("postgresql://x/y")


class EvidenceSqlTests(unittest.TestCase):
    def test_the_statement_is_a_single_select_without_ddl_dml_or_secret_columns(self):
        sql = ev.evidence_sql()
        stripped = re.sub(r"'[^']*'", "''", sql)
        self.assertRegex(stripped.lstrip().upper(), r"^SELECT JSON_BUILD_OBJECT")
        self.assertNotIn(";", stripped)
        self.assertIsNone(re.search(r"\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|COPY|SET|RESET|CALL|DO|VACUUM|LISTEN|NOTIFY)\b", stripped, re.I))
        self.assertNotRegex(sql.lower(), r"rolpassword|pg_authid|auth\.users|secret|token|pg_shadow")
        self.assertNotRegex(stripped, r"(?i)\bpg_read_file|lo_import|dblink")
        for key in ("runtime_role_memberships", "runtime_role_owned_objects", "runtime_role_inherited_access_outside_public", "runtime_role_function_execute_count"):
            self.assertIn(key, sql)

    def test_it_runs_through_the_read_only_helper(self):
        calls = []
        with mock.patch.object(ev.base, "query", side_effect=lambda url, sql: calls.append(sql) or healthy_raw()):
            ev.collect("postgresql://x/y")
        self.assertEqual(len(calls), 1)  # one statement, executed by the helper that wraps it in BEGIN READ ONLY


WORKFLOW = (ROOT / ".github/workflows/production-readiness-evidence.yml").read_text()


class EvidenceWorkflowTests(unittest.TestCase):
    def problems(self, old, new):
        self.assertIn(old, WORKFLOW, old)
        return evidence_workflow_problems(WORKFLOW.replace(old, new, 1))

    def test_current_workflow_satisfies_the_invariants_and_the_repository_check(self):
        self.assertEqual(evidence_workflow_problems(WORKFLOW), [])
        self.assertEqual(inspect_workflows(ROOT / ".github/workflows"), [])

    def test_it_is_manual_main_only_read_only_and_artifact_free(self):
        self.assertTrue(any("workflow_dispatch" in p for p in self.problems("on:\n  workflow_dispatch:", "on:\n  workflow_dispatch:\n  push:")))
        self.assertTrue(any("refs/heads/main" in p for p in self.problems("    if: github.ref == 'refs/heads/main'\n", "")))
        self.assertTrue(any("production-database-preflight" in p for p in self.problems("environment: production-database-preflight", "environment: production-database-apply")))
        self.assertTrue(any("upload-artifact" in p for p in self.problems("      - uses: actions/checkout@v4", "      - uses: actions/upload-artifact@v4\n      - uses: actions/checkout@v4")))
        self.assertTrue(any("only the two read-only Production secrets" in p for p in self.problems("secrets.PRODUCTION_SUPABASE_URL", "secrets.PRODUCTION_DATABASE_APPLY_URL")))
        self.assertTrue(any("only: production_db_release.py evidence" in p for p in self.problems("production_db_release.py evidence", "production_db_release.py plan --scope K-L")))
        self.assertTrue(any("permissions must be exactly" in p for p in self.problems("permissions:\n  contents: read\n\nconcurrency", "permissions:\n  contents: read\n  id-token: write\n\nconcurrency")))

    def test_other_workflows_may_not_run_evidence_with_other_secrets_or_dispatch_it(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp) / ".github/workflows"
            workflows.mkdir(parents=True)
            (workflows / "other.yml").write_text("on: workflow_dispatch\njobs:\n  a:\n    steps:\n      - run: python scripts/production_db_release.py apply --scope K-L\n")
            self.assertTrue(any("only the read-only" in e for e in inspect_workflows(workflows)))


@unittest.skipUnless(URL, "requires a bootstrapped loopback vista_test_* database")
class EvidenceOnRealDatabaseTests(unittest.TestCase):
    def test_a_real_database_yields_a_complete_redacted_result(self):
        result = ev.run(URL, ROOT)
        ev.assert_redacted(result)
        self.assertEqual(result["status"], "complete")
        self.assertEqual(set(result["checks"]), set(ev.evaluate(healthy_raw(), ROOT)["checks"]))
        # the bootstrapped test database is in the K-L state (not the D-J state Production is in), so the evidence must flag exactly that
        self.assertIn("k_and_l_not_yet_applied", result["blocking"])
        self.assertTrue(result["checks"]["m_not_applied"])


if __name__ == "__main__":
    unittest.main()
