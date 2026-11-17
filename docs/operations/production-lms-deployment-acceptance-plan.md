# Full LMS Phase 1 — Production deployment acceptance plan

Prepared, not executed. Every check below is for the **eventual approved release**; evidence must be recorded per item.
**[disposable]** = already demonstrated on local PostgreSQL 17 / local S3-compatible storage / local API+browser (not Production evidence).
**[hosted]** = must be produced on Production (or the restored rehearsal copy) and attached to the release record.

## Automatic initiation (what happens on every merge to `main`)
1. `Education CI` (push) validates only: `api`, `web`, `docker`, `database-safety` (+ `validate-inventory`, `Database Bootstrap` in their own workflows).
2. `Auto Deploy` (after a *successful* push run): verifies those required checks for the exact commit, that the commit is still the head of `main`, and then dispatches `Education CI` with `action=deploy`.
3. The dispatched run re-validates the commit, then `schema-gate` (read-only Production compatibility) → `deploy-api` → `deploy-web`, each behind the reviewer-gated `aws-demo` environment. After the approval each job re-checks that the commit is still the head of `main`.
4. Until K–M are released, step 3 stops at `schema-gate` (red, nothing touched); the validation run stays green.

## Release acceptance checklist
| # | Check | Evidence |
|---|---|---|
| 1 | K–M postflight (`verify_production_release_km.py`, ledger, grants, runtime allowlist, TEMP) 0 failed | [disposable] 32/32; [hosted] required |
| 2 | API connects as `vista_app_runtime` (PrismaService startup check passes; `current_user` confirmed by the postflight) | [hosted] |
| 3 | `GET https://api.skynex.best/api/v1/health` = ok and `GET /api/v1/version` returns the release commit (the workflow compares it to `GITHUB_SHA`) | [hosted] |
| 4 | `https://skynex.best/version.json` returns the release commit (compared by the workflow after the CloudFront invalidation) | [hosted] |
| 5 | CloudFront serves the new LMS UI (module wording, unlock-rule chip, attachment cards) | [hosted] manual + screenshot |
| 6 | Login, role resolution and RBAC: student, instructor, school admin, other-school admin | [disposable] `lms-security-matrix.spec.ts`; [hosted] smoke with dedicated test accounts |
| 7 | Course → Module → Lesson → Activity authoring, preview and publish | [disposable] `lms-authoring`, `lms-unlock-rule`; [hosted] smoke |
| 8 | Learning Media: PDF, DOCX, PPTX, PNG, MP4 upload, preview, student download, MP4 playback, missing-object fallback — against the **real** bucket, IAM role and CORS | [disposable] `lms-lesson-media.spec.ts` (S3-compatible only); [hosted] required (no AWS S3/IAM/CORS evidence exists yet) |
| 9 | Weighted quiz (25% then 100%), attempt limit, unlock progression | [disposable]; [hosted] smoke |
| 10 | Assignment, rubric, submission, grade release, audited reopen | [disposable]; [hosted] smoke |
| 11 | Instructor monitoring and per-student drill-down; cross-school denied | [disposable]; [hosted] smoke |
| 12 | Rollback: `vista-rollback-api` restores the previous image and `/api/v1/health` is ok; the previous image works with the runtime-role credential | [hosted] required; [disposable] old-image-as-runtime-role test not yet run |
| 13 | Superseded commit refused after approval (a newer `main` commit exists) | [disposable] workflow tests; [hosted] observe on the first real run |

## Smoke account hygiene
Use dedicated, clearly named test accounts and a test course; never real student data; remove or archive the test content afterwards. Do not paste tokens into tickets.

## Stop conditions
Any failed check, an unexpected `current_user`, a version mismatch, or a failed health check stops the release; use the documented rollback and recovery steps (`production-lms-k-m-readiness-review.md`, `production-release-k-m-runbook.md`).
