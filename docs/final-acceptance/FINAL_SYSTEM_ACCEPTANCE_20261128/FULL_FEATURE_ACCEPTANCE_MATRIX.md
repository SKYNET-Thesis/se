# Full feature acceptance matrix (2026-11-28)

Tested revision: `develop` `eceb8d1`. Environment: **LOCAL isolated** (real Chrome, real API, PostgreSQL 17, RustFS S3-compatible store; real GoTrue for the auth rows). Production `430ad59` was observed read-only only. Statuses: PASS / FAIL / BLOCKED / NOT RUN / DEFERRED. Every row is a check **inside** a registered requirement of `MASTER_REQUIREMENTS_TRACEABILITY_MATRIX.md`. "Prod" = Production acceptance this cycle (always NOT RUN unless noted: no Production writes were authorised).

## 1. Capability checklist from the acceptance brief (Phase C–E)
| # | Capability | Evidence | Local | Prod |
|---|---|---|---|---|
| 1 | Login, logout, session restoration and expiry | `platform-resilience` 6/6; real GoTrue `student-auth-session-ui/api` (inside 18/18 and 13/13) | PASS | NOT RUN |
| 2 | Password and invitation flows | real GoTrue UI 18/18 (activation, first login, recovery code, reissue, staff recovery with single-use link and forged-marker refusal); `platform-invite-security` 10 passed, 1 skipped | PASS | NOT RUN |
| 3 | Unauthorized access, role enforcement, direct URL/API authorization | `lms-security-matrix` 1/1; `platform-route-sweep` 22/22; jest `supabase-auth.guard`, `learning-scope.service`; static: 28 of 31 controllers guarded, 3 public (health, version, status — no data) | PASS | read-only: unauthenticated `/me/…` → **401** (PASS) |
| 4 | Tenant/school isolation, cross-user resource access | `lms-security-matrix`, `lms-robot-lab-access`, `platform-school-admin`; jest `question-bank-global-scope.db`, `activity-progress-scope.db` | PASS | NOT RUN |
| 5 | Token handling | real GoTrue session API specs; Twin viewer scope ≤ 60 s subprotocol token (pytest `test_authorization`) | PASS | NOT RUN |
| 6 | File access permissions | `lms-lesson-media`, `platform-media-archive`; jest `learning-media.*` (incl. real S3), `submission-file*.spec` | PASS | Production buckets: all four Block Public Access flags ON (PASS, read-only) |
| 7 | School/organization, user, instructor/student management | `platform-lifecycle`, `platform-system-admin` 5/5, `platform-school-admin` 6/6, `student-bulk-import-ui` (in GoTrue UI 18/18) | PASS | NOT RUN |
| 8 | Classes and enrollments | `platform-school-admin`, `lms-offering-enrollment-limits` 3/3 | PASS | NOT RUN |
| 9 | Robot registration, resource allocation, ownership, removal/replacement, concurrent conflicts | `lab-session-management` 4/4, `lms-independent` 9/9; jest `robot-allocation.db`, `robot-resource.db` | PASS (D-11 = owner decision) | NOT RUN |
| 10 | **D-11 current behaviour** | legacy `PUT …/robot-allocation` **adds** an allocation; same robot again → **409**; classroom detail `allocated_robot` = first; contract not changed | documented | OWNER-DECISION B5 |
| 11 | Course → Module → Lesson → Media → Quiz → Assignment → Preview → Publish → Delivery | `lms-authoring` 5/5, `lms-lesson-media`, `lms-module-quiz`, `lms-course-offerings` | PASS | NOT RUN |
| 12 | Draft/published, discard draft, edit/version | `lms-draft-discard`, `lms-p1-p2-regression` | PASS | NOT RUN |
| 13 | PDF/DOCX/PPTX/image/video/attachments | `lms-lesson-media`; jest media allow-list/validation (browser journey covers the fixture's types only) | PASS | NOT RUN |
| 14 | Mini-quiz per module; class assignments separate from module navigation | `lms-module-quiz`, `lms-offering-selection` | PASS | NOT RUN |
| 15 | Basic course Blockly-only; Advanced simulation and lab | `lms-beginner-lab`; `lms-robot-lab-assignment` | PASS | NOT RUN |
| 16 | Final assessment manual grading; student progress and completion | `lms-assignment-grading`, `lms-unlock-rule` | PASS | NOT RUN |
| 17 | Question CRUD, single/multiple choice, weights, difficulty/topic | jest `question-bank*.spec`, `question-import.spec` | PASS | NOT RUN |
| 18 | Excel/CSV template, mapping, validation, preview, duplicate detection | `question-import.spec`, `question-bank-import.db.spec`, `qb-import` 1/1 | PASS | NOT RUN |
| 19 | Transactional import, idempotency, error reporting, draft import, RBAC, failure recovery | `question-bank-import.db.spec`, `question-bank-import.http.db.spec` | PASS | NOT RUN |
| 20 | Education pilot against the actual files (180 / 3 / 18 / 9) | independent read + `normalize_pilot.py` (180 rows, 0 excluded) + `qb-pilot-import` 2/2 (local import of the 3 courses and the English demo). **Content is DRAFT, single-choice only, echo explanations, no points** — not import-ready for Production | PASS (counts and local import) | NOT RUN |
| 21 | Quiz creation/publishing, attempt initialisation, snapshot integrity | `question-bank-quiz.snapshot.spec`, `question-bank-quiz.service.spec` | PASS | NOT RUN |
| 22 | Per-question points and total visible before submission; pass threshold | `lms-module-quiz` (asserts `quiz-question-points` and `quiz-total-points` before submit) | PASS | NOT RUN |
| 23 | Exact-match multiple-choice grading; automatic weighted scoring | snapshot spec "grades all three types with exact match"; D-16 approved | PASS | NOT RUN |
| 24 | PASS/FAIL, feedback, attempt history, progression | `lms-module-quiz` (fail → retake → pass → unlock → history) | PASS | NOT RUN |
| 25 | Duplicate submission; unauthorized attempts; correct-answer confidentiality | `question-bank-quiz.service.spec` (double submit returns stored result; other learner hidden); snapshot spec (public questions without keys or explanations) | PASS | NOT RUN |
| 26 | Blockly editor, validation, execution modes, schematic experiment, symbolic evaluation, submission, evidence, result | `blockly-simulation` 1/1, `lms-beginner-lab`, jest schematic/symbolic suites | PASS | NOT RUN |
| 27 | **Evaluator `arm`, `minZ`, `objectId`, `zoneId`** | applied in `symbolic-rule-evaluator.service.ts`; 12 assertions on the four failure codes pass | PASS | NOT RUN |
| 28 | Assignment authoring/delivery/submission/review, partial drafts, explicit zero, mandatory criteria, incomplete release rejected, feedback, release, lock | `lms-assignment-grading`, `assignment-grading-lifecycle.db` | PASS | NOT RUN |
| 29 | Canonical score, student result, Gradebook, historical compatibility, `attempt.score` not overwritten, no new mixed grading | `rubric-score.spec` (31/36 = 86.11 % = 8.61/10), `assignment-config.mixed.spec`, `lms-assignment-grading` | PASS | NOT RUN |
| 30 | Rubric levels, four templates, descriptors, selector, editable weights, student preview (Migration T) | #272 on isolated DB with T: `rubric-levels-flow` 1/1, Jest DB 46/46, Vitest 71/71 | PASS (Track 2 only) | NOT RUN — unmerged; #272 CI red |
| 31 | Learning analytics: type/difficulty distribution, rating bands, objective recommendations, authorized lesson links, insufficient evidence | `quiz-analytics.spec`, `quiz-result.service.spec`, `QuizResultDashboard.spec`, `lms-module-quiz` | PASS | NOT RUN |
| 32 | Robot Lab: allocation/ownership, session creation/authorization, execution request, attempt binding | `lab-session-management`, `wf03-runtime-evidence`, jest `physical-execution.service.spec` | PASS (mock) | Lifecycle PASS 2026-11-27 |
| 33 | Command delivery, ACK, state transitions, duplicate/concurrent prevention | jest `iot-command.service`, `iot-feedback.*` (incl. real-PG int); D-04 late ACK fix prepared | PASS; D-04 fix unmerged | NOT RUN |
| 34 | Stop execution, End during execution, expiry, disconnect, quarantine, reconciliation, recovery | `wf03-safety-long-run` 4/4; jest `lab-session-stop/safe-stop/run-lost` | PASS (mock) | NOT RUN |
| 35 | Classification SIMULATION / MOCK_RUNTIME / PHYSICAL_ROBOT / UNVERIFIED_RUNTIME never substituted | readiness + artifact `sourceMode`; jest `iot-edge-contract` | PASS | n/a |
| 36 | Digital Twin identity, attempt-bound telemetry, six joints, ordering, stale, auth, reconnect, no fixture fallback | `digital-twin-*` (4 specs, 19 tests), pytest 73/73 | PASS | **FAIL** (D-09 at `430ad59`) |
| 37 | Evidence generation, upload, object persistence, idempotent retry, retrieval | `wf03-runtime-evidence`; jest S3 integration | PASS | **FAIL** (D-03/D-08) |
| 38 | Desktop integration contract | `DESKTOP_BACKEND_INTEGRATION_MATRIX.md` (Desktop 48/48 + 100/100 mock; open: auth bridge, `cancel`, physical telemetry) | PARTIAL → see matrix | NOT RUN |
| 39 | Physical SO-101 one-pair commissioning and physical WF-03 | no hardware evidence | — | **BLOCKED** (Gates H, I) |
| 40 | UI/UX: navigation, responsive 1440/768/390, tables/forms/dialogs, loading/empty/error, keyboard, a11y, console and failed requests, full-page screenshots | `UI_ROUTE_ACCEPTANCE_REPORT.md` | PASS | NOT RUN |
| 41 | Database/infrastructure: schema, constraints, bootstrap, IAM least privilege, S3 public access, IoT policy, queues/DLQ, headers | `SECURITY_ACCEPTANCE_REPORT.md`, `FINAL_REGRESSION_REPORT.md` | PASS (local) / read-only Production checks PASS; IAM statement for evidence missing; CSP report-only | partial |

Row 38 is the only row whose result is "PARTIAL": it aggregates the Desktop contract (items closed by Codex), so it is not counted as a PASS anywhere. The 41 rows contain no FAIL on the local environment; the FAIL cells are Production (D-03/D-08/D-09 at `430ad59`).

## 2. Application inventory vs requirements (Phase B)
| Inventory | Count / finding | Method |
|---|---|---|
| Frontend routes | 58 `<Route>` entries in `App.tsx` (incl. 7 redirects, one duplicate `admin/robots`, one catch-all) — all rendered and swept by role | `platform-route-inventory` 12/12, `platform-route-sweep` 22/22 |
| Backend controllers | 31 controller classes; **325 HTTP endpoints** (GET/POST/PUT/PATCH/DELETE) | `endpoints.py` static scan of `*.controller.ts` |
| Public (unauthenticated) endpoints | `health`, `health/ready`, `version`, `status` only | static scan + Production probe |
| Endpoints with no static caller (Web/Desktop/R1/Twin) | 8: device credential rotation, `health/ready` probe, challenge catalog, experiment comparisons, benchmark tasks, evaluation-run benchmark, standalone question list/create | heuristic then grep — API-only, test-covered; **no UI to rotate a device credential** (N-07) |
| Database models | 88 Prisma models; 17 released migrations + 2 staged (M, R) + T proposed in #267 | `schema.prisma`, `database/` |
| Roles | system admin, school admin, instructor, student (+ teaching assistant route role, `admin`/`teacher` aliases) | `RequireRole` |
| Background jobs | `lab-session.runner` (expiry/terminating/quarantine reaper), `iot-publish-recovery.runner`, `iot-feedback-worker`, `robot-recordings-worker` | static scan |
| S3 paths | `learning-media/courses/*`, `learning-media/submissions/*`, `learning-media/experiments/*` (needs IAM), robot recordings `episodes/*` | role policy + code |
| IoT topics | `vista/demo/robots/<robot UUID>/{commands,ack,status,telemetry}` plus classic Shadow of the one Thing | device policy (read-only) |
| WebSocket | Twin viewer `/ws/twin` with `vista.twin.<token>` subprotocol | Twin source, pytest |
| Feature flags / env | `COURSE_PREREQUISITES_ENFORCED_FROM`, `STUDENT_TEMP_PASSWORD_ENABLED`, `DEVICE_PROVISIONING_ENABLED`, `VISTA_IOT_*` incl. start modes `simulation` / `physical_commissioning`, `VISTA_ROBOT_RUNTIME_MAP` | source |
| Placeholders / dead UI | Desktop download Win/macOS "Coming Soon" (disabled, labelled, not fake); duplicate dead `admin/robots` redirect; no placeholder data found in routes | grep + route sweep |
| Deployment workflows | `.github/workflows`: `backend-ci`, `database-bootstrap`, `integration-ci`, Auto Deploy (`schema-gate`, `deploy-api`, `deploy-web`, rollback-guard), production database release workflows | static read |
