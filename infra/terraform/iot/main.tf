data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  thing_name   = "${var.project}-${var.environment}-${var.robot_id}"
  topic_prefix = "${var.project}/${var.environment}/robots/${var.robot_id}"
}

resource "aws_iot_thing" "robot" {
  name = local.thing_name

  attributes = {
    project     = var.project
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
  sql         = "SELECT *, topic() as iotTopic FROM '${local.topic_prefix}/+' WHERE topic(5) IN ('ack','status')"
  sqs {
    queue_url  = aws_sqs_queue.feedback.id
    role_arn   = aws_iam_role.iot_feedback.arn
    use_base64 = false
  }
}
