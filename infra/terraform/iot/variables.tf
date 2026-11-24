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

variable "robot_id" {
  type    = string
  default = "so101-001"
}

variable "recordings_bucket_name" {
  description = "Robot Recordings bucket name; empty uses <project>-<environment>-robot-recordings-<account>-sg."
  type        = string
  default     = ""
  nullable    = false
}

variable "recordings_retention_days" {
  description = "Expire episodes after this many days; 0 keeps them."
  type        = number
  default     = 0
  validation {
    condition     = var.recordings_retention_days >= 0 && var.recordings_retention_days <= 3650
    error_message = "recordings_retention_days must be between 0 and 3650."
  }
}
