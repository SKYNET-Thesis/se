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
| [07-api-and-mqtt-contracts.md](07-api-and-mqtt-contracts.md) + [generated/api-routes.md](generated/api-routes.md) | API and MQTT contracts |
| [../operations/EDGE_CONTRACT_HANDOFF_20261126.md](../operations/EDGE_CONTRACT_HANDOFF_20261126.md) | Canonical Edge/Desktop contract (P1–P4, §12–14) |

## Frozen source revisions
| Component | Revision |
|---|---|
| Education platform (API, Web, worker, Twin, R1, Terraform) `SKYNET-Thesis/se` | `main` = `60d878d` (deployed); `develop` = `7011beb` (adds #249 migration S promotion, #250 password UI); release PR #251 pending |
| Production API / Web | `60d878d` / `60d878d` (verified `version.json`, `/api/v1/version`) |
| Desktop `leduc121/vista_lab` | main `4906fee` (PR #7), docs `c5f4bce` (Codex-owned; not modified here) |
| Edge runtime running Phase A | R1 from `se` `4d3b98c` (+ CHECKIK fake follower) on the owner's laptop |
| Database | Production ledger through `20261120_q_media_archive`; **migration S staged → promoted in develop, not applied** |

## Acceptance status
| Item | Status |
|---|---|
| WF01–WF04 local real-browser acceptance (PostgreSQL, local JWKS + real GoTrue) | **TESTED** |
| Classroom Lab Session / Robot Resource (real PostgreSQL 32/32, real browser 4/4) | **TESTED**; Production: schema pending (503 by design) → **NOT ACCEPTED on Production** |
| Student bulk import + mandatory first-login change | **TESTED** locally; **DEPLOYED** (import page live on `60d878d`); Production import of 10 synthetic students **ACCEPTED** (owner receives `VTEST112710`); new password UI **MERGED, not deployed** |
| AWS IoT mTLS, Shadow heartbeat (R1, MOCK_RUNTIME) | **VERIFIED** |
| Production Student → IoT → R1 → CHECKIK → Twin → evidence → Instructor review | **NOT RUN** (needs instructor credentials; fake follower only, not MuJoCo, not physical) |
| Physical SO-101 execution, physical stop, Emergency Stop | **NOT RUN / BLOCKED** (Desktop P1–P4, §14 pending; supervised hardware only) |
| Migration S in Production | **NOT APPLIED** (release workflow pending owner approvals) |
