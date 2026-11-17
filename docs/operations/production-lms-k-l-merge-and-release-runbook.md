# LMS K–L — merge, hosted evidence and Production release runbook

Status: **no step below has been executed against Production.** Each numbered gate needs its own explicit approval. Facts were read
on 2026-11-18 (read-only AWS calls and `terraform plan -lock=false`; no apply, no secret values read).

## 1. Hosted read-only evidence — exact safe execution path

| Question | Finding |
|---|---|
| Can the workflow run before PR #158 is merged? | **No.** `production-readiness-evidence.yml` is `workflow_dispatch` only, guarded by `if: github.ref == 'refs/heads/main'`, and GitHub only lists a dispatch workflow that exists on the default branch. |
| Does merging change Production? | No database or AWS change. Merging runs Education CI, then Auto Deploy dispatches the deploy workflow; its `schema-gate` (`production_db_release.py compat`) fails closed because K and L are in the manifest but **not applied** in Production, so no API/web deploy reaches EC2. The `aws-demo` reviewer gate is a second barrier. `AWS_DEPLOY_ENABLED` is `true`. Expect a red schema-gate run after merge; that is the intended safe outcome. |
| Credentials the workflow uses | Environment `production-database-preflight` (no reviewers): `PRODUCTION_DATABASE_READONLY_URL`, `PRODUCTION_SUPABASE_URL`. `SUPABASE_ACCESS_TOKEN` also exists there but this workflow does not reference it. |
| What it executes | One `SELECT` statement inside `BEGIN READ ONLY` (see `scripts/production_readiness_evidence.py::evidence_sql`), after a project-ref check (`ovijutkvaaxohauvuxbj`). No DDL, DML, ledger write or role change. |
| Output | Booleans and counts only, no role/schema/table/function names, no ACLs, no rows, no secrets; no artifact upload; `assert_redacted` re-checks the log; exit 1 on any blocking finding or incomplete evidence. |
| Rollback | None needed (read-only). If a run misbehaves: cancel it. Nothing to revert. |

### Alternative before merge (operator machine, not run by me)
The operator can run the same script from the PR branch with the reader URL held in their own shell:
`DATABASE_URL=<read-only reader URL> SUPABASE_URL=<project URL> python scripts/production_db_release.py evidence --expected-project-ref ovijutkvaaxohauvuxbj`
(PostgreSQL 17 client required). Do not paste the URL into chat, logs or the repo.

### Approval request (copy/paste)
> I approve ONE read-only run of the hosted readiness evidence: after PR #158 is merged by me, dispatch
> `Production Readiness Evidence` on `main`, using environment `production-database-preflight` secrets
> `PRODUCTION_DATABASE_READONLY_URL` and `PRODUCTION_SUPABASE_URL`, project ref `ovijutkvaaxohauvuxbj`. One `SELECT` in
> `BEGIN READ ONLY`; redacted booleans/counts only; no rollback required. If it reports a BLOCKING finding, stop and report it.

Expected output: all blocking checks `true`, including ledger is exactly D–J, apply role owns the database, apply role can use every
schema, reader role present; plus informational counts. A red run is a valid result and must be triaged, not retried blindly.

## 2. Production AWS drift (read-only findings)

Live: account 157098813811, `ap-southeast-1`, instance `i-0fa8cb318ce21afa5` (t3.medium), state object `vista/demo/terraform.tfstate`
exists (last modified 2026-11-13).

| # | Drift | Impact | Fix prepared |
|---|---|---|---|
| 1 | Media bucket CORS is `PUT`/`HEAD` from the CloudFront default domain only; app uses presigned **POST** from `skynex.best` | Browser Learning Media uploads from the real domain fail CORS | Terraform config already says `POST`,`HEAD` + `skynex.best`/`www.skynex.best` (needs apply, see §3) |
| 2 | EC2 instance role has no statement for `learning-media/courses/*` (ECR, Secrets Manager, Logs only) | API cannot sign/read/write media objects (403) | Config already contains `CourseLearningMediaObjectAccess` (`s3:GetObject`,`s3:PutObject` on `…-media-…/learning-media/courses/*`) |
| 3 | Config would replace the instance (`ami` data source moved, `user_data` hash changed because `deploy-api.sh` changed) | Outage, new instance, lost EIP association/host state | **Fixed in this PR:** `user_data_replace_on_change=false`, `lifecycle { ignore_changes=[ami,user_data]; prevent_destroy=true }` |
| 4 | Config OIDC trust subject was `ref:refs/heads/main`; live roles trust `environment:aws-demo` | Applying the old config would break the deploy workflows (and drop the reviewer gate from the trust) | **Fixed in this PR:** subject is `environment:${var.github_deploy_environment}` (default `aws-demo`) |
| 5 | Config would remove CloudFront aliases `skynex.best`/`www.skynex.best`, the `api.skynex.best` origin and its cache behavior, and rewrite the web bucket policy | **Production outage on apply** | **Not fixed.** Config and live CloudFront diverge (README already warns). Needs a separate reconciliation change. |

After the fixes, `terraform plan -lock=false` (scratch copy, live state, read-only) shows **0 to add, 7 to change, 0 to destroy** and
no replacement. Four of the seven are CloudFront/bucket-policy/IAM drift items from row 5 and must not be applied.
`terraform validate` passes.

### Consequence for the media fix: do not `terraform apply`, even with `-target`
Targeting the CORS resource or the EC2 role policy pulls in their dependencies (`aws_cloudfront_distribution.web`,
`aws_instance.api`); a targeted plan of just those two still lists the CloudFront alias/origin removal. Therefore, until row 5 is
reconciled, the safe options are:

* **Option A (recommended):** reconcile CloudFront in Terraform (import live aliases, ACM certificate, `api.skynex.best` origin and
  behaviors), re-plan, and require a plan with only the CORS and EC2-policy changes before any apply. Needs its own approval.
* **Option B (smaller, out-of-band):** operator applies the two exact documents with the AWS CLI, then records the change so Terraform
  state is reconciled later. Before: `aws s3api get-bucket-cors` and `aws iam get-role-policy` output saved as rollback files.
  CORS: `POST`,`HEAD`; headers `content-type`,`x-amz-*`,`content-md5`; origins `https://dbwzn37ruvlzi.cloudfront.net`,
  `https://skynex.best`,`https://www.skynex.best`; `MaxAgeSeconds` 300. Policy: the four live statements plus
  `CourseLearningMediaObjectAccess`. Rollback: `put-bucket-cors` / `put-role-policy` with the saved originals. No instance impact.

Also verify (without printing values) that the `vista/demo/education-api/env` secret contains `LEARNING_MEDIA_BUCKET`
(`vista-demo-media-157098813811-sg`) and `AWS_REGION`; the runtime reads them and Terraform does not manage the secret value.

## 3. Release sequence (each step separately approved)

1. Review/approve PR #158 (CI green). Merge by the human reviewer only.
2. Optional now: Production Readiness Evidence run (§1). Expected: schema-gate after merge is red (K–L pending) — safe.
3. Resolve blockers in the evidence output. If it is clean, open a small follow-up PR that unblocks `K-L` in `HOSTED_BLOCKED_SCOPES`
   (`scripts/production_db_release.py`) and adds `K-L` to the release workflow options; the code deliberately refuses hosted K-L until then.
4. Backup: run `check-backup` in logical mode (≤12 h evidence); restore test on a disposable database.
5. Production Database Release (`production-database-apply` environment, reviewer approval): plan → snapshot → apply scope `K-L` →
   verifier `kl`. L aborts on any non-`public` privilege held by the runtime role. Rollback for K–L: `docs/operations/sql/k-l-rollback.sql`
   after restore-point confirmation.
6. Create/rotate `vista_app_runtime` credentials only with separate approval; update the secret `DATABASE_URL` (pooler user
   `vista_app_runtime.<project_ref>`); `deploy-api.sh` refuses any other user.
7. Media fix (§2 Option A or B), then AWS deploy through Auto Deploy → `schema-gate` (now compatible) → `aws-demo` reviewer → deploy.
   Rollback: workflow `rollback` action (API image immutable tag).
8. M stays staged. PUBLIC TEMP remains a tracked residual risk until M gets its own scope approval.

## 4. Remaining approvals / blockers
* Approve PR #158 merge (human).
* Approve one hosted evidence run (§1 text).
* Choose CloudFront reconciliation (A) or out-of-band media fix (B); approve its execution.
* Approve K–L unblock PR, backup, Production apply, runtime credential change and AWS deploy — each separately.
