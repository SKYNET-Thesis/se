data "aws_ami" "al2023" {

  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

}

resource "aws_cloudwatch_log_group" "api" {

  name              = "/${var.project}/${var.environment}/education-api"
  retention_in_days = 14

}

resource "aws_secretsmanager_secret" "api" {

  name                    = "${var.project}/${var.environment}/education-api/env"
  description             = "JSON object of Education API environment values; create a version out of band"
  recovery_window_in_days = 30

}

data "aws_iam_policy_document" "ec2_assume" {

  statement {

    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

  }

}

resource "aws_iam_role" "ec2" {

  name               = "${var.project}-${var.environment}-education-api-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json

}

resource "aws_iam_role_policy_attachment" "ssm" {

  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"

}

data "aws_iam_policy_document" "ec2" {

  statement {

    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]

  }

  statement {

    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [aws_ecr_repository.api.arn]

  }

  statement {

    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.api.arn]

  }

  statement {

    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]

  }

}

resource "aws_iam_role_policy" "ec2" {

  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ec2.json

}

resource "aws_iam_instance_profile" "api" {

  name = "${var.project}-${var.environment}-education-api"
  role = aws_iam_role.ec2.name

}

resource "aws_instance" "api" {

  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.api.id]
  iam_instance_profile   = aws_iam_instance_profile.api.name
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {

    log_group     = aws_cloudwatch_log_group.api.name
    aws_region    = var.aws_region
    secret_id     = aws_secretsmanager_secret.api.id
    deploy_script = file("${path.module}/scripts/deploy-api.sh")

    }
  )
  user_data_replace_on_change = true
  tags = {
    Name = "${var.project}-${var.environment}-education-api"
  }

}

resource "aws_eip" "api" {
  domain   = "vpc"
  instance = aws_instance.api.id
  tags     = { Name = "${var.project}-${var.environment}-api" }
}

resource "aws_cloudwatch_metric_alarm" "cpu" {

  alarm_name          = "${var.project}-${var.environment}-api-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Education API EC2 CPU above 80% for 15 minutes"
  dimensions = {
    InstanceId = aws_instance.api.id
  }

}

resource "aws_cloudwatch_metric_alarm" "status" {

  alarm_name          = "${var.project}-${var.environment}-api-status-check"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Education API EC2 status check failed"
  dimensions = {
    InstanceId = aws_instance.api.id
  }

}
