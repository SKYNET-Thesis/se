import re
import unittest
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/database-bootstrap.yml"


class BootstrapWorkflowSafetyTests(unittest.TestCase):
    def setUp(self):
        self.text = WORKFLOW.read_text()

    def test_database_is_an_ephemeral_loopback_service_container(self):
        self.assertIn("image: postgres:17", self.text)
        urls = re.findall(r"postgresql://\S+", self.text)
        self.assertTrue(urls)
        for url in urls:
            self.assertIn("@127.0.0.1:55432/vista_", url)

    def test_uses_no_secrets_or_hosted_database_references(self):
        for forbidden in ("secrets.", "supabase.co", "SUPABASE_URL", "pooler", "ovijutkvaaxohauvuxbj", "prisma migrate", "db push"):
            self.assertNotIn(forbidden, self.text)

    def test_runs_the_required_verification_steps(self):
        for required in (
            "validate_database_migration_manifest.py --release",
            "bootstrap_dev_database.py --confirm-local-bootstrap",
            "bootstrap_dev_database.py --verify-only",
            "prisma validate",
            "prisma generate",
            "npm run build",
            "RUN_POSTGRES_INTEGRATION",
            "numPendingTests",
        ):
            self.assertIn(required, self.text)

    def test_has_read_only_permissions(self):
        self.assertRegex(self.text, r"(?m)^permissions:\n  contents: read$")


if __name__ == "__main__":
    unittest.main()
