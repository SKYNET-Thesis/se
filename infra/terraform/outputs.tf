output "web_url" {
  value = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "web_bucket" {
  value = aws_s3_bucket.web.bucket
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "ai_models_bucket" {
  value = aws_s3_bucket.ai_models.bucket
}

output "ai_models_upload_policy_arn" {
  value = aws_iam_policy.ai_models_upload.arn
}

output "ai_models_download_policy_arn" {
  value = aws_iam_policy.ai_models_download.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "api_instance_id" {
  value = aws_instance.api.id
}

output "api_secret_arn" {
  value = aws_secretsmanager_secret.api.arn
}

output "github_api_role_arn" {
  value = aws_iam_role.github_api.arn
}

output "github_web_role_arn" {
  value = aws_iam_role.github_web.arn
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.web.id
}

output "api_ingress_enabled" {
  value = var.enable_insecure_api_origin
}
