# Production release readiness, 2026-11-24

Candidate: develop `a14c36ab35173f6d95d05e77a19c56c2d7694f1b` (release PR #195 to main). Production serves main `5c5667b` (`https://skynex.best/version.json`, ECR tag of the running image).
All checks below were read-only (AWS profile `vista`, `ap-southeast-1`; public HTTP; GitHub API). No secret value was printed; no Production account was created and no e-mail sent.

## Release PR
- Head = develop `a14c36a` = the accepted tree (only the acceptance document differs from the tested commit). All required checks (`api`, `web`, `docker`, `database-safety`, `validate-inventory`) pass. Mergeable CLEAN.
- It is a **draft** and `main` requires **1 approving review** (admins enforced, no code owners). Both must change before it can merge.
- `database/` is unchanged since the last Production Database Release (63c5ac8): the migration manifest has the same 13 entries on main and develop, so the `schema-gate` compat check has nothing pending. The only new environment read by the API is the optional `HTTP_KEEP_ALIVE_TIMEOUT_MS` (unset keeps Node's default).

## Infrastructure (read-only findings)
| Item | State |
| --- | --- |
| EC2 `i-0fa8cb318ce21afa5` (t3.medium) | running, status checks ok, IMDSv2 required, SSM Online, CPU and status alarms OK, no error in the last hour of the API log group |
| Security group | 80 and 443 from anywhere, no SSH |
| ECR `vista/demo/education-api` | immutable tags, scan on push; images `63c5ac8` and `5c5667b` present (rollback target) |
| Secrets Manager `vista/demo/education-api/env` | 10 keys; runtime-role DATABASE_URL, Supabase, Learning Media bucket, WEB_ORIGIN with skynex.best. No IoT/MQTT key. Optional keys absent: `HTTP_KEEP_ALIVE_TIMEOUT_MS`, `COURSE_PREREQUISITES_ENFORCED_FROM`, `SUPABASE_INVITE_REDIRECT_URL` |
| GitHub OIDC | provider present; both deploy roles trust only `repo:SKYNET-Thesis/se:environment:aws-demo`; least-privilege policies |
| S3 web / media / ai-models / prod-db-backups | public access blocked, SSE, versioning, TLS-only policy; web readable only by CloudFront; backups bucket KMS-enforced; media CORS limited to skynex.best origins |
| CloudFront `E1A274BBLHUGAO` | OAC on the web origin, aliases skynex.best and www, ACM cert issued until 2027-05-21, TLS 1.2_2021, `/api/v1/*` to `api.skynex.best`, **no response headers policy, no WAF, no logging** |
| API TLS | Let's Encrypt on the host, expires 2027-02-02. Renewal cannot be confirmed read-only |
| Production MQTT | disabled: no IoT things, policies or rules in the account, no IoT key in the secret |

## CloudFront findings and the prepared fix
Confirmed on `https://skynex.best/`: no HSTS, CSP, X-Content-Type-Options, X-Frame-Options or Cache-Control. `index.html` and `version.json` have no object Cache-Control (CloudFront default TTL 24 h; the deploy invalidates `/*`). A missing asset such as `/assets/x.js` returns an S3 403 XML; extensionless routes (`/catalog`) correctly return the SPA shell.
Prepared (not applied) in this branch: `cloudfront-security-headers.tf` (web and API response headers policies; CSP **report-only** by default, `web_csp_report_only=false` enforces), attachment to both behaviors, and a 403-to-404 custom error response for missing files.
CSP verified by enforcing it on the production build: homepage 3D (WebGL, mesh and environment workers, Google Fonts), `/login`, `/catalog` produced zero violations. Needs: `style-src 'unsafe-inline'` (React inline styles), `fonts.googleapis.com` and `fonts.gstatic.com`, `worker-src blob:`, Supabase over https and wss, the Learning Media bucket for presigned POST and media, `static.blockly.com` for Blockly sounds. Not yet exercised enforced: signed-in pages (Blockly lab, media upload, Twin viewer), hence report-only first.
Proposed, workflow change (needs review, not made here): in `deploy-web`, publish hashed `assets/` with `Cache-Control: public,max-age=31536000,immutable` and `index.html` and `version.json` with `no-cache`.

## Authentication (hosted Supabase `ovijutkvaaxohauvuxbj`)
Verified from the public settings endpoint: e-mail provider on, phone and all OAuth providers off, e-mail confirmation required, public sign-up allowed. **Not verifiable without the Supabase management token (held only in the GitHub environments):** SMTP provider and sender, Site URL, redirect allow-list, e-mail templates, rate limits. Required configuration: Site URL `https://skynex.best`; allow-list `https://skynex.best/**` and `https://www.skynex.best/**` (password recovery returns to `/reset-password`); invitation links use `SUPABASE_INVITE_REDIRECT_URL`, which is **unset** in the secret, so they fall back to the Site URL. Custom SMTP (not the shared Supabase sender) is needed for real delivery. Configuration checks are not delivery evidence: one approved test message to a controlled mailbox is still required.
`STUDENT_TEMP_PASSWORD_ENABLED` is set (4 characters, so enabled) in the Production secret; the feature is documented as off by default, so the owner should confirm that is intended.

## Pipeline
Push to main runs Education CI, then Auto Deploy (AWS_DEPLOY_ENABLED=true) dispatches the deploy: `schema-gate` (read-only Production schema compatibility, environment `production-database-preflight`, no reviewers), then `deploy-api` and `deploy-web` behind `aws-demo` (required reviewer, branch policy). API deploy: pull the exact image, validate the secret, stop-start with a 60 s health wait on the host; on failure it restarts the previous image automatically. Rollback of the API: dispatch `Education CI` with `action=rollback` (runs `vista-rollback-api` from `/opt/vista/previous-image`, not schema-gated). Web: no rollback action; recovery is a revert commit through the same pipeline, or restoring the previous object versions (the web bucket is versioned; `sync --delete` leaves delete markers).

## Deployment sequence (proposed, needs explicit approval at each gate)
1. Owner: Supabase Site URL, redirect allow-list, custom SMTP; set `SUPABASE_INVITE_REDIRECT_URL`; confirm the temporary-password flag.
2. Merge the CloudFront branch to develop after review; owner runs a reviewed, targeted Terraform plan limited to `aws_cloudfront_*` (never a plain apply) and applies it with the CSP in report-only mode.
3. Mark #195 ready, obtain 1 approval, merge to main.
4. Education CI passes, Auto Deploy dispatches, `schema-gate` passes, owner approves `aws-demo`: API deploys first, then web.
5. Verify `version.json`, `/api/v1/health` on both hostnames, the homepage 3D, sign-in and one approved test e-mail.
6. After one release cycle without violations, set `web_csp_report_only=false` through the same targeted plan.
Rollback: API `action=rollback` (previous image `5c5667b` is in ECR); web by revert PR or object-version restore; CloudFront by removing the policy attachment in a targeted apply.
