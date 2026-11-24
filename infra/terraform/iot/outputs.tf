output "iot_thing_name" {
  value = aws_iot_thing.robot.name
}

output "iot_policy_name" {
  value = aws_iot_policy.robot.name
}

output "iot_policy_arn" {
  value = aws_iot_policy.robot.arn
}

output "iot_endpoint" {
  value = data.aws_iot_endpoint.data.endpoint_address
}

output "mqtt_topic_prefix" {
  value = local.topic_prefix
}
output "feedback_queue_url" { value = aws_sqs_queue.feedback.id }
output "feedback_dlq_url" { value = aws_sqs_queue.feedback_dlq.id }

output "command_topic_arn" { value = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/${local.topic_prefix}/commands" }
output "feedback_queue_arn" { value = aws_sqs_queue.feedback.arn }
output "thing_shadow_arn" { value = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:thing/${local.thing_name}" }
output "recordings_bucket" { value = aws_s3_bucket.recordings.id }
output "recordings_bucket_arn" { value = aws_s3_bucket.recordings.arn }
output "recordings_events_queue_url" { value = aws_sqs_queue.recordings_events.id }
output "recordings_events_queue_arn" { value = aws_sqs_queue.recordings_events.arn }
output "recordings_dlq_url" { value = aws_sqs_queue.recordings_dlq.id }
