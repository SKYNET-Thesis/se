# VISTA Release Candidate — final acceptance (2026-11-15)

**Verdict for the local project demonstration: CONDITIONAL GO.**
**Verdict for Production: NO-GO** (unregistered migrations, no authoritative RBAC seed, physical robot and media paths not accepted here — see §12).

Everything below was observed in this session against the isolated local stack. "PASS" means a command ran and passed now; "NOT RUN" means it was not run; nothing is inferred from older reports.

## 1. Repository / worktree verification

| Item | Observed |
| --- | --- |
| Repository root / worktree | `/home/quangduc/Code/vista/se` (the primary checkout; `git rev-parse --show-toplevel`) |
| Branch / HEAD | `feat/course1-learning-experience` @ `29fa71a` (HEAD unchanged; ~170 modified/untracked paths from earlier agents preserved) |
| Not done | no commit, push, merge, deploy, Terraform, shared/Production DB access, physical robot |
| Processes at start | The machine had restarted: no API/Vite/JWKS processes, all Docker containers stopped (tmpfs DB contents were gone). Old API processes on 3000/3001/3100 no longer existed. |
| Database used | Only the disposable container `vista-course-builder-test-education-test-postgres-1`, host `127.0.0.1:55433`, DB `vista_test_course_builder`, data dir on tmpfs (`/var/lib/postgresql/data` rw,noexec,nosuid,size=1g), PG 17.11, Compose project `vista-course-builder-test`. **Port 55432 (`vista-qbm-test-pg`) was never contacted or started.** |
| API process used for acceptance | `node dist/main.js` on `127.0.0.1:3002`, `DATABASE_URL` = `vista_app_runtime` role on 55433 (the launcher refuses any other URL). No API was connected to a shared database. |
| Auth | local JWKS signer on `127.0.0.1:54323` (test key in `/tmp`), no hosted Supabase URL |

### Database rebuild performed (needed because tmpfs was wiped)
1. Verified `~/vista-production-baseline/production-public-schema-20261109T172950Z.sql` = 225119 bytes, SHA-256 `5b140ce7…694c2ef962` (matches `database/baselines/production-baseline-evidence.json`). The file `database/baselines/production-public-schema.sql` in the repo is a *different* 158990-byte file and is **not** the verified baseline.
2. Created the Supabase-named cluster roles the baseline's grants reference (`anon`, `authenticated`, `service_role`, `postgres`, `supabase_admin`) in the **disposable** cluster only; restored the baseline into `vista_baseline_test_clean`; cloned it to `vista_test_course_builder` (88 tables, 46 RLS).
3. Applied the active manifest migrations D and E with `scripts/sql_migration_runner.py --apply` (loopback URL needs `?sslmode=disable`; ledger now has `20261110_d_activity_content`, `20261110_e_learning_media`).
4. Applied the local drafts: `20261111_global_quiz_runtime_role.sql` (role `vista_app_runtime`, password set locally), `20261115_learning_grade_publication.sql` (revised, §9), `20261115_learning_course_author_capability.sql` (new, §3).
5. Seeded the fixture with `dist/scripts/phase243-e2e-fixtures.js seed` (guard needs `SUPABASE_URL=` set to the **empty string**; merely unsetting it lets a module-loaded `.env` reintroduce a hosted URL and the guard refuses).

## 2. Changed files (this task)

Backend (`services/education-api`):
- `src/modules/learning/learning-scope.service.ts` — `COURSE_AUTHOR_PERMISSION`, `authoringOrganizationIds()`, `canAuthorOrganization()`.
- `src/modules/learning/learning.service.ts` — school-scoped create/update/publish/archive of courses and lessons (`authorCourse`, `resolveAuthoringOrganization`), offering creation on publish (`ensureSchoolOffering`), authors can list/read their school's draft courses and lessons.
- `src/modules/learning/learning-media.service.ts` — media authoring allowed for the owning school's authors.
- `src/modules/learning/curriculum.service.ts`, `question-bank.service.ts`, `question-bank.controller.ts` — authorization uses `learning.course.author`; school authors publish/archive their own school's questions; server-derived question organization; lesson learning-outcome endpoints; one-call `authorLessonQuestion`; author preview shows the answer key to authors only.
- `src/modules/learning/activity-content.schema.ts` — `{}` content accepted for evaluated activities (quick-add quiz was rejected before).
- `src/modules/learning/dto/course-catalog.dto.ts`, `dto/question-bank.dto.ts` — `organizationId` (advisory only), `AuthorLessonQuestionDto`.
- `src/modules/learning/execution-provenance.ts` (+spec), `physical-execution.service.ts`, `assessment.service.ts` (+ their specs) — execution provenance ported (§6).
- `src/scripts/phase243-e2e-fixtures.ts` — fixture roles carry `learning.course.author`.
- Specs: `course-authoring-authority.spec.ts` (new, 13 tests), `learning.service.spec.ts`, `curriculum.service.spec.ts`, `learning-media.service.spec.ts`, `p08-simulation-result-handoff.spec.ts`, `curriculum-reorder.db.spec.ts` (mocks/guards updated for the new authority).

Frontend (`web/robot-edu`):
- `src/App.tsx`, `src/data/navigation.ts` — Course Builder reachable by `teacher` and `school_admin` (backend remains authoritative).
- `src/components/authoring/NewQuestionDialog.tsx` (+spec, new), `QuizAuthoringPanel.tsx`, `CourseContentEditor.tsx`, `src/lib/api.ts` — new-question flow, pass-threshold honoured on create (was hard-coded 80), no stale-dirty re-sync after saving an activity, quiz saves no longer send `content`, empty-body `null` responses parsed, provenance types.
- `src/pages/teacher/TeacherSubmissionReview.tsx`, `src/queries/teacherEvidence.ts` (+spec) — server-derived execution source is shown to the instructor.
- E2E: `tests/e2e/lms-authoring.spec.ts` (new), `tests/e2e/lms-independent.spec.ts` (instructor contract test replaced), `tests/e2e/local-jwks-server.mjs` (optional `ttl` to mint expired tokens).

Database drafts (unregistered, **not** in `database/migrations/manifest.json`): `database/migration-drafts/20261115_learning_grade_publication.sql` (revised), `…/20261115_learning_course_author_capability.sql` (new).

## 3. Implemented functionality (owner-approved RC policy)

- **New capability `learning.course.author`**, distinct from `learning.delivery.manage`. Draft migration grants it to roles `instructor` and `school_admin` (only if those roles exist; idempotent).
- **Course authoring:** instructors and school admins create, edit, preview, publish and archive their own school's courses, modules (lessons) and activities through the existing Course Builder. No System Admin approval. The owning school is taken from the caller's active memberships; a client-supplied `organizationId` is accepted only if it is one of those schools, otherwise 404. System Administrators keep global courses.
- **Delivery link:** publishing a school course creates one active offering for that school (idempotent), so the School Admin can create a classroom on it and enrol students.
- **Questions/quizzes:** school authors create/edit/publish school-owned questions (the question's school is derived from the lesson's course), create the quiz, pick questions, set the pass threshold, preview (answer key shown only to authors), and assign it to classrooms they teach. The global Question Bank stays read-only for school authors. Unchanged: pinned question snapshots, attempt history, server grading.
- Defects found and fixed while driving the real UI: quick-add Quiz always failed (400); quiz save failed (400); new quiz ignored the entered pass threshold; an `null` API body broke the quiz panel; saving an activity left it marked "unsaved" and blocked tab switching.

## 4. The eight LMS journeys (real browser, real API, isolated PostgreSQL, no mocked LMS responses)

Command: `cd web/robot-edu && VISTA_E2E_JWKS_PORT=54323 VISTA_E2E_API_BASE_URL=http://127.0.0.1:3002/api/v1 VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-lms.json npx playwright test --reporter=list` → **12 passed (1.3 min)**.

| # | Journey | Result | What was demonstrated |
| --- | --- | --- | --- |
| 1 | Instructor creates and publishes a course | **PASS** | Instructor UI: create course → module → lesson → reading activity with text → publish section/activity → learner preview → readiness review → publish. API shows `organizationId` = the instructor's school and an auto-created offering. Student gets 404 before delivery; School Admin creates classroom on the new offering and enrols the student; student sees the course; survives refresh and logout/login; other school's admin gets 404 on read, PATCH, publish, archive, add lesson, media list/upload; forged `organizationId` → 404; student cannot author. |
| 2 | Instructor authors and assigns a quiz | **PASS** | Instructor UI: create quiz draft with 70% threshold, author a single-choice and a multiple-choice question (published), validation refusal of an invalid multiple-choice question, add both to the quiz, author preview with answer key, publish course; School Admin adds student and instructor to a classroom; instructor assigns (UI) with attempt limit 2; student's first attempt fails (0% < 70%), second passes (100%); the attempt payload contains no answer key; unsafe edit of a delivered quiz → 409; foreign school → 404; duplicate submission replay never 5xx and creates no extra attempt. |
| 3 | Student completes a quiz and is graded | **PASS** | Seeded canonical quiz (spec 1) and the authored quiz (journey 2); server-side grading, pass/fail threshold, attempt history. |
| 4 | Student submits assignment; instructor reviews and releases | **PASS** | Blockly ProgramVersion submission → rubric review → grade hidden until published → publish → learner sees score, feedback, timestamp. |
| 5 | School Admin creates classroom and enrols students | **PASS** | Real UI; persistence after reload. |
| 6 | Cross-school access denied | **PASS** | Classroom list/roster/resource, course read/update/publish/archive/lessons/media, question authoring, classroom summary, quiz authoring read — all 403/404 for the foreign school; same-classmate cannot read another student's submission. |
| 7 | Persistence after refresh and relogin | **PASS** | Course visible after refresh, logout, new session; grade persistence within journey 4. |
| 8 | Error, retry and interruption recovery | **PASS for tested cases** | Interrupted `GET /me/quizzes` shows an alert and recovers through Retry; expired and forged tokens → 401 on read and write, app shows no private data and recovers after fresh sign-in; empty course title → 400 explained; invalid question refused; duplicate quiz submission. **Failed-upload recovery: NOT RUN** (no S3 in this run; multipart/media migration Q not applied). |

**8/8 journeys accepted on the criteria above**, with the failed-upload gap stated. Responsive: authoring pages (course list, builder, teacher assignment editor) and My Learning / School Classrooms pass at 320, 375, 768, 1024, 1440 px with no horizontal overflow and no console errors.

## 5. Robot Lab — PARTIAL (not exercised end-to-end in this checkout)

| Check | Result |
| --- | --- |
| Education API physical-execution + provenance + assessment specs | **PASS** (74 tests) |
| `services/robot-runtime` unit tests | **PASS** (16, `unittest`) |
| `services/robot-hardware-adapter` tests | **PASS** (19, pytest in its venv) |
| Real-stack Robot Lab flow (student → session → runtime → evidence → submission → review) | **NOT RUN** here: needs the CHECKIK fake-follower adapter + R1 + a qualified L4 ProgramVersion seed that this checkout's fixture does not create. An earlier session ran such a flow (Playwright, R1 + fake follower) in the separate worktree `.worktrees/qb-quiz-media`; that is **historical evidence for a different checkout, not a pass for this tree**. |
| Cross-school isolation, ESTOP/preflight rejection, runtime stop handling | covered by service unit tests (ESTOP_ACTIVE, ROBOT_RUNTIME_STOPPED, CHECKIK_UNAVAILABLE, preflight abandon) — **unit level only** |

## 6. Execution provenance (security/honesty fix applied here)

This checkout labelled every robot run `real_robot` and counted a successful run as satisfying the physical practical even when the runtime was a fake follower. Ported from the earlier worktree and re-verified here: the server derives `SIMULATION / MOCK_RUNTIME / PHYSICAL_ROBOT / UNVERIFIED_RUNTIME` from the mode the runtime itself reported (`VISTA_PHYSICAL_RUNTIME_MODES` declares physical modes; empty by default so nothing counts as physical until configured; a fake/mock mode can never be promoted). Only `PHYSICAL_ROBOT` completes the physical practical; the instructor's evidence card shows the server-derived source. **No physical robot was operated; no simulation is presented as physical.**

## 7. Digital Twin — PARTIAL

| Check | Result |
| --- | --- |
| `services/digital-twin` (pytest, venv) | **PASS** 51 |
| Frontend digital-twin specs (part of full Vitest) | **PASS** |
| Web production build bundling the viewer | **PASS** |
| Browser load of the SO-101 3D viewer on the real stack, joint updates from live telemetry, stale/disconnect behaviour | **NOT RUN** in this session |

Classification of what exists: static 3D preview and simulation/telemetry-contract code are covered by tests; **simulation-driven live synchronisation was not demonstrated end-to-end here; physical-robot synchronisation has no hardware evidence and is not claimed.**

## 8. Grading and review

PASS (real stack + unit): quiz auto-grading with pass/fail threshold and two attempts; attempt limit configured; question snapshots pinned (unsafe edit after delivery → 409); Blockly submission, instructor rubric/feedback, grade publication, learner visibility, resubmission invalidating stale grades; persistence after relogin. Robot-Lab evidence grading: service level only (§5).

## 9. Grade-publication migration (`20261115_learning_grade_publication.sql`)

- **Visibility semantics verified from `HEAD`:** before the patch, `GET /me/submissions/:id` returned the assessment for every existing row, i.e. every pre-existing assessment was learner-visible. There was no "unreleased" state in the old model.
- **Revised migration:** adds `published_at` and, only in the same step that adds the column, sets `published_at = COALESCE(reviewed_at, created_at, now())` for existing rows. Guarded by `information_schema` so a rerun changes nothing (it never publishes later drafts). Rolling back = redeploy the previous API; do not drop the column.
- **Disposable test (clone `vista_test_grade_mig`, dropped afterwards):** before: 4 assessments (one with `reviewed_at` NULL), no column. After first run: 4/4 published and each equal to `COALESCE(reviewed_at, created_at)`. Then inserted a new draft (`published_at` NULL) and reran: 5 rows, 4 published, the new draft still hidden. Applied once to `vista_test_course_builder`.
- **Not done (needs owner):** registering in the manifest, shared/Production application. Dependencies: needs `learning_assessments`; API must be deployed after the migration; a safety-test run (`scripts/run_database_safety_tests.py`) is still **NOT RUN**.
- **Capability migration `20261115_learning_course_author_capability.sql`:** idempotent insert of the permission and grants for `instructor`/`school_admin`; production RBAC data source still absent, so this is a draft for owner review.

## 10. Regression and quality gates

| Gate | Result |
| --- | --- |
| Backend `npx tsc --noEmit` | PASS, 0 errors |
| Frontend `npx tsc --noEmit` | PASS, 0 errors |
| Backend Jest (`--maxWorkers=3`) | PASS: 65 suites passed, 7 skipped (DB/S3 opt-in); **586 passed, 65 skipped, 0 failed** |
| DB integration (4 suites on 55433, `RUN_POSTGRES_INTEGRATION=1`) | PASS: 32/32 |
| Frontend Vitest | PASS: 56 files, **328 tests** |
| Playwright (real API) | PASS: **12/12** |
| `npm run build` (API) / `npm run build` (web) | PASS / PASS (Vite bundle-size advisory unchanged) |
| Python unit tests: robot-runtime 16, hardware adapter 19, digital twin 51 | PASS |
| `scripts/run_database_safety_tests.py`, S3/media upload tests, Robot Lab E2E, Digital Twin browser E2E | **NOT RUN** |

## 11. Security and organization isolation

- Authority for authoring is computed server-side from the caller's own active memberships and the new permission; hiding a menu item is not authorization (the UI exposure of "Course builder" to teachers/school admins is a convenience; the API refuses everyone else).
- School A cannot read, modify, publish, archive, add lessons, use media, or author questions in School B (404, indistinguishable from "missing"); a student/delivery-only staff cannot author; global content stays System-Administrator-only; inactive memberships/users have no authority.
- Expired/forged tokens → 401 on reads and writes.
- Backend unit coverage: 13 authority tests (`course-authoring-authority.spec.ts`).
- Residual: School Admins and instructors share one capability (as approved); there is no second-person review before a school publishes (as approved). The sweep for other endpoints that still check `org.manage` only (e.g. some media/insights reads) was not repeated.

## 12. Remaining blockers / risks

1. **Production:** both new drafts and the grade migration are unregistered; no authoritative RBAC seed exists; owner review of `20261111_global_quiz_runtime_role.sql` is outstanding; DB safety suite not rerun.
2. **Robot Lab / Digital Twin** acceptance on this checkout is unit-level only (§5, §7); needs a seeded qualified L4 version + fake-follower stack and a browser run.
3. **Media:** failed-upload recovery and browser upload not run (no S3 container started).
4. Offering auto-creation on publish uses code `C-<course id prefix>` and the course title; a school may want to rename it. Instructors cannot create classrooms (School Admin does, as designed).
5. The old API processes (3000/3001/3100) no longer exist; none were started by this session except the 3002 acceptance API, which is still running and can be stopped.

## 13. Demo runbook (local, simulation only)

Prerequisites: Docker, Node 22, Chrome (`/usr/bin/google-chrome`), free ports 3002, 4173, 54323.

1. Start only the disposable DB: `docker start vista-course-builder-test-education-test-postgres-1` (host port 55433; **never start/touch 55432**). If the container was restarted its tmpfs is empty — repeat the rebuild in §1.
2. Verify identity before any write: `psql -h 127.0.0.1 -p 55433 -U vista_test -d vista_test_course_builder -Atc "select current_database()"` and `docker inspect … .HostConfig.Tmpfs`.
3. `cd services/education-api && npm run build`; start `node dist/main.js` with `PORT=3002`, `DATABASE_URL=<vista_app_runtime URL on 127.0.0.1:55433>`, `SUPABASE_JWT_ISSUER=http://127.0.0.1:54323/auth/v1`, `SUPABASE_JWKS_URL=…/.well-known/jwks.json`, `SUPABASE_JWT_AUDIENCE=authenticated`, `WEB_ORIGIN=http://127.0.0.1:4173`, `SUPABASE_URL=` (empty), `MQTT_ENABLED=false`.
4. Fixture (once per fresh DB): `SUPABASE_URL= VISTA_DATABASE_PROJECT_REF=vista-course-builder-test VISTA_E2E_ADMIN_DATABASE_URL=<vista_test URL> VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-lms.json node dist/scripts/phase243-e2e-fixtures.js seed`.
5. Run the acceptance suite with the Playwright command in §4 (it starts the signer and Vite itself). For a manual demo use the same signer: `http://127.0.0.1:54323/token?sub=<auth id>` and set `localStorage['sb-127-auth-token']`.

Demo accounts (fixture; auth ids `f2430000-0000-4000-8000-0000000001NN`): admin `…101`, school admin `…102`, instructor `…103`, student `…104`, other school admin `…105`, second student `…106`.

| Demo | Script | Expected |
| --- | --- | --- |
| A Instructor | `/admin/courses` → Create Course → Curriculum Structure: add lesson, section, reading → Content Editor: add paragraph, Save Draft → publish section/activity → Review & Publish; add a Quick Add Quiz, New question ×2, add to quiz, set 70% | course shows `published`; quiz preview lists both questions and the answer key |
| B Student | School admin classroom on the new offering + enrol student → student `/my-learning` | course visible; first wrong attempt "Not passed yet", second "Passed 100%" |
| C School Admin | `/school/classrooms` create classroom, add student and instructor; other school's admin gets nothing | classroom roster persists after reload; foreign school 404 |
| D Robot Lab | **Not demonstrable from this checkout** (§5). If shown, state that a fake follower is a simulation. | — |
| E Digital Twin | **Not verified end-to-end** (§7); show only as a static 3D preview and say so | — |
| F Grading | student submits Blockly program → instructor rubric → "Publish grade" → student result page | grade hidden before publish, visible after |

Recovery: API not responding → restart step 3; DB empty after reboot → §1; expired demo token → request a new `/token`; stale fixture error "Fixture already exists" → the DB already has the fixture, reuse the JSON. Known limitations for the audience: simulation ≠ physical robot; media upload and multipart are not enabled; CSV/XLSX import and notification enhancements are out of RC scope.

## 14. Recommendation

- **Local project demonstration: CONDITIONAL GO.** LMS Phases A–H journeys (8/8), school isolation, grading and review are demonstrably working on a real stack. Conditions: demo Robot Lab and Digital Twin only as described in §5/§7 (not as verified live features), run the DB rebuild before the demo if the machine restarted, and keep the stack on 55433.
- **Production: NO-GO** until the owner registers and reviews the three migration drafts and the RBAC seed, the DB safety suite is rerun, and Robot Lab/Digital Twin/media get real-stack acceptance.
