# Course 1 Robotics Fundamentals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Course 1 as the first complete vertical slice from My Learning through evidence-backed task simulation, prerequisite unlock, physical execution and teacher review.

**Architecture:** Reuse the existing curriculum, assignment, ProgramVersion, Experiment, symbolic-evaluation, lesson-progress and physical-runtime boundaries. Add an authoritative progression service/read model and a versioned task-simulation result contract; keep browser animation non-authoritative and require persisted server evidence for PASS and physical eligibility.

**Tech Stack:** React 18, TypeScript, Vite, Blockly, Three.js/URDF Loader, NestJS 11, Prisma/PostgreSQL, Jest, Vitest, Python Robot Runtime/CHECKIK adapter.

**Spec:** `docs/post-review2/PRODUCT_GAP_ANALYSIS.md` and `docs/post-review2/PRODUCT_SCREEN_MAP.md`

## Global constraints

- Do not create hard-coded Grade 7/8/9 courses; use competency-based Course 1–3 progression.
- Course 1 is P0. Do not implement Course 2 or Course 3 in this plan.
- Completion is evidence-driven, never page-view-driven.
- VLA Language means a text prompt, not speech; VLA is outside P0.
- Browser → Education API → Robot Runtime → CHECKIK → physical robot remains mandatory.
- Browser never controls CHECKIK directly; NestJS never absorbs low-level hardware control.
- Reuse existing tables and modules before adding domain objects.
- Every physical run rechecks authorization, exact ProgramVersion evidence, allocation, entitlement, conflict and readiness.

## Planned file map

### Backend

- `services/education-api/src/modules/learning/progression.service.ts` — authoritative lesson state, prerequisites and PASS projection.
- `services/education-api/src/modules/learning/progression.controller.ts` — learner course path/result endpoints.
- `services/education-api/src/modules/learning/dto/course-path.dto.ts` — stable progression response and lock/evidence contracts.
- `services/education-api/src/modules/learning/dto/submit-knowledge-check.dto.ts` — validated L1 answer payload.
- `services/education-api/src/modules/learning/learning.module.ts` — progression registration.
- `services/education-api/src/modules/learning/symbolic-rules/*` — task rule compilation/evaluation extensions.
- `services/education-api/src/modules/learning/experiment.service.ts` — versioned task result artifacts/snapshots.
- `services/education-api/src/modules/learning/physical-execution.service.ts` — add Course 1 progression gate while retaining all existing gates.
- `services/education-api/src/scripts/seed-course1.ts` — idempotent Course 1 curriculum, prerequisite graph, challenges and delivery seed.

### Frontend

- `web/robot-edu/src/lib/api.ts` — course-path/progression/task-result contracts.
- `web/robot-edu/src/pages/MyLearning.tsx` — enrolled Course 1/current lesson presentation.
- `web/robot-edu/src/pages/CourseDetail.tsx` — Course Path states and lock reasons.
- `web/robot-edu/src/pages/LessonViewer.tsx` — objective/content/prerequisite/challenge CTA.
- `web/robot-edu/src/pages/Practice.tsx` — server-driven toolbox/task scene and evidence orchestration.
- `web/robot-edu/src/pages/SimulationResult.tsx` — durable PASS/FAIL/retry/continue experience.
- `web/robot-edu/src/components/studio/So101Viewer3D.tsx` — lesson-specific scene objects/target zones.
- `web/robot-edu/src/utils/robotProgram/simulator.ts` — deterministic RobotState/ObjectState/TaskState trace.
- `web/robot-edu/src/pages/teacher/*` — progression and Course 1 evidence context.

## Phase P0.1 — Authoritative Course 1 curriculum and progression

**Implementation status (2026-10-31): COMPLETE on `feat/course1-authoritative-progression`.** The Education API now exposes the authenticated course-path and server-graded knowledge-check endpoints, projects persisted symbolic PASS evidence atomically into lesson progress, and includes an idempotent Course 1 curriculum seed. L5 becomes eligible after the L4 PASS but is not completed by this phase; physical-success completion remains owned by the later physical-runtime phase. No database migration was added.

**Goal:** Seed C1-L1…L5 and return deterministic completed/current/locked states based on persisted evidence.

**Existing code reused:** `learning_courses`, `learning_lessons`, `learning_lesson_prerequisites`, `learning_lesson_progress`, objectives/competencies, assignments/challenges, `LearningService`, `seed-demo-delivery.ts` patterns.

**Files/modules likely changed:** Create `progression.service.ts`, `progression.controller.ts`, `progression.service.spec.ts`, `seed-course1.ts`; modify `learning.module.ts`, `package.json` seed scripts and possibly `learning.service.ts` read queries.

**DB migration required?** No. All required P0 entities and relations already exist.

**API changes:** Add `GET /me/courses/:courseId/path`; add `POST /me/attempts/:attemptId/knowledge-check` for server-graded L1 evidence; add a transactional internal operation invoked after a valid knowledge-check PASS, symbolic simulation PASS or physical-success outcome to upsert `learning_lesson_progress`, complete the attempt and return newly unlocked lesson IDs.

**Frontend changes:** Types/API client only in this phase.

**Tests:** Unit/integration coverage for first lesson unlocked, later lesson locked with reason, PASS unlocks exactly the next lesson, FAIL does not unlock, repeated PASS is idempotent, minimum-score prerequisite, different learner isolation and exact challenge/ProgramVersion provenance.

**Acceptance criteria:**

- [x] Course 1 is idempotently seeded with five ordered lessons and L1→L5 prerequisite edges.
- [x] Course 1 objectives and competencies are stored through existing models.
- [x] Opening a lesson does not change completion.
- [x] A valid persisted PASS transaction completes only its matching lesson and unlocks its successor.
- [x] API returns machine-readable lock code and human-readable lock reason.
- [x] Existing Robot Discovery records are not destructively rewritten.

**Dependencies:** None.

**Risk:** Historical demo seeds can collide by ordinal/title; use stable lookup rules and explicit Course 1 identity without deleting old data.

### Canonical Course 1 seed contract

The initial seed uses database-generated UUIDs but stable organization-scoped identity `(organization, course title)` plus `(course, lesson ordinal)`. Objectives use stable lesson-local codes.

| Lesson | Title | Primary evidence | Objective/competency intent | Challenge/delivery |
| --- | --- | --- | --- | --- |
| C1-L1 / ordinal 1 | Meet Your Robot | Server-graded knowledge-check result persisted in `learning_assignment_attempts.result_snapshot` | Identify components/workspace/safety; competency `C1.SAFETY.AWARENESS` | Assignment type in `constraints.kind = knowledge_check`; no Blockly/ProgramVersion required |
| C1-L2 / ordinal 2 | Move the Robot | Server task simulation PASS for exact ProgramVersion | Home, joint motion, wait, sequence; `C1.MOTION.SEQUENCE` | Target-pose challenge with allowed blocks Home/Move Joint/Wait |
| C1-L3 / ordinal 3 | Grab & Release | Server task simulation PASS for exact ProgramVersion | Approach/grasp/lift/release; `C1.MANIPULATION.GRIPPER` | Object challenge adds gripper and Cartesian motion |
| C1-L4 / ordinal 4 | Pick & Place | Server task simulation PASS for exact ProgramVersion | Complete pick/place and interpret feedback; `C1.MANIPULATION.PICK_PLACE` | Object + target-zone challenge |
| C1-L5 / ordinal 5 | Physical Robot Lab | Terminal successful physical Experiment for the same L4-passed ProgramVersion | Readiness, confirmation, safe execution, evidence; `C1.RUNTIME.SAFETY` | Physical delivery reuses L4 ProgramVersion; no new program draft |

Prerequisite edges are required L1→L2→L3→L4→L5. Course 1 is published; organization offerings/classroom deliveries remain explicit. The seed creates curriculum/challenge templates but must not silently enroll users or publish into every classroom.

Progress semantics: `not_started` → `in_progress` when the learner starts the eligible lesson; → `completed` only from the evidence source above. Completed rows have `progress_percent=100` and `completed_at`; started rows have `started_at` and a non-100 percent appropriate to the lesson contract. FAIL preserves `in_progress`. Current lesson is the lowest-ordinal eligible incomplete lesson. Reconciliation may project historical valid evidence idempotently, never downgrade completion.

## Phase P0.2 — My Learning and Course Path

**Goal:** Make the student entry point course-centric with a Continue Learning action and visible prerequisite path.

**Existing code reused:** `MyLearning.tsx` session/retry/query behavior, `CourseDetail.tsx`, `LessonViewer.tsx`, enrollment/course endpoints.

**Files/modules likely changed:** `MyLearning.tsx` and tests, `CourseDetail.tsx`, `lib/api.ts`, route wiring in `App.tsx` only if result/path routes require it.

**DB migration required?** No.

**API changes:** Consume P0.1 course-path read model; optionally extend `/me/learning` to include current lesson and progress summary rather than duplicating client joins.

**Frontend changes:** Course cards show progress/current lesson; Course Path shows completed/current/locked/prerequisite and lock reason.

**Tests:** Preserve token refresh and stale-query tests; add route and state tests for completed/current/locked lessons and Continue Learning resolution.

**Acceptance criteria:**

- [ ] My Learning shows enrolled courses, progress, current lesson and Continue Learning.
- [ ] Course Path exposes all C1 lessons and never infers unlock locally.
- [ ] Refresh/login restores identical path state.
- [ ] Locked lessons cannot start an attempt through UI or API.

**Dependencies:** P0.1.

**Risk:** Replacing assignment-centric data may regress current published-assignment UX; retain assignments as delivery details beneath the course path.

## Phase P0.3 — Lesson Detail and guided-practice contract

**Goal:** Provide objective, concept/media, prerequisites, challenge and Start Practice for each C1 lesson.

**Existing code reused:** `LessonViewer.tsx`, `learning_lessons.content`, objectives, assignments and classroom deliveries.

**Files/modules likely changed:** `LessonViewer.tsx`, `learning.service.ts`, `learning.controller.ts`, DTO/read-model tests, Course 1 seed content.

**DB migration required?** No; use lesson `content` JSON plus normalized objectives.

**API changes:** Enrich lesson response with objectives, prerequisite state, eligible classroom assignment/challenge and prior evidence summary.

**Frontend changes:** Render structured sections and disable Start Practice with server lock reason.

**Tests:** Accessible rendering, missing media fallback, locked CTA, eligible CTA, correct attempt continuation.

**Acceptance criteria:**

- [ ] Each lesson has explicit learning objectives and challenge instructions.
- [ ] Start Practice continues an active attempt or creates one idempotently.
- [ ] L1 supports interactive content/quiz evidence without page-view completion.

**Dependencies:** P0.1–P0.2.

**Risk:** Lesson JSON can become an unvalidated dumping ground; define and validate a small versioned content shape.

## Phase P0.4 — Server-driven Blockly integration

**Implementation status (2026-10-31): COMPLETE on `feat/course1-blockly-practice` (automated verification).** Course 1 Practice now reuses the existing Blockly → canonical program → SO-101 preview pipeline with an assignment-driven toolbox, server-enforced capability and workspace validation, recoverable draft persistence, and visible immutable ProgramVersion creation. Curriculum Practice does not submit/evaluate or project PASS in this phase; authoritative task results remain P0.5–P0.7. LIVE E2E remains unverified.

**Goal:** Make lesson-specific block palettes and server-backed Program/ProgramVersion the only curriculum-authoritative path.

**Existing code reused:** block definitions, generator, validator, canonical NEST adapter, ProgrammingController/Service, Practice evidence orchestrator.

**Files/modules likely changed:** `Practice.tsx`, `BlocklyCanvas.tsx`, `blocklyConfig.ts`, `lib/api.ts`, assignment DTO/query fields, existing Blockly/canonical tests.

**DB migration required?** No; `learning_assignments.allowed_blocks` exists.

**API changes:** Include validated `allowed_blocks` in lesson/practice payload; reject disallowed block types server-side during draft/version validation.

**Frontend changes:** Build toolbox from allowed block IDs; remove title-based `isReachTarget`/toolbox decisions.

**Tests:** L2 palette includes Home/Move Joint/Wait only as specified; L3/L4 add gripper/Cartesian capabilities; malicious workspace with disallowed block is rejected by server.

**Acceptance criteria:**

- [x] Palette is driven by assignment data, not English titles.
- [x] Save/version/reload preserves workspace and canonical program.
- [x] Immutable version identity is visible before evaluation.
- [x] Standalone Studio remains available as a non-authoritative sandbox.

**Dependencies:** P0.3.

**Risk:** Client-only toolbox restrictions are not security; server validation is mandatory.

## Phase P0.5 — L2 target-pose task simulation

**Goal:** Turn Move the Robot into a persisted target-pose task with PASS/FAIL and useful reasons.

**Existing code reused:** FK/IK/joint limits, target marker, schematic engine, `preview_target_match` rule, Experiment and symbolic evaluation.

**Files/modules likely changed:** `simulator.ts`, `So101Viewer3D.tsx`, `Practice.tsx`, symbolic rule compiler/evaluator/preparation, Course 1 challenge seed.

**DB migration required?** No; challenge object/condition, Experiment snapshots and evaluation rule results are sufficient.

**API changes:** Version task input/output schema in Experiment snapshots; evaluator returns reason codes such as target mismatch/unreachable/joint limit.

**Frontend changes:** Render target pose and current robot state; Run Simulation/Reset; show authoritative result.

**Tests:** Exact target PASS, tolerance edge, wrong pose FAIL, unreachable/joint-limit FAIL, version hash/evidence integrity.

**Acceptance criteria:**

- [x] L2 PASS is based on final task state, not only presence/order of a block.
- [x] Result is tied to exact ProgramVersion and challenge snapshot.
- [x] Failure identifies the incorrect pose/joint constraint in student language.

**Dependencies:** P0.4.

**Risk:** Browser and server kinematics can diverge. The server recomputes the complete authoritative trace from immutable ProgramVersion + challenge snapshot in `SchematicEngineService`; browser output is visualization only and is never trusted for PASS.

## Phase P0.6 — L3 object and gripper simulation

**Implementation status (2026-10-31): COMPLETE on `feat/course1-l3-object-simulation` (automated verification).** Course 1 L3 Grab & Release now executes deterministic educational task simulation deriving object grasp, carry and release server-side. ProgramVersion authority and provenance are strictly verified. PASS projects lesson progression to unlock C1-L4. Practice UI renders authoritative PASS / FAIL cards with specific grasp, lift and release feedback. LIVE E2E remains unverified.

**Goal:** Add challenge-specific object state, grasp, lift and release evidence.

**Existing code reused:** browser grasp/release logic, `learning_challenge_objects`, Experiment artifacts/events and symbolic rule framework.

**Files/modules likely changed:** simulation state types, `simulationScene.ts` (replace static-only use with injected scene), `simulator.ts`, viewer scene composition, symbolic rules and tests.

**DB migration required?** No.

**API changes:** Return challenge objects and normalized ObjectState; add rules for approach-before-close, object grasped and lifted.

**Frontend changes:** Render object and movement with the gripper; map reason codes to feedback.

**Tests:** close-before-approach, missed grasp, correct grasp, lift while holding, release/drop; challenge isolation.

**Acceptance criteria:**

- [x] Object initial state comes from the persisted challenge, not a global hard-coded scene.
- [x] PASS requires the specified object manipulation outcome.
- [x] Feedback distinguishes missed grasp from unreachable motion.

**Dependencies:** P0.5.

**Risk:** A kinematic grasp heuristic can be mistaken for physics; UI/docs must state the deterministic educational model and its limits.

## Phase P0.7 — L4 pick-and-place task

**Implementation status (2026-10-31): COMPLETE on `feat/course1-l4-pick-place-simulation` (automated verification).** Course 1 L4 Pick & Place now executes authoritative target-zone task simulation, evaluating pick, lift, carry, and release within the configured deterministic target zone. ProgramVersion authority, provenance, and multiple-pass resolution are strictly verified. PASS projects progression unlocking C1-L5. Practice UI renders authoritative PASS / FAIL cards with target-zone visualization and near-miss distance guidance. LIVE E2E remains unverified.

**Goal:** Evaluate complete pick-and-place into a configured target zone.

**Existing code reused:** zone membership, object carry/release, challenge success conditions, symbolic evaluation evidence.

**Files/modules likely changed:** task state/evaluator rules, scene renderer, `Practice.tsx`, Course 1 L4 seed, regression tests.

**DB migration required?** No.

**API changes:** Add target-zone challenge object/condition contract and final membership evaluation.

**Frontend changes:** Render robot, object and target zone; display task instruction and state.

**Tests:** correct placement PASS; release outside zone, release too high, close too early, wrong object and joint-limit FAIL.

**Acceptance criteria:**

- [x] PASS requires object released inside target zone.
- [x] Result includes machine reason code, observed state and educational message.
- [x] Retry creates new evidence without mutating previous evaluation.

**Dependencies:** P0.6.

**Risk:** Existing server symbolic traces may not contain enough object state; extend the server-produced, versioned trace output without changing historical records. Never accept a client-computed task trace as evidence.

## Phase P0.8 — Result UX and unlock transaction

**Goal:** Complete the loop PASS/FAIL → Retry/Continue → next lesson unlock.

**Existing code reused:** `EvaluationResult`, symbolic-evaluation query, progression service from P0.1.

**Files/modules likely changed:** create `SimulationResult.tsx`; modify `App.tsx`, `Practice.tsx`, progression/evaluation transaction and tests.

**DB migration required?** No.

**API changes:** Evaluation response includes progression projection outcome and next lesson; result remains retrievable by evaluation ID.

**Frontend changes:** Durable result route with Retry and Continue; Course Path cache invalidation after PASS.

**Tests:** FAIL retry, PASS continue, double-submit idempotency, stale draft cannot replace passed ProgramVersion, refresh result route.

**Acceptance criteria:**

- [ ] FAIL never unlocks.
- [ ] PASS unlocks only after evidence transaction commits.
- [ ] Result survives reload and teacher sees the same verdict.
- [ ] C1-L4 PASS unlocks C1-L5.

**Dependencies:** P0.1, P0.5–P0.7.

**Risk:** Split writes can produce PASS without progress or progress without PASS; use a single database transaction or deterministic reconciliation.

## Phase P0.9 — L5 physical robot lab

**Goal:** Execute the exact L4-passed ProgramVersion through the existing fail-closed physical boundary.

**Existing code reused:** physical eligibility/start/status/stop, ControlSession lock, allocation, entitlement, safety profile, Robot Runtime and CHECKIK adapter.

**Files/modules likely changed:** `PhysicalExecutionService` and tests; extract/extend `PhysicalExecutionPanel`; add student experiment-result UI; Course 1 L5 seed/content.

**DB migration required?** No.

**API changes:** Add explicit C1-L4 progression prerequisite to eligibility; preserve all existing eligibility checks and sanitized errors.

**Frontend changes:** L5 readiness checklist, exact ProgramVersion, explicit confirmation, execution lifecycle and result/evidence.

**Tests:** Missing L4 PASS, wrong ProgramVersion, revoked membership/entitlement, absent allocation, busy robot, runtime unavailable, stop, safe retry/reconciliation.

**Acceptance criteria:**

- [ ] Same immutable ProgramVersion that passed L4 is submitted to Robot Runtime.
- [ ] Every eligibility condition is rechecked server-side immediately before motion.
- [ ] Browser never sees runtime token or CHECKIK endpoint.
- [ ] Runtime remains hardware-disabled by default and fails closed.
- [ ] L5 completion depends on persisted physical Experiment outcome/evidence, not start-click.
- [ ] `PhysicalExecutionService.persistRuntimeSnapshot()` projects L5 completion only when Robot Runtime reports terminal `succeeded`, in the same transaction that persists the terminal Experiment/ControlSession state.
- [ ] Failed, cancelled, stopped, timed-out and preflight-failed runs never complete L5; repeated status reconciliation is idempotent.

**Dependencies:** P0.8 and supervised runtime commissioning outside this code plan.

**Risk:** Hardware behavior cannot be accepted by unit tests alone; require supervised low-speed hardware checklist and evidence without weakening defaults.

## Phase P0.10 — School-admin robot authorization and readiness

**Goal:** Give school administrators an authoritative view of allocation versus entitlement/policy/readiness without exposing low-level control.

**Existing code reused:** Education-admin organization/classroom APIs, classroom robot allocation, `org_entitlements`, safety profiles, control modes and Runtime status boundary.

**Files/modules likely changed:** `education-admin.controller.ts`, `education-admin.service.ts` or a focused robot-authorization service/spec; `SchoolManagement.tsx`; create an organization-scoped robot authorization/readiness panel; `lib/api.ts`/school query keys.

**DB migration required?** No unless audit of existing entitlement mutation semantics proves they cannot represent school authorization; this phase begins with that endpoint audit.

**API changes:** Add/read organization-scoped robot authorization summary; add the smallest permission-guarded entitlement/policy mutation only if an equivalent endpoint is absent. Never expose serial ports, calibration commands or runtime token.

**Frontend changes:** Show allocation, entitlement, safety policy and readiness as separate states with explicit missing reasons.

**Tests:** School-admin scope, cross-organization denial, allocation-without-entitlement, entitlement-without-readiness, and no low-level hardware fields.

**Acceptance criteria:**

- [ ] SA5 distinguishes classroom allocation from authorization and runtime readiness.
- [ ] Only permitted school/system administrators can mutate authorization policy.
- [ ] UI cannot start motion or call CHECKIK/Robot Runtime directly.

**Dependencies:** P0.1 and existing education-admin foundation; may run before P0.9 UI but must finish before hardware acceptance.

**Risk:** Entitlement mutations are security-sensitive; if existing ownership rules are insufficient, stop and produce a separate reviewed design rather than broadening P0 silently.

## Phase P0.11 — Student/teacher evidence and progress

**Goal:** Present a shared evidence chain to students and teachers and support feedback/assessment.

**Existing code reused:** submissions, experiments, events/artifacts, assessment/feedback/reflection APIs, `TeacherSubmissionReview.tsx`, learning insights.

**Files/modules likely changed:** student evidence page, teacher overview/class detail/progress components, teacher evidence queries, learning-insights/assessment read models.

**DB migration required?** No.

**API changes:** Add/extend aggregated read endpoints only when client composition would be excessive; never duplicate evidence rows.

**Frontend changes:** Student history by lesson; teacher per-student Course 1 path and evidence links; existing assessment form retained.

**Tests:** Role scoping, learner isolation, teacher classroom scope, PASS/FAIL presentation, artifact availability and sanitized runtime failure.

**Acceptance criteria:**

- [ ] Student and teacher see the same ProgramVersion and verdict provenance.
- [ ] Teacher can review schematic and physical evidence and leave feedback.
- [ ] Missing/local-only artifacts are labeled honestly.
- [ ] No AI/dataset claims appear unless corresponding metadata exists.

**Dependencies:** P0.8–P0.9.

**Risk:** Evidence queries are complex and security-sensitive; retain membership/organization scoping and add negative authorization tests.

## Phase P0.12 — End-to-end, regression and demo seed

**Goal:** Prove the five-lesson vertical slice while protecting Review-2 workflows.

**Existing code reused:** Jest/Vitest suites, CI workflows, demo identity/delivery seeds, Runtime integration tests.

**Files/modules likely changed:** Course 1 seed, API E2E specs, frontend journey specs, CI only if a new command is needed, docs/runbook.

**DB migration required?** No for planned P0.

**API changes:** None beyond prior phases.

**Frontend changes:** Only defects found during E2E.

**Tests:** Full C1-L1→L5 journey using schematic/fake follower; existing school admin, assignment, submission, symbolic evaluation, physical execution and teacher review regressions; build/lint/typecheck.

**Acceptance criteria:**

- [ ] Fresh seed produces Course 1 with all prerequisite and challenge data.
- [ ] Student cannot skip lessons or unlock by viewing pages.
- [ ] L2/L3/L4 failures produce distinct useful messages.
- [ ] L4 PASS unlocks L5 and exact ProgramVersion reaches fake-follower Runtime.
- [ ] Teacher can review the resulting evidence and provide feedback.
- [ ] Existing Review-2 CI suites pass unchanged or with explicitly justified updates.

**Dependencies:** All previous phases.

**Risk:** Seed/E2E assumptions may hide production data differences; test both fresh database and upgrade-compatible existing data.

## First implementation task

The first task should be **P0.1: authoritative Course 1 curriculum and progression**, narrowly scoped to backend seed/read/projection behavior. Do not begin with UI or 3D work: without an authoritative progression contract, every screen would invent lock state independently.

Exact initial files:

- Create `services/education-api/src/modules/learning/progression.service.ts`.
- Create `services/education-api/src/modules/learning/progression.controller.ts`.
- Create `services/education-api/src/modules/learning/progression.service.spec.ts`.
- Create `services/education-api/src/modules/learning/progression.controller.spec.ts`.
- Create `services/education-api/src/modules/learning/dto/course-path.dto.ts`.
- Create `services/education-api/src/modules/learning/dto/submit-knowledge-check.dto.ts`.
- Create `services/education-api/src/scripts/seed-course1.ts`.
- Modify `services/education-api/src/modules/learning/learning.module.ts`.
- Modify `services/education-api/package.json` to expose the idempotent seed command.
- Modify `services/education-api/src/modules/learning/symbolic-rules/symbolic-evaluation.service.ts` and `symbolic-evaluation.service.spec.ts` to invoke the transactional PASS projection.
- Do not modify `learning.service.ts` in the first task; the new progression controller owns the course-path query boundary.

## Verification commands for implementation sessions

Run from `se/`:

```bash
npm --prefix services/education-api test
npm --prefix services/education-api run build
npm --prefix web/robot-edu test
npm --prefix web/robot-edu run lint
npm --prefix web/robot-edu run build
python -m unittest discover -s services/robot-runtime/tests -v
python -m pytest -q web/checkIk/tests/test_wf03_command_adapter.py
docker compose config --quiet
```

## Implementation branch recommendation

`feat/course1-authoritative-progression`

Keep the first branch limited to P0.1. Subsequent task-simulation phases should use separate branches/reviews because they change different evidence and safety surfaces.
