# Learning Management System acceptance (2026-11-28)

Tested revision `develop` `eceb8d1`. Environment: **LOCAL isolated** — real browser (Chrome), real Education API with the runtime database role, real PostgreSQL 17, real S3-compatible object store (RustFS), local JWKS signer (and real GoTrue for the auth suites). Nothing mocked at the API boundary. **Not Production** (Production `430ad59`; only read-only checks this cycle).

## Journey: Course → Module → Lesson → Media → Quiz → Assignment → Preview → Publish → Delivery → Enrolment → Progression → Assessment → Gradebook
| Step | Evidence | Status |
|---|---|---|
| Course / module / lesson authoring | `lms-authoring` 5/5, `course-builder-delivery` 1/1, `lms-p1-p2-regression` 3/3 (includes the Course Builder overwrite regression: an activity's title/content is no longer replaced by another after navigation) | **PASS** |
| Draft vs published, discard draft, unsaved-change guard | `lms-draft-discard` 1/1; jest `quiz-draft.service.spec`, `course-publish-sync.db.spec`, `unpublish.service.spec` | **PASS** |
| Edit/version behaviour | `lms-authoring`; jest `course-publish-sync.db` | **PASS** |
| Media upload; PDF/DOCX/PPTX/images/video/approved attachments; media access authorisation | `lms-lesson-media` 1/1, `platform-media-archive` 3/3; jest `learning-media.*` incl. real-S3 `learning-media.storage.s3.int` and `learning-media.s3.db`; `submission-file.validation.spec` | **PASS** (allow-list and signed-URL checks are unit/DB level; the browser journey exercises the media types in the fixture) |
| Quiz configuration and publishing | `lms-module-quiz` 1/1; jest `question-bank-quiz.service.spec`, `quiz-draft.service.spec` | **PASS** |
| Mini-quiz at the end of each module | `lms-module-quiz`, `lms-curriculum` | **PASS** |
| Assignment configuration; class assignments separate from module navigation | `lms-authoring`, `lms-offering-selection`, `/my-learning` vs `/courses/:id` routes | **PASS** |
| Preview | `lms-authoring` (preview before publish), `lms-curriculum` | **PASS** |
| Publish and class delivery | `lms-course-offerings` 2/2, `lms-unlock-rule` 1/1, `lms-prerequisite-enforcement` 1/1 | **PASS** |
| Student enrolment (catalog, school enrolment, limits) | `lms-catalog-enrollment`, `lms-offering-selection` 2/2, `lms-offering-enrollment-limits` 3/3 | **PASS** |
| Learning progression and completion rules; prerequisites (opt-in `COURSE_PREREQUISITES_ENFORCED_FROM`) | `lms-prerequisite-enforcement`, `lms-unlock-rule`; jest `course-prerequisite-enforcement.db`, `progression-journey.db` | **PASS** |
| Basic course: Blockly-only, no Robot Lab required | `lms-beginner-lab` 1/1 — integrated WF-01→WF-04 journey on a Blockly lab with automatic simulation grading, review, release and reflection; **no robot is commanded and no Digital Twin is needed in that journey**. Whether the Basic path is formally part of WF-02 is owner item C5 | **PASS** (journey); formal confirmation pending |
| Advanced course: simulation and physical lab requirements | `lms-robot-lab-assignment`, `lms-robot-lab-access`, `wf03-runtime-evidence` (mock); physical **BLOCKED** | **PASS (simulation) / BLOCKED (physical)** |
| Assessment, final assessment manual grading, Gradebook | see `RUBRIC_AND_GRADEBOOK_ACCEPTANCE.md` | **PASS** |
| Instructor analytics, student progress | `lms-academic` 4/4 | **PASS** |

## Question Bank and bulk import
| Requirement | Evidence | Status |
|---|---|---|
| Question CRUD, single/multiple choice, true/false, weights, difficulty and topic metadata | jest `question-bank.service.spec`, `question-bank.controller.spec`, `question-bank-global-scope.db`; `global-course-question-authoring` 1/1 | **PASS**. Note: the standalone `GET/POST /author/question-bank/questions` has no UI caller; the UI uses the lesson-scoped quiz-authoring routes (N-07) |
| Excel/CSV template, quoted CSV/BOM/XML, difficulty default points 1/2/3, explicit points preserved | jest `question-import.spec` (9 tests) | **PASS** |
| Column mapping, validation, preview without writing, row-level errors with row numbers | `question-import.spec`, `question-bank-import.db.spec` ("previews without writing, then imports valid rows, skips duplicates and reports row errors"), `qb-import` 1/1 | **PASS** |
| Duplicate detection (in-file stems; existing code + same question = duplicate, reused code with a different question = error) | `question-import.spec`, `question-bank-import.db.spec` | **PASS** |
| Transactional import, confirmation bound to the previewed file hash, idempotency, import as DRAFT, audit reference | `question-bank-import.db.spec` ("requires explicit confirmation and the previewed file hash, and writes nothing otherwise"; "imports as DRAFT by default … idempotent"), `question-bank-import.http.db.spec` | **PASS** |
| RBAC and tenant isolation of import | `question-bank-import.db.spec` ("denies import … never writes"; "refuses an unauthorized caller before revealing request-validation errors") | **PASS** |
| Failure recovery | rollback of the whole transaction on error (db specs); one failed run leaves no partial rows | **PASS** |

### Education pilot content (`VISTA_Education_Content`) — verified against the actual files
The folder is **not in `develop`** (it exists in the owner's checkout only; `docs/education/EDUCATION_CONTENT_VALIDATION_REPORT.md` is the repository record). Independent read of the files this cycle:
* `vista_question_bank.json`: **180** records, 180 unique `Question ID`, **all `SINGLE_CHOICE`, all `Review Status` = `DRAFT`**; difficulty EASY 72 / MEDIUM 54 / HARD 54; correct answer A/B/C/D = 45/46/45/44; **`Explanation` equals the correct option's text in 180/180** records; 18 distinct course/lesson pairs over 3 courses.
* `vista_courses.json`: 3 courses, 18 lessons. `vista_quiz_mapping.json`: **9** quiz blueprints. The status field of every file is `DRAFT_NOT_IMPORT_READY`.
* `scripts/education/normalize_pilot.py` reproduces 180 Vietnamese rows (18 lesson files) with **0 exclusions**.
* Blocking content gaps (not silently fixed; owner decision C10): no points column, echo explanations, Vietnamese-only, no multiple-choice rows, no reviewer sign-off, no section/topic mapping, module definition (lesson pair vs section) unconfirmed. The scope was **not** expanded.
* Local import of the pilot into the isolated database: see `qb-pilot-import` in `FINAL_REGRESSION_REPORT.md`.

## Quiz Engine
| Requirement | Evidence | Status |
|---|---|---|
| Attempt initialisation, immutable public/private snapshots, snapshot tamper rejection | `question-bank-quiz.snapshot.spec` ("rejects snapshot tampering and mismatched identity"; "grades from issued snapshots even after source rows change"), `question-bank-quiz.service.spec` | **PASS** |
| Per-question points and total visible before submission; pass threshold | `lms-module-quiz` (points shown before submit, 20 questions / 35 points in the seeded quiz); `question-bank-quiz.service.spec` | **PASS** |
| Single, multiple, true/false; **exact-match** multiple-choice (D-16, approved) | `question-bank-quiz.snapshot.spec` "grades all three types with exact match" | **PASS** |
| Automatic weighted scoring, PASS/FAIL, feedback, attempt history | `lms-module-quiz`, `quiz-result.service.spec` (7/7 per earlier record, in this cycle's green suite), `quiz-analytics.spec` | **PASS** |
| Duplicate submission returns the stored result without regrading | `question-bank-quiz.service.spec` "returns the same stored result on double submit without regrading"; `attempt-retry-regression.db.spec` | **PASS** |
| Unauthorised attempts; answer-key confidentiality before submission | "hides another learner attempt and rejects client score/PASS at DTO boundary"; "issues ordered public questions without keys or explanations"; `lms-security-matrix` 1/1 | **PASS** |
| Learning progression after a quiz | `question-bank-quiz.service.spec` ("completes a lesson only when the linked required quiz is the remaining condition") | **PASS** |

## Learning analytics (student quiz result dashboard)
`quiz-analytics.spec` (rating boundaries 100/90/89.99/80/79.99/70/69.99/50/49.99/0, zero denominators, empty attempt, unanswered ≠ incorrect, question-type and difficulty buckets, learning-objective recommendations ranked by lost points, no answer keys), `quiz-result.service.spec` and the web `QuizResultDashboard.spec` (insufficient evidence shown as such, lesson-link fallback) all pass in this cycle's Vitest/Jest runs; the browser path is `lms-module-quiz`. Recommendations are **deterministic** (computed from the learner's own incorrect answers, not invented). **PASS (local).**

## Blockly and Schematic Experiment (L01–L03)
`blockly-simulation` 1/1 (editor → program → validation → simulation → submission → result), `lms-beginner-lab`, jest `schematic-engine.service.spec`, `experiment.service.spec`, `experiment-run.db.spec`, `symbolic-evaluation*.spec`. **Evaluator parameters `arm`, `minZ`, `objectId`, `zoneId` are applied** (`symbolic-rule-evaluator.service.ts`; codes `OBJECT_GRASPED_BY_OTHER_ARM`, `LIFT_HEIGHT_INSUFFICIENT`, `OBJECT_NOT_FOUND`, `TARGET_ZONE_UNKNOWN`; 12 assertions in `symbolic-rule-evaluator.service.spec.ts`, all passing). The earlier gap list (GAP-L02-02/-03) is therefore closed by code and tests, not by a claim. **PASS (local).**

## Not PASS
Anything on Production, physical lab, and text search of catalog/courses in a browser (API/unit only — module J1 Partial).
