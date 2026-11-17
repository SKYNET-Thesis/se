import tempfile
import unittest
from pathlib import Path

from scripts import runtime_role_api_smoke as smoke


class RuntimeRoleSmokeSafetyTests(unittest.TestCase):
    def test_only_loopback_vista_test_databases_are_accepted(self):
        smoke.guard("postgresql://u:p@127.0.0.1:5432/vista_test_abc?sslmode=disable")
        smoke.guard("postgresql://u:p@localhost/vista_test_x")
        for url in ("postgresql://u:p@db.example.com/vista_test_abc", "postgresql://u:p@127.0.0.1/postgres", "postgresql://u:p@127.0.0.1/vista_prod",
                    "postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/vista_test_abc", "postgresql://u:p@127.0.0.1/vista_test_"):
            with self.subTest(url=url), self.assertRaises(SystemExit):
                smoke.guard(url)

    def test_it_discovers_only_parameterless_get_routes(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src" / "m"
            src.mkdir(parents=True)
            (src / "a.controller.ts").write_text('@Controller("courses")\\nclass A {\\n @Get() list(){}\\n @Get("mine") mine(){}\\n @Get(":id") one(){}\\n @Post("x") create(){}\\n @Get("a/:b/c") nested(){}\\n}\\n'.replace("\\\\n", "\\n"))
            self.assertEqual(smoke.routes(Path(tmp)), ["/courses", "/courses/mine"])


if __name__ == "__main__":
    unittest.main()
