# CloudFront hardening: change assessment (PR #196), 2026-11-24

Nothing here has been applied. The assessment comes from a **full** `terraform plan` of the whole configuration (refresh on, `-lock=false`, so no state write), not from a targeted plan.

## What a full plan shows
`Plan: 3 to add, 3 to change, 0 to destroy.` No drift: Terraform found no object changed outside its state, and no resource is replaced or destroyed (the EC2 instance is untouched).
- **Add (3):** response headers policies `web`, `web_assets`, `api`.
- **Change in place (3):** `aws_cloudfront_distribution.web` (attach a policy to the default and `/api/v1/*` behaviors, add one `/assets/*` behavior); `aws_s3_bucket_policy.web` (add `s3:ListBucket` for this distribution only); `aws_iam_role_policy.github_web`.
- **Why the IAM role policy appears:** its policy document reads the distribution ARN, and Terraform defers a data source that depends on a resource with a pending change, so the plan shows the whole document as "known after apply". The content is not intended to change (S3 ListBucket and Get/Put/Delete on the web bucket, CloudFront invalidation on this distribution). Check this on the real plan output before applying; it is the one change that touches the deploy role, so it deserves the owner's eye.
- A **targeted** plan on the distribution alone would hide the bucket-policy and role-policy effects of the same change; do not use it to validate this release.

## Behavior after apply
| Item | Result |
| --- | --- |
| HSTS 1 year (no includeSubdomains, no preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` | on web, assets and API responses |
| CSP | `Content-Security-Policy-Report-Only` on web and assets (variable `web_csp_report_only`, default true); `frame-ancestors 'none'` also covers framing once enforced |
| Cache-Control | default behavior (`index.html`, `version.json`, SPA routes): `no-cache`, only when S3 sent none; `/assets/*`: `public, max-age=31536000, immutable` (Vite content-hashes these names) |
| SPA routing | unchanged: extensionless paths are rewritten to `/index.html` by the viewer-request function |
| Missing static file | S3 answers 404 instead of 403 (new `s3:ListBucket` for this distribution). Not served as `index.html`: a missing `.js`, `.css` or model file stays a real 404 |
| API behavior | cache disabled as before; only security headers added; API 403 responses are untouched |

An earlier draft of this PR used a distribution-wide custom error response (403 to 404 with `index.html`). It was removed: CloudFront applies it to every origin, so a genuine API 403 would have been rewritten to an HTML 404.

## CSP compatibility
Directives: `default-src 'self'`; scripts `'self'`; styles `'self' 'unsafe-inline'` plus `fonts.googleapis.com`; fonts `fonts.gstatic.com`; images from `'self'`, `blob:`, `data:`, the Learning Media bucket and `static.blockly.com` (Blockly toolbox sprites); media from the same plus Blockly sounds; `connect-src` the Supabase https and wss origin and the media bucket (presigned POST uploads); `frame-src` the media bucket (PDF preview iframe); `worker-src 'self' blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action` self and the media bucket.
Known limits: report-only has no collector (no `report-to` endpoint exists), so violations are visible only in a browser console; the Digital Twin WebSocket is not allowed (it is not deployed in Production; add its `wss:` origin if it ever is); inline styles need `'unsafe-inline'` because React and framer-motion write style attributes.

## Tested under the enforced policy (local stack, production web build, same-origin `/api/v1` like CloudFront)
- The policy was read straight from `cloudfront-security-headers.tf` with the local origins substituted.
- Signed-in sweep as student (My Learning, course, lesson, reading, assignment page, quiz attempt, Blockly programming attempt, AI registry, catalog, settings), instructor (teacher pages, classes, assignments) and School Admin (school pages, offerings, courses, import, Course Builder list): **one violation found and fixed**, `img-src` for `https://static.blockly.com/media/sprites.svg`. After the fix: none.
- Synthetic: an iframe and a POST to the media origin are allowed; an iframe and a fetch to another origin are blocked (so the policy is really enforced).
- Real Playwright specs against the enforced build: course authoring, evidence upload to the media bucket, module quiz, Course Builder delivery, Blockly simulation, the integrated WF-01 to WF-04 lab, draft discard: **13 passed**.
- Not covered: the Digital Twin viewer (not deployed in Production), a PDF preview with a real presigned URL (the iframe rule was verified synthetically), and the hosted Supabase origin itself (only its local stand-in).

## Apply path (owner)
1. Review and merge this PR. 2. `terraform plan -out=release.tfplan` of the **whole** configuration; confirm exactly 3 add, 3 change, 0 destroy and the IAM role policy content. 3. `terraform apply release.tfplan` (the saved plan, never a fresh apply). 4. Verify with `curl -sI` on the site root, an asset, an unknown asset and `/api/v1/health`. 5. Exercise the signed-in pages with the console open. 6. After a release without violations set `web_csp_report_only=false` and repeat steps 2 to 4.
Rollback: remove the three `response_headers_policy_id` lines and the `/assets/*` behavior (or revert the PR) and apply again; a distribution update takes a few minutes and serves the old behavior meanwhile. The bucket-policy statement can be removed the same way.
