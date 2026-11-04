resource "aws_iam_openid_connect_provider" "github" {

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

}

data "aws_iam_policy_document" "github_assume" {

  statement {

    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/${var.deploy_branch}"]
    }

  }

}

resource "aws_iam_role" "github_api" {

  name               = "${var.project}-${var.environment}-github-api-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json

}

data "aws_iam_policy_document" "github_api" {

  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {

    actions   = ["ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart", "ecr:BatchGetImage", "ecr:DescribeImages"]
    resources = [aws_ecr_repository.api.arn]

  }

  statement {

    actions   = ["ssm:SendCommand"]
    resources = [aws_instance.api.arn, "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript"]

  }

  statement {
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }

}

resource "aws_iam_role_policy" "github_api" {

  role   = aws_iam_role.github_api.id
  policy = data.aws_iam_policy_document.github_api.json

}

resource "aws_iam_role" "github_web" {

  name               = "${var.project}-${var.environment}-github-web-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json

}

data "aws_iam_policy_document" "github_web" {

  statement {

    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn]

  }

  statement {

    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

  }

  statement {

    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetDistribution", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.web.arn]

  }

}

resource "aws_iam_role_policy" "github_web" {

  role   = aws_iam_role.github_web.id
  policy = data.aws_iam_policy_document.github_web.json

}
