# LMS K–L — merge, hosted evidence and Production release runbook

Status: **no step below has been executed against Production.** Every numbered step has its own approval. Facts were read on 2026-11-18
(read-only AWS calls, `terraform plan -lock=false` against the live state in a scratch copy; no apply, no secret values read).

## A. Findings that shape the sequence

* **Hosted evidence cannot run before merge.** `production-readiness-evidence.yml` is `workflow_dispatch` only with `if: github.ref == 'refs/heads/main'`, and
  GitHub lists a dispatch workflow only when it exists on the default branch. The same script can be run from the PR branch on an operator machine (step 3, alternative).
* **Merging cannot change Production.** After merge, Auto Deploy dispatches the deploy workflow; its `schema-gate` (`production_db_release.py compat`) fails closed because
  K and L are in the manifest but not applied in Production, so no API/web image reaches EC2 (`deploy-api`/`deploy-web` need `schema-gate` success and the `aws-demo` reviewer).
  A red schema-gate run after merge is the intended safe outcome. `AWS_DEPLOY_ENABLED` is `true`.
* **K–L is blocked in code** (`HOSTED_BLOCKED_SCOPES = ("K-L", "M")`). The unblock is a separate reviewed change (step 5) that must not be merged before reviewed evidence exists.
* **Terraform now matches live Production** (see §B). The remaining plan is 0 add / 4 change / 0 destroy.

## B. Terraform reconciliation (read-only plan result)

Live account 157098813811, `ap-southeast-1`; state `vista/demo/terraform.tfstate`; instance `i-0fa8cb318ce21afa5`; distribution `E1A274BBLHUGAO`.

| Area | Live | Configuration now | Plan |
|---|---|---|---|
| CloudFront aliases | `skynex.best`, `www.skynex.best` | `var.cloudfront_aliases` (same default) | no change |
| TLS | ACM us-east-1 cert `34e06040…`, SNI, `TLSv1.2_2021` | `var.cloudfront_acm_certificate_arn` (same default) | no change |
| API origin | `vista-api` → `api.skynex.best`, HTTPS-only TLSv1.2, timeouts 30/5 | same (`var.api_origin_domain`); old HTTP `api-ec2-http` origin removed from config | no change |
| API behavior | `/api/v1/*`, 7 methods, CachingDisabled, AllViewerExceptHostHeader, redirect-to-https | same (managed policies via data sources) | no change |
| Web OAC / S3 bucket policy | OAC `EOK08PFF3K6BY`, CloudFront-only read + TLS-only deny | unchanged | no change |
| EC2 replacement | AMI/`user_data` drift would have replaced the instance | `ignore_changes=[ami,user_data]`, `prevent_destroy=true`, `user_data_replace_on_change=false` | none |
| OIDC trust | `repo:SKYNET-Thesis/se:environment:aws-demo` | same (`var.github_deploy_environment`) | none |
| Media CORS | `PUT`,`HEAD`; CloudFront domain only | `POST`,`HEAD`; CloudFront domain + `skynex.best` + `www.skynex.best`; headers `content-type`,`x-amz-*`,`content-md5`; 300 s | **change** |
| Media IAM (EC2 role) | ECR, Secrets Manager, Logs only | + `s3:PutObject`/`s3:GetObject` on `learning-media/courses/*` and on `learning-media/submissions/*` only (no delete, no list, no bucket-wide) | **change** |
| Security group | 80/443 from `0.0.0.0/0` | inline `ingress` unmanaged (Computed), so Terraform neither reads nor changes it | none |

Plan: `0 to add, 4 to change, 0 to destroy`, no replacement. The four changes are the media CORS rule, the EC2 role inline policy, the in-place
`user_data_replace_on_change true→false` (state-only attribute), and `github_api` role policy shown as "known after apply" only because its policy document depends on the
instance being updated in-place (content is identical: ECR push, SSM SendCommand on the instance and `AWS-RunShellScript`, GetCommandInvocation). `terraform fmt -check` and `validate` pass.
The unmanaged custom origin-request policy `aws_cloudfront_origin_request_policy.api` stays in state (unused) so that nothing is destroyed.
Static guards: `tests/database/test_terraform_production_guards.py`.

Presigned POST is what the application uses (`createPresignedPost` in `learning-media.storage.ts` and `submission-file.storage.ts`); the app never calls delete in production code.
The secret `vista/demo/education-api/env` must contain `LEARNING_MEDIA_BUCKET=vista-demo-media-157098813811-sg` and `AWS_REGION` (verify key names only, never print values).

## C. Approval-gated runbook

Rule for every step: stop at the first failure, report it, do not retry blindly.

### 1. Independent PR review — approval: reviewer (human)
* Pre: PR #158 up to date with `main` (`git rev-list --left-right --count origin/main...HEAD` left side 0), required checks green.
* Expected: reviewer reads `database/migrations/20261116_l_runtime_role.sql`, `scripts/production_db_release.py::refuse_blocked_scope`, `scripts/production_readiness_evidence.py`, workflows, `infra/terraform/*`.
* Fail: any unresolved comment or red check. Rollback: none.

### 2. Merge decision — approval: repository owner
* Pre: step 1 done. Merging is the human's action (squash or merge per repo rules); not done by the agent.
* Expected: Education CI green on `main`; Auto Deploy runs; `schema-gate` **red** with "migrations not applied: 20261116_k…, 20261116_l…"; deploy jobs skipped; EC2 untouched.
* Fail: a deploy job starts → cancel the run immediately and set `AWS_DEPLOY_ENABLED=false` (repository variable). Rollback: revert PR on `main`.

### 3. Hosted read-only evidence — approval: owner (text below)
> I approve ONE read-only run of the hosted readiness evidence on `main`: dispatch `Production Readiness Evidence` using environment `production-database-preflight` secrets
> `PRODUCTION_DATABASE_READONLY_URL` and `PRODUCTION_SUPABASE_URL`, project ref `ovijutkvaaxohauvuxbj`. One `SELECT` inside `BEGIN READ ONLY`; redacted booleans/counts only. Stop on any BLOCKING finding.
* Credentials: the two secrets above (reader role; the environment has no reviewers). SQL: `evidence_sql()` — a single read-only SELECT; no DDL/DML/ledger write; the project ref is checked first.
* Expected: exit 0; every blocking check `true` (ledger exactly D–J, apply role owns database, apply role can use every schema, reader present, no runtime-role privileges outside `public`, M not applied).
* Fail: exit 1 or incomplete evidence. Triage the check named in the log; fix with a code change, not by editing Production. Rollback: none (read-only).
* Alternative before merge (operator machine): `DATABASE_URL=<read-only URL> SUPABASE_URL=<project URL> python scripts/production_db_release.py evidence --expected-project-ref ovijutkvaaxohauvuxbj` (PostgreSQL 17 client).
* Reviewed output is attached to the unblock PR (step 5). Do not paste URLs into chat or logs.

### 4. Backup and restore readiness — approval: owner
* Pre: step 3 clean. Run `production_db_release.py check-backup` (logical mode: `pg_dump` of `public`, restore test into a disposable database, evidence ≤ 12 h).
* Expected: restore test passes, evidence file produced, age ≤ 12 h. Fail: stale/failed restore → no migration. Rollback: none (read-only on Production).

### 5. K–L migration authorization — approval: owner + second reviewer
* Pre: steps 3–4 reviewed. Merge the **unblock PR** (prepared on local branch `release/lms-k-l-unblock-after-evidence`, not pushed): removes `K-L` from `HOSTED_BLOCKED_SCOPES` only,
  marks the K–L scope `READY` with the evidence reference; M stays in `HOSTED_BLOCKED_SCOPES`.
* Run `Production Database Release` (scope `K-L`): plan → reviewer approval in `production-database-apply` → snapshot → apply → verifier `kl`.
* Expected: ledger D–L (9 rows), K and L applied once, verifier 46/46-equivalent, policy count 48, runtime role without privileges outside `public`. M unapplied.
* Fail: L raises "vista_app_runtime holds explicit privileges outside schema public" or any verifier failure → stop; transaction rolls back the migration.
* Rollback: `docs/operations/sql/k-l-rollback.sql` (after confirming the restore point); last resort restore from step 4 evidence.

### 6. Runtime credential authorization — approval: owner
* Pre: step 5 passed. Create/rotate `vista_app_runtime` credentials (separate approval), update secret `DATABASE_URL` using pooler user `vista_app_runtime.<project_ref>`; `deploy-api.sh` refuses any other user.
* Expected: API starts, `/health` 200, `PrismaService` role assertion passes. Fail: deploy refuses or API cannot start → restore the previous secret version (Secrets Manager version staging) and run the API rollback.
* Rollback: previous secret version; `vista-rollback-api`.

### 7. Terraform apply authorization — approval: owner
* Pre: a fresh read-only plan shows exactly `0 to add, 4 to change, 0 to destroy`, no `must be replaced`, no CloudFront/bucket-policy/OIDC change. Use `-lock=true` and a saved plan file; apply that plan only.
* Expected after apply: media CORS `POST,HEAD` with three origins; EC2 role has both media statements; instance id unchanged (`i-0fa8cb318ce21afa5`); a second plan is empty.
* Fail: plan differs from the reviewed one → do not apply. Rollback: `terraform apply` of the previous commit's configuration, or restore saved `get-bucket-cors` / `get-role-policy` documents (taken beforehand).

### 8. API deployment authorization — approval: `aws-demo` reviewer
* Pre: steps 5–7; `schema-gate` green; `is-head` SHA check passes (deploy is for the head of `main`).
* Expected: image `vista-education-api:<sha>` pushed to immutable ECR tag, SSM deploy, public health check green, API reports the same SHA.
* Fail: health check fails → workflow rolls back / run `rollback` action (API only). Rollback: `vista-rollback-api` via workflow `rollback`.

### 9. Web deployment authorization — approval: `aws-demo` reviewer
* Pre: API deployment succeeded (web job requires it). Expected: S3 sync, CloudFront invalidation, `skynex.best` returns 200 with new build.
* Fail: invalidation/health failure → redeploy previous web build from the previous commit (S3 objects are versioned by build); API is unaffected.

### 10. Production smoke tests and rollback — approval: owner (observation only)
* Smoke: login as instructor and student; course authoring publish; Learning Media upload from `https://skynex.best` (presigned POST succeeds, no CORS error); submission attachment upload; quiz attempt; no 5xx in CloudWatch.
* Fail: any smoke failure → API `rollback`; for DB issues follow step 5 rollback. M stays staged; PUBLIC TEMP remains a documented residual risk until M has its own scope approval.

## D. Remaining approvals
PR review and merge; one hosted evidence run; backup readiness; unblock-PR merge; K–L apply; runtime credential change; Terraform apply; API deploy; web deploy.
