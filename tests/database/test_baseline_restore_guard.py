import unittest

from scripts.restore_schema_baseline_isolated import _acl_roles, validate_isolated_target
from scripts.sql_migration_runner import RunnerError


class BaselineRestoreGuardTests(unittest.TestCase):
    def test_loopback_test_database_is_accepted(self):
        details = validate_isolated_target(
            "postgresql://vista:dummy@127.0.0.1:55432/vista_baseline_test_20261109?sslmode=disable"
        )
        self.assertEqual(details["database"], "vista_baseline_test_20261109")
        self.assertEqual(details["host"], "127.0.0.1")

    def test_production_supabase_host_is_rejected(self):
        with self.assertRaisesRegex(RunnerError, "loopback"):
            validate_isolated_target(
                "postgresql://postgres:dummy@db.ovijutkvaaxohauvuxbj.supabase.co:5432/postgres"
            )

    def test_non_loopback_host_is_rejected(self):
        with self.assertRaisesRegex(RunnerError, "loopback"):
            validate_isolated_target("postgresql://user:dummy@10.0.0.2:5432/vista_baseline_test_x")

    def test_database_name_must_be_dedicated_test_database(self):
        with self.assertRaisesRegex(RunnerError, "vista_baseline_test_"):
            validate_isolated_target("postgresql://user:dummy@localhost:5432/postgres")

    def test_acl_parser_finds_default_privilege_grantees_and_grantors(self):
        sql = (
            "GRANT SELECT ON TABLE public.example TO authenticated;\n"
            "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public "
            "GRANT ALL ON TABLES TO service_role;\n"
        )
        self.assertEqual(_acl_roles(sql), ["authenticated", "service_role", "supabase_admin"])


if __name__ == "__main__":
    unittest.main()
