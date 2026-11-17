# LMS Full Phase 1 — implementation notes

Status of this document: written during Phase 1D on branch `feat/lms-full-phase1`; it records decisions and
limitations, not a release approval. Local results are not remote CI or Production evidence.

## Grade history limitation (deliberate)

- Reopening a released grade (`POST attempts/:attemptId/grading/reopen`) requires a reason and writes an
  `audit_logs` row (`grading.release_withdrawn`) holding the withdrawn scores, feedback, releaser and reason.
- The runtime role `vista_app_runtime` has `INSERT` but no `SELECT` on `audit_logs` (migration L). The API therefore
  cannot read that history, and no in-app Grade History screen or endpoint exists.
- A secure history view needs a separate, reviewed authorization design (for example a purpose-built history
  table or a narrowly scoped read path). Do not grant the runtime role broad `SELECT` on `audit_logs`, and do not
  add a migration solely for this without that review.

## Instructor progress monitoring

`GET classrooms/:classroomId/learner-progress` (permission `learning.work.review`) returns per enrolled student the
completed lessons, course progress (same rounding as the learner's course path), submitted attempts, best
auto-graded score and last activity. The Teacher classroom page renders it.

## Local verification recipe (disposable resources only)

- PostgreSQL 17: `docker-compose.education-local.yml` on a random loopback port; never 55432–55434.
- S3-compatible storage: a throw-away container with tmpfs (for example the locally cached `rustfs/rustfs`) bound to
  `127.0.0.1`. Set `RUN_LOCAL_S3_INTEGRATION=1` and `LEARNING_MEDIA_S3_ENDPOINT=http://127.0.0.1:<port>`.
  `learning-media.storage.s3.int.spec.ts` and `learning-media.s3.db.spec.ts` skip unless both that flag and
  `RUN_POSTGRES_INTEGRATION=1` are set. This proves storage behaviour against an S3-compatible service, not the
  AWS bucket, IAM policy or CORS configuration.
- Browser journeys: see `docs/operations/phase-2-4-3-local-acceptance.md` (fixtures, local JWKS signer, API as
  `vista_app_runtime`).

## Phase 1E acceptance map (local, disposable resources)

The repository documents only the Release-Candidate journeys 1–3 (`docs/agent-reports/`). The 18-journey list used for
this phase comes from the Phase 1 task definition and is mapped to tests below; it is not a repository requirement
document.

| # | Journey | Evidence |
|---|---|---|
| 1 | Instructor creates a course | `lms-authoring.spec.ts` Journey 1 |
| 2 | Modules and lessons (incl. unlock rule) | Journey 1, `lms-unlock-rule.spec.ts` |
| 3 | Learning materials uploaded and attached | `lms-lesson-media.spec.ts` (real browser, local S3-compatible storage), `learning-media.s3.db.spec.ts` |
| 4 | Questions created manually | Journey 2 |
| 5 | CSV import | `qb-import.spec.ts` |
| 6 | XLSX import | `qb-import.spec.ts` (downloaded XLSX template re-imported), `question-bank-import.http.db.spec.ts` |
| 7 | Weighted quiz from Question Bank | `qb-import.spec.ts`, `lms-unlock-rule.spec.ts` |
| 8 | Assignment and rubric | `lms-assignment-grading.spec.ts` |
| 9 | Preview and publish | Journey 1, `lms-unlock-rule.spec.ts` |
| 10 | Student opens an authorized course | Journey 1, `lms-lesson-media.spec.ts` |
| 11 | Lessons completed, progress shown | `qb-import.spec.ts`, `lms-unlock-rule.spec.ts`, `progression-journey.db.spec.ts` |
| 12 | Weighted quiz result | Journey 2, `qb-import.spec.ts` (25% then 100%) |
| 13 | Assignment submitted | `lms-assignment-grading.spec.ts` |
| 14 | Automatic grading | Quiz only (exact match, weighted). Blockly verdicts do not become rubric grades. |
| 15 | Teacher reviews and releases | `lms-assignment-grading.spec.ts` |
| 16 | Student sees feedback and progress | `lms-assignment-grading.spec.ts`, `lms-independent.spec.ts` |
| 17 | Unauthorized users denied | all journeys, `assignment-grading-lifecycle.db.spec.ts` |
| 18 | Cross-school denied | all journeys, `lms-independent.spec.ts`, DB-backed specs |

Database paths verified on disposable PostgreSQL 17: fresh bootstrap (10 migrations, deterministic schema fingerprint) and
`scripts/check_local_upgrade_path.py` (baseline + D..J with data, then K..M: data preserved, idempotent re-run,
least-privilege runtime role, same fingerprint). K–M remain unapproved for Production.

Known limits: Learning Media has no delete endpoint (an attachment is removed from a lesson, the stored file remains);
the Playwright JWKS port (54321/54323) is shared by every agent, so runs must not overlap.

## Phase 1G — terminology decision, closure and WF-02 handoff

### Curriculum vocabulary (user-facing only)

| Database / API name | Shown to users as | Notes |
|---|---|---|
| `courses` | Course | unchanged |
| `lessons` (`/courses/:id/lessons`, `/lessons/:id`) | **Module** | the top-level unit; owns unlock rules (`prerequisiteLessonIds`) |
| `sections` (`/lessons/:id/sections`) | **Lesson** | groups activities inside a module |
| `activities` | Activity | reading, video, quiz, practice… |

Only presentation strings changed (instructor Outline and Structure & Publishing, student Course Path, sidebar, progress
labels, locked-state messages, ARIA labels). Identifiers, routes, JSON field names and error codes are unchanged. The server's
lock message is now "Complete <module> to unlock this module." (`progression.service.ts`). `src/lib/terms.ts` holds the
shared helpers (`countLabel`, `plural`) and documents the mapping. The Question Bank still says "lesson" where it means the
Question Bank's scope (a DB lesson = a module); that is a known leftover (see limitations in the acceptance report).

### Learning Media rules confirmed by the real-file test
- One private bucket for every file type; objects are served only through `GET /activities/:activityId/media/:mediaId/url`
  (enrolment, published state and prerequisites checked; a file attached to activity A is not served through activity B).
- Readings accept documents and images; **video belongs to a Video activity**. The library now disables "Use file" for videos
  when attaching to a reading instead of letting the publish step fail.
- No delete endpoint; "Detach" only removes the link from a lesson.
- `tests/e2e/fixtures/media/` holds valid files (PNG, one-page PDF, DOCX/PPTX packages, H.264/AAC MP4). `lms-lesson-media.spec.ts`
  uploads them in the browser, compares SHA-256 of what the student receives, decodes the PNG, plays the MP4 (currentTime advances)
  and, when `VISTA_E2E_S3_*` variables are set, deletes an object from the disposable bucket to prove the missing-file fallback.

### Handoff to the WF-01–WF-04 integration (what must be preserved)

API routes added or changed by the LMS branch (no new migration; the LMS relies on baseline + D–M already in the manifest):

- Grading: `POST attempts/:attemptId/grading/reopen` (reason ≥ 5 chars, audited, instructor only); existing `POST submissions/:id/assessment` returns 409 `GRADE_RELEASED` for a released grade.
- Assignment configuration: `GET|PUT classrooms/:c/assignments/:a/rubric`, `PATCH classrooms/:c/assignments/:a/schedule`.
- Instructor monitoring (permission `learning.work.review`): `GET classrooms/:c/learner-progress`, `…/learner-progress/:learnerUserId/lessons`, `GET classrooms/:c/quiz-results`.
- Question Bank import: `GET quiz-authoring/import-template?format=csv|xlsx`, `POST quiz-authoring/lessons/:id/import/preview`, `POST …/import` (multipart, 1 MB / 500 rows, CSV or XLSX only).
- Existing contracts the UI depends on and that must not change shape: `GET /me/courses/:id/path` (`lockReason.message`, `progressPercent`), `POST /classroom-assignments/:id/attempts`, quiz submit (weighted `earnedPoints/possiblePoints`), `GET /me/attempts`, `GET /admin/courses/:id/media`, activity media URL route above.

Frontend pieces WF-02 must keep working (routes and components):

- Routes: `/my-learning`, `/my-learning/:classroomAssignmentId`, `/courses/:id`, `/courses/:id/lessons/:moduleId`, `…/activities/:activityId`, `/practice/:attemptId`, `/teacher/classes/:id`, `/teacher/classes/:id/submissions/:submissionId`, `/teacher/assignments/*`, `/admin/courses/:id`.
- Components: `AppShell`/`SidebarNav` (labels now wrap; keep long labels such as "3D Simulation & Monitoring"), `CourseOutlinePanel` (reorder controls always visible, unlock-rule chip), `CurriculumItemEditor` (Unlock rule), `MediaAttachmentList`, `MediaAssetLibraryModal`, `KnowledgeCheckAttempt`, `ImportQuestionsDialog`, `AssignmentConfigPanel`, `TeacherAttemptPanel`, `LearnerProgressTable`, `QuizResultsTable`.
- Design tokens: `--ink-subtle` and `--warn` in `src/index.css` were darkened to satisfy WCAG AA text contrast; do not revert them when merging styles.
- Blockly symbolic evaluation must never become a rubric grade; quiz auto-grading stays separate from manual rubric grading.
- Playwright: the JWKS port (54321/54323) is shared between agents; the E2E specs and accessibility checks assume the labels listed above.

### Phase 1G additions to the acceptance map
- Attempt limit (journey 12/13 support): `lms-authoring.spec.ts` Journey 2 — a limit of 2 shows "2 of 2 used", disables the start button and the API refuses a third attempt.
- Authorization matrix: `lms-security-matrix.spec.ts` — unauthenticated, enrolled classmate (non-owner), other school's administrator, student (wrong role), owning instructor (positive control) and a draft course. Note: the fixture user `otherStudent` is an enrolled classmate in the same school; the only cross-school principals in that fixture are `otherSchoolAdmin` and `otherClassroomId`. A student who posts to the import endpoint without a file receives 400 before the permission answer; with a file the request is refused (non-blocking ordering observation).
- Real media: `lms-lesson-media.spec.ts` (byte-identical downloads, decoded PNG, MP4 playback, missing-object fallback).
- Accessibility aids: `lms-a11y-smoke.spec.ts` and `lms-a11y-extended.spec.ts` (heading order, 24 px touch targets at 390 px, WCAG AA text contrast computed from rendered colours on seven routes at 1440 and 390 px). These are automated smoke checks, not a WCAG conformance audit.
- Visual evidence: `docs/education/lms-acceptance-evidence/` (manifest.json, README.md, desktop and mobile JPEGs; generated by `scripts/build_lms_evidence.py`).
