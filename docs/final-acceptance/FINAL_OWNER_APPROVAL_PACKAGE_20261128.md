# Final owner approval package (2026-11-28)

## 1. Release candidate
Release PR **#266 develop → main** (open, unmerged). Develop head at hand-off is stated in the final report. Contents since Production `430ad59`: evidence IAM/status fix (#260), Twin attempt-bound telemetry (#262), UI polish + route fixes (#261/#264/#269), rubric summary (#265), D-06 release gate (#263), D-17 quarantine reconciliation (#270), Gradebook (#271), safety/regression tests (#268), docs. **No database migration** (no `database/` or `schema.prisma` change). Excluded: #272 (rubric levels, needs migration T), #267 (T SQL).
Required CI: api, web, docker, runtime, database-safety, fresh-bootstrap, syntax, validate-inventory — green on every merged PR.

## 2. Deployment sequence (owner-approved gates marked ■)
■ merge #266 → Auto Deploy dispatch → schema-gate (read-only) → ■ approve `deploy-api` (also builds/deploys the Twin image `twin-<sha>`) → ■ approve `deploy-web` → verify `/api/v1/version`, `version.json`, Twin image tag, containers healthy, SQS/DLQ 0 → ■ `terraform apply recheck-plan` (IAM only) → Production acceptance.
**Rollback:** redeploy the previous image via the rollback dispatch (allowed: no migration in this release; rollback-guard refuses only pre-migration-S images); IAM: remove the statement (additive). Web: previous bundle.

## 3. Terraform IAM-only plan
Latest: `~/.vista-acceptance/20261127-phaseA/tfplan/recheck3.plan` (re-validated; 0 add / 1 change / 0 destroy; only `aws_iam_role_policy.ec2` + `ExperimentEvidenceObjectAccess` on `learning-media/experiments/*`; IoT/SQS/recordings permissions preserved). Re-plan immediately before apply with the five live variables.

## 4. Migration T
`MIGRATION_T_RELEASE_PLAN.md` — separate release after Production acceptance; #272 stays draft.

## 5. Production test content
`PRODUCTION_TEST_DATA_MANIFEST.md` ("Approval request"). **Not created.** Needs the explicit phrase "approved: Production test content". Rubric levels content (templates) only after migration T.

## 6. Production acceptance runbook (after steps above)
1. Versions: API/Web/Twin SHA. 2. WF01: allocation + Lab Session start/end (instructor). 3. WF02: attempt → program → symbolic → submit. 4. WF03: run → status 200 (D-08) → evidence object in S3 + artifact row (D-03) → student/instructor download → unauthorized rejected → viewer frames carry robot UUID/controller/sequence, no `offline-fixture` (D-09). 5. WF04: instructor evidence, rubric scoring, partial draft, release refused when incomplete (D-06), release, student result (canonical summary), Gradebook agrees; post-release lock. 6. Quiz auto-grading (exact match), LMS/Question Bank (with approved content). 7. RBAC/tenant isolation. 8. Close D-03/D-08/D-09/D-15/D-06 only on this evidence.

## 7. Owner decisions still open
W1-1 (D-11, see `D11_LEGACY_ALLOCATION_PUT_OWNER_REVIEW.md`), migration T release timing, quarantine policy for the IoT path (no change proposed), mixed-grading formula (none approved; new mixed configurations to be refused — implementation pending that decision).
