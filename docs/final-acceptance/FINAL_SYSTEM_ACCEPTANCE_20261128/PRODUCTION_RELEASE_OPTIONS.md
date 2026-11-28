# Production release options (2026-11-28)

Prepared as the acceptance lead. **No option is chosen here; the owner decides.** Nothing was merged, deployed, migrated or applied.

Verified facts (all read-only):

| Item | Verified value | How |
|---|---|---|
| `origin/develop` | `eceb8d1d0cfabdb0ca96906eeaaa9f5e9cf5b69f` | `git rev-parse origin/develop` after `git fetch` |
| `origin/main` | `430ad594d8fc1087d16870104d5eb037b4fca864` | same |
| Production API / Web | both `430ad594…` (`/api/v1/version`, `/version.json`, health 200) | `curl` on `skynex.best`, 2026-11-28 |
| Twin image tag in Production | NOT VERIFIED (needs SSM/ECR access; not performed) | — |
| Code change `04fed8b` → `eceb8d1` | docs only (3 files) | `git diff --stat 04fed8b eceb8d1` |
| #266 (develop → main) | OPEN, `MERGEABLE`, merge state CLEAN, **0 reviews**, head = `eceb8d1`; 155 files; **no `database/` or `schema.prisma` change**; one infra file `infra/terraform/compute.tf` (adds `ExperimentEvidenceObjectAccess`) | `gh pr view 266`, `git diff --name-only origin/main origin/develop` |
| #267 (staged SQL for T) | DRAFT, head `08e77706`, 3 files (SQL, README, verify script); CI green | `gh pr view 267` |
| #272 (rubric levels, needs T) | DRAFT, head `17c9c547`, 19 files; **CI `fresh-bootstrap` FAILED (2 runs)**; other checks green | `gh pr view 272` |

## Option A — Current non-migration release (PR #266)

| Aspect | Content |
|---|---|
| Included requirements | WF-01…WF-04 as implemented on develop: evidence IAM fix and truthful run status (D-03/D-08), Twin attempt-bound telemetry (D-09), rubric completeness gate + partial drafts (D-06, owner-approved), canonical rubric summary, Gradebook (quiz + rubric, read-only), D-17 quarantine reconciliation, no-new-mixed-grading guard, UI polish/route fixes (D-10/D-12/D-13) (the P1 Course Builder fix, `draftOwnerId` in `CourseContentEditor.tsx`, is already present in `origin/main`, so it is not part of this delta) |
| Excluded | Rubric achievement levels, descriptors, templates, level selectors, student descriptor preview (need Migration T); physical SO-101; Desktop installers; Production test content |
| Migration dependency | **None** (no `database/**` change, schema-gate must still pass read-only) |
| Terraform | One IAM statement (additive), a **separate** owner-approved `terraform apply`; **not performed** |
| Risks | (1) D-03/D-08 fix is only effective after the IAM apply; without it evidence stays `unavailable` (status no longer 500s). (2) Production-only behaviours (S3 write, IoT path, Twin image) have never been accepted on Production. (3) CSP is report-only in Production (see SECURITY_ACCEPTANCE_REPORT). (4) Rubric-level requirement stays unreleased. |
| Test evidence | `FINAL_REGRESSION_REPORT.md` (this cycle, revision `eceb8d1`); CI on #266 head: all required jobs SUCCESS (api, web, runtime, docker, database-safety, fresh-bootstrap, syntax, validate-inventory) |
| Rollback | Redeploy the previous API image through the rollback dispatch (allowed: no migration; rollback-guard refuses only pre-S images); previous web bundle; IAM statement removal is additive-reversible |
| Owner approvals needed | merge #266; dispatch + approve `deploy-api`; approve `deploy-web`; approve `terraform apply` of the IAM-only plan (re-plan immediately before; see below); approve Production test content if Production acceptance data is wanted |

## Option B — Full rubric-level release including Migration T

| Aspect | Content |
|---|---|
| Included requirements | everything in A, plus: four configurable rubric templates, four level descriptors per criterion, level selector (4/3/2/1, explicit 0), editable weights, student descriptor preview, the 31/36 = 86.11 % = 8.61/10 behaviour |
| Excluded | physical SO-101, Desktop installers, mixed-grading formula (still forbidden) |
| Migration dependency | **Migration T** (`20261128_t_rubric_level_descriptors.sql`): two nullable columns + two CHECKs, additive, idempotent; must go through the repository SQL runner (backup → apply → postflight), after promotion from `database/staged-migrations/` to `database/migrations/` with a manifest entry |
| Preconditions that are NOT yet met | #272 `fresh-bootstrap` is red at the step `PostgreSQL integration tests (real database; none skipped)`; the workflow applies staged M and R only, not T, so T-dependent DB specs are the probable cause (inference; log text not retrievable). The CI workflow or the migration promotion order must change before #272 can be green; PR #267/#272 are drafts; migration promotion PR does not exist; no owner approval of the migration text |
| Risks | schema change on Production (low: nullable, no rewrite); two-step release ordering (T before the API that reads it, or the API ignores unknown columns — verified only locally); #272 touches the grading path (assessment/assignment-config) |
| Test evidence | this cycle: T applied twice on isolated PostgreSQL 17, #272 Jest DB 46/46 (subset), Vitest `src/queries` 71/71, `tsc` clean; browser `rubric-levels-flow` — see `RUBRIC_AND_GRADEBOOK_ACCEPTANCE.md` for the final status |
| Rollback | drop the two CHECKs and columns (SQL header); loses only descriptors/levels, points stay valid; roll the API back first |
| Owner approvals needed | all of A, plus: approve the migration text and release order; approve promotion PR; approve Production Database Release workflow run; approve template weights (defaults are configurable) |

## Terraform IAM plan — revalidated this cycle (not applied)

Configuration = current develop `infra/terraform` (byte-identical to the previously reviewed copy), backend `vista-tfstate-157098813811-sg`, run with `-lock=false -input=false`, with the five live variables read from the live role policy (`iot_command_topic_arn`, `iot_feedback_queue_arn`, `iot_thing_arn`, `recordings_bucket_arn`, `recordings_events_queue_arn`) plus the three bucket names.

Result: **`Plan: 0 to add, 1 to change, 0 to destroy`**. Only `aws_iam_role_policy.ec2` changes: 11 → 12 statements, 0 removed, added `ExperimentEvidenceObjectAccess` (`s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::vista-demo-media-157098813811-sg/learning-media/experiments/*`). The live role policy was read directly and does **not** yet contain that statement (so D-03/D-08 are unfixed in Production today). A plan from the repository `terraform.tfvars.example` alone would drop the IoT/SQS/recordings statements: always supply the live variables. Plan file: `scratchpad/tfrevalidate/final.plan` (session scratch; re-plan before any real apply).


## Update after the release package
Migrations T and U are now in `database/migrations/manifest.json` (scope `T-U`) and #272 is merged, so `develop` — and therefore release PR #266 — **is Option B**. Because the deployment `schema-gate` requires every manifest migration to be applied, the API can only be deployed after the owner-approved database release `T-U`. Option A (no migration) would now require reverting #280 and #272. The exact order: `../FINAL_RELEASE_PACKAGE_20261128/02_PRODUCTION_DB_AND_DEPLOYMENT_SEQUENCE.md`.
