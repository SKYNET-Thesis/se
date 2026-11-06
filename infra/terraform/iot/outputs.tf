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
