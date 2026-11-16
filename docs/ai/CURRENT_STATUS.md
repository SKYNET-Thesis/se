# VISTA development status

Status reviewed: 2026-11-11 (Asia/Ho_Chi_Minh). This is a point-in-time map,
not an authority that overrides the checkout, test output, migration manifest,
or operator evidence. Verify each claim before relying on it.

## Status meanings

- **IMPLEMENTED** — relevant code/configuration exists; this alone says nothing
  about passing tests or deployment.
- **VERIFIED** — an identified artifact records a successful check for the
  stated, limited scope. Check its date and whether it was rerun on this HEAD.
- **PARTIALLY VERIFIED** — implementation and/or a narrow check exists, while
  integration, security, current regression, or acceptance remains open.
- **BLOCKED** — a named prerequisite, approval, or acceptance gate remains.
- **PLANNED** — present in product direction/design/runbooks, without verified
  implementation evidence for the claimed outcome.
- **UNKNOWN** — available repository evidence does not establish the fact.

## Repository snapshot

- Branch: `feat/course1-learning-experience`; HEAD inspected as `cefd482`
  (`feat(db): add course builder foundation migrations`), one commit ahead of
  its tracked origin at the time of inspection.
- The active checkout has extensive pre-existing staged/unstaged/untracked
  changes across application, database, infrastructure, and docs. Several
  changes concern Course Builder, quiz delivery, Learning Media, runtime/IoT,
  tests, and migrations. This status page does not claim they are reviewed,
  integrated, or production-ready. Preserve them.
- Existing `se-codex`, `se-claude-b`, and `se-agy` worktrees were each 61
  commits behind this branch at inspection. `se-claude-b` has uncommitted
  learning-UI work. Other worktrees also have changes and/or branch divergence;
  see Git's current worktree listing before using any secondary checkout.
- No tests or E2E were run during this documentation review. Never carry a
  result forward as if it were run on current HEAD.

## Subsystem status

| Subsystem | Status | Implemented / available evidence | Remaining work and blockers |
| --- | --- | --- | --- |
| Course Builder | **PARTIALLY VERIFIED** | Admin catalog/editor and curriculum API/UI source exist; focused service/component tests exist. The 2026-11-07 handoff reports a previous backend run (52 suites / 464 tests), focused editor tests (6/6), and web build passing; these are reported results from an earlier checkout, not independently rerun here. | Handoff records unresolved System Admin catalog routing/role behavior and says role navigation and authenticated integration are not accepted. Verify current source, run current safe tests, then complete role-aware workflow acceptance. See [handoff](../../VISTA_MASTER_CONTEXT_UPDATED_2026-11-07.md) and `web/robot-edu/src/pages/admin/`. |
| Reading and Video | **PARTIALLY VERIFIED** | Activity schema/UI support and the Course Builder Playwright scenario for reading/video previews exist. | Preview/activity records do not establish secured, learner-facing playback/download end to end. Run the local browser/API flow on isolated services; verify media authorization and actual ready object behavior. See `services/education-api/src/modules/learning/activity-content.schema.ts` and [E2E spec](../../web/robot-edu/tests/e2e/course-builder-delivery.spec.ts). |
| Question Bank | **PARTIALLY VERIFIED** | Canonical question/authoring services, controller, DTOs, and focused specs are present. | The dated handoff explicitly asks for separate verified Question Bank/quiz integration coverage. Verify authoring, version publication, scope, and integration against current migrations and API. See `services/education-api/src/modules/learning/question-bank.service.ts`. |
| Quiz Engine | **PARTIALLY VERIFIED** | Server grading and public/private immutable snapshot construction/checksum validation are implemented; snapshot and service specs exist. | Current test execution and the full author → deliver → attempt → grade → progress path are not established. Preserve private answer keys and attempt snapshots. See `question-bank-quiz.snapshot.ts` and its specs. |
| Classroom Delivery | **PARTIALLY VERIFIED** | Classroom quiz delivery API/UI and enrollment lifecycle source/specs exist; local E2E scenario covers delivery setup. | Cross-role and cross-school HTTP E2E is not evidenced as run on current HEAD. Isolated DB fixture use requires the approvals in the acceptance runbook. |
| Student Learning | **PARTIALLY VERIFIED** | My Learning, course/lesson activities, quiz and progress code exist; dated reports include prior focused results. | The 2026-11-07 handoff records a System Admin route showing student-style My Learning and says its cause/fix is unverified. Check current role resolution, navigation, direct-route authorization, and student/teacher workflows. |
| Learning Media | **PARTIALLY VERIFIED** | API authorization/storage code, private-bucket configuration, storage specs, and S3-compatible integration spec exist. | The local S3 integration needs an explicitly configured loopback service; the runbook says the image was unavailable in the earlier environment. No current integration execution or Production bucket verification is evidenced. Never substitute AWS for local integration. |
| PostgreSQL authorization | **PARTIALLY VERIFIED** | Supabase JWT identity mapping and API permission/scope services/tests exist. Product rules and the 2026-11-09 inventory state that the Prisma identity is the database owner with `BYPASSRLS`; the inspected Production baseline recorded 46 RLS-enabled tables and zero policies. | NestJS scope checks are the authoritative API boundary today; do not claim learning-table RLS provides tenant isolation. Least-privilege runtime-role work/security proof is not complete in the documented acceptance plan. Do not weaken RLS or write DB fixtures without explicit target/scope approval. |
| SQL migrations | **PARTIALLY VERIFIED** | The Production baseline record reports successful integrity checks, isolated PostgreSQL 17.11 restore, and Production catalog comparison: 12 matches, 3 documented environment differences, 0 drift, 0 unverified fields. Migration runner/manifest validator and migration tests exist. | That verified scope is baseline recovery/parity only. Five Course Builder migrations are registered for isolated verification, explicitly not applied to Production and not approved for release. First live Production SQL-runner release is unvalidated. Never run migrations as part of initialization. See [migration ownership](../operations/production-migration-ownership.md). |
| Playwright E2E | **BLOCKED** | A Playwright config, local JWKS signer, synthetic fixture script, and course → publish → classroom quiz → student result spec exist. | The 2026-11-11 acceptance plan requires isolated PostgreSQL/auth/web setup and explicit approval before DB fixture writes. No browser E2E run is recorded for this review. Passing unit tests/builds would not establish E2E. See [local acceptance](../operations/phase-2-4-3-local-acceptance.md). |
| Digital Twin | **PARTIALLY VERIFIED** | React/Three.js SO-101 viewer, Python FastAPI read-only telemetry service, mock frames, physical-owner push boundary, scope checks, calibration model, and offline test suites exist. | The phase 5A document calls this software readiness, not hardware verification; visual checklist is pending. Do not call a schematic/preview or mock stream a calibrated physical twin. Verify fresh measured telemetry, identity, calibration, units, and safety under supervised procedure. |
| SO-101 integration | **PARTIALLY VERIFIED** | Python R1 runtime implements a narrow fail-closed contract with hardware disabled by default; an explicit fake-follower adapter and local tests are available. Safety and commissioning runbooks exist. | Real follower driver/configuration, per-arm safe home/gripper values, physical commissioning evidence, and complete authorized VISTA-to-hardware E2E are not established. Phase 5A “ready” is readiness to perform a supervised test, not a passed hardware test. Physical run remains **BLOCKED** on commissioning gates. |
| AWS deployment | **UNKNOWN** for live Production state; rollout **BLOCKED** | Terraform roots, AWS SDK integrations, CI/deploy scripts, and an AWS IoT/SO-101 runbook exist. | These artifacts do not prove current resources, successful deployment, IoT credentials, or Production health. The runbook requires reviewed plans, approvals, migration and fake-telemetry evidence, then gated rollout. No AWS mutation or deployment is authorized by this status. |
| AI/VLA integration | **PLANNED** | Python integration service directory and product/architecture descriptions exist. | Inspected `services/ai-integration/src/main.py` only prints a startup message. No working VLA model/provider inference or robot-action pipeline is established. Do not report VLA integration as implemented. |

## Development priorities

1. Preserve and inspect the current working tree before each task; identify
   which uncommitted changes belong to the assigned scope.
2. Resolve and verify role-aware System Admin Course Management routing, then
   exercise the Course → Lesson → Section → Activity authoring and publishing
   flow without confusing a preview with accepted learner behavior.
3. Complete Phase 2.4.3 isolated acceptance: least-privilege DB role/security
   evidence, media storage integration, and authenticated Playwright workflow.
   Obtain the documented approval before fixture/database writes.
4. Add separate current evidence for canonical Question Bank authoring,
   classroom quiz delivery, immutable attempts, grading, and learner progress.
5. Keep Production SQL release separate from application work. Review a future
   release and obtain explicit approval; the verified baseline is not release
   approval.
6. Treat digital-twin visual QA and supervised SO-101 commissioning as gated
   work. Complete authorization, calibration, Stop/E-stop, ownership,
   cancellation, and evidence checks before any physical-motion claim.
7. Treat AWS deployment and VLA inference as separate future/gated milestones;
   inspect current operator evidence before describing either as live.

These priorities summarize dated handoffs/plans and repository evidence; the
user's current task assignment and fresh source/evidence take precedence.

## Evidence and refresh protocol

Before relying on a status, check current `git status` and branch, inspect the
relevant source/specs, read the current SQL migration manifest/ledger evidence
when the task concerns schema, and consult the linked operational evidence.
Record the exact test command/result and commit when tests are run. Distinguish
reported historical results from locally reproduced results. At task end,
propose a status update when implementation or evidence materially changes;
inspect the diff first and do not overwrite another agent's edits silently.
