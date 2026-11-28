# VISTA — Production deployment execution plan, smoke tests and rollback

Nothing here has been executed. Release PR: #222 (draft, `develop` → `main`). Production serves `ef95cdd`. Every step marked **OWNER** needs the owner; I do not merge, approve `aws-demo`, deploy, migrate or change configuration.

## 1. Sequence and how the workflows actually behave

| # | Step | Actor | What really happens (from `.github/workflows/backend-ci.yml`, `auto-deploy.yml`) |
|---|---|---|---|
| 1 | Mark #222 ready for review, review, approve | OWNER | `main` requires the listed checks (api, web, docker, database-safety, validate-inventory) and admin-enforced protection |
| 2 | Merge #222 into `main` | OWNER | push to `main` starts **Education CI** (validation only: api, web, docker, database-safety, validate-inventory, runtime, syntax; fresh-bootstrap by path filter). `changes`/`schema-gate`/deploy jobs are skipped on a push |
| 3 | Main validation completes | CI | success of that push run triggers **Auto Deploy** (only if `AWS_DEPLOY_ENABLED=true`, event=push, same repo). It re-checks that the commit is still the head of `main` and that all required checks passed, then dispatches Education CI with `action=deploy` |
| 4 | Schema gate | CI (no approval) | in the **dispatched** run: `changes` (api=true, web=true) → `api`, `web`, `docker`, `database-safety` re-run → `schema-gate` (read-only Production compatibility, environment `production-database-preflight`). Expected result: `compatible` (no database change; same as the run on `745c7ac`) |
| 5 | Approve the API deployment | OWNER | `deploy-api` waits on environment **`aws-demo`** (required reviewers). After approval it re-checks `main` is still the head, builds and pushes the commit image, verifies the host script hash (expected PASS: `ef5a33bf…04bd`), deploys via SSM, then checks health on `api.skynex.best` and `skynex.best` and that `/api/v1/version` equals the commit |
| 6 | Verify API | me / OWNER | smoke tests A below |
| 7 | Verify Digital Twin and workers | me / OWNER | smoke tests B below (the Twin and both workers are redeployed by `deploy-api.sh`) |
| 8 | Approve the Web deployment | OWNER | `deploy-web` `needs` `deploy-api` and also uses `aws-demo`, so its approval request appears only after the API job finished successfully. It builds with the environment's Supabase values and `PUBLIC_DIGITAL_TWIN_WS_URL`, syncs to the web bucket, writes `version.json`, invalidates CloudFront `/*` and waits for completion, then compares `https://skynex.best/version.json` |
| 9 | Verify CloudFront publishing | me / OWNER | `version.json` equals the commit; Homepage shows the Desktop download |
| 10 | Focused smoke tests | see §2 | read-only first |

Differences from the requested sequence: schema gate runs in the dispatched run after Auto Deploy (step 4 follows step 3), not inside the push validation; there are two separate `aws-demo` approvals (API, then web), as requested; the web approval cannot be requested before the API job completes; if `main` moves before an approval is granted, the job refuses the superseded commit.

## 2. Smoke tests

**A. Read-only (no Production data written; no authorization beyond the deployment approval)**
1. `GET https://api.skynex.best/api/v1/health` and `/health/ready` → 200; `https://skynex.best/api/v1/health` → 200.
2. `https://skynex.best/version.json` and `https://api.skynex.best/api/v1/version` equal the merge SHA.
3. `GET /api/v1/me/attempts/<random uuid>/quiz-result` without a token → **401** (route exists; today 404).
4. Public site, `/login`, `/catalog` load; Homepage shows **Download DEB**; `curl -sIL` of the DEB URL → 200 and `content-length: 131395882`.
5. Hosted Supabase: `GET <SUPABASE_URL>/auth/v1/settings` (public) answers; no secret printed.
6. SSM read-only: `docker ps` shows API, Digital Twin, `vista-iot-feedback-worker`, `vista-recordings-worker` running with 0 restarts; Twin `localhost:8767/health` ok; `printenv VISTA_IOT_ENABLED` = `false`; `aws iot list-certificates` = 0.
7. SQS: `aws sqs get-queue-attributes` on feedback and recordings queues and DLQs: DLQ `ApproximateNumberOfMessages` = 0.

**B. Requires separate authorization — each writes or touches Production data**
8. Sign-in as School Admin, Instructor and Student with dedicated **test** accounts in a **test** school/classroom: creates auth sessions (and last-login updates). Must not use real students.
9. Course/lesson access and assignment visibility: read-only after sign-in.
10. Question Bank import of the English demo file as an instructor of the test school: **writes draft questions** (archive afterwards).
11. Mini-quiz attempt and result dashboard/recommendations: **writes an attempt and grading**.
12. Blockly simulation run and submission: **writes a program version, submission and evaluation**.
13. Digital Twin viewer connection: requires a scoped token and an existing attempt; creates no data but needs a test account.
14. Evidence access/authorization (owner downloads, peer refused): needs an existing experiment from a test run; a physical-run experiment must not be created (no Production MQTT).
15. Student temporary-password login: do **not** exercise on real students; see the decision in `TEMP_PASSWORD_FLAG_DECISION.md`.

## 3. Rollback
- **API (and Twin/workers):** Actions → Education CI → Run workflow on `main` → `action=rollback` (runs `vista-rollback-api` on the host, **not** schema-gated; also needs `aws-demo` approval). Previous image `ef95cdd` is retained in ECR (immutable tags). After rollback re-run smoke A1, A2, A6.
- **Web:** web is not part of `action=rollback` (it sets web=false). Roll back by a revert PR to `main` (re-deploys the previous bundle through the same gated path) or by restoring the previous object versions in the web bucket and invalidating CloudFront; confirm `version.json`.
- **Database:** nothing applied, nothing to reverse.
- **Trigger conditions:** health/readiness failing after deploy, API or worker crash-loop, sign-in broken, or version mismatch.
