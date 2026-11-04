resource "aws_s3_bucket" "web" {
  bucket        = var.web_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket" "media" {
  bucket        = var.media_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "web" {

  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

}

resource "aws_s3_bucket_public_access_block" "media" {

  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {

  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }

  }

}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {

  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }

  }

}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration {
    status = "Enabled"
  }

}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }

}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }

}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }

}

resource "aws_s3_bucket_lifecycle_configuration" "media" {

  bucket = aws_s3_bucket.media.id
  rule {

    id     = "remove-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

  }

}

resource "aws_s3_bucket_cors_configuration" "media" {

  bucket = aws_s3_bucket.media.id
  cors_rule {

    allowed_headers = ["content-type", "x-amz-*", "content-md5"]
    allowed_methods = ["PUT", "HEAD"]
    allowed_origins = ["https://${aws_cloudfront_distribution.web.domain_name}"]
    max_age_seconds = 300

  }

}

data "aws_iam_policy_document" "web_read" {

  statement {

    sid       = "CloudFrontReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }

  }

  statement {
    sid       = "DenyPlaintextTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
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

resource "aws_s3_bucket_policy" "web" {

  bucket     = aws_s3_bucket.web.id
  policy     = data.aws_iam_policy_document.web_read.json
  depends_on = [aws_s3_bucket_public_access_block.web]

}

data "aws_iam_policy_document" "media_transport" {
  statement {
    sid       = "DenyPlaintextTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
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
resource "aws_s3_bucket_policy" "media" {
  bucket     = aws_s3_bucket.media.id
  policy     = data.aws_iam_policy_document.media_transport.json
  depends_on = [aws_s3_bucket_public_access_block.media]
}

resource "aws_ecr_repository" "api" {

  name                 = "${var.project}/${var.environment}/education-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep 30 images for rollback"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = { type = "expire" }
    }]
  })
}
