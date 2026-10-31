# Post-Review-2 Product Gap Analysis

**Scope:** Code-grounded audit for the secondary-school, competency-based VISTA Robotics STEM Curriculum. This document does not authorize implementation or database changes.

**Audit date:** 2026-10-31

## Status legend

- **EXISTS** — implemented and connected sufficiently to preserve.
- **PARTIAL** — a usable foundation exists, but the requested product behavior is incomplete.
- **MISSING** — no implementation was found in the audited repository.
- **CONFLICTING** — current behavior or content contradicts the post-Review-2 direction.
- **UNKNOWN** — the repository does not provide enough evidence.

## Executive finding

VISTA already has most of the domain objects needed for Course 1. The primary gap is orchestration, not schema: the repository does not currently turn a persisted Course 1 task PASS into authoritative `learning_lesson_progress`, prerequisite unlocks, and a coherent Course Path. The browser includes a capable kinematic teaching simulator, while the server persists a deterministic schematic trace and symbolic PASS/FAIL. These are currently separate concepts. Course 1 should preserve both and make the server evidence chain authoritative.

The current seed curriculum (`Robot Discovery`, including VR and demonstration lessons) conflicts with the proposed Course 1 sequence. It should be replaced or versioned through seed/content changes, not by hard-coding grade-specific courses.

## Audit method and reproducibility

The audit used the checked-in repository as the source of truth. Positive claims were traced through Prisma models, controllers/services, frontend routes/components and tests. Negative claims were checked with repository-wide symbol searches, including:

```bash
rg -n 'learning_lesson_progress|learning_lesson_prerequisites|progress_percent|minimum_score|unlock|lockReason' services/education-api/src web/robot-edu/src
rg -n 'learning_vla|vla|training_runs|dataset|language_instruction|speech|microphone' services/education-api/src services/ai-integration web/robot-edu/src
rg -n '@Controller|@(Get|Post|Patch|Put|Delete)\(' services/education-api/src/modules
rg -n 'grasp|object|target|joint|gripper|collision|fail|success' web/robot-edu/src/components/studio/So101Viewer3D.tsx web/robot-edu/src/utils/robotProgram
```

“Not found” means absent from these checked-in implementation paths, not proof about uncommitted deployment configuration or external hardware state.

## Capability matrix

| Requirement | Current implementation | Status | Evidence | Gap | Recommended change | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Competency-based courses | Courses relate to levels, lessons, objectives and competencies. | PARTIAL | `services/education-api/prisma/schema.prisma`: `learning_courses`, `learning_levels`, `learning_objectives`, `learning_competencies` | API/UI does not expose competency progression as the curriculum spine. | Extend existing course/lesson read models; do not add a parallel curriculum model. | P0 |
| Course ordering / track | `learning_levels.ordinal` exists; course has optional `level_id`. | PARTIAL | `services/education-api/prisma/schema.prisma` | No explicit curriculum-path ordering between courses; `difficulty/track` is only indirectly represented. | Use `learning_levels` for Fundamentals/Programming/Intelligent Robotics initially; add fields only if product semantics cannot be represented. | P1 |
| Recommended grade range | School profiles have `grade_level`; courses do not have recommended ranges. | MISSING | `education_school_user_profiles.grade_level`; no course range in `learning_courses` | Recommendation metadata cannot be stored canonically. | Defer for P0 unless needed in UI; likely a small course metadata field/JSON migration after product decision. Never use it as an unlock gate. | P1 |
| Lesson ordering | Unique `(course_id, ordinal)` and ordered API query. | EXISTS | `learning_lessons`; `LearningService.lessonsForCourse()` | None for basic ordering. | Preserve. | P0 |
| Lesson prerequisites | Required prerequisite and minimum score are modeled. | PARTIAL | `learning_lesson_prerequisites` | No service was found enforcing it or returning lock reasons. | Add an authoritative progression query/service using existing rows. | P0 |
| Learning objectives | Normalized objectives and objective-to-competency weights exist. | PARTIAL | `learning_objectives`, `learning_objective_competencies` | Course and lesson endpoints do not return them. | Extend lesson read model and seed Course 1 objectives. | P0 |
| Enrollment | Enrollment, offering and classroom linkage are persisted. | EXISTS | `learning_enrollments`, `learning_course_offerings`; `GET /me/enrollments` | My Learning response is assignment-oriented rather than course-path-oriented. | Preserve enrollment; aggregate it into the new course-path read model. | P0 |
| Lesson progress persistence | Table supports status, percent and timestamps. | PARTIAL | `learning_lesson_progress` | No runtime read/write usage was found in `services/education-api/src`. Completion is not driven by task evidence. | Add transactional PASS-to-progress projection; do not create `LessonProgressV2`. | P0 |
| Attempts | Numbered attempts, state, snapshots and max-attempt enforcement exist. | EXISTS | `learning_assignment_attempts`; `LearningService.startAttempt()` | Attempt terminal state is not consistently projected from evaluation. | Update attempt state/result snapshot in the evaluation/progression transaction. | P0 |
| PASS evidence | Immutable symbolic evaluations link Experiment, Submission and ProgramVersion with hashes and rule evidence. | EXISTS | `learning_symbolic_evaluations`; symbolic-rule services; `LearningLoop.tsx`, `Practice.tsx` | PASS currently does not unlock lessons. Symbolic evaluation is explicitly not a physical simulation. | Preserve immutable evidence; make Course 1 progression consume the latest valid PASS for the exact ProgramVersion/challenge. | P0 |
| Reload/login persistence | Programs, versions, submissions, experiments and symbolic evaluation are server persisted. My Learning uses authenticated API. | PARTIAL | `ProgrammingService`; `ExperimentService`; `MyLearning.tsx`; `c1EvidenceOrchestrator.ts` | Standalone Studio still uses browser-local program context; lesson unlock state is absent. | Route curriculum tasks through server-backed Practice/LearningLoop and expose progression from API. | P0 |
| Program draft | Server-backed `learning_programs` stores Blockly workspace and canonical robot program. | EXISTS | `learning_programs`; `ProgrammingController` | Two UX paths exist: server-backed lesson practice and local standalone Studio. | Preserve standalone Studio as sandbox; make curriculum flow use server-backed program. | P0 |
| Immutable ProgramVersion | Versioned workspace/program/validation snapshot exists and submission references it. | EXISTS | `learning_program_versions`, `learning_submissions.program_version_id`; `ProgrammingService` | UI terminology and recovery are fragmented across Practice and LearningLoop. | Consolidate Course 1 around the existing version/submission/evidence orchestrator. | P0 |
| Assignment relationship | Program optionally belongs to assignment; attempts and submissions bind learner work to classroom delivery. | EXISTS | `learning_programs.assignment_id`, `learning_assignments`, `learning_classroom_assignments` | Course lessons without classroom assignment do not have a practice delivery path. | Define Course 1 seed/delivery policy; reuse Assignment as lesson challenge delivery. | P0 |
| Lesson-specific Blockly palette | Assignment has `allowed_blocks`; Practice currently selects hard-coded toolboxes by assignment title. | PARTIAL | `learning_assignments.allowed_blocks`; `Practice.tsx`; `blocklyConfig.ts` | Palette is title-coupled and not driven by authoritative assignment data. | Map `allowed_blocks` to a validated toolbox and remove title-based selection. | P0 |
| Blockly blocks for Course 1 | Home, joint/Cartesian move, gripper, wait, repeat, condition and dual-arm blocks exist. | EXISTS | `components/studio/blocklyConfig.ts`; generator/validator | Course 1 needs a restricted subset per lesson. | Reuse definitions; configure palette by lesson/assignment. | P0 |
| Course 2 readiness | Repeat, condition, Cartesian motion, multiple objects/zones and dual-arm commands exist. | PARTIAL | `blocklyConfig.ts`; `simulator.ts`; `simulationScene.ts` | No Course 2 curriculum or robust multi-object task evaluation. | Preserve as future-capability foundation; do not expose as P0 requirements. | P1 |
| 3D robot rendering | SO-101 URDF is rendered with `urdf-loader`; joint/gripper values animate. | EXISTS | `So101Viewer3D.tsx`; `public/assets/so101/urdf/so101_new_calib.urdf` | Viewer renders one arm and only an optional target marker in the audited lesson preview. | Preserve viewer; extend scene composition rather than replace it. | P0 |
| Kinematic simulation | Browser simulator has FK/IK, joint limits, motion, gripper state, object attach/release, zones and educational logs. | EXISTS | `utils/robotProgram/simulator.ts`, `kinematics.ts`, `simulationScene.ts` | It explicitly has no physics, dynamics or collision detection; task result is not persisted as authoritative evidence. | Treat it as deterministic task simulation, document limits, and persist normalized result/evidence through Education API. | P0 |
| L2 target-pose task | A learning target marker and server rule `preview_target_match` exist. | PARTIAL | `Practice.tsx`; `seed-demo-delivery.ts`; symbolic rules | Current experience is a coordinate declaration preview, explicitly not physical reachability. | Define L2 task state/evaluator on canonical robot state and return educational failure reasons. | P0 |
| L3 object/gripper task | Browser simulator can grasp within 30 mm below 50 mm, carry, release and warn on misses/drops. Challenge objects exist in DB. | PARTIAL | `simulator.ts`; `learning_challenge_objects` | Viewer does not demonstrate persisted challenge-specific objects; server schematic evaluator does not evaluate grasp physics/state. | Load challenge objects into scene and define deterministic object-state trace/evaluation. | P0 |
| L4 pick-and-place task | Objects/zones and conditions exist in browser; server has challenge objects/conditions and symbolic rules. | PARTIAL | `simulationScene.ts`; `learning_challenge_conditions`; symbolic evaluator | No end-to-end persisted task run proving object enters target zone. | Extend existing Experiment + artifact/evaluation chain; avoid adding a duplicate `SimulationRun`. | P0 |
| Machine-readable TaskState | Browser returns `ExecutionResult` with outcome/final state; server stores schematic output and symbolic rule results. | PARTIAL | `types/robot.ts`; `simulator.ts`; `learning_experiments`; `learning_symbolic_evaluations` | No shared `TaskState` contract joins browser animation to server-authoritative evaluation. | Define versioned task-simulation result schema in existing Experiment snapshots/artifacts. | P0 |
| Human-readable failure feedback | Browser emits reach/joint/grasp/drop messages; symbolic evaluation returns per-rule reasons. | PARTIAL | `simulator.ts`; `SymbolicEvaluation` UI in `Practice.tsx` | Messages are split across local logs and server rule reasons; examples such as release outside target are not consistently authoritative. | Normalize reason codes plus student-facing messages in evaluator result. | P0 |
| Simulation history/evidence | Schematic Experiments, events, artifacts and immutable evaluations are queryable. | EXISTS | `ExperimentController`; `learning_experiment_*`; symbolic evaluation APIs | Student Progress/Evidence does not present a complete course timeline. | Build a read model from existing evidence tables. | P0 |
| Physical execution boundary | Browser calls Education API; API validates and calls private Robot Runtime; Runtime calls CHECKIK adapter. | EXISTS | `PhysicalExecutionController/Service`; `RobotRuntimeClient`; `services/robot-runtime`; docs `robot-safety-boundary.md` | Must remain separate from browser and NestJS low-level control. | Preserve boundary exactly. | P0 |
| Physical authorization | Student permission, active membership/classroom, published assignment, entitlement, allocated robot and safety policy are checked. | EXISTS | `PhysicalExecutionService.resolveScope()` and `requireStudentCapability()` | Course-lesson eligibility is based on symbolic PASS, not explicit C1-L4 progress identity. | Add course progression gate without weakening existing checks. | P0 |
| Immutable program reuse | Physical scope selects the submitted ProgramVersion and exact symbolic PASS. | EXISTS | `PhysicalExecutionService.resolveScope()` | UI must clearly show that same version and prevent silent draft changes. | Preserve and surface ProgramVersion identity in L5. | P0 |
| Robot availability/conflict | Advisory lock and active ControlSession conflict handling exist. | EXISTS | `PhysicalExecutionService.prepare()` | None found at architecture level. | Preserve regression coverage. | P0 |
| Runtime software readiness boundary | Runtime is fail-closed and hardware disabled by default; status/preflight boundary exists. | PARTIAL | `services/robot-runtime/README.md`, `services/robot-runtime/src/runtime.py`; `PhysicalExecutionService` | Commissioning config is intentionally absent. | Preserve fail-closed boundary and add no bypass. | P0 |
| Hardware calibration/E-stop acceptance | No committed commissioning profile or supervised hardware acceptance result was found. | UNKNOWN | `services/robot-runtime/README.md` states commissioning configuration is intentionally not committed. | Repository cannot prove real hardware readiness. | Require supervised acceptance evidence outside code. | P0 |
| Physical result/evidence | Real-robot Experiment, events, artifacts, ControlSession and teacher evidence read model exist. | EXISTS | physical execution service; `AssessmentService`; `TeacherSubmissionReview.tsx` | L5 course completion rule and student-facing experiment result route are incomplete. | Add progression projection and dedicated result UX using existing evidence. | P0 |
| My Learning | Authenticated, server-backed list of published classroom assignments with retry/error handling. | PARTIAL | `MyLearning.tsx`; `GET /me/learning`; tests | It is assignment-centric, not enrolled-course/current-lesson/course-progress centric. | Extend read model and redesign content around Course 1 path without discarding query/session behavior. | P0 |
| Course Path | Course detail and lesson listing routes exist. | PARTIAL | `/courses/:courseId`; `CourseDetail.tsx`; `LessonViewer.tsx` | No completed/current/locked states or lock reasons from backend. | Modify CourseDetail into authoritative Course Path. | P0 |
| Lesson Detail | Lesson viewer exists and course seed has content JSON. | PARTIAL | `LessonViewer.tsx`; `learning_lessons.content` | Objectives, prerequisite status and challenge CTA are not a complete server-driven contract. | Extend lesson endpoint/read model and reuse page. | P0 |
| Simulation Result screen | PASS/FAIL is embedded in Practice. | PARTIAL | `Practice.tsx::EvaluationResult` | No durable result route/state with retry/continue/unlock outcome. | Add result state/route or stable panel backed by evaluation ID and progression response. | P0 |
| Progress/Evidence screen | My Learning, submissions, experiments, feedback and teacher evidence components exist separately. | PARTIAL | `MyLearning.tsx`; APIs in `lib/api.ts`; teacher evidence queries | No student course evidence timeline. | Compose existing evidence; do not duplicate storage. | P0 |
| Teacher dashboard/class detail | Dashboard, classes and class detail routes/pages exist with server queries. | EXISTS | `TeacherOverview.tsx`, `TeacherClasses.tsx`, `TeacherClassDetail.tsx`; learning-insights endpoints | Curriculum-path progress needs new columns/read model. | Extend, do not replace. | P0 |
| Curriculum/assignment authoring | Teacher can create/publish/update assignments and attach published challenge. | EXISTS | `TeacherAssignmentEditor.tsx`; `LearningController` | Does not author curriculum structure; this is acceptable if Course 1 is seeded/admin-managed. | Preserve; expose Course 1 lesson/challenge options. | P0 |
| Student progress | Classroom progress summary endpoint/UI foundation exists. | PARTIAL | `LearningInsightsController`; teacher pages | It cannot show prerequisite/mastery progression because lesson progress is unused. | Extend insight query after progression service. | P0 |
| Evidence review/feedback/assessment | Submission review, experiment evidence, symbolic verdict, feedback and rubric assessment exist. | EXISTS | `AssessmentController/Service`; `TeacherSubmissionReview.tsx` | Course 1 task/evidence labels need normalization. | Preserve and add Course 1 context. | P0 |
| School users/classrooms/membership | Organization-scoped user import, classroom creation and member management exist. | EXISTS | `education-admin`; `SchoolManagement.tsx` | None for P0 curriculum flow. | Preserve. | P0 |
| Classroom robot allocation | One robot per classroom allocation and management UI/API exist. | EXISTS | `learning_classroom_robot_allocations`; education-admin controller; `ClassroomRobotAllocation` | Allocation is not authorization by itself—which current execution service correctly recognizes. | Preserve separation. | P0 |
| Robot authorization/entitlement | Physical execution checks organization entitlement and permission. | PARTIAL | `PhysicalExecutionService`; `org_entitlements`, roles/permissions | Dedicated SA5 authorization UX is not clearly present; AdminRobots is browser demo data and conflicts with live expectations. | Add organization-scoped entitlement/readiness UI using existing backend concepts; do not trust local AdminRobots registry. | P0/P1 |
| VLA data model | Text `language_instruction`, observation snapshot, actions, safety and results are modeled. | EXISTS | `learning_vla_interactions`, `learning_vla_action_steps` | Only read/provenance endpoints were found; no operational VLA execution pipeline. | Keep outside P0. Preserve definition: visual observation + text prompt → action. | Advanced |
| AI datasets/training/evaluation | Rich metadata tables and ownership-filtered read APIs exist. | PARTIAL | `dataset_versions`, `training_runs`, `evaluation_runs`; `MetadataService` | Service comments explicitly say reads do not create captures/training/inference; AI integration service is skeletal. | Label as metadata/provenance only until operational evidence exists. | Advanced |
| Text-prompt VLA scope guard | VLA schema correctly stores `language_instruction`; an unrelated AI service README also lists speech-to-text, but no product behavior equating speech with VLA was found. | PARTIAL | `learning_vla_interactions.language_instruction`; `services/ai-integration/README.md` | Curriculum/UI scope is not yet explicit everywhere. | State that VLA Language is text prompt; treat speech as unrelated/out of scope rather than a VLA input. | P1/P2 |
| Current seed curriculum | `Robot Discovery`: gripper, reach target, VR control, demonstration. One UI says “Grade 3”. | CONFLICTING | `seed-demo-delivery.ts`; `DemonstrationPractice.tsx` | Does not match THCS–THPT Course 1 L1–L5 and contains grade-specific copy. | Create idempotent Course 1 seed and remove grade-specific product copy without deleting historical records. | P0 |

## Current 3D preview: verified behavior and limits

### What it supports

- SO-101 URDF rendering and smooth left-arm joint/gripper animation (`So101Viewer3D.tsx`).
- A target marker for the existing Reach Target learning preview.
- A separate browser simulator with two-arm kinematic state, FK/IK, joint limits, Home, joint/Cartesian moves, waits, repeat/condition, asynchronous dual-arm motion, gripper state, object grasp/carry/release and zone membership (`simulator.ts`).
- Educational messages for unreachable targets, joint limits, closing on nothing and dropping an object.
- Server-side deterministic schematic execution and immutable symbolic evaluation tied to ProgramVersion, Submission, Experiment and challenge rule snapshots.

### What it does not prove

- No physics, dynamics or collision detection; the source explicitly says so.
- The audited Course 1 Practice viewer does not render the browser simulator's complete object/zone scene; it renders the URDF plus an optional target marker.
- A locally completed animation is not persisted task evidence.
- Server schematic PASS does not currently represent a physics simulation and does not update lesson progression.
- Real-hardware correctness, calibration and E-stop acceptance remain **UNKNOWN** without supervised hardware evidence.

## Reuse decisions

1. Extend `learning_lesson_progress`; do not create a second progress table.
2. Extend `learning_experiments` + artifacts/events + `learning_symbolic_evaluations`; do not add a disconnected `SimulationRun` model for P0.
3. Use `learning_assignments` + `learning_challenges` as lesson challenge delivery; do not add a duplicate Challenge entity.
4. Keep immutable `learning_program_versions` as the artifact reused for physical execution.
5. Keep classroom robot allocation separate from authorization/entitlement and ControlSession ownership.
6. Keep browser 3D visualization separate from the server-authoritative evaluation boundary, while sharing a versioned task-state contract.

## Simulation authority decision

For P0, the Education API is the sole authority for PASS. The server extends the existing `SchematicEngineService` to deterministically recompute RobotState, ObjectState and TaskState from the stored immutable `ProgramVersion.robot_program` plus a snapshotted challenge configuration. The browser may run the same contract for responsive animation, but its trace/result is never uploaded as trusted evidence and never unlocks a lesson. `learning_experiments.output_snapshot` stores the server-produced task result; `learning_symbolic_evaluations` stores immutable rule evidence and verdict hashes over that output and rule snapshot.

This avoids both trusting client state and introducing a second SimulationRun domain object.

## Legacy curriculum visibility decision

The new Course 1 seed must be additive and use the canonical title `Robotics Fundamentals` within the target organization. `Robot Discovery` remains historical data but is not returned as an active post-Review-2 course unless it has an active offering/enrollment explicitly retained by that organization. No seed deletes or rewrites historical submissions. My Learning filters through active enrollments/offerings and must not merge records merely because lesson ordinals match.

## Database migration assessment

No database migration is required for the first P0 implementation slice: Course 1 content, prerequisite graph, lesson progress, attempts, challenge objects/conditions, ProgramVersion, Experiment and evaluation storage already exist. Seed/content changes and service/query changes are sufficient.

A later migration may be justified for recommended grade range or a first-class curriculum track if the team rejects representing those through `learning_levels`/course metadata. That is not required to implement Course 1 progression and must not block P0.

## Unknowns

- Whether the production database exactly matches the checked-in Prisma schema and migrations.
- Whether real robot commissioning profiles exist on the deployment host.
- Whether Review-2 hardware evidence can demonstrate readiness/calibration/E-stop behavior end to end.
- Whether historical `Robot Discovery` records must remain visible alongside the new curriculum or be archived through data operations.
