# WF-01–WF-04 Integration Baseline

Reviewed on 2026-11-17 from `feat/wf01-wf04-integration` at
`8cce5bb979374c41c79ea0d7b0addbaf3c0cbe3d` (`origin/main`, PR #152). This is
an implementation inventory and verification record, not a deployment or
physical robot acceptance claim.

## Workspace and safety

- Dedicated worktree: `/home/quangduc/Code/vista/se-wf-integration`
- Branch: `feat/wf01-wf04-integration`
- Verified base: `origin/main` = `8cce5bb979374c41c79ea0d7b0addbaf3c0cbe3d`
- The original checkout had unrelated modified and untracked files. They were
  left untouched. Claude's `/home/quangduc/Code/vista/se-lms-full-phase1`
  worktree and `44964f4` were left untouched.
- WF-01 verification used an isolated PostgreSQL 17.11 container on
  `127.0.0.1:46489`, network `vista-wf01-20261117-net`, tmpfs-only data and
  database `vista_test_wf01_20261117`. It did not use ports 55432–55434 or
  access Production or staging. Its schema came from the pinned baseline and
  migrations D–N through `scripts/bootstrap_dev_database.py`.
- Claude's LMS worktree and commit remain untouched. No Production/staging
  migrations, deploys, or physical robot operations were performed.

## Approved workflow definitions

These are the repository's complete approved activity diagrams and workflow
gate documents used for this review:

- WF-01: [activity-wf01-school-administration.md](../diagrams/workflows/activity-wf01-school-administration.md),
  [wf-01-robot-resource-allocation.md](wf-01-robot-resource-allocation.md),
  [wf-01-robot-resource-allocation.puml](wf-01-robot-resource-allocation.puml)
- WF-02: [activity-wf02-learning-assignment.md](../diagrams/workflows/activity-wf02-learning-assignment.md),
  [wf-02-gate-1-assignment-draft-publish.md](wf-02-gate-1-assignment-draft-publish.md),
  [wf-02-gate-2-3-student-c1.md](wf-02-gate-2-3-student-c1.md),
  [wf-02-gate-4-instructor-review.md](wf-02-gate-4-instructor-review.md)
- WF-03: [activity-wf03-robot-experiment.md](../diagrams/workflows/activity-wf03-robot-experiment.md),
  [wf03-gate1-physical-authorization.md](wf03-gate1-physical-authorization.md),
  [wf03-gate2-3-runtime-fake-follower.md](wf03-gate2-3-runtime-fake-follower.md)
- WF-04: [activity-wf04-ai-data-teacher-review.md](../diagrams/workflows/activity-wf04-ai-data-teacher-review.md),
  [wf04-teacher-evidence-review.md](wf04-teacher-evidence-review.md)

## Implementation matrix

“Existing tests” names source/spec evidence. Status describes current repository
code and the check evidence in this document; it does not imply Production
deployment. **COMPLETE AND VERIFIED** means the documented behavior passed the
listed local checks, with explicitly stated scope.

| Approved step | Existing implementation | API | Frontend | Database dependency | Authorization | Existing tests | Missing functionality | External blocker | Verification status |
|---|---|---|---|---|---|---|---|---|---|
| WF-01: school admin opens/selects an authorized classroom | Existing School Management and classroom integration | `GET /education-admin/organizations/:organizationId/classrooms`; classroom detail via `GET /classrooms/:classroomId` | School Management and classroom allocation panel | `learning_classrooms`, memberships, offerings | Active organization membership; classroom/organization scope checked server-side | Education Admin unit/lifecycle specs; WF-01 browser API journey; classroom E2E regressions | No identified WF-01 gap | None for local workflow; organization/user data remains deployment-specific | **COMPLETE AND VERIFIED** (local authorized and cross-school browser journey; broader provisioning roles out of scope) |
| WF-01: display robot resources entitled to classroom organization | Eligible query filters robot resource type, current entitlement and available status | `GET /education-admin/classrooms/:classroomId/eligible-robots` | `ClassroomRobotAllocation` displays server-provided eligible list | `robots`, `org_entitlements`, classroom organization | Allocation permission and classroom scope; foreign scope fails closed | Education Admin unit + PostgreSQL tests; browser test asserts expired, maintenance and foreign resources excluded | Deployed entitlement inventory not verified | No live entitlement inventory available/needed for local acceptance | **COMPLETE AND VERIFIED** (disposable DB/browser fixture) |
| WF-01: validate and allocate/replace one robot; instructor sees allocation | Atomic transaction locks eligible robot+entitlement and upserts one allocation per classroom; reads hide unavailable/expired/revoked resources | `PUT /education-admin/classrooms/:classroomId/robot-allocation`; authorized classroom GET | Existing allocation panel; instructor classroom display consumes safe allocation projection | `learning_classroom_robot_allocations`, `robots`, `org_entitlements` | School Admin permission; instructor classroom membership; organization derived from classroom, resource entitlement checked in transaction | Education Admin unit, PostgreSQL allocation/instructor readback, Playwright authorized/unauthorized/cross-school/invalid/replacement flow | Physical robot use is explicitly outside WF-01 | Production permission migration N is local unapproved candidate; no live resources provisioned | **COMPLETE AND VERIFIED** (workflow allocation only; no booking/runtime/hardware) |
| WF-02: teacher creates/edits lesson/assignment and saves draft delivery | Assignment content and classroom delivery are distinct; content + draft delivery created transactionally | `POST /classrooms/:id/assignments`, `PATCH /classrooms/:id/assignments/:id` | Teacher assignment editor and class assignment list | Course/Lesson, `learning_assignments`, `learning_classroom_assignments`, rubric | Active teacher/TA classroom scope and delivery permission | `learning.service.spec.ts`, `instructor-assignment-management.db.spec.ts`, browser LMS authoring E2E | Broader cross-role acceptance for all teacher/TA variants | None for local path | **COMPLETE AND VERIFIED** (local browser/API/DB path, supported scenarios) |
| WF-02: explicitly publish assignment | Draft→published transition; publish is idempotent; closed/archived refused; quizzes require published canonical question versions | `POST /classrooms/:id/assignments/:assignmentId/publish` | Publish action in Teacher Class Detail / assignment management | Same delivery rows plus canonical Question Bank for quizzes | Teacher classroom authorization checked by API | Service specs; Playwright authoring/publishing and School Admin cannot publish | None in the verified tested scope | None for local path | **COMPLETE AND VERIFIED** (Playwright includes course publish and quiz journey; assignment path has service tests) |
| WF-02: learner views assigned work and starts/continues an attempt | Published, available delivery; enrollment/offering/classroom checks; attempt limit/window and immutable quiz snapshot | `GET /classrooms/:id/assignments`, `POST /classroom-assignments/:id/attempts`, attempt/history APIs | Student Assignments, My Learning, assignment detail, Practice | Delivery, classroom/course enrollment, attempts, private quiz grading snapshot | Authenticated learner ownership, active enrollment and classroom scope | `learning.service.spec.ts`, attempt DB suites, Playwright course/quiz/refresh scenarios | No remaining core step identified in the tested LMS scope | None for local path | **COMPLETE AND VERIFIED** (13 browser E2E total includes student delivery/quiz; DB suites separately pass) |
| WF-02: student submits program/work; persist submission | Immutable ProgramVersion and attempt-bound Submission; C1 evidence flow can persist schematic Experiment and SymbolicEvaluation | Program/version/submission/experiment/symbolic-evaluation APIs under `/me/...` | Practice and C1 evidence orchestrator; status from persisted server evidence | Programs, versions, attempts, submissions, experiments, evaluations | Own active enrolled attempt; exact version provenance; server-side grading/evaluation | `attempt-submissions.db.spec.ts`, `experiment-run.db.spec.ts`, `physical-execution.service.spec.ts` (physical eligibility), Practice specs; browser submission E2E | Browser E2E currently submits immutable program version but does not run the complete schematic→symbolic C1 chain | No safe physical DB/runtime mapping for physical path; symbolic chain is local code path | **COMPLETE AND VERIFIED** for submission+teacher review journey; C1 chain **IMPLEMENTED BUT UNVERIFIED** end-to-end |
| WF-03: student requests experiment; API validates identity, assignment and robot | Authoritative provenance resolution binds current student, classroom delivery, attempt, submitted immutable version, persisted symbolic PASS, allocation and entitlement; creates owned control session and physical Experiment | `GET /me/attempts/:attemptId/physical-execution-eligibility`; `POST /me/attempts/:attemptId/physical-executions` | Physical execution panel and confirmation use API eligibility; browser cannot send executable program or robot identity | Attempts/submissions/versions/evaluation, classroom allocation, entitlement, control sessions, experiments | Supabase JWT, active student membership/enrollment, assignment ownership, server-side PASS and robot authorization | `physical-execution.service.spec.ts`, controller spec, attempt regression DB tests | Full Education API + persistent DB fake-follower E2E explicitly deferred; no runtime URL mapping in safe current setup | `HOST_TEST_DEFERRED` / DB concurrency live test deferred per gate doc; no real robot commissioned | **IMPLEMENTED BUT UNVERIFIED** (unit/service tests only for this vertical) |
| WF-03: runtime executes program and returns status/telemetry | R1 validates canonical limited commands, fails closed when hardware disabled, supports explicit fake adapter, cancel/stop and sanitized lifecycle; Education API maps durable state | Private API→R1 client and run/status/cancel/stop contracts; never public browser endpoint | Student UI gets eligibility/start/status/stop via Education API | Persistent execution provenance/events/control-session state; runtime process state in memory | Server-owned token and Robot→loopback runtime map; ownership checked on stop | `robot-runtime/tests/test_runtime.py` 16/16; physical service unit suite; documented prior two-process fake-follower check (not rerun here) | No full current API+DB+R1 process E2E was run; no real hardware execution | Runtime map/credentials, runtime adapter process, hardware commissioning; no automated replay after restart | **PARTIAL** |
| WF-03: store result and evidence; show success/error | Experiment lifecycle, events, sanitized outputs, symbolic and execution provenance persisted; browser can render persisted status | physical execution and experiment result/status APIs | Practice/result panels display persisted outcomes | `learning_experiments`, events, artifacts, control sessions, version/evaluation links | Student ownership; server-derived lifecycle and exact ProgramVersion | Unit/service specs; runtime offline tests | Dedicated browser E2E for result/error and persisted telemetry | Physical evidence and operator commissioning are unavailable | **IMPLEMENTED BUT UNVERIFIED** for full student→API→runtime path |
| WF-04: link experiment evidence and model metadata | Instructor submission query roots at authorized Submission and projects Experiments/events/artifacts, demo/reflection, dataset and model metadata through scoped relationships; metadata-only; no fabricated links | `GET /submissions/:submissionId`; assessment/feedback routes | Teacher Submission Review + EvidenceCard and TeacherAttemptPanel display persisted evidence | Submission/Attempt/Experiment, demonstration, reflection, dataset versions, evaluation runs/checkpoints/models | Active teacher/TA membership plus `learning.work.review`; assessment needs `learning.assessment.assess`; organization joins limit metadata | `assessment.service.spec.ts` checks evidence projection/sanitization; `assessment.service` query is source evidence; Playwright review E2E confirms basic submission/assessment/feedback | No dedicated E2E asserts full experiment, demonstration, dataset and model projection; artifacts may be local-only | C3 artifacts can be `local://`; model inference/training absent | **PARTIAL** |
| WF-04: teacher reviews evidence, records assessment/feedback; student sees feedback | Server-side rubric assessment and feedback persist on submission; grade/feedback have release gate; review is read-only for robot evidence | Submission GET, assessment/feedback POST, grade release, student feedback GET | Teacher review route; student My Learning/feedback display | Submission, rubric, assessment, feedback and release state | Teacher classroom review/assess permission; student only sees own released grading/feedback | `assessment.service.spec.ts`; Playwright “Student submits a ProgramVersion and instructor assesses and returns feedback” | Evidence-rich review path not separately asserted in browser test | None for software test flow | **COMPLETE AND VERIFIED** for submission + assessment + feedback lifecycle in local E2E |
| WF-04: AI/data integration produces model output for review | Schema and review projection can reference dataset/model/checkpoint/evaluation metadata; AI integration entry point only prints startup message | No established inference or training API in `services/ai-integration` | Review can show existing persisted model metadata if present; no inference UI | Dataset/model metadata schema exists | Any future inference must preserve API authorization and robot safety ownership | No inference tests | VLA inference, training workers, model evaluation/action pipeline missing | Model/provider/service implementation and validation absent | **MISSING** |

## WF-02 Queue 03 — verified main scope and integration boundary

Read the approved [WF-02 activity diagram](../diagrams/workflows/activity-wf02-learning-assignment.md)
and its Gate 1, Gate 2+3 and Gate 4 definitions before verification. The diagram
approves: teacher creates/edits a lesson; the web collects assignment details;
the API validates and saves; the teacher publishes; the student sees assigned
work, submits a program/work item and the API records the submission.

| Boundary / approved step | Category and state on this Codex branch | Main implementation and evidence | Remaining limitation |
|---|---|---|---|
| School offerings and classroom enrollment | **A — available on main; verified locally** | Offering/classroom scoping and transactional enrollment synchronization on course publish; membership change/revocation synchronization. Real PostgreSQL publish, rollback, retry, concurrency, offering/classroom state and enrollment access suites passed. | No remote CI or Production evidence; those are outside this local verification. |
| Course and lesson access; assigned work visibility | **A — available on main; verified locally** | Published course/lesson/activity delivery; enrollment-gated student reads/writes; authorized My Learning and lesson paths. Real PostgreSQL enrollment/course builder suites and Playwright classroom/course journeys passed. | Full C1 evidence chain is not covered by a single browser journey. |
| Quiz delivery, attempts, scoring and snapshots | **A — available on main; verified locally** | Canonical Question Bank quiz delivery; server-issued public/private attempt snapshots; weighted scoring and retake lifecycle. PostgreSQL course-builder persistence test verifies private answer snapshot, immutable attempt snapshot, score and classroom isolation. Browser Journey 2 verifies weighted 1+3 point scoring (25%, then 100%), attempt limit/retake and no key exposure; course-builder delivery journey also passed. | No missing core quiz step identified in WF-02. |
| Assignment attempt and submission lifecycle | **A — available on main; verified locally** | Classroom assignment attempt → immutable ProgramVersion → one final attempt-bound Submission, with duplicate/frozen-write and retry protections. DB submission/retry suites and Playwright student submission journey passed. | Refresh recovery cannot safely reuse an orphan ProgramVersion created before later orchestration stages finish (known Gate 2+3 limitation). |
| Teacher review, grading and release | **A — available on main; verified locally** | Classroom-scoped instructor review, rubric assessment and separate grade/feedback release; student cannot read grading before release. DB assessment/submission suites and browser teacher review/release flow passed. | Reopening a released grade with audited history is a separate Claude branch enhancement, not present in main. |
| Progression | **A — core course/lesson/quiz progression available on main; components verified** | Progression and quiz completion covered by course-builder persistence, retry and quiz service tests. | Full ProgramVersion → Submission → schematic Experiment → SymbolicEvaluation → progression vertical remains **IMPLEMENTED BUT UNVERIFIED** as one end-to-end C1 journey. |
| Authorization and tenant isolation | **A — available on main; verified locally** | Active membership/enrollment and organization/classroom scope checked in services; unauthorized attempt/submission access returns not found; cross-school classroom/roster and forged course ownership denied. Real PostgreSQL and browser isolation cases passed. | Hosted Supabase/Production authorization was not exercised. |
| Approved diagram: author/edit → validate/save draft → publish → learner view → submit/record | **A — available on main; verified locally** | Assignment content and classroom delivery are separate; create is transactional and begins draft; explicit classroom-scoped publish; student delivery/attempt/submission paths. Backend and browser coverage passed. | None identified for the approved diagram's core steps. |

### A / B / C classification

- **A — already available and verifiable on main:** all approved diagram steps
  and listed core integration boundaries above. Queue 03 found no isolated
  implementation defect to fix, so it made no WF-02 source-code changes.
- **B — implemented on Claude's branch, not integrated into main:** commit
  `44964f4` on `feat/lms-full-phase1` adds assignment configuration (schedule,
  attempt/rubric options), audited reopening of released grades, teacher
  learner-progress monitoring, Question Bank CSV/XLSX import and related UI;
  it also adds progression/media/question-import integration coverage. These
  files were inspected read-only. Do not duplicate them. Phase 1E is pending;
  retain an explicit dependency on that branch and its owner's completion,
  then formally integrate and rerun acceptance before claiming this enhanced
  LMS journey verified.
- **C — genuinely missing from both:** no core feature required by the
  approved WF-02 activity diagram was found missing. The Gate 2+3 recovery
  limitation remains: after refresh between ProgramVersion creation and a
  later C1 stage, the current APIs cannot safely reuse the orphan version.
  This needs a broader idempotency contract and is not safe to recreate as an
  independent patch. Full C1 vertical E2E verification also remains outstanding.

The Queue 03 result is **PARTIAL** for total WF-02 completion because Claude's
enhancements are not integrated and the Gate 2+3 C1 recovery/full-journey gap
remains. This report does **not** claim verification against Claude's LMS code.

## Baseline verification

Commands and results on this branch (Queue 01 records below are retained for WF-02–WF-04 context; WF-01 updated verification follows):

- Added migration `20261117_n_wf01_robot_allocation_permission.sql` to grant `education.classroom.resource.allocate` to the canonical organization-scoped `school_admin` role. It is an additive local candidate, included in the manifest and bootstrap invariant; it has not been applied outside disposable PostgreSQL.
- Queue 03 used a second disposable PostgreSQL 17.11 container on loopback `127.0.0.1:46517`, tmpfs-only data, database `vista_test_wf02_20261117`, and migrations D–N from the SQL runner. No application writes targeted a Production/staging database.
- WF-02 backend: `npm run build` passed; targeted Jest with PostgreSQL integration enabled passed **17 suites / 222 tests**, covering course publish/enrollment, enrollment authorization and revocation, quiz delivery/snapshot/scoring, submission/attempt lifecycle, assessment/release and classroom regression.
- WF-02 frontend: targeted Vitest passed **9 files / 83 tests**; `npm run build` passed with existing BlocklyCanvas import and large-chunk warnings.
- WF-02 browser: `course-builder-delivery.spec.ts`, `lms-independent.spec.ts` and `lms-authoring.spec.ts` passed **14/14** against local JWKS, Vite, Education API and disposable PostgreSQL. This includes the weighted quiz score sequence 25% → 100%, assignment submission, teacher review/grade release, classroom enrollment, authorization and cross-school denials.
- WF-02 DB `--verify-only` passed: ledger D–N (11 migrations), schema fingerprint `c5032d16ff1dbe008d1bc3f34ebb8b1d44ca6fa94c82b972e37469106cae147d`.
- `cd services/education-api && npm run build` — passed.
- Backend targeted Jest with PostgreSQL integration enabled: `education-admin.service.spec.ts`, `education-admin.classroom-lifecycle.spec.ts`, `learning.service.spec.ts`, `instructor-assignment-management.db.spec.ts`, `robot-allocation.db.spec.ts` — 5 suites / 127 tests passed; the database-backed cases used only the disposable PostgreSQL instance.
- `cd web/robot-edu && npm run build` — passed (existing chunk-size and BlocklyCanvas import warnings).
- Frontend Vitest: school admin queries, student import, member candidate state and classroom teacher quiz/assignment separation — 4 files / 26 tests passed.
- Playwright `lms-independent.spec.ts` — 8/8 passed, including School Admin classroom creation and enrollment, cross-school denial, WF-01 allocation/replacement/Instructor view, submission/review, course authoring, refresh/relogin, retry and viewport behavior. The first run exposed the fixture creating an unpublished course; the seed now publishes its synthetic course after publishing required activities, and the clean-database rerun passed.
- `python3 scripts/bootstrap_dev_database.py --verify-only` — passed against isolated PostgreSQL; migration ledger contains D–N (11 entries), fingerprint `c5032d16ff1dbe008d1bc3f34ebb8b1d44ca6fa94c82b972e37469106cae147d`.
- `git diff --check` — passed before final document update.

- `VISTA_DEV_DATABASE_URL=... VISTA_TEST_DATABASE_NAME=... VISTA_TEST_DATABASE_PORT=46317 VISTA_DATABASE_PROJECT_REF=local-wf0104-20261117 SUPABASE_URL='' python3 scripts/bootstrap_dev_database.py --confirm-local-bootstrap` — passed. Restored pinned baseline SHA-256 `5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962`, applied D–M in disposable PostgreSQL 17.11, 91 tables, 814 columns, 502 constraints, 246 indexes, 48 policies, schema fingerprint `b11e8a06964af31814fc1731f72ba5cd6354cb69090b40f33eee06a5bea1424b`.
- `python3 scripts/bootstrap_dev_database.py --verify-only` with the same target variables — passed; ledger matches all 10 manifest migrations and fingerprint matches pinned expectation.
- `cd services/education-api && npm run build` — passed.
- `cd services/education-api && npm test -- --runInBand --silent src/modules/education-admin/education-admin.service.spec.ts src/modules/learning/learning.service.spec.ts src/modules/learning/physical-execution.service.spec.ts src/modules/learning/physical-execution.controller.spec.ts src/modules/learning/assessment.service.spec.ts src/modules/learning/experiment.service.spec.ts src/modules/learning/symbolic-rules/symbolic-evaluation.service.spec.ts` — passed, 7 suites / 197 tests. First attempt before `npx prisma generate` failed because the generated Prisma Client was absent in the clean worktree; generation completed locally and retry passed.
- `cd services/education-api && VISTA_TEST_DATABASE_NAME=vista_test_wf0104_20261117 VISTA_TEST_DATABASE_PORT=46317 VISTA_DATABASE_PROJECT_REF=local-wf0104-20261117 RUN_POSTGRES_INTEGRATION=1 SUPABASE_URL='' VISTA_INTEGRATION_DATABASE_URL=... npm test -- --runInBand --silent src/modules/learning/instructor-assignment-management.db.spec.ts src/modules/learning/attempt-submissions.db.spec.ts src/modules/learning/experiment-run.db.spec.ts src/modules/learning/attempt-retry-regression.db.spec.ts` — Queue 01 evidence: passed, 4 suites / 30 tests, against only its disposable DB.
- `cd web/robot-edu && npm test -- --run src/queries/schoolAdminQueries.spec.ts src/pages/StudentAssignments.spec.tsx src/pages/Practice.spec.tsx src/queries/teacherSubmissionReview.spec.ts` — passed, 4 files / 60 tests.
- `cd services/robot-runtime && python3 -m unittest discover -s tests -v` — passed, 16 tests.
- `cd web/robot-edu && VISTA_E2E_JWKS_PORT=54323 VISTA_E2E_API_BASE_URL=http://127.0.0.1:3001/api/v1 VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-wf0104-20261117.json npm run test:e2e` — Queue 01 evidence: passed, 13/13. Queue 02 re-ran the expanded file with the dedicated WF-01 test; results are recorded above.
- `cd services/robot-hardware-adapter && python3 -m unittest discover -s tests -v` — unavailable in current Python environment: `pytest` and installed `robot_hardware_adapter` package are absent.
- Direct Jest/Vitest attempts before installing dependencies failed because executables were absent. `npm install --ignore-scripts --no-audit --no-fund` in API and web worktrees plus Prisma generation were local environment setup; tracked lockfiles and source remained unchanged.

No real robot, AWS, Production, or staging services were accessed. No migration was run outside the disposable PostgreSQL instance. Migrations K–M remain Production blocked as documented.

## Remaining blockers and next action

- WF-01 is locally verified for the approved allocation flow. Permission migration N remains an unapproved release candidate; an environment without it will lack the allocation grant. Production/staging migration execution is outside this task.
- WF-02 C1 full browser vertical (ProgramVersion → Submission → schematic Experiment → SymbolicEvaluation → progression) needs an explicit E2E scenario; current E2E verifies adjacent LMS paths but does not claim this chain.
- WF-03 complete Education API + persistent DB + R1 fake-follower process test and DB concurrency test remain deferred in the approved gate docs. Real hardware remains blocked by missing commissioning evidence, runtime mapping and operator safety gates.
- WF-04 full evidence projection needs browser/API coverage; C3 artifact availability may remain host-local; dataset/model links are metadata only. VLA training/inference is missing.
- K–N Production release remains blocked by migration-runner/platform-role and recovery verification requirements.

**Next action:** WF-01 implementation and local acceptance are complete. WF-02 core main functionality is locally verified; enhanced LMS integration and the C1 retry/idempotency gap remain pending. Queue 04 may proceed with independent work on this worktree/branch. Keep WF-03 physical work gated and do not start LMS Phase 1E.
