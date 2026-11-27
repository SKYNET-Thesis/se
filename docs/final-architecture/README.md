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
| Education platform (API, Web, worker, Twin, R1, Terraform) `SKYNET-Thesis/se` | Production API + Web `f148ecd`; `main` `f148ecd`; `develop` `fba6055` (+ PR #253 fix pending) |
| Production API / Web | `f148ecd` / `f148ecd` (verified `version.json`, `/api/v1/version`) |
| Desktop `leduc121/vista_lab` | main `4906fee` (PR #7), docs `c5f4bce` (Codex-owned; not modified here) |
| Edge runtime running Phase A | R1 from `se` `4d3b98c` (+ CHECKIK fake follower) on the owner's laptop |
| Database | Production ledger through `20261127_s_classroom_lab_sessions` (migration S applied via the release workflow) |

## Acceptance status
See [08-production-acceptance.md](08-production-acceptance.md) (Production results, measured latency, defects, deferred boundaries).
