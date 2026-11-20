# WF-01 … WF-04 — trace, tests and completion state

Definitions are the repository's approved ones (not extended): WF-01 robot resource allocation
(`docs/education/wf-01-robot-resource-allocation.md`), WF-02 learning/assignments/review
(`docs/diagrams/workflows/activity-wf02-learning-assignment.md`, gate docs), WF-03 robot experiment
(`activity-wf03-robot-experiment.md`, `wf03-gate1/2-3*.md`), WF-04 AI/data teacher review
(`activity-wf04-ai-data-teacher-review.md`, `wf04-teacher-evidence-review.md`). The prior step-level matrix is
`docs/education/WF01-WF04-INTEGRATION-BASELINE.md`; this file re-states it against the **merged** branch and this sprint's runs.

Legend: **E2E** = real browser against real API + PostgreSQL on disposable infrastructure (local). "Prod" = Production evidence.

| WF | Real entry point | Frontend → backend → persistence | Robot/simulation | Authorization tests | Failure handling | Completion state | E2E evidence (this sprint) | Status |
|---|---|---|---|---|---|---|---|---|
| **WF-01** | School Management → classroom robot allocation panel | `ClassroomRobotAllocation` → `GET /education-admin/classrooms/:id/eligible-robots`, `PUT …/robot-allocation` → `learning_classroom_robot_allocations` (+ `robots`, `org_entitlements`; permission from migration **O**) | none (resource record only) | School Admin allowed; cross-school, instructor-without-permission, student refused | invalid / unavailable / expired / maintenance / foreign robots rejected; atomic replace | allocation visible to the classroom's instructor | `lms-independent.spec.ts` WF-01 journey passed; `robot-allocation.db.spec.ts` passed | **VERIFIED locally.** Migration O has no Production scope → **not deployable** without a reviewed release scope |
| **WF-02** | Teacher assignment editor → Student My Learning / Practice → Teacher submission review | `TeacherAssignmentEditor`, `Practice`, `SubmissionReview` → `/classrooms/:id/assignments`, `/classroom-assignments/:id/attempts`, `/me/attempts/:id/program|submission`, `/submissions/:id`, assessment/feedback/release → `learning_assignments`, `…classroom_assignments`, attempts, programs/versions, submissions, assessments | schematic simulation + symbolic evaluator (not physical) | teacher scope, student ownership, peer and foreign-school denial, School Admin cannot publish | attempt limit/window, one final submission, late/closed refusal, release gate, audited correction | released grade/feedback visible only to the owner | `lms-assignment-grading`, `lms-authoring`, `lms-independent`, `lms-security-matrix`, **`blockly-simulation`** all passed (49 + 3) | **VERIFIED locally**; Prod: LMS smoke 23/23 (navigation/authorization only) |
| **WF-03** | Student activity page "Physical Experiment" → confirmation checklist → Run | `ActivityReader` → `GET …/physical-execution-eligibility`, `POST …/physical-executions/start`, `GET/stop /me/physical-executions/:id` → `learning_experiments`, control sessions, events, artifacts | API → R1 (`VISTA_ROBOT_RUNTIME_MAP`) → CHECKIK **fake follower**; telemetry → Twin → MuJoCo; evidence JSON → S3 | JWT, enrollment, immutable version + symbolic PASS, allocation + entitlement, robot→runtime map, stop ownership | hardware disabled by default; non-`fake_follower` or IoT-enabled start refused; runtime-lost handling; cancel/stop; missing artifact reported `unavailable` | experiment `succeeded`, evidence `available`, Twin `accepted` | `wf03-runtime-evidence.spec.ts` 1/1 (fresh fixture); pytest R1 17, CHECKIK 7, Twin 56 | **Simulation path VERIFIED locally; physical BLOCKED** (no commissioned hardware, no supervised run). Fake follower is not hardware acceptance |
| **WF-04** | Teacher submission review page | `SubmissionReview`/`EvidenceCard` → `GET /submissions/:id`, artifact download routes, assessment/feedback/release → submission, experiments/events/artifacts, assessments | reads persisted simulation evidence only | `learning.work.review`, exact classroom/submission link; peer and foreign teacher denied | short-lived signed URL after HEAD digest/size/scope check; missing object → `unavailable`; no fabricated links | teacher assesses, releases, student sees result | `wf03-runtime-evidence.spec.ts` (teacher + student download, peer/foreign 403/404), `blockly-simulation.spec.ts` (review → release) | **Teacher-review VERIFIED locally.** The "AI/data output for review" step is **NOT IMPLEMENTED** (no model output exists; see [VLA_SCOPE_AND_EVIDENCE.md](VLA_SCOPE_AND_EVIDENCE.md)) |

## Cross-cutting findings

1. **Branch gap closed**: before this sprint WF-01/03/04 existed only on the unmerged `feat/wf01-wf04-integration` branch and had never
   been run together with the final LMS on `main`. They now pass on the merged tree.
2. **WF-03 fixtures are single-use**: the spec consumes the attempt and deletes its S3 object; rerun requires a fresh seed.
3. **Release coupling**: shipping WF-01 requires migration O to receive a reviewed release scope (`database/release-scopes.json`),
   which this sprint deliberately did not create.
4. **Honest limits**: R1 state is in memory (no restart reconciliation); telemetry is the latest frame, not a persisted time series;
   no physical E-stop, calibration or movement was exercised; Twin viewer rendering of MuJoCo state is not browser-tested.
