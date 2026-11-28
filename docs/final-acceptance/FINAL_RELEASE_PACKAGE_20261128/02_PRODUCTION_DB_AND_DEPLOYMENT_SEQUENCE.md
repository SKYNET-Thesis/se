# Production database action and deployment sequence (exact)

Repository `SKYNET-Thesis/se`. Release candidate = `develop`; release PR = **#266** `develop → main` (https://github.com/SKYNET-Thesis/se/pull/266). Production now runs `main` `430ad594…`; the Production database ledger contains D…S (S verified 2026-11-27); **pending: scope `T-U` only**.

Why the order is fixed: `main` will contain migrations T and U in `database/migrations/manifest.json`. The deployment `schema-gate` (`production_db_release.py compat`) requires **every** manifest migration to be in the Production ledger, so the API deploy is refused until `T-U` is applied. That is intended and fail-closed. T and U are additive and compatible with the currently running API (it never names the new columns), so applying them first is safe.

| # | Who | Action | Where / exact inputs | Expected result |
|---|---|---|---|---|
| 0 | owner | (optional) review | PR #266 files: 0 migrations are *applied* by merging; scope `T-U` is registered but only runs through the workflow below | — |
| 1 | **owner** | **Merge PR #266** into `main` (merge commit) | https://github.com/SKYNET-Thesis/se/pull/266 → *Merge pull request* (required checks are green; `main` has no review requirement) | `main` = new head SHA `<MAIN_SHA>` |
| 2 | automatic | *Education CI* runs on the `main` push; *Auto Deploy* then dispatches `Education CI` with `action=deploy` | Actions → *Auto Deploy* | the dispatched deploy run **fails at `schema-gate`** (message: migrations not applied: `20261128_t_…, 20261128_u_…`). **This red run is expected and touches nothing** |
| 3 | **owner** | Run the database release | https://github.com/SKYNET-Thesis/se/actions/workflows/production-database-release.yml → *Run workflow* → branch **main** → `scope` = **`T-U`** · `backup_mode` = **`logical`** (PITR is off on this plan; same as scopes J/N/O-Q) · `expected_main_sha` = the full 40-character `<MAIN_SHA>` from step 1 | `preflight` (read-only) prints plan `status: ready`, plan hash, `preview` counts |
| 4 | automatic | `backup` job: logical dump + restore into a disposable PostgreSQL 17, stored SSE-KMS in the private backup bucket, evidence bound to scope/manifest/commit/plan | environment `production-database-preflight` | backup evidence artifact; job green |
| 5 | **owner** | **Approve the apply** | the `apply` job waits on environment `production-database-apply` → *Review deployments* → tick it → *Approve and deploy* (reviewer account `leduc121`) | `apply` runs T then U in the repository SQL runner, then the postflight verifier `verify_production_release_tu.py` (all checks must PASS) |
| 6 | automatic | `resume-deployment` dispatches `Education CI` `action=deploy` on `main` | — | the new run passes `schema-gate` and waits at `deploy-api` |
| 7 | Claude (after owner approval of this package) | **Set API configuration** | AWS Secrets Manager `vista/demo/education-api/env`: add `SUPABASE_INVITE_REDIRECT_URL=https://skynex.best/accept-invitation` and `STAFF_TEMP_PASSWORD_ENABLED=true` (command in `01_SUPABASE_AND_SMTP_CONFIGURATION.md` §E). **Do this after step 5 and before step 8** (flag on + migration absent would break authentication, flag off + migration present is harmless) | secret updated, values never printed |
| 8 | **owner** | **Approve `deploy-api`** (also builds and deploys the Twin image `twin-<sha>` and runs the container with the new secret) | the dispatched *Education CI* run → `deploy-api` → *Review deployments* → environment `aws-demo` → approve | API container healthy; `GET /api/v1/version` = `<MAIN_SHA>` |
| 9 | **owner** | **Approve `deploy-web`** | same run → `deploy-web` → `aws-demo` → approve | `/version.json` = `<MAIN_SHA>`; CloudFront invalidated by the job |
| 10 | Claude | **IAM: apply the evidence statement** | re-plan with the five live variables (`iot_command_topic_arn`, `iot_feedback_queue_arn`, `iot_thing_arn`, `recordings_bucket_arn`, `recordings_events_queue_arn`) and apply **only** the saved plan, which must be `0 to add, 1 to change, 0 to destroy` and change only `aws_iam_role_policy.ec2` (adds `ExperimentEvidenceObjectAccess`). Revalidated at the RC: see `04_FINAL_REGRESSION_RC.md` | live role policy has 12 statements, 0 removed |
| 11 | owner (Supabase dashboard) | Configure URL/SMTP/templates/sign-up | `01_SUPABASE_AND_SMTP_CONFIGURATION.md` §A–D. May be done **any time before step 13**; it does not depend on the deployment | invitation e-mail arrives from the configured sender |
| 12 | owner | Say `approved: Production test content` | in the reply to this package | allows the synthetic E2E data of `PRODUCTION_TEST_DATA_MANIFEST.md` |
| 13 | Claude | **Production acceptance** (all four roles, WF-01…WF-04, ACCT cases) | `03_PRODUCTION_ACCEPTANCE_PLAN.md`; evidence recorded with the deployed SHA | PASS/FAIL per case, defect register updated, freeze decision |

## Rollback and stop rules
* Before step 5: nothing changed in Production (preflight/backup are read-only or write only to the private backup bucket). Cancel the run.
* After step 5 (T-U applied): both migrations are additive; the previous API keeps working. If a problem appears, fix forward. The documented SQL rollback in each migration header only loses descriptors/levels/pending-first-login state and is **not** run automatically.
* After step 8: rollback = *Education CI* → *Run workflow* → `action=rollback` (allowed: no pre-S image is involved; the `rollback-guard` job refuses only pre-Lab-Session images). Disable `STAFF_TEMP_PASSWORD_ENABLED` **only** if no staff account is still pending its first password change.
* Stop and report if: `preflight` status is not `ready`; the postflight verifier has any FAIL; `/api/v1/health` is not 200 after step 8; a queue/DLQ is above 0.

## What changes in Production, in total
Database: 5 additive columns + 2 CHECK constraints (no row rewritten, nobody restricted). API/Web/Twin images at `<MAIN_SHA>`. IAM: one additive statement. Secret: two keys. Supabase: URL list, SMTP, templates, sign-up OFF, min password length 12. **No** data is written outside the synthetic E2E organization during acceptance.
