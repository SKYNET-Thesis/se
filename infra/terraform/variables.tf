variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "project" {
  type    = string
  default = "vista"
}

variable "environment" {
  type    = string
  default = "demo"
}

variable "github_repository" {
  type    = string
  default = "SKYNET-Thesis/se"
}

variable "github_deploy_environment" {
  type        = string
  default     = "aws-demo"
  description = "GitHub environment whose OIDC subject may assume the deploy roles (must have required reviewers)."
}

variable "deploy_branch" {
  type    = string
  default = "main"
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.42.1.0/24"
}

variable "enable_insecure_api_origin" {

  type        = bool
  default     = false
  description = "Explicit approval gate: forwards Bearer tokens from CloudFront to EC2 over plaintext HTTP. Leave false until approved or replaced with TLS ingress."

}

variable "cloudfront_aliases" {
  type        = list(string)
  default     = ["skynex.best", "www.skynex.best"]
  description = "Alternate domain names served by the web distribution (live Production)."
}

variable "cloudfront_acm_certificate_arn" {
  type        = string
  default     = "arn:aws:acm:us-east-1:157098813811:certificate/34e06040-c1ca-417a-944d-df194e1ed7f3"
  description = "ACM certificate (us-east-1) for the aliases. Empty string uses the CloudFront default certificate and requires no aliases."
}

variable "api_origin_domain" {
  type        = string
  default     = "api.skynex.best"
  description = "Public HTTPS hostname of the API origin (nginx + TLS on the EC2 instance)."
}

variable "web_bucket_name" {
  type = string
}

variable "media_bucket_name" {
  type = string
}

variable "ai_models_bucket_name" {
  type        = string
  description = "Globally unique private bucket for AI model artifacts; override the placeholder before provisioning."
  default     = "vista-demo-ai-models-change-me-sg"
}

variable "media_cors_allowed_origins" {
  type        = list(string)
  default     = ["https://skynex.best", "https://www.skynex.best"]
  description = "Browser origins allowed to upload Learning Media with presigned POST, in addition to the CloudFront default domain. Exact HTTPS origins only."

  validation {
    condition     = alltrue([for origin in var.media_cors_allowed_origins : can(regex("^https://[a-z0-9.-]+$", origin))])
    error_message = "Each origin must be an exact https:// origin without a wildcard, path or port."
  }
}

# ---- AWS IoT integration (outputs of the independent infra/terraform/iot root). Empty by default: no IoT permission is added until set. ----
variable "iot_command_topic_arn" {
  description = "Exact ARN of the one robot command topic the Education API may publish to."
  type        = string
  default     = ""
  nullable    = false
}

variable "iot_feedback_queue_arn" {
  description = "Exact ARN of the one feedback queue the IoT feedback worker may read."
  type        = string
  default     = ""
  nullable    = false
}

variable "iot_thing_arn" {
  description = "Exact ARN of the one Thing whose Device Shadow the Education API may read."
  type        = string
  default     = ""
  nullable    = false
}

variable "recordings_bucket_arn" {
  description = "Exact ARN of the Robot Recordings bucket; the API may presign and verify objects under episodes/ only."
  type        = string
  default     = ""
  nullable    = false
}

variable "recordings_events_queue_arn" {
  description = "Exact ARN of the Robot Recordings episode-events queue the recordings worker may read."
  type        = string
  default     = ""
  nullable    = false
}
