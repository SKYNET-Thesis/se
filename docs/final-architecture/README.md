# VISTA — final frozen architecture (2026-11-27)

Everything here is derived from the actual repository (`SKYNET-Thesis/se`), the Desktop repository (`leduc121/vista_lab`) and read-only Production checks, not from earlier documents. Regenerate the source-derived parts with `python3 docs/final-architecture/generated/generate.py`.

| Document | Content |
|---|---|
| [01-system-context.md](01-system-context.md) | System context |
| [02-container-architecture.md](02-container-architecture.md) | Containers and runtimes |
| [03-deployment-architecture.md](03-deployment-architecture.md) | Deployment, release gates, Production state |
| [generated/erd.md](generated/erd.md) | Logical ERD (88 tables, per domain) |
| [generated/database-schema.md](generated/database-schema.md) | Database schema, migration order, staged migrations |
| [04-use-case-model.md](04-use-case-model.md) | Consolidated use case model |
| [05-sequence-wf01-wf04.md](05-sequence-wf01-wf04.md) | WF01–WF04 sequence diagrams |
| [06-activity-flows.md](06-activity-flows.md) | Activity and state flows |
| [08-production-acceptance.md](08-production-acceptance.md) | Production acceptance record |
| [07-api-and-mqtt-contracts.md](07-api-and-mqtt-contracts.md) + [generated/api-routes.md](generated/api-routes.md) | API and MQTT contracts |
| [../operations/EDGE_CONTRACT_HANDOFF_20261126.md](../operations/EDGE_CONTRACT_HANDOFF_20261126.md) | Canonical Edge/Desktop contract (P1–P4, §12–14) |

## Frozen source revisions
| Component | Revision |
|---|---|
| Education platform (API, Web, worker, Twin, R1, Terraform) `SKYNET-Thesis/se` | Production API + Web + Twin `430ad59`; `main` `430ad59`; `develop` `2d0b260` (#260/#262/#261/#258 merged, release to `main` pending) |
| Production API / Web | `430ad59` / `430ad59` (verified `version.json`, `/api/v1/version`) |
| Desktop `leduc121/vista_lab` | main `4906fee` (PR #7), docs `c5f4bce` (Codex-owned; not modified here) |
| Edge runtime running Phase A | R1 from `se` `4d3b98c` (+ CHECKIK fake follower) on the owner's laptop |
| Database | Production ledger through `20261127_s_classroom_lab_sessions` (migration S applied via the release workflow) |

## Acceptance status
See [08-production-acceptance.md](08-production-acceptance.md) (Production results, measured latency, defects, deferred boundaries).

## Authentication and authorization model
Supabase Auth (hosted) issues JWTs; Education API verifies the Bearer token and resolves role from organization membership (System Admin, School Admin, Instructor, Student). Student accounts created by import are `password_change_required` (restricted session until changed). Tenant isolation: cross-organization admin routes return 404. Robot access requires entitlement + allocation + an open Lab Session; Digital Twin access uses a short-lived scoped `vista.twin.<token>` subprotocol token per attempt. Physical control additionally requires a local operator arm on the Edge.

## Migration S evidence
Production Database Release run `45962239320`: preflight, backup, apply, resume-deployment all success; ledger contains `20261127_s_classroom_lab_sessions`. Deploy dispatch `45970542970` (`43dcb60`): schema-gate, deploy-api, deploy-web success; rollback-guard skipped.

## Final acceptance package
[`../final-acceptance/`](../final-acceptance/): test plan, case matrix, data manifest, WF01–WF04 runbook, defect register, IoT readiness, web closeout.

## Component status (what is real)
Legend: **Deployed** = running on Production at `430ad59`; **Merged** = on `develop`, not released; **Locally verified** = isolated stack/CI only; **Planned**; **Unverified**; **NOT RUN**.
| Component | Status |
|---|---|
| Web SPA, Education API, RBAC, Supabase Auth, student first-login flow | Deployed, Production-verified (earlier today) |
| Classroom Lab Session (migration S) | Deployed; Start/End Production-verified; Extend/Force End/Stop/expiry/quarantine locally verified only |
| Learning Media (S3 courses/submissions prefixes) | Deployed; Production LMS authoring NOT RUN |
| Experiment evidence (S3 `learning-media/experiments/*`) | Merged (#260); IAM statement **not applied**; Production **FAIL** at `430ad59` |
| AWS IoT Core, Thing, policy, topic rule, SQS + DLQs, feedback/recordings workers | Deployed, read-only verified |
| R1 runtime + CHECKIK fake follower (simulation, `MOCK_RUNTIME`) | Running on the owner's laptop; Production-verified lifecycle |
| Digital Twin service (mock + relay) | Deployed; attempt-bound viewer fix merged (#262), Production NOT yet verified |
| Desktop Lab Station, physical SO-101 adapter, calibration, teleop | Codex-owned, **Unverified / NOT RUN** |
| VLA inference, model training | Planned; not implemented (metadata only) |
| Paper/UI polish (#261) | Merged, not deployed |
