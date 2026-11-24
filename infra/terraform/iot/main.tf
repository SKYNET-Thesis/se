data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  thing_name   = "${var.project}-${var.environment}-${var.robot_id}"
  topic_prefix = "${var.project}/${var.environment}/robots/${var.robot_id}"
}

resource "aws_iot_thing" "robot" {
  name = local.thing_name

  # AWS allows 3 attributes on a Thing without a thing type.
  attributes = {
    environment = var.environment
    robot_id    = var.robot_id
    robot_model = "SO-101"
  }
}

data "aws_iam_policy_document" "robot" {
  statement {
    sid    = "ConnectAsRegisteredThing"
    effect = "Allow"

    actions = [
      "iot:Connect"
    ]

    resources = [
      "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:client/${local.thing_name}"
    ]
  }

  statement {
    sid    = "PublishRobotTelemetry"
    effect = "Allow"

    actions = [
      "iot:Publish"
    ]

    resources = [
      for topic in ["telemetry", "status", "ack"] :
      "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/${local.topic_prefix}/${topic}"
    ]
  }

  statement {
    sid    = "SubscribeRobotCommands"
    effect = "Allow"

    actions = [
      "iot:Subscribe"
    ]

    resources = [
      "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topicfilter/${local.topic_prefix}/commands"
    ]
  }

  # Classic Device Shadow of this Thing only: the edge reports last-known state (connection, stop latch, hardware mode, calibration) and
  # may read it back. It cannot touch another Thing's shadow or any other topic.
  statement {
    sid     = "ShadowPublish"
    effect  = "Allow"
    actions = ["iot:Publish"]
    resources = [
      for op in ["update", "get"] :
      "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/$aws/things/${local.thing_name}/shadow/${op}"
    ]
  }

  statement {
    sid     = "ShadowSubscribe"
    effect  = "Allow"
    actions = ["iot:Subscribe"]
    resources = [
      for op in ["update/*", "get/*"] :
      "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topicfilter/$aws/things/${local.thing_name}/shadow/${op}"
    ]
  }

  statement {
    sid     = "ShadowReceive"
    effect  = "Allow"
    actions = ["iot:Receive"]
    resources = [
      for op in ["update/*", "get/*"] :
      "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/$aws/things/${local.thing_name}/shadow/${op}"
    ]
  }

  statement {
    sid    = "ReceiveRobotCommands"
    effect = "Allow"

    actions = [
      "iot:Receive"
    ]

    resources = [
      "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/${local.topic_prefix}/commands"
    ]
  }
}

resource "aws_iot_policy" "robot" {
  name   = "${local.thing_name}-policy"
  policy = data.aws_iam_policy_document.robot.json
}

data "aws_iot_endpoint" "data" {
  endpoint_type = "iot:Data-ATS"
}

resource "aws_sqs_queue" "feedback_dlq" {
  name                      = "${local.thing_name}-feedback-dlq"
  message_retention_seconds = 1209600
}
resource "aws_sqs_queue" "feedback" {
  name                       = "${local.thing_name}-feedback"
  visibility_timeout_seconds = 90
  receive_wait_time_seconds  = 20
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.feedback_dlq.arn, maxReceiveCount = 5 })
}
resource "aws_iam_role" "iot_feedback" {
  name               = "${local.thing_name}-iot-feedback"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "iot.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "iot_feedback" {
  role   = aws_iam_role.iot_feedback.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.feedback.arn }] })
}
resource "aws_iot_topic_rule" "feedback" {
  name        = replace("${local.thing_name}_feedback", "-", "_")
  enabled     = true
  sql_version = "2016-03-23"
  # Only command-correlated events reach the feedback worker; the edge's periodic device state (no commandId) lives in the Device Shadow.
  sql = "SELECT *, topic() as iotTopic FROM '${local.topic_prefix}/+' WHERE (topic(5) = 'ack' OR topic(5) = 'status') AND isUndefined(commandId) = false"
  sqs {
    queue_url  = aws_sqs_queue.feedback.id
    role_arn   = aws_iam_role.iot_feedback.arn
    use_base64 = false
  }
}


# ---------------------------------------------------------------------------------------------------------------------
# Robot Recordings (episodes recorded by the Desktop Lab Station / edge runtime) and episode events.
# One private bucket, uploaded with short-lived presigned URLs issued by the Education API under `episodes/<robot>/<episode>/`.
# The last object of an episode is `manifest.json`; its creation is the "episode complete" event, sent to a queue with a DLQ so a
# consumer can validate and register the episode without polling. No consumer runs yet (no table or API depends on it).
# ---------------------------------------------------------------------------------------------------------------------
locals {
  recordings_bucket = coalesce(var.recordings_bucket_name, "${var.project}-${var.environment}-robot-recordings-${data.aws_caller_identity.current.account_id}-sg")
}

resource "aws_s3_bucket" "recordings" {
  bucket = local.recordings_bucket
}

resource "aws_s3_bucket_public_access_block" "recordings" {
  bucket                  = aws_s3_bucket.recordings.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "recordings" {
  bucket = aws_s3_bucket.recordings.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "recordings" {
  bucket = aws_s3_bucket.recordings.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Optional retention. 0 keeps episodes until the owner decides (storage of a few episodes costs cents).
  dynamic "rule" {
    for_each = var.recordings_retention_days > 0 ? [1] : []
    content {
      id     = "expire-episodes"
      status = "Enabled"
      filter {
        prefix = "episodes/"
      }
      expiration {
        days = var.recordings_retention_days
      }
    }
  }
}

data "aws_iam_policy_document" "recordings" {
  statement {
    sid       = "DenyPlaintextTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.recordings.arn, "${aws_s3_bucket.recordings.arn}/*"]
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

resource "aws_s3_bucket_policy" "recordings" {
  bucket     = aws_s3_bucket.recordings.id
  policy     = data.aws_iam_policy_document.recordings.json
  depends_on = [aws_s3_bucket_public_access_block.recordings]
}

resource "aws_sqs_queue" "recordings_dlq" {
  name                      = "${local.thing_name}-recordings-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "recordings_events" {
  name                       = "${local.thing_name}-recordings-events"
  visibility_timeout_seconds = 120
  receive_wait_time_seconds  = 20
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.recordings_dlq.arn, maxReceiveCount = 5 })
}

resource "aws_sqs_queue_policy" "recordings_events" {
  queue_url = aws_sqs_queue.recordings_events.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowRecordingsBucketToNotify"
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.recordings_events.arn
      Condition = {
        ArnEquals    = { "aws:SourceArn" = aws_s3_bucket.recordings.arn }
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_s3_bucket_notification" "recordings" {
  bucket = aws_s3_bucket.recordings.id
  queue {
    queue_arn     = aws_sqs_queue.recordings_events.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "episodes/"
    filter_suffix = "/manifest.json"
  }
  depends_on = [aws_sqs_queue_policy.recordings_events]
}
