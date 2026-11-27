# Final Web closeout (2026-11-27)

## Revisions
| Item | Value |
|---|---|
| `main` / Production API+Web | `430ad59` (verified `/api/v1/version`, `version.json`; includes #257) |
| `develop` | `45a8a01` |
| Pending | PR #257 `bugfix/iot-run-evidence-20261127` (evidence for IoT runs), CI green, awaiting owner merge |
| Migration S | applied (run `45962239320`), ledger confirmed; deploy dispatch `45970542970` success |
| Containers / queues | education-api, iot-feedback-worker, recordings-worker, digital-twin healthy; all SQS queues and DLQs 0 |

## Status
- **Accepted on Production:** AUTH, SA, INST (session), STU, WF01, WF02, WF03 lifecycle + Twin, WF04 feedback/release, tenant isolation (see matrix).
- **Not accepted:** WF03 evidence artifact (D-03/D-08): #257 is deployed but the retest failed (IAM prefix missing → 500); fix PR #260 plus an owner-run Terraform apply are required; rubric scoring and instructor evidence opening (depend on D-03).
- **Open low defects:** D-04 (late ACK), D-06 (release without rubric scores).
- **Not run:** Stop/concurrency/expiry/quarantine on Production; Desktop, physical SO-101, VLA.

## Release steps still needed (owner)
1. Merge #260 → `develop`; release PR → `main`; approve `deploy-api`. 2. Owner runs the Terraform plan/apply for the IAM statement `ExperimentEvidenceObjectAccess` (not executed by me). 3. I retest WF03 evidence and WF04 evidence opening. Optional: merge UI polish #261 (tsc, vitest 834/834, build OK).

## Freeze
Feature freeze in force: only the evidence fix and docs remain. Education Platform readiness is reported separately from physical robotics (see `IOT_READINESS_20261128.md`). Verdict: **CONDITIONAL GO** pending #257 deployment and retest.

## Update: 430ad59 retest
WF04 scoring/release/student view PASS; telemetry provenance resolved as *not* R1-synchronised (D-09). LMS/quiz/admin Production regression, simulation safety cases and authenticated before/after UI screenshots were NOT RUN in this session. Paper MCP was not available; Taste-skill guidance was applied only to a minimal shared polish.
