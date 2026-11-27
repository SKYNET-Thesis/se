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
| Education platform (API, Web, worker, Twin, R1, Terraform) `SKYNET-Thesis/se` | Production API + Web `43dcb60`; `main` `43dcb60`; `develop` `45a8a01` (+ PR #257 evidence fix pending) |
| Production API / Web | `43dcb60` / `43dcb60` (verified `version.json`, `/api/v1/version`) |
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
