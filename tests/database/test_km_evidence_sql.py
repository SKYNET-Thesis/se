import re
import unittest
from pathlib import Path

SQL = (Path(__file__).resolve().parents[2] / "docs/operations/sql/km-hosted-readiness.sql").read_text()


class KmEvidenceSqlTests(unittest.TestCase):
    def statements(self):
        body = "\n".join(line for line in SQL.splitlines() if not line.strip().startswith("--"))
        return [s.strip() for s in body.split(";") if s.strip()]

    def test_it_is_strictly_read_only(self):
        statements = self.statements()
        self.assertEqual(statements[0].upper(), "BEGIN READ ONLY")
        self.assertEqual(statements[-1].upper(), "ROLLBACK")
        for statement in statements[1:-1]:
            self.assertRegex(statement.upper(), r"^SELECT\b", statement[:60])
        forbidden = r"\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|COPY|DO|CALL|SET|RESET|VACUUM|COMMENT|SECURITY\s+LABEL)\b"
        for statement in statements[1:-1]:
            sql_without_strings = re.sub(r"'[^']*'", "''", statement)
            self.assertIsNone(re.search(forbidden, sql_without_strings, re.I), statement[:80])

    def test_it_never_selects_secrets_or_data_rows(self):
        queries = "\n".join(self.statements()).lower()  # comments may mention what the file avoids
        self.assertNotRegex(queries, r"password|rolpassword|pg_authid|auth\.users|secret|token")


if __name__ == "__main__":
    unittest.main()
