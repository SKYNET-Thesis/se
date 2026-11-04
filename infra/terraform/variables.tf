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
