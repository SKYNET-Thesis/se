resource "aws_cloudfront_origin_access_control" "web" {

  name                              = "${var.project}-${var.environment}-web"
  description                       = "Sign private S3 web origin requests"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"

}

resource "aws_cloudfront_distribution" "web" {

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200"
  origin {

    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id

  }

  dynamic "origin" {

    for_each = var.enable_insecure_api_origin ? [1] : []
    content {

      domain_name = aws_eip.api.public_dns
      origin_id   = "api-ec2-http"
      custom_origin_config {

        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "http-only"
        origin_ssl_protocols   = ["TLSv1.2"]

      }

    }

  }

  default_cache_behavior {

    target_origin_id       = "web-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
    function_association {

      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn

    }

  }

  dynamic "ordered_cache_behavior" {

    for_each = var.enable_insecure_api_origin ? [1] : []
    content {

      path_pattern             = "/api/v1/*"
      target_origin_id         = "api-ec2-http"
      viewer_protocol_policy   = "https-only"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
      compress                 = true

    }

  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }

  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project}-${var.environment}-web"
  }

}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_function" "spa" {

  name    = "${var.project}-${var.environment}-spa"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite browser routes to index.html; leave API and asset paths intact"
  publish = true
  code    = file("${path.module}/spa.js")

}

resource "aws_cloudfront_origin_request_policy" "api" {

  name    = "${var.project}-${var.environment}-api-all-viewer"
  comment = "Forward Bearer tokens, query strings, and CORS headers; API caching is disabled"
  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "allViewer"
  }

  query_strings_config {
    query_string_behavior = "all"
  }

}
