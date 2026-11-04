resource "aws_s3_bucket" "ai_models" {
  bucket        = var.ai_models_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "ai_models" {
  bucket                  = aws_s3_bucket.ai_models.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "ai_models" {
  bucket = aws_s3_bucket.ai_models.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ai_models" {
  bucket = aws_s3_bucket.ai_models.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "ai_models" {
  bucket = aws_s3_bucket.ai_models.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "ai_models" {
  bucket = aws_s3_bucket.ai_models.id

  rule {
    id     = "retain-current-models-and-limit-old-versions"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    noncurrent_version_expiration {
      noncurrent_days = 180
    }
  }

  depends_on = [aws_s3_bucket_versioning.ai_models]
}

data "aws_iam_policy_document" "ai_models_transport" {
  statement {
    sid       = "DenyPlaintextTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.ai_models.arn, "${aws_s3_bucket.ai_models.arn}/*"]

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
}

resource "aws_s3_bucket_policy" "ai_models" {
  bucket     = aws_s3_bucket.ai_models.id
  policy     = data.aws_iam_policy_document.ai_models_transport.json
  depends_on = [aws_s3_bucket_public_access_block.ai_models]
}

data "aws_iam_policy_document" "ai_models_upload" {
  statement {
    sid       = "UploadModelArtifacts"
    actions   = ["s3:PutObject", "s3:AbortMultipartUpload"]
    resources = ["${aws_s3_bucket.ai_models.arn}/models/*"]
  }
}

resource "aws_iam_policy" "ai_models_upload" {
  name   = "${var.project}-${var.environment}-ai-models-upload"
  policy = data.aws_iam_policy_document.ai_models_upload.json
}

data "aws_iam_policy_document" "ai_models_download" {
  statement {
    sid       = "DownloadModelArtifacts"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.ai_models.arn}/models/*"]
  }
}

resource "aws_iam_policy" "ai_models_download" {
  name   = "${var.project}-${var.environment}-ai-models-download"
  policy = data.aws_iam_policy_document.ai_models_download.json
}
