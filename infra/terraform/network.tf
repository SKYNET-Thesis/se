data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {

  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "${var.project}-${var.environment}"
  }

}

resource "aws_internet_gateway" "main" {

  vpc_id = aws_vpc.main.id
  tags = {
    Name = "${var.project}-${var.environment}"
  }

}

resource "aws_subnet" "public" {

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true
  tags = {
    Name = "${var.project}-${var.environment}-public"
  }

}

resource "aws_route_table" "public" {

  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

}

resource "aws_route_table_association" "public" {

  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id

}

resource "aws_security_group" "api" {

  name_prefix = "${var.project}-${var.environment}-api-"
  description = "Education API; no direct ingress unless explicitly approved"
  vpc_id      = aws_vpc.main.id
  dynamic "ingress" {

    for_each = var.enable_insecure_api_origin ? [1] : []
    content {

      description     = "CloudFront origin-facing HTTP only; payload is not encrypted on origin hop"
      from_port       = 80
      to_port         = 80
      protocol        = "tcp"
      prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]

    }

  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-${var.environment}-api"
  }

}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}
