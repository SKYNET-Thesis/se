# VISTA — Production release gate (read-only review, 2026-11-26)

> **Update, final develop `6d49566`:** host-script gate **PASS** and Production configuration checked read-only via AWS profile `vista` / SSM (results in §9). Release PR: #222 (draft).

Scope: what merging `develop` into `main` would do. Sources: repository, GitHub Actions metadata and variables (read-only), public HTTP endpoints. **No Production or AWS resource was modified, no SSM command was run, no credential was used.** Items that need AWS or Supabase credentials are listed as NOT VERIFIED.

## 1. State of the three revisions

| Revision | Value |
|---|---|
| Production web (`https://skynex.best/version.json`) | `ef95cdd` (PR #207 hotfix) |
| `main` head | `745c7ac` (merge of #210). Its deploy dispatch was **cancelled** after `schema-gate` succeeded, so main is ahead of Production by #208–#210 (infrastructure scripts and CI only, no application code) |
| `develop` | `7ac0d58` plus the open documentation/Homepage PRs (#220, #221); 24 commits ahead of `main`, `main` has 1 commit (#210 merge) not in `develop` whose tree is already contained; `git merge-tree` develop→main is **clean** |
| API health (`api.skynex.best/api/v1/health`) | `ok`, PostgreSQL up |
| New route in this release (`/me/attempts/:id/quiz-result`) on Production | 404 (not yet deployed), as expected |

## 2. Database and migrations — READY (no migration)

- `git diff ef95cdd develop -- database services/education-api/prisma` is **empty**: no migration file, manifest or release-scope change. The migration manifest has the same 13 entries as Production's last Database Release. The `schema-gate` read-only compatibility check therefore has nothing new to require.
- Nothing destructive or incompatible is introduced: the Question Bank import writes ordinary rows (drafts) into existing tables; the quiz dashboard is read-only; no column is added or removed.
- Production Database Release workflow is **not** involved and must not be run for this release.

## 3. Backend — READY, with one owner pre-step

| Item | Finding |
|---|---|
| New environment variables | none required (compare `git diff ef95cdd develop -- services/education-api/src` for `process.env`/config: no new key) |
| Authorization | import commit now authorizes before validating (D-09); owner-only quiz-result route; covered by `lms-security-matrix`, DB tests |
| Backward compatibility | additive route; import commit now requires `confirm` and `expectedSha256` (the web client sends them; other clients of that endpoint would need updating) |
| Health/readiness | `/health` verified OK on Production today; `/health/ready` is post-deploy smoke |
| S3 Learning Media, recordings, feedback worker, Digital Twin | unchanged code paths; Production MQTT remains off (no IoT key in the secret per the 2026-11-24 read-only review); workers unchanged |
| **Host deploy script drift (owner pre-step)** | `main` contains a check (`check-host-deploy-script.sh`) that **fails the deploy before anything is replaced** unless `/usr/local/bin/vista-deploy-api` on the EC2 host equals the repository's `deploy-api.sh`. `deploy-api.sh` changed since Production's last deploy (`--no-healthcheck` on the two worker containers, #208–#210), so unless the owner already refreshed the host script the deploy will stop there. Fix: owner-approved `infra/terraform/scripts/refresh-host-deploy-script.sh --execute`, then re-run. I did not run an SSM command to read the host hash, so whether it is stale is **NOT VERIFIED**. Failing here is safe (the running API is untouched) |

## 4. Web — READY

Build inputs come from the `aws-demo` environment: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL=/api/v1`, `PUBLIC_DIGITAL_TWIN_WS_URL` (repository variable present: `wss://api.skynex.best/ws/twin`). The deploy job fails closed if the Supabase values are missing. Static assets are synced to the web bucket and CloudFront `/*` is invalidated; `version.json` is checked after deploy. CloudFront response-header policy **is applied in Production** (verified 2026-11-26 from the live response headers: `content-security-policy-report-only`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `strict-transport-security: max-age=31536000`, `cache-control: no-cache` on HTML). The CSP is still **report-only** (Chrome logs a console notice that `upgrade-insecure-requests` is ignored in report-only mode); enforcement is a separate decision. This supersedes the earlier statement that the Terraform change was unapplied; it is not part of this release. The Homepage Desktop download (PR #221) links to the GitHub release asset directly; it does not depend on CloudFront configuration. Environment-scoped values (`WEB_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, role ARNs) were not read: NOT VERIFIED.

## 5. Deployment workflow conditions (what merging to `main` triggers)

1. Push to `main` runs **Education CI** (validation only): api, web, docker, database-safety, runtime/syntax and inventory jobs. `changes`, `schema-gate`, `deploy-api`, `deploy-web` are skipped on a push (`changes` runs only for `workflow_dispatch` on `main`).
2. **Auto Deploy** (`workflow_run` on success of Education CI on `main`, `AWS_DEPLOY_ENABLED=true`) verifies every required check of that commit, confirms it is still the head of `main`, then dispatches Education CI with `action=deploy`.
3. The dispatched run: `changes` → `schema-gate` (read-only Production schema compatibility, environment `production-database-preflight`, branch policy only) → `deploy-api` and `deploy-web`, each behind environment **`aws-demo` with required reviewers**. **Nothing reaches Production without a reviewer approving `aws-demo`.** That is exactly where the #210 deploy was stopped.
4. Merging `main` therefore *starts* the deployment path but cannot finish it without the owner's approval at `aws-demo`.
5. `main` branch protection (per the 2026-11-24 review): one approving review required, administrators enforced. Not changed by this work.

## 6. Rollback — READY (compatible, no data to reverse)

API: dispatch Education CI with `action=rollback` (not schema-gated); the previous image is retained in ECR (immutable tags; `ef95cdd`/previous SHAs). Web: redeploy the previous bundle (revert PR or object-version restore) and invalidate CloudFront. Database: none applied, so none to reverse. Imported draft questions can be archived through the authoring UI. The previous healthy release is Production's current `ef95cdd`.

## 7. Production smoke tests (after an approved deploy; read-only first)

`version.json` equals the released SHA; `/api/v1/health` on both hostnames; `GET /api/v1/me/attempts/<uuid>/quiz-result` without a token → 401; public site and sign-in load; Homepage shows **Download DEB** (v0.1.0, 125.3 MiB) and the link returns HTTP 200; one test student in a **test** classroom opens a quiz result.

## 8. Not verified / owner confirmations

Host script hash; environment-scoped GitHub variables; Supabase hosted settings (Site URL, redirects, SMTP) and whether `STUDENT_TEMP_PASSWORD_ENABLED` is intended as set in the Production secret (flagged on 2026-11-24, still open); CloudFront security-header Terraform (unapplied); Production MQTT stays off.

## 9. Read-only verification results (2026-11-26, after #220/#221 merged)

| Check | Result |
|---|---|
| Host `/usr/local/bin/vista-deploy-api` SHA-256 | `ef5a33bf805e52bbc39c614ec980c5a912562ba01d81a3c8e3e35877c89704bd` = `main` = `develop` `deploy-api.sh` → **PASS** (supersedes the NOT VERIFIED in §3) |
| `/health`, `/health/ready` | 200; database, academicMetadataColumns, mediaArchiveColumns, runtimeRole all true |
| Running revision | `ef95cdd`; containers API, Digital Twin (`/health` ok, mode `mock`), IoT feedback worker, recordings worker running, 0 restarts |
| Production MQTT | `VISTA_IOT_ENABLED=false`; 1 IoT Thing, 1 rule, **0 certificates** → disabled |
| `STUDENT_TEMP_PASSWORD_ENABLED` | **`true` on the running API** — not the documented default; unchanged by this release; owner decision pending (not modified) |
| Schema compatibility | `schema-gate` on `main` `745c7ac` reported `compatible`; `database/` identical to `develop` |
| Gates | `aws-demo` reviewers + branch policy; `production-database-preflight` branch policy |

Verdict: **READY TO MERGE to `main` as a draft/approval-gated release once #220 and #221 are in `develop`; deployment is BLOCKED on the owner's `aws-demo` approval and on the host-script check.** No production acceptance is claimed.
