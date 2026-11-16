# VISTA LMS final acceptance hardening report

**Updated:** 2026-11-15 (Asia/Ho_Chi_Minh)  
**Checkout:** `se/`, branch `feat/course1-learning-experience`, HEAD `29fa71a8f42ff15b4ff1642deb3381e921895ef6`  
**Final status (updated by continuation 2, see section “Continuation 2”):** **PARTIAL — not Production ready**. Loopback networking now works and the full Playwright suite was rerun: 8/8 specs pass, but only 6/8 business journeys are accepted (journeys 1–2 remain BLOCKED; spec 5 only asserts the current rejection). Earlier text below describing the sandbox `EPERM` is historical.

**Earlier status:** The latest full acceptance-stack run before this continuation passed six of eight business journeys; the two instructor-authorship journeys remain blocked by the absent approved school-scoped course/quiz ownership and authorization contract. This continuation fixed a reproduced course-editor pagination defect and reverified builds/typecheck/unit coverage, but could not rerun Playwright because the current sandbox denies loopback socket bind/connect (`EPERM`). The previous 7/7 run is historical evidence, not a fresh pass for the latest patch.

## Continuation 2 (2026-11-15) — observed results

Status vocabulary: PASS = observed passing now; PARTIAL; BLOCKED = needs a decision/approval; NOT RUN.

### Environment and safety (PASS)
- Loopback bind + connect probe (Node `net` server/client on 127.0.0.1) succeeded: **no EPERM in this session**. No sandbox bypass attempted.
- Target identity verified before any write: container `vista-course-builder-test-education-test-postgres-1`, `127.0.0.1:55433`, DB `vista_test_course_builder`, tmpfs data dir (`/var/lib/postgresql/data` rw,noexec,nosuid,size=1g, no volume mounts), PG 17.11, 89 public tables. Port 55432 (`vista-qbm-test-pg`) was **not contacted** in this task.
- No DB writes were made: the fixture seed refused to run again (“Fixture already exists”), so the existing fixture JSON `/tmp/vista-phase243-fixture-lms.json` was reused. No schema or data change in this continuation. No commit/push/deploy.
- Note: the fixture script's guard needs `SUPABASE_URL` set to the empty string (`SUPABASE_URL=`); merely unsetting it lets a module-loaded `.env` re-introduce a hosted URL and the guard refuses.

### Full Playwright acceptance suite (PASS for 8/8 specs; journeys 6/8)
Command (API rebuilt from current source with `npm run build`, started on private port 3002 with the existing `vista_app_runtime` URL for 55433):

`cd web/robot-edu && VISTA_E2E_JWKS_PORT=54323 VISTA_E2E_API_BASE_URL=http://127.0.0.1:3002/api/v1 VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-lms.json npx playwright test --reporter=list`

Result: **8 passed (28.4 s)**, one worker, real API and real browser, no mocked LMS responses.

| Spec | Result | Journey mapping |
| --- | --- | --- |
| course-builder-delivery: Course→Lesson→Section→Activity→Preview→Publish→Classroom→Student quiz→Result | PASS | Journey 3 (student quiz/grading) + system-admin authoring (not journey 1) |
| School Admin creates classroom and enrolls student | PASS | Journey 5 |
| Cross-school classroom/roster denied | PASS | Journey 6 |
| Student submits ProgramVersion; instructor assesses and returns feedback | PASS | Journey 4 |
| Instructor course creation rejected by current contract | PASS (asserts the rejection) | **Journey 1 is still BLOCKED**, this spec documents the gap |
| Enrolled course persists across refresh/relogin | PASS | Journey 7 |
| My Learning interrupted request → Retry | PASS | Journey 8 (tested case only) |
| Core LMS pages do not overflow at 320/375/768/1024/1440 | PASS | Responsive (My Learning, School Classrooms only) |

**Journeys: 1 BLOCKED, 2 BLOCKED, 3–8 PASS = 6/8. 8/8 is NOT claimed.**

### Course Builder pagination beyond 100 (PASS)
- The approved DB holds 109 `learning_courses`; the fixture course is row **109 of 109** by newest-first order (and row 1 by oldest-first), i.e. beyond the first 100 under the old listing.
- The real-stack spec that opens that course in the builder passed (it was the spec that failed before the fix); `CourseBuilderPage.spec.tsx` 3/3 and `learning.service.spec.ts` pass. The editor now fetches by ID (`catalogApi.course`), not by scanning the first page.

### Other checks rerun
| Check | Result |
| --- | --- |
| `web/robot-edu`: `npx tsc --noEmit` | PASS, 0 errors |
| `services/education-api`: `npx tsc --noEmit` | PASS, 0 errors |
| Vitest `CourseBuilderPage.spec.tsx` | PASS 3/3 |
| Jest `learning.service`, `assessment.service`, `programming.service` specs | PASS 78/78 |
| `services/education-api` `npm run build`; `web/robot-edu` `npm run build` | PASS (Vite still warns about the large bundle) |
| `git diff --check` | PASS |
| Full Jest / full Vitest / DB integration suites / S3 test | NOT RUN in this continuation (last results in the table above) |

### Journeys 1–2: smallest decision proposal (NOT implemented; needs your approval)
Facts from the code and schema: `POST/PATCH /admin/courses` and publish call `createGlobalCourse`/`updateGlobalCourse`/`publishCourse`, gated by the system permission `org.manage`. `learning_courses` already has `organization_id` (only 9 of 109 rows non-null in the test DB) and `learning_questions` has `organization_id` (12/13 set), so a school-owned model is schema-compatible; no new table is required. The code's existing capability codes are `learning.delivery.manage`, `learning.work.review`, `learning.assessment.assess`, `learning.work.write`; none expresses course authoring.

Decisions needed (each answerable yes/no or by choosing a name):
1. **D1 — Capability.** Create a new capability code for school-scoped authoring (suggested name `learning.course.author`, **your choice**), granted to `instructor` (and `school_admin`?) at organization scope. Alternative: reuse `learning.delivery.manage` (rejected by this report: it already means classroom delivery).
2. **D2 — Course ownership endpoint.** Add `POST /orgs/:organizationId/courses` (and PATCH/publish) that forces `organization_id` = the caller's membership organization and requires D1; keep `/admin/courses` system-admin-only. Draft/publish by the instructor allowed? (yes/no). Does a school-published course need system-admin approval before students see it?
3. **D3 — Quiz authoring scope.** Allow D1 holders to author questions/quizzes only for courses of their own organization (questions already carry `organization_id`); global Question Bank stays read-only for them. Confirm, and confirm review of the unregistered `20261111_global_quiz_runtime_role.sql` draft (it changes global Question Bank scope) before any release.
4. **D4 — Seed.** Provide the authoritative role/permission seed (baseline contains none) so D1 can be granted in Production through a reviewed migration, not by fixture.
Once D1–D3 are approved, journeys 1 and 2 need: the endpoints above, DB tests for cross-organization denial, and two Playwright journeys (instructor creates+publishes course; instructor authors+assigns quiz) — about 1–2 days of work.

### Grade-release migration readiness (`database/migration-drafts/20261115_learning_grade_publication.sql`)
Content: `ALTER TABLE public.learning_assessments ADD COLUMN published_at timestamptz;` (nullable, additive). It is **unregistered** (not in `database/migrations/manifest.json`) and was applied only to the 55433 test DB. Checklist (all items are OPEN until owner sign-off; nothing below was done against shared/Production):
- [ ] **Backfill decision (blocking).** The new read path returns `assessment = null` while `published_at IS NULL`. Any assessment row already existing in a target database would silently disappear from the learner view after deploy. Owner must choose: backfill `published_at = reviewed_at` for existing rows (preserves current visibility) or leave unpublished (hides history). The draft has no backfill statement.
- [ ] Count affected rows on the target (`SELECT count(*) FROM learning_assessments`) on a read-only basis before choosing.
- [ ] Register in `manifest.json` with the sha256 and next `order`; rename to the repo convention (`2026111x_<letter>_...sql`); run `scripts/run_database_safety_tests.py` and the manifest/sequence tests; the manifest/README are already locally modified by others — coordinate to avoid overwriting.
- [ ] Verify RLS/grants: the table has one policy (`vista_app_runtime_backend_access`) and table-level grants, so the new column inherits access; confirm in a copy that `vista_app_runtime` can UPDATE the column and a school-scoped user cannot read another student's published assessment (covered by the same-classmate E2E).
- [ ] Deploy order: migration first, then API (old API tolerates the extra column; new API requires it). Roll back by redeploying the old API; do **not** drop the column (data loss) unless explicitly decided.
- [ ] Production application only through the repository SQL migration runner with approval; no Prisma `db push`/Migrate, no ledger fabrication.
- [ ] Confirm the Prisma schema/client does not model this table in a way that breaks (code uses raw SQL; `tsc`/build pass).
Verdict for this migration: **NOT READY for registration** until the backfill decision and manifest/safety-test run are done.

### Runbook for the trusted host terminal (re-run any time)
Prerequisites: Docker containers `vista-course-builder-test-education-test-postgres-1` (55433, tmpfs) and Chrome at `/usr/bin/google-chrome` (or `VISTA_E2E_CHROMIUM_PATH`); free ports 3002, 4173, 54323.
1. Verify identity: `psql -h 127.0.0.1 -p 55433 -U vista_test -d vista_test_course_builder -Atc "select current_database(), inet_server_port()"` (port seen inside the container is 5432; the host mapping must be 55433 and the container's data dir must be tmpfs).
2. `cd services/education-api && npm run build`, then start `node dist/main.js` with `PORT=3002`, `DATABASE_URL=<vista_app_runtime URL on 127.0.0.1:55433/vista_test_course_builder>`, `SUPABASE_JWT_ISSUER/JWKS_URL/AUDIENCE` pointing at `http://127.0.0.1:54323/auth/v1`.
3. Fixture: if empty DB, `SUPABASE_URL= VISTA_DATABASE_PROJECT_REF=vista-course-builder-test VISTA_E2E_ADMIN_DATABASE_URL=<vista_test URL> VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-lms.json node dist/scripts/phase243-e2e-fixtures.js seed`; otherwise reuse the existing file (the script refuses to reseed).
4. Run the Playwright command above. Never point any of these at port 55432 or a hosted Supabase URL.

### Remaining decisions requiring your approval
1. D1–D4 above (authoring capability, school-owned course endpoint and publish rule, quiz authoring scope, role/permission seed).
2. Grade-release migration: backfill choice and permission to register it in `manifest.json` (owner review of both drafts).
3. Review/approval of the global Question Bank scope draft `20261111_global_quiz_runtime_role.sql`.
4. Scope of remaining acceptance (browser media upload/failure, notifications, CSV/XLSX, broader catalogue/progress) — confirm whether they are in or out of this release.

### Production readiness verdict (continuation 2)
**NO — not Production ready.** Evidence is stronger (8/8 specs, 6/8 journeys, pagination verified beyond row 100, 0 TypeScript errors, builds pass), but journeys 1–2 are BLOCKED on D1–D3, the grade-release migration has an unresolved backfill gap and is unregistered, and media/notification acceptance is NOT RUN.

---

# Earlier report (continuation 1)

## Acceptance scope and completion measure

A journey counts complete only after an authenticated real-browser/API flow succeeds against the approved disposable PostgreSQL instance. A passing component test, build, or seeded system-admin flow does not substitute for the required instructor journey.

- **Business journeys: 6/8 complete (75%) based on the last successful acceptance run.** Journeys 1 and 2 are blocked. Journeys 3–8 passed in that seven-test Playwright run; journey 4 is one of the real flows. A subsequent rerun with the newly added responsive case exposed the course pagination defect and failed the composite course-builder scenario. That defect is fixed, but the final rerun is blocked by the current sandbox's loopback restrictions.
- **Phase A–H whole-scope completion: 0/8.** Each grouped phase still has at least one requested gap (e.g. instructor authoring, notifications, browser media, or responsive sweep). This is a strict feature-scope measure, distinct from the six passing journeys.
- No result below implies Production approval. The local draft migrations are unregistered and owner review is outstanding.

## Phase A–H matrix

The original request names phases A–H but does not define canonical names; these groupings match its feature areas.

| Phase | Scope and observed evidence | Status |
| --- | --- | --- |
| A | Course Builder preview, publish, curriculum, reading/quiz content, and student visibility passed in the seeded system-admin journey. Instructor course create is rejected by the current system-admin-only endpoint. A detail lookup that failed for courses after the first 100 was fixed to fetch by ID directly; focused frontend spec and backend service regression pass. Thumbnail/video upload and acceptance-stack responsive sweep are not verified. | PARTIAL |
| B | Canonical Question Bank and quiz engine are used by the student quiz journey. The instructor-authored quiz flow is blocked by ownership/authorization; CSV/XLSX import has no supported contract. | PARTIAL |
| C | School Admin quiz delivery and publish passed. Instructor quiz authorship/assignment remains unverified and blocked with A/B. | PARTIAL |
| D | Student catalogue/My Learning, quiz attempt, server grading, result, refresh/relogin, and retry path passed. Broader course progress and every catalogue state were not swept. | PARTIAL |
| E | Student Blockly ProgramVersion submission → instructor rubric review → explicit grade publish → same student sees score/feedback/time passed. Re-submitting a different ProgramVersion now invalidates the previous grade and scores. | COMPLETE for tested submit/review/release path; broader assignment and interruption states remain partial |
| F | School Admin classroom creation/enrollment and persistence passed; cross-school classroom/roster denial passed. Broader instructor allocation and school-admin workflows remain unverified. | PARTIAL |
| G | Local RustFS S3 storage integration passed 1/1. Browser media upload/attachment access, document/image/video lifecycle, and notifications were not accepted. | PARTIAL |
| H | Real local JWT identities, role checks, cross-school denial, same-classmate submission denial, and retry/relogin passed in the prior acceptance run. A separate Playwright viewport test for My Learning and School Classrooms at 320/375/768/1024/1440 passed 1/1 before sandbox restrictions prevented the current full-stack rerun. Broader upload/attempt interruption recovery remains untested. | PARTIAL |

## Environment, fixture, and migration findings

- The worktree was already heavily modified and contained untracked work from other agents. Those changes were preserved. No commit, push, merge, branch switch, AWS operation, Production/shared DB operation, or robot action occurred.
- Port **55432** belongs to unrelated container `vista-qbm-test-pg`; it was not contacted or changed. The acceptance target was verified as Compose project `vista-course-builder-test`, tmpfs data at `/var/lib/postgresql/data`, loopback mapping `127.0.0.1:55433`, database `vista_test_course_builder`, fixture writer `vista_test`, and API role `vista_app_runtime`. Acceptance fixture and integration-test guards now accept **55433 only** and reject 55432.
- The schema-only baseline has 88 tables, 46 RLS-enabled tables, no migration ledger rows, and no role/permission rows. No authoritative role/permission seed was found; the security design cites a proposed SQL seed that is absent. The local fixture provisions only capability codes found in API guards/services. This is test bootstrap, not Production RBAC data.
- Active D/E SQL migrations were applied earlier to the isolated clone. The separately approved draft `database/migration-drafts/20261111_global_quiz_runtime_role.sql` was validated on this clone only; it changes global Question Bank scope and provisions restricted `vista_app_runtime`. It remains unregistered and requires owner review before any canonical migration/release decision.
- With the user's approval, `database/migration-drafts/20261115_learning_grade_publication.sql` added nullable `learning_assessments.published_at` to **only** `vista_test_course_builder` on 55433, in one transaction. The column was verified there. This draft was not added to the migration manifest or applied elsewhere. Owner approval is required before registration/release.
- The fixture now has a second student in the same school/classroom for same-classmate ownership denial. One initial fixture SQL attempt referenced a nonexistent column and rolled back atomically; the corrected transaction inserted the user, membership, classroom membership, and enrollment in 55433. The baseline clone and unrelated DB were untouched.
- The service `.env` DATABASE_URL did not identify the approved target, so the integration-test launcher refused before starting Jest. The tests were then run with the verified live API target and the local fixture writer URL; no access to the wrong URL occurred.
- MinIO's Quay registry returned 401. The already cached `rustfs/rustfs` image runs as tmpfs-backed local storage at `127.0.0.1:59000`; the existing service on 9100 was untouched. The first S3 test got `InvalidAccessKeyId` because `LearningMediaStorage` uses the AWS SDK default credential chain. Supplying the same local RustFS credentials through both `LEARNING_MEDIA_S3_*` and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` fixed the test. No cloud credentials or remote endpoints were used.

## Grade publication contract and verification

- `POST /submissions/:submissionId/assessment` saves an instructor's draft score/rubric/comments. Saving is not publication.
- `POST /submissions/:submissionId/assessment/publish` checks the existing classroom scope and both existing capabilities `learning.work.review` and `learning.assessment.assess`, then timestamps the saved assessment. It does not add a new permission or bypass scope checks.
- `GET /me/submissions/:submissionId` verifies ownership and active classroom scope and returns assessment scores, overall assessment feedback, and `publishedAt` only after publication; before release `assessment` is `null`. A second student in the same classroom receives 404 for the first student's submission.
- Instructor UI now shows “Saved as draft; the student cannot see this grade yet.” and a “Publish grade” action. The learner sees the published rubric score, overall feedback, and time on the classroom assignment page.
- A real Playwright run verified: submit version → learner result hidden → instructor saves 8/10 → still hidden → instructor publishes → learner API and browser show 8/10, feedback, and timestamp. The direct learner API read also verified the timestamp.
- Repeat testing uncovered a data-integrity defect: a later ProgramVersion submission upserted the one-row-per-assignment/learner submission but retained its old published assessment. `ProgrammingService.submit` now deletes the old assessment and cascading rubric scores only when the submitted ProgramVersion changes. Resubmitting the same version remains idempotent and preserves its grade. Unit regression coverage verifies both cases.

## Eight required journeys

| # | Journey | Result | Evidence / limitation |
| --- | --- | --- | --- |
| 1 | Instructor creates and publishes a course | **BLOCKED** | Real API rejects instructor `POST /admin/courses` with 403/404. Current course authoring service is global/system-admin-only. A school-owned course lifecycle and approved authoring permission are missing; no role was widened. |
| 2 | Instructor authors and assigns a quiz | **BLOCKED** | Current quiz/question authoring uses the global/organization ownership model; fixture quiz is system-admin-authored and school-admin-delivered. Instructor authoring cannot be claimed without the same approved ownership/authorization contract and review of the unregistered global-scope draft. |
| 3 | Student completes quiz and receives grading | **PASS** | Real Playwright quiz attempt; server result is 100%/Passed; no mocked LMS API response. |
| 4 | Student submits assignment and instructor reviews/releases grading | **PASS** | Real student Blockly submission, instructor 8/10 rubric review and publish, learner-hidden-before/present-after API/browser assertions, and timestamp. Repeat-version stale-grade regression also passes. |
| 5 | School Admin creates classroom and enrolls students | **PASS** | Real UI creates classroom, enrolls student, reload confirms member. |
| 6 | Cross-school access is denied | **PASS** | Other school can read its own resource (200); foreign school token is denied (403/404) on classroom list, roster, and classroom resource. Same-classmate cannot read another student's submission. |
| 7 | Persistence after refresh and relogin | **PASS** | Student course remains visible after refresh, logout, new local JWT session, and reload. Grade persistence is verified after assessment publication within journey 4. |
| 8 | Error, retry, and interruption recovery | **PASS for the required tested case** | Playwright interrupts four real quiz-list requests, observes an error, retries, and recovers through the real API. Upload/attempt-interruption cases are not included in this journey evidence. |

**Last successful acceptance: 6/8 (75%). Blocked: 2/8.** After that run, an 8-spec rerun failed the composite seeded course-builder journey because a fixture course was beyond the first 100 catalog rows; journeys 2–7 passed in that run, while the output did not establish a fresh all-suite pass. The pagination defect is now fixed and unit-tested; fresh full-stack verification remains blocked. Do not treat the earlier 7/7 run as verification of the latest code.

## Actual verification on this continuation

| Command / check | Exit | Actual result |
| --- | ---: | --- |
| `cd web/robot-edu && VISTA_E2E_JWKS_PORT=54323 VISTA_E2E_API_BASE_URL=http://127.0.0.1:3001/api/v1 VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-lms.json npm run test:e2e` (prior run, before latest pagination fix and responsive test) | 0 | **7/7 Playwright tests passed** in 22.9 s, one worker. Rebuilt API ran on private local port 3001 and used approved DB 55433. Real frontend/API calls; no LMS response mocks. Historical evidence only for the state at that run. |
| Full Playwright rerun after responsive test was added | 1 | The composite Course Builder scenario failed because the fixture course was not among the first 100 catalog rows; other reported scenarios 2–7 passed. Root cause fixed afterward by direct ID lookup; could not rerun full stack in current sandbox. |
| `npx playwright test --grep 'Core LMS pages'` with isolated API/fixture config | 1 | Blocked before tests: test signer could not bind loopback port 54323 (`listen EPERM`). `curl` to loopback API/auth was also denied by sandbox. No API request was made by this attempt. |
| Responsive Playwright focused case | 0 | **1/1 passed** at 320/375/768/1024/1440 for My Learning and School Classrooms, before the current sandbox restrictions were encountered. |
| `cd services/education-api && npm test -- --runInBand --silent` | 0 | **63 suites passed, 564 tests passed; 7 suites / 65 tests skipped** behind opt-in integration gates (629 total). Expected error logs in unit fixtures. |
| `cd web/robot-edu && npm test -- --reporter=dot` | 0 | **55 files / 324 tests passed.** Existing React `act` and router future-flag warnings remain. |
| Four DB integration suites with explicit `RUN_POSTGRES_INTEGRATION=1`, writer URL on 55433, correct project ref and empty `SUPABASE_URL` | 0 | **4 suites / 32 tests passed** on the verified tmpfs target. The guards now reject 55432. |
| Local S3 test with RustFS credentials supplied to both credential chains | 0 | **1/1 passed** against loopback tmpfs RustFS `127.0.0.1:59000`. |
| `cd services/education-api && npm run build` | 0 | Backend TypeScript build passed after grade invalidation changes. |
| `cd web/robot-edu && npm run build` | 0 | Vite production build passed. Main bundle remains ~3.1 MB and emits the 500 kB advisory. |
| `cd web/robot-edu && npx tsc --noEmit --pretty false` | 0 | **0 TypeScript errors** (down from 95 at this continuation's start, rechecked after the pagination fix). No `any` widening, `ts-ignore`, test removal, or compiler-rule disabling was used. |
| `cd services/education-api && npm run build` (after direct course lookup fix) | 0 | Backend TypeScript build passed. |
| `cd web/robot-edu && npx vitest run src/pages/admin/CourseBuilderPage.spec.tsx` | 0 | **1 file / 3 tests passed** after changing editor detail fetch to direct course-by-ID. |
| `git diff --check` | 0 | Passed after the latest edits. |
| `git diff --check` | 0 | Passed. Worktree still includes pre-existing/concurrent changes; no destructive Git operation was run. |

An intermediate full Playwright rerun failed because a prior published score survived resubmission under a different ProgramVersion. That exposed and fixed stale-grade behavior. A later rerun found the course pagination issue described above, which was fixed and covered by backend/frontend focused tests. The complete acceptance-stack rerun is currently unverified because loopback socket creation and requests are denied in this execution sandbox; an operator must rerun the documented command outside it.

## TypeScript error classification and fixes

The 95 diagnostics were grouped as: unused imports/variables; canonical Blockly RobotProgram objects incompatible with overly narrow `Record<string, unknown>` request types; optional coordinate values not narrowed; a Promise chain inferred as `unknown`; an unsupported `WorkspaceSvg.scrollIntoView`; RobotLab reading stale `ProgramRecord.title` and nonexistent `JointInfo.axis`; missing `completedAt` in the VR session type; and nullable DOM/test values with insufficient element typing. Those sources were corrected, including unused imports across files with compiler errors. Final `tsc` is 0. These are narrow type/unused-code changes; the frontend files with large pre-existing LMS/digital-twin work remain preserved.

## Files changed in this continuation

Grade lifecycle, persistence, and E2E:

- `services/education-api/src/modules/learning/assessment.controller.ts`
- `services/education-api/src/modules/learning/assessment.service.ts`
- `services/education-api/src/modules/learning/assessment.service.spec.ts`
- `services/education-api/src/modules/learning/programming.service.ts`
- `services/education-api/src/modules/learning/learning.service.ts` (direct course-by-ID query avoids the 100-row paging bug while preserving visibility checks)
- `services/education-api/src/modules/learning/learning.service.spec.ts`
- `services/education-api/src/modules/learning/programming.service.spec.ts`
- `services/education-api/src/scripts/phase243-e2e-fixtures.ts`
- `database/migration-drafts/20261115_learning_grade_publication.sql` (unregistered, applied only to approved 55433 test DB)
- `web/robot-edu/src/lib/api.ts`
- `web/robot-edu/src/pages/StudentAssignmentDetail.tsx`
- `web/robot-edu/src/pages/teacher/TeacherSubmissionReview.tsx`
- `web/robot-edu/tests/e2e/lms-independent.spec.ts`
- `web/robot-edu/tests/e2e/lms-independent.spec.ts` (responsive viewport case)
- `web/robot-edu/src/pages/admin/CourseBuilderPage.tsx` and `CourseBuilderPage.spec.tsx` (direct course detail query)

Safety guards now require port 55433 only:

- `services/education-api/src/modules/learning/course-builder-persistence.db.spec.ts`
- `services/education-api/src/modules/learning/curriculum-reorder.db.spec.ts`
- `services/education-api/src/modules/learning/enrollment-lifecycle.db.spec.ts`
- `services/education-api/src/modules/learning/enrollment-lifecycle.extended.db.spec.ts`
- `services/education-api/src/modules/learning/runtime-role-security.db.spec.ts`
- `services/education-api/src/modules/learning/iot-feedback.repository.int.spec.ts`

TypeScript zero-error cleanup (unused imports and narrow type corrections):

- `web/robot-edu/src/App.tsx`, `src/index.tsx`, `src/lib/api.ts`
- `src/components/admin/RolesOverview.tsx`, `src/components/assignments/AssignmentWorkPanel.tsx`
- `src/components/dashboard/{ContinueLearning,RecentPrograms,UpcomingAssignments}.tsx`
- `src/components/digital-twin/{DigitalTwinWorkspace,HardwareCalibrationPanel,useDigitalTwinViewerScope.spec}.tsx`
- `src/components/layout/{AppShell,AppShell.spec,RoleSwitcher,SidebarNav,VistaMark}.tsx`
- `src/components/learning/LessonSectionView.tsx`, `src/components/robot/{ExperimentList,RobotStatusSummary}.tsx`
- `src/components/studio/{BlocklyCanvas,CommandTree,InspectorPanel,LogList,PreviewDialog,ProblemsList,ProgramMenu,ProgramNameField,ProgramOutput,RealRobotDialog,SimulationPanel,SimulationView,So101Viewer3D,StudioMobile,StudioToolbar,TaskPanel}.tsx`
- `src/components/teacher/CriteriaEditor.tsx`, `src/components/ui/{DemoTag,ProgressBar,StatusDot,Switch}.tsx`
- `src/pages/{AccountSettings,AssignmentDetail,Assignments,CourseDetail.spec,Courses,Dashboard,DemonstrationPractice,LearningLoop,MyLearning.spec,MyLearningReload.spec,NotFound,Practice,RobotLab,SimulationResult,SimulationResult.spec,StudentAssignmentDetail,StudentAssignments.spec,Studio,VrPractice,WebSettings}.tsx`
- `src/pages/admin/AdminRobots.tsx`, `src/pages/school/{ClassroomRobotAllocation,ClassroomStudentImport,MemberCandidatePicker,SchoolImportUsers}.tsx`, `src/pages/teacher/{TeacherClasses,TeacherCourses,TeacherSubmissionReview,TeacherSubmissions}.tsx`

These lists describe this continuation's edits only. Other modified/untracked files were already present at the start and were preserved; see `git status` for the complete shared worktree.

## Remaining blockers and owner approvals

1. **Instructor course authoring:** define an organization-owned course lifecycle and owner-approved capability/role mapping. Current `learning.delivery.manage` is used for classroom delivery and is not silently repurposed as global course-authoring authority.
2. **Instructor quiz/question authoring:** approve school ownership, assignment association, and permission semantics; review the global Question Bank/runtime-role draft. No permission names were invented and no global access was granted.
3. **Draft migration governance:** owner review and canonical registration/release for both unregistered drafts remain outstanding. They were not added to the manifest and were not run on any shared/Production target.
4. **Production RBAC seed:** provide the authoritative roles/permissions seed source; schema baseline contains none.
5. **Remaining UI acceptance:** rerun full Playwright after the course pagination fix outside the current socket-restricted sandbox. Browser media attachment/upload/failure, notification UI/API, and broader catalogue/progress and attempt interruption flows still need acceptance. A focused responsive case passed at 320/375/768/1024/1440, but it must be included in the real-stack run. CSV/XLSX and multipart remain outside supported contracts.

## Production readiness verdict

**NO — not Production ready.** Grade release, stale-grade invalidation, course detail pagination, and zero frontend TypeScript errors have focused verification. Six journeys passed in the last successful full-stack run, but the current final E2E rerun is blocked by sandbox `EPERM` on loopback bind/connect after a later run exposed the now-fixed pagination issue. The two instructor authoring journeys still require approved ownership/RBAC semantics. Run the documented E2E command outside the restricted sandbox, then resolve owner decisions and remaining media/notification coverage.
