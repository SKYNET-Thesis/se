"""The deployment script refuses a DATABASE_URL that is not the restricted runtime role. The test executes the script's REAL validation block (extracted from
infra/terraform/scripts/deploy-api.sh) against temporary files; nothing else of the script (docker, AWS) runs."""
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / "infra/terraform/scripts/deploy-api.sh").read_text()
REF = "ovijutkvaaxohauvuxbj"
BASE = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "k", "WEB_ORIGIN": "https://skynex.best"}


def run_block(database_url) -> subprocess.CompletedProcess:
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", SCRIPT, re.S).group(1)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "env.json").write_text(json.dumps({**BASE, **({} if database_url is None else {"DATABASE_URL": database_url})}))
        code = block.replace("/opt/vista/env.json", str(tmp / "env.json")).replace("/opt/vista/api.env", str(tmp / "api.env"))
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        done.api_env = (tmp / "api.env").read_text() if (tmp / "api.env").exists() else None  # type: ignore[attr-defined]
        return done


class DeployScriptRuntimeUserTests(unittest.TestCase):
    def test_the_restricted_runtime_role_is_accepted_in_plain_and_pooler_form(self):
        for url in ("postgresql://vista_app_runtime:pw@db.example:5432/postgres", f"postgresql://vista_app_runtime.{REF}:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"):
            done = run_block(url)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertIn("NODE_ENV=production", done.api_env)

    def test_every_other_identity_is_refused_without_echoing_the_url(self):
        for url in (f"postgresql://postgres.{REF}:SECRETPW@pooler:6543/postgres", "postgresql://postgres:SECRETPW@db:5432/postgres", "postgresql://vista_backup_reader:SECRETPW@db/postgres",
                    "postgresql://supabase_admin:SECRETPW@db/postgres", "postgresql://vista_app_runtime_x:SECRETPW@db/postgres", "postgresql://xvista_app_runtime:SECRETPW@db/postgres",
                    "postgresql://vista_app_runtime.short:SECRETPW@db/postgres", f"postgresql://vista_app_runtime.{REF}x:SECRETPW@db/postgres", "postgresql://db:5432/postgres", "", "not a url"):
            done = run_block(url)
            self.assertNotEqual(done.returncode, 0, url)
            self.assertIsNone(done.api_env, f"api.env must not be written for {url!r}")
            self.assertNotIn("SECRETPW", done.stdout + done.stderr)
            self.assertIn("restricted runtime role", done.stderr)

    def test_a_missing_or_non_string_database_url_is_refused(self):
        self.assertNotEqual(run_block(None).returncode, 0)  # the existing "required keys" rule
        block_env = run_block("x")
        self.assertNotEqual(block_env.returncode, 0)


if __name__ == "__main__":
    unittest.main()
