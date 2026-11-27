# Consolidated release and owner approval checklist (2026-11-27)

Production baseline: `430ad59` (main). Nothing below has been merged, deployed or applied by the assistant.

## 1. PR status (all target `develop`, all MERGEABLE, no conflicts — a throwaway merge of all four was conflict-free)
| PR | Content | CI |
|---|---|---|
| #260 | D-03/D-08: no artifact row without object, status endpoint never 500s, Terraform `ExperimentEvidenceObjectAccess` | green |
| #262 | D-09: attempt-bound Twin viewer, no fixture fallback, run panel Twin, API scope for post-submission run, truthful evidence text | green |
| #261 | UI polish (tokens, class page cards, course outline aside, robot table, mobile titles) + capture spec + screenshots | see PR |
| #258 | Documentation, IoT handoff CC-1..7 / CX-1..6 | green |
| #263 | **DRAFT — D-06 proposal, do not merge without explicit approval** | n/a |
Merge order: **#260 → #262 → #261 → #258** (independent files; this order puts the Production fixes first). #263 only after the owner approves the D-06 policy.

## 2. Deployment coverage (verified in `.github/workflows/backend-ci.yml` and `infra/terraform/scripts/deploy-api.sh`)
- The **Digital Twin is built and deployed by the existing `deploy-api` job**: it builds/pushes `…education-api:twin-<commit>` (same ECR repository, immutable, skipped if it already exists) and `deploy-api.sh` `start_twin()` pulls that tag and restarts `vista-digital-twin` on the private network. Live proof: the running Twin image on 2026-11-27 is `twin-430ad594…`, the same commit as the API.
- No separate Twin deployment or approval exists or is needed. If the Twin image cannot be pulled `deploy-api.sh` fails the deployment.
- `deploy-web` builds the Web with `VITE_DIGITAL_TWIN_WS_URL` = repository variable `PUBLIC_DIGITAL_TWIN_WS_URL` (= `wss://api.skynex.best/ws/twin`, verified set).
- Release path: Auto Deploy → `workflow_dispatch` deploy → schema-gate → `aws-demo` approval for `deploy-api` and `deploy-web`. No migration in these PRs (schema-gate must stay green; rollback-guard still refuses rollback after migration S).

## 3. Terraform IAM (reviewed, NOT applied)
Reviewed plan: `~/.vista-acceptance/20261127-phaseA/tfplan/reviewed.plan` (0600, dir 0700; readable text `plan-readable.txt`, summary `plan-summary.txt`). Built from the release-candidate `infra/terraform`, remote S3 state, profile `vista`, region `ap-southeast-1`, with the live variables `iot_command_topic_arn`, `iot_feedback_queue_arn`, `iot_thing_arn`, `recordings_bucket_arn`, `recordings_events_queue_arn`.
Summary: **`Plan: 0 to add, 1 to change, 0 to destroy`** — only `aws_iam_role_policy.ec2`; statements 11 → 12; removed: none; added: `ExperimentEvidenceObjectAccess` (`s3:PutObject`, `s3:GetObject`) on `arn:aws:s3:::vista-demo-media-157098813811-sg/learning-media/experiments/*`. All IoT/SQS/recordings statements are preserved.
Owner procedure (run from the plan directory): `export AWS_PROFILE=vista AWS_REGION=ap-southeast-1; terraform apply reviewed.plan`. The plan is tied to the current state; if anything else changes first, re-plan. Apply only after #260 is deployed (order is not critical: the IAM grant is additive and harmless before the code ships).

## 4. Owner approval checklist
1. Merge #260, #262, #261, #258 (in that order) into `develop`; open the `develop`→`main` release PR; merge it.
2. Dispatch/approve the deployment: approve `deploy-api` and `deploy-web` in `aws-demo`.
3. Run the Terraform apply above (or authorise the assistant to).
4. Decide D-06 (#263) and whether to merge it.
5. Re-authenticate Paper MCP (still refusing: "account setup incomplete").
6. Tell the assistant when 1–3 are done: it resumes at **Post-release acceptance** (below) without repeating earlier work.

## 5. Post-release acceptance checkpoint (resume here)
Verify: API/Web SHA and Twin image `twin-<sha>`; container health; SQS/DLQ = 0; fresh WF03 run (Lab Session → attempt → run): status endpoint 200; evidence object in S3 and artifact metadata row; student download OK, instructor download OK, unauthorised user rejected; viewer frames carry the robot UUID, the run's controller id and sequence, joint values equal the stored `simulation_telemetry_latest`; no `offline-fixture` frames for the attempt viewer; WF04 instructor opens evidence → scores → release → student view. Only then close D-03, D-08, D-09.

## 6. Freeze baseline (proposed, NOT in force)
Feature Freeze: only defect/security fixes and IoT-compatibility changes after the release above. Architecture Freeze: API contracts, DB schema (through `20261127_s_classroom_lab_sessions`), auth/RBAC, storage boundaries, WF01–WF04, Edge Contract unchanged. Web Freeze is **PENDING** until the owner approves it and the post-release acceptance passes.

## Update (completion sprint)
Merged into `develop`: #260, #262, #261, #258 (2026-11-27 14:30–14:31Z). Remaining for the release: **#264** (follow-up UI/test/docs; no migration, no IAM), then the `develop`→`main` release PR, `deploy-api` (also deploys the Twin) and `deploy-web`, then `terraform apply reviewed.plan` (plan must be re-validated first: `terraform plan` with the five live IoT/recordings variables must still show 0 add / 1 change / 0 destroy). #263 stays a draft until D-06 is decided. Owner decisions pending: D-06, D-11 (legacy PUT allocation semantics), WF-01..04 open decisions in `WF01_WF04_DEFINITION_PACKAGE.md`, approval of the Production test content (`PRODUCTION_TEST_DATA_MANIFEST.md`), Paper MCP re-authentication.
