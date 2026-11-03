# VISTA Review 2 — Test Case Mapping (82 Committed Cases)

> **Traceability & Evidence Separation Principle:**
> Existing local automated test runs (192 unit tests in `services/education-api` and 75 unit tests in `web/robot-edu`, total 267 passed) confirm module-level code correctness. However, this total does not imply that all 82 Review 2 committed test cases have been executed. Cases requiring staging deployment, end-to-end browser workflows, dedicated state-transition matrix execution, physical robot hardware, or CI pipeline logs remain strictly marked as **Pending**.

| ID | Test Case ID | FR / Workflow / Category | Mapped Test File & Test Name in Codebase | Local Execution Evidence | Review 2 Status |
|:---|:---|:---|:---|:---|:---|
| 1 | `TC-FR01-01` | FR-01 Role-governed access | `services/education-api/src/modules/identity/identity.service.spec.ts`<br>`it('resolves user profile with valid active membership')` | PASS (192 unit tests pass in `services/education-api`) | **Covered by unit test** |
| 2 | `TC-FR01-02` | FR-01 Role-governed access | `services/education-api/src/modules/identity/auth/supabase-auth.guard.spec.ts`<br>`it('rejects invalid or expired JWT token')` | PASS (`services/education-api`) | **Covered by unit test** |
| 3 | `TC-FR01-03` | FR-01 Role-governed access | `services/education-api/src/modules/identity/identity.http.spec.ts`<br>`it('denies cross-organization access with 403 Forbidden')` | PASS (`services/education-api`) | **Covered by unit test** |
| 4 | `TC-FR02-01` | FR-02 Classroom robot allocation | `services/education-api/src/modules/education-admin/education-admin.service.spec.ts`<br>`it('allocates entitled robot to owned classroom')` | PASS (`services/education-api`) | **Covered by unit test** |
| 5 | `TC-FR02-02` | FR-02 Classroom robot allocation | `services/education-api/src/modules/education-admin/education-admin.service.spec.ts`<br>`it('enforces atomic single allocation replacement')` | PASS (`services/education-api`) | **Covered by unit test** |
| 6 | `TC-FR02-03` | FR-02 Classroom robot allocation | `services/education-api/src/modules/education-admin/education-admin.service.spec.ts`<br>`it('rejects allocating unentitled or foreign-organization robot')` | PASS (`services/education-api`) | **Covered by unit test** |
| 7 | `TC-FR03-01` | FR-03 Assignment publication | `services/education-api/src/modules/learning/learning.service.spec.ts`<br>`it('publishes classroom assignment')` | PASS (`services/education-api`) | **Covered by unit test** |
| 8 | `TC-FR03-02` | FR-03 Assignment publication | `services/education-api/src/modules/learning/learning-scope.service.spec.ts`<br>`it('validates assignment dates and delivery payload')` | PASS (`services/education-api`) | **Covered by unit test** |
| 9 | `TC-FR03-03` | FR-03 Assignment publication | `services/education-api/src/modules/learning/learning.service.spec.ts`<br>`it('rejects publish by unauthorized teacher or foreign classroom')` | PASS (`services/education-api`) | **Covered by unit test** |
| 10 | `TC-FR04-01` | FR-04 Immutable program submission | `services/education-api/src/modules/learning/programming.service.spec.ts`<br>`it('creates immutable program version and submits attempt')` | PASS (`services/education-api`) | **Covered by unit test** |
| 11 | `TC-FR04-02` | FR-04 Immutable program submission | `web/robot-edu/src/utils/robotProgram/toCanonicalNest.spec.ts`<br>`it('validates canonical AST and rejects invalid structure')` | PASS (75 tests pass in `web/robot-edu`) | **Covered by unit test** |
| 12 | `TC-FR04-03` | FR-04 Immutable program submission | `services/education-api/src/modules/learning/programming.service.spec.ts`<br>`it('denies submitting another student program version')` | PASS (`services/education-api`) | **Covered by unit test** |
| 13 | `TC-FR05-01` | FR-05 Schematic experiment | `services/education-api/src/modules/learning/experiment.service.spec.ts`<br>`it('creates schematic experiment and persists initial pending record')` | PASS (`services/education-api`) | **Covered by unit test** |
| 14 | `TC-FR05-02` | FR-05 Schematic experiment | `services/education-api/src/modules/learning/schematic-engine.service.spec.ts`<br>`it('evaluates schematic trajectory deterministically')` | PASS (`services/education-api`) | **Covered by unit test** |
| 15 | `TC-FR05-03` | FR-05 Schematic experiment | `services/education-api/src/modules/learning/experiment.service.spec.ts`<br>`it('rejects experiment creation outside learner classroom scope')` | PASS (`services/education-api`) | **Covered by unit test** |
| 16 | `TC-FR06-01` | FR-06 Physical execution boundary | `services/education-api/src/modules/learning/physical-execution.service.spec.ts`<br>`it('creates reservation when robot is ready and entitled')` | PASS (Mock runtime unit test only) | **Partial / Hardware Pending** |
| 17 | `TC-FR06-02` | FR-06 Physical execution boundary | `services/education-api/src/modules/learning/robot-runtime.client.spec.ts`<br>`it('validates hardware readiness check and telemetry')` | PASS (Mock runtime client test) | **Partial / Hardware Pending** |
| 18 | `TC-FR06-03` | FR-06 Physical execution boundary | `services/education-api/src/modules/learning/physical-execution.controller.spec.ts`<br>`it('fails closed and denies execution when hardware is unsafe/unreachable')` | PASS (`services/education-api`) | **Partial / Hardware Pending** |
| 19 | `TC-FR07-01` | FR-07 Assessment and feedback | `services/education-api/src/modules/learning/assessment.service.spec.ts`<br>`it('records rubric score and teacher feedback')` | PASS (`services/education-api`) | **Covered by unit test** |
| 20 | `TC-FR07-02` | FR-07 Assessment and feedback | `web/robot-edu/src/queries/teacherSubmissionReview.spec.ts`<br>`it('validates rubric item scores and feedback boundaries')` | PASS (`web/robot-edu`) | **Covered by unit test** |
| 21 | `TC-FR07-03` | FR-07 Assessment and feedback | `services/education-api/src/modules/learning/assessment.service.spec.ts`<br>`it('denies grading or reviewing foreign classroom submission')` | PASS (`services/education-api`) | **Covered by unit test** |
| 22 | `TC-FR08-01` | FR-08 AI/model provenance | `services/education-api/src/modules/metadata/metadata.service.spec.ts`<br>`it('reads AI model and dataset metadata safely')` | PASS (`services/education-api`) | **Covered by unit test** |
| 23 | `TC-FR08-02` | FR-08 AI/model provenance | `services/education-api/src/modules/metadata/metadata.service.spec.ts`<br>`it('returns empty/fallback structure for unconfigured external providers')` | PASS (`services/education-api`) | **Covered by unit test** |
| 24 | `TC-FR08-03` | FR-08 AI/model provenance | `services/education-api/src/modules/metadata/metadata.service.spec.ts`<br>`it('fails closed; does not report unavailable external AI training as successful')` | PASS (`services/education-api`) | **Covered by unit test** |
| 25 | `TC-WF01-01` | WF-01 School admin & robot allocation | End-to-end integration scenario across School Admin UI and API | Requires deployed staging environment | **Pending** |
| 26 | `TC-WF02-01` | WF-02 Learning assignment & submission | End-to-end integration scenario across Teacher publishing and Student submission | Requires deployed staging environment | **Pending** |
| 27 | `TC-WF03-01` | WF-03 Experiment execution & evaluation | End-to-end integration scenario across Student program, schematic engine, and runtime | Requires deployed staging environment | **Pending** |
| 28 | `TC-WF04-01` | WF-04 Teacher review & learner reflection | End-to-end integration scenario across Teacher rubric grading and Student reflection | Requires deployed staging environment | **Pending** |
| 29 | `ST-EXP-01` | State Transition: Experiment Session | `Requested → Authorized` (Allowed when scope and permissions pass) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 30 | `ST-EXP-02` | State Transition: Experiment Session | `Requested → Rejected` (Allowed when scope or permission fails) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 31 | `ST-EXP-03` | State Transition: Experiment Session | `Authorized → Queued` (Allowed after resource allocation) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 32 | `ST-EXP-04` | State Transition: Experiment Session | `Queued → Running` (Allowed when runtime is available) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 33 | `ST-EXP-05` | State Transition: Experiment Session | `Queued → Cancelled` (Allowed before run) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 34 | `ST-EXP-06` | State Transition: Experiment Session | `Running → Completed` (Allowed on successful terminal result) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 35 | `ST-EXP-07` | State Transition: Experiment Session | `Running → Failed` (Allowed on runtime error) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 36 | `ST-EXP-08` | State Transition: Experiment Session | `Running → Cancelled` (Allowed on stop or timeout) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 37 | `ST-EXP-09` | State Transition: Experiment Session | `Completed → Archived` (Allowed by retention/close action) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 38 | `ST-EXP-10` | State Transition: Experiment Session | `Failed → Archived` (Allowed after outcome recording) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 39 | `ST-EXP-11` | State Transition: Experiment Session | `Cancelled → Archived` (Allowed after outcome recording) | Enums defined in schema; dedicated transition test pending | **Pending** |
| 40 | `ST-EXP-12` | State Transition: Experiment Session | `Requested → Completed` (REJECTED: bypasses authorization/execution) | Invalid transition rejection test pending | **Pending** |
| 41 | `ST-EXP-13` | State Transition: Experiment Session | `Archived → Running` (REJECTED: archived is terminal) | Invalid transition rejection test pending | **Pending** |
| 42 | `ST-RUN-01` | State Transition: Robot Execution | `Idle → Ready Check` (Allowed on run command) | Runtime state machine design; execution test pending | **Pending** |
| 43 | `ST-RUN-02` | State Transition: Robot Execution | `Ready Check → Reserved` (Allowed when safety checks pass) | Runtime state machine design; execution test pending | **Pending** |
| 44 | `ST-RUN-03` | State Transition: Robot Execution | `Ready Check → Not Ready` (Allowed when safety checks fail) | Runtime state machine design; execution test pending | **Pending** |
| 45 | `ST-RUN-04` | State Transition: Robot Execution | `Reserved → Executing` (Allowed when execution begins) | Runtime state machine design; execution test pending | **Pending** |
| 46 | `ST-RUN-05` | State Transition: Robot Execution | `Executing → Uploading Evidence` (Allowed after task completion) | Runtime state machine design; execution test pending | **Pending** |
| 47 | `ST-RUN-06` | State Transition: Robot Execution | `Uploading Evidence → Completed` (Allowed after artifact persistence) | Runtime state machine design; execution test pending | **Pending** |
| 48 | `ST-RUN-07` | State Transition: Robot Execution | `Executing → Stopped` (Allowed on emergency stop) | Runtime state machine design; execution test pending | **Pending** |
| 49 | `ST-RUN-08` | State Transition: Robot Execution | `Executing → Failed` (Allowed on execution error) | Runtime state machine design; execution test pending | **Pending** |
| 50 | `ST-RUN-09` | State Transition: Robot Execution | `Not Ready → Idle` (Allowed after reset/retry) | Runtime state machine design; execution test pending | **Pending** |
| 51 | `ST-RUN-10` | State Transition: Robot Execution | `Stopped → Idle` (Allowed after resource release) | Runtime state machine design; execution test pending | **Pending** |
| 52 | `ST-RUN-11` | State Transition: Robot Execution | `Failed → Idle` (Allowed after recovery/release) | Runtime state machine design; execution test pending | **Pending** |
| 53 | `ST-RUN-12` | State Transition: Robot Execution | `Completed → Idle` (Allowed when session closes) | Runtime state machine design; execution test pending | **Pending** |
| 54 | `ST-RUN-13` | State Transition: Robot Execution | `Idle → Executing` (REJECTED: bypasses readiness check and reservation) | Invalid transition rejection test pending | **Pending** |
| 55 | `ST-RUN-14` | State Transition: Robot Execution | `Completed → Executing` (REJECTED: requires new authorized session) | Invalid transition rejection test pending | **Pending** |
| 56 | `ST-SUB-01` | State Transition: Learning Submission | `Draft → In Progress` (Allowed when learner starts attempt) | Submission lifecycle model; transition test pending | **Pending** |
| 57 | `ST-SUB-02` | State Transition: Learning Submission | `In Progress → Submitted` (Allowed on eligible submission) | Submission lifecycle model; transition test pending | **Pending** |
| 58 | `ST-SUB-03` | State Transition: Learning Submission | `Submitted → Under Review` (Allowed when authorized teacher opens review) | Submission lifecycle model; transition test pending | **Pending** |
| 59 | `ST-SUB-04` | State Transition: Learning Submission | `Under Review → Accepted` (Allowed when rubric criteria are met) | Submission lifecycle model; transition test pending | **Pending** |
| 60 | `ST-SUB-05` | State Transition: Learning Submission | `Under Review → Returned` (Allowed when revision is requested) | Submission lifecycle model; transition test pending | **Pending** |
| 61 | `ST-SUB-06` | State Transition: Learning Submission | `Under Review → Rejected` (Allowed for invalid/late submission) | Submission lifecycle model; transition test pending | **Pending** |
| 62 | `ST-SUB-07` | State Transition: Learning Submission | `Accepted → Published Feedback` (Allowed when assessment is released) | Submission lifecycle model; transition test pending | **Pending** |
| 63 | `ST-SUB-08` | State Transition: Learning Submission | `Returned → In Progress` (Allowed for resubmission) | Submission lifecycle model; transition test pending | **Pending** |
| 64 | `ST-SUB-09` | State Transition: Learning Submission | `Rejected → Published Feedback` (Allowed when rejection feedback is released) | Submission lifecycle model; transition test pending | **Pending** |
| 65 | `ST-SUB-10` | State Transition: Learning Submission | `Draft → Accepted` (REJECTED: bypasses submission and teacher review) | Invalid transition rejection test pending | **Pending** |
| 66 | `ST-SUB-11` | State Transition: Learning Submission | `Published Feedback → In Progress` (REJECTED: requires new attempt) | Invalid transition rejection test pending | **Pending** |
| 67 | `ST-ASG-01` | State Transition: Classroom Assignment | `Draft → Scheduled` (Allowed when teacher schedules assignment) | Assignment lifecycle model; transition test pending | **Pending** |
| 68 | `ST-ASG-02` | State Transition: Classroom Assignment | `Scheduled → Published` (Allowed on publish action) | Assignment lifecycle model; transition test pending | **Pending** |
| 69 | `ST-ASG-03` | State Transition: Classroom Assignment | `Published → Open` (Allowed when availability start time is reached) | Assignment lifecycle model; transition test pending | **Pending** |
| 70 | `ST-ASG-04` | State Transition: Classroom Assignment | `Open → Closed` (Allowed when deadline is reached) | Assignment lifecycle model; transition test pending | **Pending** |
| 71 | `ST-ASG-05` | State Transition: Classroom Assignment | `Closed → Archived` (Allowed by retention action) | Assignment lifecycle model; transition test pending | **Pending** |
| 72 | `ST-ASG-06` | State Transition: Classroom Assignment | `Scheduled → Cancelled` (Allowed before publication) | Assignment lifecycle model; transition test pending | **Pending** |
| 73 | `ST-ASG-07` | State Transition: Classroom Assignment | `Published → Cancelled` (Allowed on withdrawal) | Assignment lifecycle model; transition test pending | **Pending** |
| 74 | `ST-ASG-08` | State Transition: Classroom Assignment | `Cancelled → Archived` (Allowed after record retention) | Assignment lifecycle model; transition test pending | **Pending** |
| 75 | `ST-ASG-09` | State Transition: Classroom Assignment | `Draft → Open` (REJECTED: bypasses scheduling and publication) | Invalid transition rejection test pending | **Pending** |
| 76 | `ST-ASG-10` | State Transition: Classroom Assignment | `Archived → Published` (REJECTED: archived is terminal) | Invalid transition rejection test pending | **Pending** |
| 77 | `TC-NFR01-01` | Non-Functional: Authorization Isolation | `services/education-api/src/modules/identity/identity.http.spec.ts` | Negative test suite designed; formal staging suite pending | **Pending** |
| 78 | `TC-NFR02-01` | Non-Functional: Runtime Safety & Stop | `services/education-api/src/modules/learning/physical-execution.service.spec.ts` | Mock runtime tests pass; physical hardware stop tests pending | **Pending** |
| 79 | `TC-NFR03-01` | Non-Functional: API Latency P95 ≤3s | Load testing suite against declared staging database | Staging environment pending | **Pending** |
| 80 | `TC-NFR04-01` | Non-Functional: Runtime Ack ≤5s | Instrumented physical command-to-ack measurement | Physical hardware test pending | **Pending** |
| 81 | `TC-NFR05-01` | Non-Functional: Execution Traceability | Query verification for actor, timestamps, and terminal state | Automated query test pending | **Pending** |
| 82 | `TC-NFR06-01` | Non-Functional: CI Test Automation Rate | GitHub Actions CI test run on official tagged commit | Requires merge and official tagged commit | **Pending** |

---

## Summary of Status
- **Covered by unit test:** 21 cases (FR-01 to FR-05, FR-07, FR-08)
- **Partial / Hardware Pending:** 3 cases (FR-06 physical execution boundary)
- **Pending (Staging, E2E, Hardware, or CI required):** 58 cases (4 workflows + 48 state transitions + 6 NFRs)
- **Total:** 82 test cases
