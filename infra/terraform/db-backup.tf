# Private, encrypted destination for the Production database logical backups (scripts/production_db_backup.py,
# docs/operations/production-db-logical-backup.md). Supabase Free has no managed backups/PITR.
#
# PROPOSAL, NOT APPLIED. Creating these resources needs an approved `terraform apply` by the account owner.
# Self-contained on purpose: it only references the existing GitHub OIDC provider (github-oidc.tf) and the caller identity.
#
# Trust: the two roles are assumable only from the two GitHub *environments* of the release workflow (OIDC `sub` claim =
# repo:<owner>/<repo>:environment:<name>), not from branches. The write role is used by the `backup` job, the read role by the `apply` job
# (which only starts after its required reviewers approved). Neither role can delete objects or change the bucket or key.

variable "db_backup_project_ref" {
  description = "Supabase project reference whose backups live under production/<ref>/ (must equal the release tooling's Production ref)."
  type        = string
  default     = "ovijutkvaaxohauvuxbj"
  validation {
    condition     = can(regex("^[a-z]{20}$", var.db_backup_project_ref))
    error_message = "A Supabase project reference is 20 lowercase letters."
  }
}

variable "db_backup_retention_days" {
  description = "Days a backup is kept; must equal RETENTION_DAYS in scripts/production_db_backup.py (the evidence expiresAt)."
  type        = number
  default     = 90
  validation {
    condition     = var.db_backup_retention_days >= 30 && var.db_backup_retention_days <= 365
    error_message = "Retention must be between 30 and 365 days."
  }
}

locals {
  db_backup_bucket_name = "${var.project}-prod-db-backups-${data.aws_caller_identity.current.account_id}"
  db_backup_prefix      = "production/${var.db_backup_project_ref}"
  db_backup_write_env   = "production-database-preflight"
  db_backup_read_env    = "production-database-apply"
}

# ------------------------------------------------------------------------------------------------------------------------------- KMS
resource "aws_kms_key" "db_backup" {
  description             = "VISTA Production database logical backups (SSE-KMS)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  # Default key policy (account root => IAM policies decide). No principal outside this account is granted anything.
}

resource "aws_kms_alias" "db_backup" {
  name          = "alias/${var.project}-prod-db-backups"
  target_key_id = aws_kms_key.db_backup.key_id
}

# ----------------------------------------------------------------------------------------------------------------------------- bucket
resource "aws_s3_bucket" "db_backup" {
  bucket        = local.db_backup_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "db_backup" {
  bucket                  = aws_s3_bucket.db_backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "db_backup" {
  bucket = aws_s3_bucket.db_backup.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "db_backup" {
  bucket = aws_s3_bucket.db_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "db_backup" {
  bucket = aws_s3_bucket.db_backup.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.db_backup.arn
    }
  }
}

# Retention: current versions expire after var.db_backup_retention_days (a delete marker is added), the hidden versions after 7 more days,
# so a backup is gone at most retention+7 days after upload. Incomplete multipart uploads are cleaned up.
resource "aws_s3_bucket_lifecycle_configuration" "db_backup" {
  bucket     = aws_s3_bucket.db_backup.id
  depends_on = [aws_s3_bucket_versioning.db_backup]

  rule {
    id     = "expire-backups"
    status = "Enabled"
    filter {
      prefix = "production/"
    }
    expiration {
      days = var.db_backup_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }

  rule {
    id     = "remove-expired-delete-markers"
    status = "Enabled"
    filter {
      prefix = "production/"
    }
    expiration {
      expired_object_delete_marker = true
    }
  }
}

data "aws_iam_policy_document" "db_backup_bucket" {
  statement {
    sid       = "DenyPlaintextTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.db_backup.arn, "${aws_s3_bucket.db_backup.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid       = "DenyUploadWithoutKms"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.db_backup.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }

  statement {
    sid       = "DenyUploadWithAnotherKey"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.db_backup.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption-aws-kms-key-id"
      values   = [aws_kms_key.db_backup.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "db_backup" {
  bucket     = aws_s3_bucket.db_backup.id
  policy     = data.aws_iam_policy_document.db_backup_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.db_backup]
}

# ------------------------------------------------------------------------------------------------------------------------------ roles
data "aws_iam_policy_document" "db_backup_assume" {
  for_each = {
    write = local.db_backup_write_env
    read  = local.db_backup_read_env
  }

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
      values   = ["repo:${var.github_repository}:environment:${each.value}"]
    }
  }
}

resource "aws_iam_role" "db_backup_write" {
  name                 = "${var.project}-prod-db-backup-writer"
  assume_role_policy   = data.aws_iam_policy_document.db_backup_assume["write"].json
  max_session_duration = 3600
}

resource "aws_iam_role" "db_backup_read" {
  name                 = "${var.project}-prod-db-backup-reader"
  assume_role_policy   = data.aws_iam_policy_document.db_backup_assume["read"].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "db_backup_write" {
  statement {
    sid       = "WriteAndVerifyBackupObjects"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.db_backup.arn}/${local.db_backup_prefix}/*"]
  }
  statement {
    sid       = "UseTheBackupKeyThroughS3Only"
    actions   = ["kms:GenerateDataKey", "kms:Encrypt", "kms:Decrypt"]
    resources = [aws_kms_key.db_backup.arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["s3.${var.aws_region}.amazonaws.com"]
    }
  }
  # Deliberately absent: s3:DeleteObject*, s3:PutBucket*, s3:PutLifecycleConfiguration, kms:ScheduleKeyDeletion, kms:PutKeyPolicy.
}

data "aws_iam_policy_document" "db_backup_read" {
  statement {
    sid       = "ReadBackupObjects"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.db_backup.arn}/${local.db_backup_prefix}/*"]
  }
  statement {
    sid       = "DecryptThroughS3Only"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.db_backup.arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["s3.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "db_backup_write" {
  role   = aws_iam_role.db_backup_write.id
  policy = data.aws_iam_policy_document.db_backup_write.json
}

resource "aws_iam_role_policy" "db_backup_read" {
  role   = aws_iam_role.db_backup_read.id
  policy = data.aws_iam_policy_document.db_backup_read.json
}

# Values to copy into the GitHub environment *variables* (not secrets) described in docs/operations/production-db-logical-backup.md.
output "db_backup_bucket" {
  value = aws_s3_bucket.db_backup.bucket
}

output "db_backup_kms_key_arn" {
  value = aws_kms_key.db_backup.arn
}

output "db_backup_write_role_arn" {
  value = aws_iam_role.db_backup_write.arn
}

output "db_backup_read_role_arn" {
  value = aws_iam_role.db_backup_read.arn
}
