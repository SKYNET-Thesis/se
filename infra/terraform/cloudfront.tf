resource "aws_cloudfront_origin_access_control" "web" {

  name                              = "${var.project}-${var.environment}-web"
  description                       = "Sign private S3 web origin requests"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"

}

resource "aws_cloudfront_distribution" "web" {

  enabled             = true
  aliases             = var.cloudfront_aliases
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200"
  origin {

    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id

  }

  # Live Production API origin: HTTPS-only to the public API hostname (nginx + TLS on the EC2 instance).
  origin {

    domain_name = var.api_origin_domain
    origin_id   = "vista-api"
    custom_origin_config {

      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5

    }

  }

  default_cache_behavior {

    target_origin_id       = "web-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true

    response_headers_policy_id = aws_cloudfront_response_headers_policy.web.id
    function_association {

      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn

    }

  }

  ordered_cache_behavior {

    path_pattern             = "/api/v1/*"
    target_origin_id         = "vista-api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true

    response_headers_policy_id = aws_cloudfront_response_headers_policy.api.id

  }

  # A missing file (an unknown /assets/x.js) is answered by S3 with 403 because the origin has no s3:ListBucket; show it as the 404 it is
  # (the SPA shell body, status 404). Browser routes without a file extension are rewritten to /index.html by the viewer-request function.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }

  }

  # Live Production certificate (ACM, us-east-1, SNI). An empty ARN falls back to the CloudFront default certificate (no aliases allowed then).
  viewer_certificate {
    cloudfront_default_certificate = var.cloudfront_acm_certificate_arn == ""
    acm_certificate_arn            = var.cloudfront_acm_certificate_arn == "" ? null : var.cloudfront_acm_certificate_arn
    ssl_support_method             = var.cloudfront_acm_certificate_arn == "" ? null : "sni-only"
    minimum_protocol_version       = var.cloudfront_acm_certificate_arn == "" ? null : "TLSv1.2_2021"
  }

  tags = {
    Name = "${var.project}-${var.environment}-web"
  }

}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewerExceptHostHeader"
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

# Kept (already in state; not used by the live behavior, which uses the managed AllViewer policy) so that no resource is destroyed.
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
