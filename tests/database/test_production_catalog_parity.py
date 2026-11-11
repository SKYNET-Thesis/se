import unittest
import json
import copy

from scripts.verify_production_catalog_parity import (
    BASELINE_EVIDENCE_FIELDS,
    _classify_differences,
    _child_environment,
    _parse_catalog_output,
    _pgpass_escape,
    _psql_command,
    _safe_psql_diagnostic,
    _validated_connection,
)
from scripts.restore_schema_baseline_isolated import _inventory_sql


class ProductionCatalogParityConnectionTests(unittest.TestCase):
    def test_direct_url_percent_encoding_and_query_options_are_preserved(self):
        settings, project_host = _validated_connection({
            "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co",
            "DIRECT_URL": (
                "postgresql://audit:p%40ss%3Aword%25%2B@db.ovijutkvaaxohauvuxbj.supabase.co:5432/postgres"
                "?sslmode=require&connect_timeout=27&application_name=vista%20audit"
            ),
        })

        self.assertEqual(project_host, "ovijutkvaaxohauvuxbj.supabase.co")
        self.assertEqual(settings["password"], "p@ss:word%+")
        self.assertEqual(settings["query_options"], {
            "sslmode": "require",
            "connect_timeout": "27",
            "application_name": "vista audit",
        })

    def test_direct_url_rejects_identity_overrides(self):
        with self.assertRaisesRegex(ValueError, "query host conflicts"):
            _validated_connection({
                "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co",
                "DIRECT_URL": (
                    "postgresql://audit:secret@db.ovijutkvaaxohauvuxbj.supabase.co/postgres"
                    "?host=other.example"
                ),
            })

    def test_inherited_pg_environment_is_removed_and_direct_url_settings_applied(self):
        settings, _ = _validated_connection({
            "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co",
            "DIRECT_URL": (
                "postgresql://audit:secret@db.ovijutkvaaxohauvuxbj.supabase.co/postgres"
                "?sslmode=require&connect_timeout=19"
            ),
        })
        child = _child_environment({
            "PATH": "/usr/bin",
            "PGHOST": "wrong-host",
            "PGPORT": "9999",
            "PGUSER": "wrong-user",
            "PGPASSWORD": "wrong-password",
            "PGPASSFILE": "/wrong/passfile",
            "PGSSLMODE": "disable",
            "PGOPTIONS": "-c default_transaction_read_only=off",
            "PGSERVICE": "wrong-service",
        }, settings, "/secure/audit.pgpass")

        self.assertEqual(child["PATH"], "/usr/bin")
        self.assertEqual(child["PGPASSFILE"], "/secure/audit.pgpass")
        self.assertEqual(child["PGSSLMODE"], "require")
        self.assertEqual(child["PGCONNECT_TIMEOUT"], "19")
        self.assertEqual(child["PGAPPNAME"], "vista_readonly_catalog_audit")
        self.assertFalse(any(key in child for key in (
            "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGOPTIONS", "PGSERVICE"
        )))

    def test_pgpass_fields_escape_delimiters(self):
        self.assertEqual(_pgpass_escape(r"pass:with\slashes"), r"pass\:with\\slashes")

    def test_psql_arguments_never_contain_the_password(self):
        settings, _ = _validated_connection({
            "SUPABASE_URL": "https://ovijutkvaaxohauvuxbj.supabase.co",
            "DIRECT_URL": "postgresql://audit:secret-password@db.ovijutkvaaxohauvuxbj.supabase.co/postgres?sslmode=require",
        })

        self.assertNotIn("secret-password", " ".join(_psql_command(settings)))

    def test_connection_diagnostic_redacts_secrets_and_context(self):
        settings = {"user": "private-user", "password": "private-secret"}
        diagnostic = _safe_psql_diagnostic(
            "FATAL: password authentication failed for user private-user: postgresql://private-user:private-secret@db.example/postgres\n"
            "DETAIL: postgresql://private-user:private-secret@db.example/postgres\n"
            "DETAIL: api_key=example-sensitive-token\n"
            "CONTEXT: sensitive catalog definition",
            settings,
        )
        self.assertNotIn("private-user", diagnostic)
        self.assertNotIn("private-secret", diagnostic)
        self.assertNotIn("example-sensitive-token", diagnostic)
        self.assertNotIn("sensitive catalog definition", diagnostic)
        self.assertIn("[CONNECTION URI REDACTED]", diagnostic)

    def test_empty_psql_output_reports_only_safe_output_metadata(self):
        with self.assertRaises(RuntimeError) as caught:
            _parse_catalog_output(b"", b"private error detail", 0)
        message = str(caught.exception)
        self.assertIn("stdout_bytes=0", message)
        self.assertIn("stderr_bytes=20", message)
        self.assertIn("output_lines=0", message)
        self.assertIn("EmptyOutputError", message)
        self.assertNotIn("private error detail", message)

    def test_malformed_json_reports_parse_type_and_position_without_output(self):
        raw = b'{"preflight":, "sensitive": "function body"}'
        with self.assertRaises(RuntimeError) as caught:
            _parse_catalog_output(raw, "", 0)
        message = str(caught.exception)
        self.assertIn("JSONDecodeError", message)
        self.assertIn("json_error_position=", message)
        self.assertIn(f"stdout_bytes={len(raw)}", message)
        self.assertNotIn("function body", message)

    def test_multiple_psql_output_lines_are_rejected_with_line_count(self):
        raw = b'{"preflight": {}, "inventory": {}}\nstatus text\n'
        with self.assertRaisesRegex(RuntimeError, "output_lines=2.*OutputLineCountError"):
            _parse_catalog_output(raw, "", 0)

    def test_single_json_object_parses_successfully(self):
        raw = json.dumps({"preflight": {"transaction_read_only": "on"}, "inventory": {"tables": []}}).encode()
        self.assertEqual(_parse_catalog_output(raw), {
            "preflight": {"transaction_read_only": "on"},
            "inventory": {"tables": []},
        })


class ProductionCatalogDifferenceClassificationTests(unittest.TestCase):
    def _base_inventories(self):
        base = {
            "baseline_sha256": "a" * 64,
            "baseline_size": 123,
            "dump_count_comparison": {},
            "dump_counts_match": True,
            "tables": [],
            "default_privileges": [],
            "extensions": [{"name": "plpgsql", "version": "1.0"}],
            "schema_acl": {"name": "public", "acl": [
                "postgres=UC/postgres", "anon=U/postgres",
                "authenticated=U/postgres", "service_role=U/postgres",
            ]},
            "functions": [],
            "constraints": [], "indexes": [], "triggers": [], "types": [],
            "rls": [], "policies": [], "sequences": [], "relations": [],
            "counts": {}, "relation_acls": [],
        }
        production = {
            key: copy.deepcopy(value)
            for key, value in base.items()
            if key not in BASELINE_EVIDENCE_FIELDS
        }
        return base, production

    def test_baseline_evidence_metadata_is_not_reported_as_missing_catalog_fields(self):
        isolated, production = self._base_inventories()
        classified, missing, _ = _classify_differences(isolated, production)
        self.assertEqual(missing, [])
        self.assertFalse(any(item["field"] in BASELINE_EVIDENCE_FIELDS for item in classified))

    def test_equal_catalog_field_is_classified_as_match(self):
        isolated, production = self._base_inventories()
        classified, _, _ = _classify_differences(isolated, production)
        self.assertEqual(next(x for x in classified if x["field"] == "tables")["status"], "MATCH")

    def test_supabase_default_privileges_are_expected_only_with_matching_public_rows(self):
        isolated, production = self._base_inventories()
        isolated["default_privileges"] = [
            {"schema": "public", "grantor": "postgres", "type": kind, "acl": ["anon=U/postgres"]}
            for kind in ("S", "f", "r")
        ]
        production["default_privileges"] = list(isolated["default_privileges"]) + [
            {"schema": schema, "grantor": grantor, "type": kind, "acl": []}
            for schema, grantor in (("auth", "supabase_auth_admin"), ("storage", "postgres"))
            for kind in ("S", "f", "r")
        ]
        classified, _, _ = _classify_differences(isolated, production)
        result = next(item for item in classified if item["field"] == "default_privileges")
        self.assertEqual(result["status"], "EXPECTED_ENVIRONMENT_DIFFERENCE")

        production["default_privileges"][0] = {**production["default_privileges"][0], "acl": ["anon=U/changed"]}
        classified, _, _ = _classify_differences(isolated, production)
        result = next(item for item in classified if item["field"] == "default_privileges")
        self.assertEqual(result["status"], "REAL_SCHEMA_DRIFT")

    def test_unrecognized_extra_default_privileges_are_not_suppressed(self):
        isolated, production = self._base_inventories()
        isolated["default_privileges"] = [{"schema": "public", "grantor": "postgres", "type": "r", "acl": []}]
        production["default_privileges"] = list(isolated["default_privileges"]) + [
            {"schema": "customer_data", "grantor": "postgres", "type": "r", "acl": []}
        ]
        classified, _, _ = _classify_differences(isolated, production)
        self.assertEqual(next(x for x in classified if x["field"] == "default_privileges")["status"], "UNVERIFIED")

    def test_additional_extensions_without_public_references_are_environment_difference(self):
        isolated, production = self._base_inventories()
        production["extensions"] += [
            {"name": name, "version": "1.0"}
            for name in ("pg_stat_statements", "pgcrypto", "supabase_vault", "uuid-ossp")
        ]
        classified, _, _ = _classify_differences(isolated, production)
        result = next(item for item in classified if item["field"] == "extensions")
        self.assertEqual(result["status"], "UNVERIFIED")

    def test_extension_difference_is_expected_only_when_catalog_dependency_audit_is_present(self):
        isolated, production = self._base_inventories()
        isolated["public_extension_dependencies"] = []
        production["public_extension_dependencies"] = []
        production["extensions"] += [
            {"name": name, "version": "1.0"}
            for name in ("pg_stat_statements", "pgcrypto", "supabase_vault", "uuid-ossp")
        ]
        classified, _, _ = _classify_differences(isolated, production)
        self.assertEqual(next(x for x in classified if x["field"] == "extensions")["status"], "EXPECTED_ENVIRONMENT_DIFFERENCE")

        production["public_extension_dependencies"] = [
            {"extension": "pgcrypto", "object_type": "function", "object_identity": "public.encrypt_data(bytea)"}
        ]
        classified, _, _ = _classify_differences(isolated, production)
        self.assertEqual(next(x for x in classified if x["field"] == "extensions")["status"], "REAL_SCHEMA_DRIFT")

    def test_public_schema_acl_is_classified_from_application_role_semantics(self):
        isolated, production = self._base_inventories()
        isolated["schema_acl"]["acl"] = ["postgres=UC/postgres", "anon=U/postgres", "authenticated=U/postgres", "service_role=U/postgres"]
        production["schema_acl"]["acl"] = [
            "pg_database_owner=UC/pg_database_owner", "=U/pg_database_owner",
            "postgres=U/pg_database_owner", "anon=U/pg_database_owner",
            "authenticated=U/pg_database_owner", "service_role=U/pg_database_owner",
        ]
        classified, _, _ = _classify_differences(isolated, production)
        result = next(item for item in classified if item["field"] == "schema_acl")
        self.assertEqual(result["status"], "EXPECTED_ENVIRONMENT_DIFFERENCE")

    def test_missing_nonbaseline_catalog_field_is_unverified(self):
        isolated, production = self._base_inventories()
        del production["policies"]
        classified, missing, _ = _classify_differences(isolated, production)
        self.assertIn("policies", missing)
        self.assertEqual(next(x for x in classified if x["field"] == "policies")["status"], "UNVERIFIED")

    def test_catalog_inventory_includes_direct_extension_dependency_audit(self):
        sql = _inventory_sql()
        self.assertIn("'public_extension_dependencies'", sql)
        self.assertIn("pg_identify_object", sql)
        self.assertIn("'pg_extension'::regclass", sql)


if __name__ == "__main__":
    unittest.main()
