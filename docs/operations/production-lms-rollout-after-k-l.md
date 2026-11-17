# Full LMS — ordered Production rollout after K–L (runtime credentials, host script, Terraform, API, Web)

State on 2026-11-17: K and L are applied in Production (Production Database Release run 44150959108: 46 postflight checks passed, 0 failed; M not applied).
`schema-gate` passes (Education CI deploy run 44152024019 passed it and is waiting at the `aws-demo` reviewer gate). Running API image: `…/vista/demo/education-api:b8ac12f559a0…` (the J-release build).

Each step needs its own explicit owner approval. Steps 1–3 can be done in any order **before** step 4; step 4 and 5 are the `aws-demo` approvals.

## Findings that make steps 1–3 mandatory (read-only, 2026-11-17)
| Finding | Evidence | Consequence if skipped |
|---|---|---|
| Secret `vista/demo/education-api/env` uses the owner role | `DATABASE_URL` user shape `postgres.<ref>` (session pooler :5432, `sslmode=require`); keys present: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `WEB_ORIGIN` | The new API refuses to start: `production-config.ts` requires `DATABASE_RUNTIME_ROLE`, rejects `postgres`, and requires the `DATABASE_URL` user prefix to equal it |
| `DATABASE_RUNTIME_ROLE`, `LEARNING_MEDIA_BUCKET`, `AWS_REGION` are absent | same | Boot failure (role) / "Learning Media storage is not configured" (uploads) |
| `WEB_ORIGIN` is only the CloudFront default domain | same | Browser CORS from `https://skynex.best` is not allowed by the API |
| Host deploy script has no guards | `sha256 dc22789b…`; no `vista_app_runtime`, no `VISTA_ROLLBACK` in the host scripts | Owner-role deployments are not refused before the container starts (the API's own role check would crash-loop it and the script would restore the previous image) |
| Role `vista_app_runtime` exists but has **no password** | migration L creates it without a credential | API cannot log in until the owner sets one |
| Media CORS is `PUT`/CloudFront-only; EC2 role lacks media S3 access | `get-bucket-cors`, `get-role-policy` | Uploads fail |

## Step 1 — Terraform apply (Learning Media CORS + IAM) — approval A
* Pre: a fresh read-only plan from the merged configuration shows **exactly** `0 to add, 4 to change, 0 to destroy`, no `must be replaced`: media CORS, EC2 role inline policy (two media statements), `aws_instance.api` (`user_data_replace_on_change` true→false, state only), `github_api` role policy ("known after apply", identical content). Last run: 2026-11-17 (plan8): matches.
* Run: `terraform plan -lock=true -out=tfplan` with the reviewed tfvars/backend, review, then `terraform apply tfplan` (saved plan only). Save `aws s3api get-bucket-cors` and `aws iam get-role-policy` output first (rollback files).
* Expected: CORS `POST`,`HEAD` from the CloudFront domain, `skynex.best`, `www.skynex.best`; EC2 role has `CourseLearningMediaObjectAccess` and `StudentSubmissionObjectAccess` (Put/Get only); instance id unchanged; second plan empty.
* Fail: plan differs → do not apply. Rollback: `put-bucket-cors` / `put-role-policy` with the saved documents (or apply the previous commit).

## Step 2 — Refresh the host deploy script — approval B
* Run `infra/terraform/scripts/refresh-host-deploy-script.sh` (dry run prints the new script hash and command count, no AWS call), then `--execute` after approval. It sends one SSM command: writes the script to a temp file, verifies its sha256, `bash -n`, keeps `*.prev-<timestamp>` backups, installs `vista-deploy-api` and the `vista-rollback-api` wrapper (`VISTA_ROLLBACK=1`). It does not restart or touch the running API.
* Expected: output prints the new sha256 (must equal the dry-run value) and `1` for the `VISTA_ROLLBACK` grep.
* Fail: any command fails → nothing is replaced before the checks; rollback: `mv` the `.prev-<timestamp>` files back.

## Step 3 — Runtime database credential — approval C
Do this on the owner's machine so the password never appears in chat, logs or the repository.
1. Generate: `RT_PW="$(openssl rand -hex 24)"` (hex avoids URL-encoding issues).
2. Set it (owner connection, e.g. direct/session URL for `postgres`):
   `printf "ALTER ROLE vista_app_runtime PASSWORD :'rt_pw';\n" | psql "<owner URL>" -X -v ON_ERROR_STOP=1 -v rt_pw="$RT_PW"`
3. Prove the login and the role's safety **before** touching the secret (pooler form `vista_app_runtime.<project_ref>`):
   `psql "postgresql://vista_app_runtime.<ref>:$RT_PW@<pooler host>:5432/postgres?sslmode=require" -Atc "select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user"` → `vista_app_runtime|f|f`.
4. Update the secret by merging into the current JSON (a new version; `AWSPREVIOUS` keeps the old one for rollback). Required result keys: `DATABASE_URL` (user `vista_app_runtime.<ref>`, same host/port/`sslmode=require`), `DATABASE_RUNTIME_ROLE=vista_app_runtime`, `LEARNING_MEDIA_BUCKET=vista-demo-media-157098813811-sg`, `AWS_REGION=ap-southeast-1`, and `WEB_ORIGIN=https://skynex.best,https://www.skynex.best,https://dbwzn37ruvlzi.cloudfront.net`; keep every other existing key. Use a script that reads the secret and the password from environment variables and never prints them.
5. Expected: the new `deploy-api.sh` accepts the secret (it checks all of the above); the running API is not affected until the next deploy.
* Fail/rollback: `aws secretsmanager update-secret-version-stage` back to `AWSPREVIOUS`; to revoke, `ALTER ROLE vista_app_runtime PASSWORD NULL`.

## Step 4 — Deploy the API — approval D (`aws-demo` reviewer)
* Pre: steps 1–3 done; a deploy run for the **current head of `main`** is waiting at `aws-demo` (Education CI "Deploy deploy @ <sha>"; older waiting runs are superseded by the head-of-main check and fail by design; reject/cancel them).
* Approve only the `deploy-api` job. Expected: image `vista-education-api:<sha>` (immutable tag) pushed, host script validates the secret, container starts, health check green, previous image kept for rollback.
* Fail: guard refusal or failed health check → the script restores the previous image automatically; run workflow `rollback` (API only) if needed.

## Step 5 — Deploy the Web — approval E (`aws-demo` reviewer)
* Pre: step 4 succeeded (the web job requires it). Expected: S3 sync, CloudFront invalidation, `https://skynex.best` serves the new build and `/api/v1/...` through `api.skynex.best` answers; API and Web report the same SHA.
* Fail: redeploy the previous web build; API unaffected.

## Step 6 — Acceptance on https://skynex.best (read/write with approved test accounts only)
Instructor login; course/module/lesson/section/activity create+edit; video/document upload from the real origin (presigned POST, no CORS error); quiz authoring + question bank; student quiz attempt, submission, grading; assignment create/submit/grade with feedback and file attachment; publish; student enrollment; progression; role-based authorization; cross-school isolation; API/Web SHA consistency. Any failure → diagnose, fix through a reviewed PR, repeat the affected tests.

## Residual risk (unchanged)
`PUBLIC` keeps `TEMP` until migration M is separately approved; M stays staged.
