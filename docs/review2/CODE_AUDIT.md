# Review 2 code audit

Baseline `8aac863`; branch `chore/review2-readiness`.

| Component | Classification | Evidence |
|---|---|---|
| `web/robot-edu` | CAPSTONE CORE | WF-01–04 UI/Vitest |
| `services/education-api` | CAPSTONE CORE | guarded NestJS/Prisma APIs/Jest |
| `services/robot-runtime`, `web/checkIk` adapter | CAPSTONE CORE for WF-03 software path | fake-follower contract tests |
| `services/ai`, edge agent | EXPERIMENTAL / SUPPORTING | syntax checks; not required by current demo |
| mobile | OPTIONAL | Expo typecheck; not authoritative education UI |
| snapshots/other backends | LEGACY / NOT USED BY CURRENT DEMO | excluded from gate |

## P0

Five echo-only workflows were false-positive CI; they are now executable. Runtime `8015` is Compose-internal (`expose`, no host mapping). CI uses mocks/fakes and a dummy local URL, never live Supabase, AWS, MQTT or hardware. The Blockly migration preserves `manual`, `ai`, `vr`, `remote` and adds `blockly`; this task does not apply it.

| DOC SAYS | CODE DOES | REVIEW-2 IMPACT | RECOMMENDED ACTION |
|---|---|---|---|
| older WF-03 uses `physical` | persisted execution mode is `real_robot` | invalid demo payload risk | use schema/API term |
| old state table mirrors runtime states | persistence maps to `active/completed/stopped/fault` | evidence ambiguity | cite persisted mapping |
| endpoint inventory has no runtime route | guarded physical routes now exist | stale inventory | refresh after Review 2 (P1) |
| product rule also names robot-control grant | approved implementation enforces experiment eligibility/allocation | policy ambiguity | resolve by ADR (P1) |
| Registration FR-01…06 are teleop/data/policy | education WF-01…04 have no matching IDs | traceability gap | use `NO_FORMAL_FR_ID` (P1 formalization) |

No production data, AWS resource or real robot was touched.
