# Security response headers for the public distribution (release readiness, 2026-11-24).
#
# Web (default behavior): HSTS, X-Content-Type-Options, X-Frame-Options plus frame-ancestors, Referrer-Policy and a Content-Security-Policy.
# API (/api/v1/*): the same headers without a CSP (JSON responses).
#
# The CSP is shipped as Content-Security-Policy-Report-Only first (`web_csp_report_only = true`): watch the browser console for
# `securitypolicyviolation` on the authenticated pages (Blockly lab, media upload, Supabase sign-in, Twin viewer), then set it to false.
# It was checked against the production web build with the policy ENFORCED: homepage 3D (WebGL, STL/mesh workers, Google Fonts), /login and
# /catalog produced no violation. Not yet checked enforced: signed-in pages.
#
# Nothing here is applied by CI. A reviewed, targeted apply is the only path (see docs/operations/PRODUCTION_RELEASE_READINESS_20261124.md).

variable "web_csp_report_only" {
  description = "Send the Content-Security-Policy as report-only (true) or enforce it (false)."
  type        = bool
  default     = true
}

variable "supabase_project_origin" {
  description = "Hosted Supabase project origin the browser talks to (sign-in, password recovery, invitation links)."
  type        = string
  default     = "https://ovijutkvaaxohauvuxbj.supabase.co"
}

variable "digital_twin_ws_origin" {
  description = "Secure WebSocket origin of the Digital Twin service (for example wss://twin.example.com). Empty while the Twin is not deployed; set it together with the web build variable VITE_DIGITAL_TWIN_WS_URL."
  type        = string
  default     = ""
  validation {
    condition     = var.digital_twin_ws_origin == "" || can(regex("^wss://[a-zA-Z0-9.-]+(:[0-9]+)?$", var.digital_twin_ws_origin))
    error_message = "digital_twin_ws_origin must be empty or a wss:// origin without a path."
  }
}

locals {
  supabase_ws_origin = replace(var.supabase_project_origin, "https://", "wss://")
  media_origin       = "https://${aws_s3_bucket.media.bucket_regional_domain_name}"
  web_csp = join("; ", [
    "default-src 'self'",
    "script-src 'self'",
    # React/framer-motion write inline style attributes; fonts.googleapis.com serves the stylesheet imported by the homepage.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    # Blockly draws its toolbox and zoom controls from static.blockly.com/media/sprites.svg (found by the authenticated CSP test).
    "img-src 'self' data: blob: ${local.media_origin} https://static.blockly.com",
    # Blockly loads its click sounds from static.blockly.com unless a media path is set.
    "media-src 'self' blob: ${local.media_origin} https://static.blockly.com",
    # The API is same-origin (/api/v1). Media uploads are presigned POSTs straight to the Learning Media bucket.
    "connect-src ${join(" ", concat(["'self'", var.supabase_project_origin, local.supabase_ws_origin, local.media_origin], var.digital_twin_ws_origin == "" ? [] : [var.digital_twin_ws_origin]))}",
    # The Learning Media preview shows a PDF in an iframe whose source is a presigned URL on the Learning Media bucket.
    "frame-src 'self' ${local.media_origin}",
    # The SO-101 3D scene decodes meshes and the environment map in module workers.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' ${local.media_origin}",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ])
}

resource "aws_cloudfront_response_headers_policy" "web" {
  name    = "${var.project}-${var.environment}-web-security"
  comment = "HSTS, nosniff, frame protection, referrer policy and CSP for the static web"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    dynamic "content_security_policy" {
      for_each = var.web_csp_report_only ? [] : [1]
      content {
        content_security_policy = local.web_csp
        override                = true
      }
    }
  }

  # index.html, version.json and the SPA routes (rewritten to /index.html) must be revalidated on every load so a deploy is seen at once;
  # the hashed /assets/* files have their own long-lived policy below. `override = false`: an origin that sets Cache-Control keeps it.
  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "no-cache"
      override = false
    }
    dynamic "items" {
      for_each = var.web_csp_report_only ? [1] : []
      content {
        header   = "Content-Security-Policy-Report-Only"
        value    = local.web_csp
        override = true
      }
    }
  }
}

# Same security headers for the hashed static assets, plus a long, immutable cache lifetime.
resource "aws_cloudfront_response_headers_policy" "web_assets" {
  name    = "${var.project}-${var.environment}-web-assets-security"
  comment = "Security headers and immutable caching for content-hashed /assets/*"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    dynamic "content_security_policy" {
      for_each = var.web_csp_report_only ? [] : [1]
      content {
        content_security_policy = local.web_csp
        override                = true
      }
    }
  }

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=31536000, immutable"
      override = true
    }
    dynamic "items" {
      for_each = var.web_csp_report_only ? [1] : []
      content {
        header   = "Content-Security-Policy-Report-Only"
        value    = local.web_csp
        override = true
      }
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "api" {
  name    = "${var.project}-${var.environment}-api-security"
  comment = "HSTS, nosniff, frame protection and referrer policy for the API behavior (JSON, no CSP)"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}
