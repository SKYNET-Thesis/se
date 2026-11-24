# VISTA development status

Status reviewed: 2026-11-16 (Asia/Ho_Chi_Minh). This is a point-in-time map,
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

## Production release, 2026-11-24 (added; sections below predate it)

- **VISTA EDUCATION PLATFORM: PRODUCTION DEPLOYED AND VERIFIED** (Education API and Web; public, deployment and infrastructure acceptance passed, **signed-in acceptance still pending**, see below) at main `77db65a75fc14696bb99032a2795bed25b98ab7b` (merge of release PR #195, deploy run #345, all 8 jobs passed, schema-gate compatible against project `ovijutkvaaxohauvuxbj`). `version.json` reports this SHA on `skynex.best`, `www.skynex.best` and the CloudFront domain; API health 200; container healthy. Rollback target: image `5c5667b` (ECR digest `sha256:fcc3c20f...`, also on the host as `/opt/vista/previous-image`).
- **Verified in Production:** homepage SO-101 3D (80,660 triangles; two browser tests pass, desktop and phone), login page, protected routes redirect to sign-in, protected API endpoints answer 401, no console errors, no failed requests, bundle points at the Production Supabase project, EC2 healthy (CPU about 0 percent, 846 of 3835 MB memory used, disk 51 percent of 20 GB), no MQTT, IoT, runtime or Twin environment key in the running container, no AWS resource added versus the pre-deploy baseline.
- **Not verified in Production:** signed-in flows (catalog, Learning Media, quiz and assignment, instructor and student workflows) and real e-mail delivery, because they need Production test accounts and an approved test message; none were created. CloudFront security headers (PR #196) are merged but **not applied**; until the owner applies the Terraform change the site has no HSTS, CSP or Cache-Control headers.
- **Web code freeze accepted** on develop `830dd9666c1b27a9039c007dea6100bccad7043c`; WF-01 to WF-04 accepted in simulation. Evidence: `docs/acceptance/WEB_FREEZE_20261124.md`, `docs/acceptance/WEB_CLOSURE_20261124.md`, `docs/operations/evidence/`.
- **Not accepted:** physical SO-101, Desktop Lab Station (separate repository), AI/VLA inference, curriculum content completeness. **Digital Twin and AWS IoT:** local only; Production MQTT is OFF. Handoff: `docs/operations/DESKTOP_TWIN_AI_HANDOFF_20261124.md`.

## Repository snapshot

- Combined candidate: `integration/classroom-lms-combined-2026-11-16`,
  implementation HEAD `f14ab6f4df39ab8c581f35c1e56423de41747319`.
  `origin/develop` at fetch was `83266c7ddeade23866ee848e4a492fe13d6e0211`,
  the merge base and an ancestor; the candidate can fast-forward from that ref.
- Classroom PR #148 head `b51d211ed548b0893f9ab9d845074a72de5d0a3c` is an
  ancestor of combined. Its remote checks were successful at audit time. The PR
  also contains backup scripts and documentation outside the feature scope.
- Local combined checks: backend build; Jest (79 suites passed, 19 skipped;
  905 passed, 178 skipped); DB-backed Jest (18 suites / 177 passed); frontend
  TypeScript, lint, build and Vitest (84 files / 584 passed); DB safety runner
  (288 tests, zero failures/errors/skips); PostgreSQL 17 fresh bootstrap twice
  (10 migrations, 91 tables, deterministic fingerprint); manifest/workflow
  safety checks; Playwright (13/13 passed). These are local results only.
- DB/browser tests used a disposable PostgreSQL 17 container (tmpfs, no mounts,
  loopback-only published port). Runtime role had no SUPERUSER, BYPASSRLS,
  CREATEDB, CREATEROLE, INHERIT or TEMP privilege; 48 RLS policies were
  verified. No shared or Production database was used.
- RC local head is `fbac025221e98b3c37642ea91344a24e16ab1a62`, four commits
  ahead of remote. The RC worktree has staged/unstaged teammate changes and
  was left untouched. The four RC CI-fix commits' behavior is represented in
  combined. PR #149 remote checks still refer to the older head and fail; no
  new remote CI was run.
- Tracked generated file `web/robot-edu/test-results/.last-run.json` remains
  in the candidate and should be removed in a reviewed follow-up before
  publication. No tracked `.env.test.local` or live production credentials
  were found; credential-pattern matches were documented placeholders and
  test-only values. Local PASS is not remote CI PASS.

## Subsystem status

| Subsystem | Status | Implemented / available evidence | Remaining work and blockers |
| --- | --- | --- | --- |
| Course Builder | **VERIFIED (local integration scope)** | Role-aware instructor and School Admin authoring, instructor-only publishing, and builder flow passed local Playwright; frontend/backend regressions and school authorization tests passed. | Local tests do not establish remote CI or Production behavior. See the 2026-11-16 audit below. |
| Reading and Video | **PARTIALLY VERIFIED** | Activity schema/UI support and the Course Builder Playwright scenario for reading/video previews exist. | Preview/activity records do not establish secured, learner-facing playback/download end to end. Run the local browser/API flow on isolated services; verify media authorization and actual ready object behavior. See `services/education-api/src/modules/learning/activity-content.schema.ts` and [E2E spec](../../web/robot-edu/tests/e2e/course-builder-delivery.spec.ts). |
| Question Bank | **PARTIALLY VERIFIED** | Canonical question/authoring services, controller, DTOs, and focused specs are present. | The dated handoff explicitly asks for separate verified Question Bank/quiz integration coverage. Verify authoring, version publication, scope, and integration against current migrations and API. See `services/education-api/src/modules/learning/question-bank.service.ts`. |
| Quiz Engine | **PARTIALLY VERIFIED** | Server grading and public/private immutable snapshot construction/checksum validation are implemented; snapshot and service specs exist. | Current test execution and the full author → deliver → attempt → grade → progress path are not established. Preserve private answer keys and attempt snapshots. See `question-bank-quiz.snapshot.ts` and its specs. |
| Classroom Delivery | **VERIFIED (local integration scope)** | PR #148 is in combined history. Local DB-backed tests and Playwright covered offerings, classroom creation, enrollment, delivery, grading, grade release, and school isolation. | No remote combined CI run. PR #148 includes out-of-scope backup artifacts for reviewer attention. |
| Student Learning | **PARTIALLY VERIFIED** | My Learning, course/lesson activities, quiz and progress code exist; dated reports include prior focused results. | The 2026-11-07 handoff records a System Admin route showing student-style My Learning and says its cause/fix is unverified. Check current role resolution, navigation, direct-route authorization, and student/teacher workflows. |
| Learning Media | **PARTIALLY VERIFIED** | API authorization/storage code, private-bucket configuration, storage specs, and S3-compatible integration spec exist. | The local S3 integration needs an explicitly configured loopback service; the runbook says the image was unavailable in the earlier environment. No current integration execution or Production bucket verification is evidenced. Never substitute AWS for local integration. |
| PostgreSQL authorization | **VERIFIED (local disposable DB scope)** | Runtime role was checked for SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, INHERIT and TEMP restrictions; 48 policies and school-isolation/security suites passed locally. | This is disposable PostgreSQL evidence, not hosted Supabase or Production proof. API scope checks remain authoritative. |
| SQL migrations | **VERIFIED locally; Production rollout BLOCKED** | Fresh PostgreSQL 17 bootstrap applied 10 migrations and verified 91 tables with deterministic fingerprint. Manifest and workflow safety checks passed. | K–M remain unapproved and production-blocked pending hosted Supabase role compatibility and recovery evidence, especially M. No K–M Production migration was run. See [K–M runbook](../operations/production-release-k-m-runbook.md). |
| Playwright E2E | **VERIFIED (local disposable environment)** | 13/13 Chromium journeys passed against local API/web and disposable DB, including authoring, publishing, classroom delivery, enrollment, grading, release, isolation and unauthorized access. | Local E2E is not remote CI or Production acceptance. |
| Digital Twin | **PARTIALLY VERIFIED** | React/Three.js SO-101 viewer, Python FastAPI read-only telemetry service, mock frames, physical-owner push boundary, scope checks, calibration model, and offline test suites exist. | The phase 5A document calls this software readiness, not hardware verification; visual checklist is pending. Do not call a schematic/preview or mock stream a calibrated physical twin. Verify fresh measured telemetry, identity, calibration, units, and safety under supervised procedure. |
| SO-101 integration | **PARTIALLY VERIFIED** | Python R1 runtime implements a narrow fail-closed contract with hardware disabled by default; an explicit fake-follower adapter and local tests are available. Safety and commissioning runbooks exist. | Real follower driver/configuration, per-arm safe home/gripper values, physical commissioning evidence, and complete authorized VISTA-to-hardware E2E are not established. Phase 5A “ready” is readiness to perform a supervised test, not a passed hardware test. Physical run remains **BLOCKED** on commissioning gates. |
| AWS deployment | **UNKNOWN** for live Production state; rollout **BLOCKED** | Terraform roots, AWS SDK integrations, CI/deploy scripts, and an AWS IoT/SO-101 runbook exist. | These artifacts do not prove current resources, successful deployment, IoT credentials, or Production health. The runbook requires reviewed plans, approvals, migration and fake-telemetry evidence, then gated rollout. No AWS mutation or deployment is authorized by this status. |
| AI/VLA integration | **PLANNED** | Python integration service directory and product/architecture descriptions exist. | Inspected `services/ai-integration/src/main.py` only prints a startup message. No working VLA model/provider inference or robot-action pipeline is established. Do not report VLA integration as implemented. |

## Development priorities

### 2026-11-16 combined integration audit

- Combined contains the full Classroom PR #148 head and all four local RC
  CI-fix commits' intended behavior. The hook fix calls `useOptionalRole()`
  unconditionally, preserving Rules of Hooks while supporting components
  rendered without a role provider.
- RC PR #149 remains remotely red at its older remote commit. The local RC
  branch contains four unpushed CI-fix commits; its dirty staged/unstaged
  changes were preserved and not copied. Several RC-only edits remove runtime
  database-role checks, CORS handling, an IoT migration, and recovery/error
  tests, so they are not safe to propagate without separate review.
- Combined local suites passed as listed above. Combined GitHub Actions were
  **NOT RUN**. The remote PR #149 checks do not represent the local RC head.
- Candidate is not yet publication-ready: remove the tracked generated
  `test-results/.last-run.json` in a reviewed artifact cleanup, then run CI
  after publication is authorized. The candidate is fast-forwardable to the
  fetched `origin/develop`.
- Credential-pattern scan hits were limited to documented placeholders and
  test-only values; no live credentials were found. Test-only environment
  files are not tracked. K–M remain Production-blocked; local PostgreSQL
  results do not satisfy hosted release gates.

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
