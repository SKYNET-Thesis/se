# Final Web closeout (2026-11-27)

## Revisions
| Item | Value |
|---|---|
| `main` / Production API+Web | `43dcb60` (verified `/api/v1/version`, `version.json`) |
| `develop` | `45a8a01` |
| Pending | PR #257 `bugfix/iot-run-evidence-20261127` (evidence for IoT runs), CI green, awaiting owner merge |
| Migration S | applied (run `45962239320`), ledger confirmed; deploy dispatch `45970542970` success |
| Containers / queues | education-api, iot-feedback-worker, recordings-worker, digital-twin healthy; all SQS queues and DLQs 0 |

## Status
- **Accepted on Production:** AUTH, SA, INST (session), STU, WF01, WF02, WF03 lifecycle + Twin, WF04 feedback/release, tenant isolation (see matrix).
- **Not accepted:** WF03 evidence artifact (D-03), until #257 is released and the single affected flow retested; rubric scoring and instructor evidence opening (depend on D-03).
- **Open low defects:** D-04 (late ACK), D-06 (release without rubric scores).
- **Not run:** Stop/concurrency/expiry/quarantine on Production; Desktop, physical SO-101, VLA.

## Release steps still needed (owner)
1. Merge #257 → `develop`. 2. Release PR `develop`→`main`. 3. Approve `deploy-api` and `deploy-web` in `aws-demo` (no migration in this change; schema-gate must pass). 4. Retest WF03 evidence + WF04 evidence opening.

## Freeze
Feature freeze in force: only the evidence fix and docs remain. Education Platform readiness is reported separately from physical robotics (see `IOT_READINESS_20261128.md`). Verdict: **CONDITIONAL GO** pending #257 deployment and retest.
