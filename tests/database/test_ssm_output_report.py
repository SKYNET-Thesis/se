import io
import json
import re
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from scripts import ssm_output_report as report

ROOT = Path(__file__).resolve().parents[2]
FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVl"


class RedactionTests(unittest.TestCase):
    def assertHidden(self, text, secret):
        out = report.redact(text)
        self.assertNotIn(secret, out)
        self.assertIn(report.PLACEHOLDER, out)

    def test_database_url_password(self):
        self.assertHidden("connect postgresql://app:hunter2pass@db.example.com:5432/x", "hunter2pass")

    def test_env_style_secrets(self):
        for line in (
            "SUPABASE_SERVICE_ROLE_KEY=abcdef123456",
            "DATABASE_URL=postgres://u:p4ss@h/db",
            "password: s3cr3tvalue",
            '"api_key": "k-123456789"',
            "AWS_SESSION_TOKEN=FwoGZXIvYXdz",
        ):
            out = report.redact(line)
            self.assertIn(report.PLACEHOLDER, out, line)
            self.assertNotRegex(out, r"abcdef123456|p4ss|s3cr3tvalue|k-123456789|FwoGZXIvYXdz")

    def test_aws_keys_jwts_and_bearer(self):
        self.assertHidden("key AKIAIOSFODNN7EXAMPLE used", "AKIAIOSFODNN7EXAMPLE")
        self.assertHidden(f"token {FAKE_JWT}", FAKE_JWT)
        self.assertHidden("Authorization: Bearer abc.def-ghi_jkl123", "abc.def-ghi_jkl123")

    def test_private_key_block(self):
        pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----"
        self.assertHidden("x\n" + pem, "MIIEvQIBADANBg")

    def test_docker_password_flag(self):
        self.assertHidden("docker login --password hunter2pass", "hunter2pass")

    def test_diagnostic_text_survives(self):
        text = (
            "Health check failed for 157098813811.dkr.ecr.ap-southeast-1.amazonaws.com/vista/demo/education-api:07ea5a7\n"
            "Error: D03 database schema is incompatible: migration X is not applied"
        )
        self.assertEqual(report.redact(text), text)


class ReportTests(unittest.TestCase):
    def test_report_has_status_stdout_and_stderr_redacted(self):
        out = report.report(
            {
                "Status": "Failed",
                "ResponseCode": 1,
                "StandardOutputContent": "SUPABASE_URL=https://x.supabase.co",
                "StandardErrorContent": "Health check failed\nDATABASE_URL=postgres://u:pw1234@h/db",
            }
        )
        self.assertIn("SSM status: Failed (response code 1)", out)
        self.assertIn("Health check failed", out)
        self.assertNotIn("pw1234", out)
        self.assertIn("SSM stderr", out)

    def test_output_is_truncated_to_the_tail(self):
        out = report.report({"Status": "Failed", "ResponseCode": 1, "StandardErrorContent": "a" * 9000 + "THE-END"})
        self.assertIn("THE-END", out)
        self.assertIn("truncated", out)
        self.assertLess(len(out), 9000)

    def test_missing_fields_do_not_crash(self):
        out = report.report({})
        self.assertIn("(empty)", out)

    def test_unreadable_input_prints_nothing_from_it(self):
        buffer = io.StringIO()
        with mock.patch("sys.stdin", io.StringIO("password=leakme not json")), redirect_stdout(buffer):
            self.assertEqual(report.main(), 0)
        self.assertNotIn("leakme", buffer.getvalue())

    def test_main_round_trip(self):
        payload = json.dumps({"Status": "Failed", "ResponseCode": 1, "StandardErrorContent": "token=zzz999aaa"})
        buffer = io.StringIO()
        with mock.patch("sys.stdin", io.StringIO(payload)), redirect_stdout(buffer):
            report.main()
        self.assertNotIn("zzz999aaa", buffer.getvalue())


class WorkflowWiringTests(unittest.TestCase):
    def deploy_api(self):
        workflow = (ROOT / ".github/workflows/backend-ci.yml").read_text()
        match = re.search(r"(?ms)^  deploy-api:\n(.*?)(?=^  [a-z0-9-]+:|\Z)", workflow)
        self.assertIsNotNone(match)
        return match.group(1)

    def test_failed_ssm_commands_print_the_redacted_report(self):
        job = self.deploy_api()
        self.assertIn("scripts/ssm_output_report.py", job)
        self.assertRegex(job, r"Failed\|Cancelled\|TimedOut")
        self.assertIn("exit 1", job)

    def test_raw_ssm_output_is_never_printed_unredacted(self):
        job = self.deploy_api()
        for line in job.splitlines():
            if "get-command-invocation" in line and "StandardErrorContent" in line:
                self.assertIn("ssm_output_report.py", line)
            self.assertNotIn("StandardOutputContent", line.replace("ssm_output_report", ""))

    def test_checkout_runs_for_rollback_too_so_the_helper_exists(self):
        job = self.deploy_api()
        checkout = re.search(r"- uses: actions/checkout@v4\n(\s+if:[^\n]*\n)?", job)
        self.assertIsNotNone(checkout)
        self.assertIsNone(checkout.group(1), "checkout must not be skipped on rollback")

    def test_safety_gates_are_still_in_place(self):
        job = self.deploy_api()
        for needle in (
            "needs.database-safety.result == 'success'",
            "schema-gate",
            "github.ref == 'refs/heads/main'",
            "vars.AWS_DEPLOY_ENABLED == 'true'",
            "is not the approved role",
            "is not the approved EC2 instance",
        ):
            self.assertIn(needle, job)

    def test_deploy_script_is_unchanged_so_the_instance_is_not_replaced(self):
        # infra/terraform/scripts/deploy-api.sh is embedded in user_data; editing it
        # would replace the production instance. Keep its health-check rollback.
        script = (ROOT / "infra/terraform/scripts/deploy-api.sh").read_text()
        self.assertIn("Health check failed", script)
        self.assertIn("Rolled back to", script)


if __name__ == "__main__":
    unittest.main()
