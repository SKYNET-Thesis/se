"""Static guards for the Production Terraform configuration (no cloud access, no plan).

The live EC2 instance is long-lived Production; a first-boot script change or a newer AL2023 AMI must never plan a replacement, and the
GitHub OIDC trust must stay on the reviewer-gated environment subject used by the deploy workflows.
"""
import re
import unittest
from pathlib import Path

TF = Path(__file__).resolve().parents[2] / "infra" / "terraform"


def instance_block() -> str:
    text = (TF / "compute.tf").read_text()
    start = text.index('resource "aws_instance" "api"')
    end = text.index('resource "aws_eip" "api"')
    return text[start:end]


class TerraformProductionGuards(unittest.TestCase):
    def test_instance_is_never_replaced_by_user_data_or_ami(self):
        block = instance_block()
        self.assertIn("user_data_replace_on_change = false", block)
        self.assertNotIn("user_data_replace_on_change = true", block)
        match = re.search(r"ignore_changes\s*=\s*\[([^\]]*)\]", block)
        self.assertIsNotNone(match, "aws_instance.api needs lifecycle.ignore_changes")
        self.assertTrue({"ami", "user_data"} <= {x.strip() for x in match.group(1).split(",")})
        self.assertRegex(block, r"prevent_destroy\s*=\s*true")

    def test_oidc_trust_is_the_reviewer_gated_environment(self):
        text = (TF / "github-oidc.tf").read_text()
        self.assertIn(":environment:${var.github_deploy_environment}", text)
        self.assertNotIn("refs/heads", text)
        variables = (TF / "variables.tf").read_text()
        self.assertRegex(variables, r'variable "github_deploy_environment" \{[^}]*default\s*=\s*"aws-demo"')

    def test_media_cors_allows_presigned_post_without_wildcards(self):
        text = (TF / "storage.tf").read_text()
        block = text[text.index('resource "aws_s3_bucket_cors_configuration" "media"'):]
        self.assertIn('allowed_methods = ["POST", "HEAD"]', block)
        self.assertNotIn('"*"]', block.split("allowed_origins")[1].split("\n")[0])


if __name__ == "__main__":
    unittest.main()
