# VISTA — integration of the RC checkpoint onto `origin/develop` (2026-11-16)

**Verdict: INTEGRATION READY FOR OWNER REVIEW — with the open decisions in §8.** Nothing was pushed or merged. All work is in the isolated worktree `../se-rc-integration` on branch `integration/rc-on-develop-2026-11-16` (local only).

## 1. Inputs

| Item | SHA |
| --- | --- |
| `origin/develop` used (includes merged PR #147) | `83266c7` |
| RC checkpoint (`rc/checkpoint-2026-11-16`) | `ccf7234ea9810fba3dda74894d9049df2b6b3e7c` |
| Common ancestor | `cefd4825` |
| Original RC branch / dirty worktree | untouched (`/home/quangduc/Code/vista/se`, 13 uncommitted infra/CI/baseline entries preserved) |

The 57 non-merge commits on develop since the ancestor include: PR #147 evaluator and ProgramVersion work, migrations F–J (global question scope, activity-progress guard, audio media, attempt submission foundation, one submission per attempt), the transactional course publish with enrollment synchronization, archived-course freezing, attempt-level grade release (`grading_released_at`), quiz drafts/confirm/attempt history, the new `CourseBuilder` page with dialogs, the Quizzes page for scheduling, classroom creation that creates the school offering, and CI/database release workflows.

Method: because the checkpoint's two oldest commits already exist upstream in rewritten form (add/add noise), only the two *checkpoint* commits were cherry-picked onto develop and every conflict was resolved by reading the ancestor, develop and RC versions. No whole-file `ours/theirs` was used except where the develop file was a strict superset and the RC change was re-applied by hand (listed below).

## 2. Team work preserved (verified by the test runs in §6)

PR #147 symbolic evaluator and ProgramVersion handling; migrations F–J (the registered manifest D–J is unchanged and applies cleanly on the verified baseline); transactional publish + enrollment sync; archived-course freeze; attempt-level grade release (`/release` endpoints, `GRADE_RELEASED` lock); quiz draft/confirm/history; attempt-bound submissions; the new Course Builder and Quizzes pages; CI workflows. Develop's Jest, Vitest and DB specs all pass (§6), including the symbolic-evaluation specs.

## 3. RC functionality preserved

| RC capability | Where it lives now |
| --- | --- |
| School-scoped authoring (courses, modules, lessons, activities, media, questions, quizzes) | `learning.course.author`; `LearningScopeService.authoringOrganizationIds/canAuthorOrganization`; routes `/admin/courses*` now open to `admin`, `teacher`, `school_admin` in the **develop** `AdminCourses` + `CourseBuilder` (no obsolete route restored) |
| School ownership/isolation | owner taken from the caller's memberships, client `organizationId` only honoured if it is one of them; foreign school → 404 on every action (E2E) |
| Instructor-only course publishing | new capability `learning.course.publish` (Instructor only) enforced **inside develop's transactional publish**; UI disables publish for School Admins |
| Question authoring + publish by school authors | `authorLessonQuestion`, learning-outcome endpoints, `NewQuestionDialog` inside develop's `QuizAuthoringPanel`; global Question Bank read-only for school authors (team contract of migration F kept) |
| Quiz attempts/grading, snapshots | develop's engine, unchanged; RC journeys run through it |
| Grade draft vs publication | **develop's attempt-level release is the single mechanism**; the RC `published_at` column/endpoint/migration were dropped as a duplicate (§5) |
| Execution provenance | `execution-provenance.ts` + physical execution / instructor evidence + `EvidenceCard` note |
| Delivery of school-owned courses | develop's "create classroom → create school offering" flow extended to the school's own published courses (§4, row 9) |

## 4. Conflict resolution matrix

| # | File(s) | Base change (develop) | RC change | Resolution | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | `database/README.md`, `database/migrations/{README.md,manifest.json}` | manifest D–J, new README | doc/manifest edits from uncommitted local work | develop versions | RC added nothing to the registered chain |
| 2 | `learning.service.ts` `publishCourse` / `syncCourseEnrollments` | single DB transaction, course row lock, `synchronizeCourseIn`, system-admin only | authority by school, offering on publish | develop transaction kept; authority = `canPublishOrganization` read from the locked row; sync uses `authorCourse`; **auto-offering dropped** (develop creates offerings with the classroom) | atomicity is the team's invariant; offering creation would duplicate their flow |
| 3 | `question-bank.service.ts` | `assertCourseWritable` (archived freeze) | removed `publisher()` | both kept (freeze + school authors publish) | |
| 4 | `question-bank.service.ts` `createQuestion` | client states scope, must equal the lesson's course | server-derived scope | **develop semantics restored**; `authorLessonQuestion` passes the lesson's scope explicitly | team DB test asserts it; authority is still checked against the stated scope |
| 5 | `assessment.service.ts`, `programming.service.ts` (+ specs) | attempt-level release, attempt-bound submissions | `published_at`, `publishAssessment`, stale-grade invalidation | **develop files kept**; only RC's provenance mapping re-applied | RC grade publication duplicated develop's `grading_released_at`; invalidation is moot with one submission per attempt |
| 6 | `learning.service.spec.ts`, `learning-media.service.spec.ts` | new publish/sync tests | scope mocks | develop tests kept; mocks extended with the new scope methods; "only a system administrator can publish" rewritten to "no publish authority ⇒ nothing changes" | the check now needs the course row |
| 7 | `web` `App.tsx`, `data/navigation.ts` | `admin/courses/:courseId` → `CourseBuilder`, `admin` only | roles for teacher/school admin, nav | develop routes; roles widened; "Course builder" nav for teacher and school admin | |
| 8 | `CourseBuilderPage.tsx(+spec)` | deleted upstream | modified | **deleted** (RC capabilities exist in `CourseBuilder`/`CanonicalCurriculumEditor`) | no verified need for the old route |
| 9 | `education-admin.service.ts`, `school-admin-query.service.ts` (+ specs) | course pickers/offering checks accept **global published courses only** (explicit tests) | school-owned courses must be deliverable | extended to "published and (global **or the school's own**)"; tests updated | owner-approved RC policy; **see decision D1** |
| 10 | `QuizAuthoringPanel.tsx`, `CourseContentEditor.tsx` | already fixed quiz content `{}`, pass threshold and refetch ordering | same fixes (RC) | develop kept; RC's "New question" button and the once-only assignment link reporting re-applied | |
| 11 | `api.ts` | `apiGet/apiRequest` | null-body parsing, new authoring calls, provenance types | merged | |
| 12 | `EvidenceCard.tsx` (develop refactor) | component extracted | provenance note in the page | note re-applied in the component | |
| 13 | ~70 web files from the checkpoint's TypeScript/UI sweep (studio, digital-twin workspace, dashboard…) | newer team versions | uncommitted work of other agents | **not carried** (restored to develop) | not RC functionality; they stay on the checkpoint branch |
| 14 | `AGENTS.md`, `docs/operations/*` | team versions | local edits | develop versions | |

## 5. Database migration compatibility

- Registered D–J apply cleanly on the verified baseline (SHA `5b140ce7…`, disposable 55433): `20261110_d … 20261114_j`.
- **Dropped (duplicate):** `20261115_learning_grade_publication.sql` — develop already has `learning_assignment_attempts.grading_released_at`.
- **Trimmed:** `20261111_global_quiz_runtime_role.sql` — its global-scope part is now migration F; what remains is the `vista_app_runtime` role/grants. Found and fixed during the E2E: the grant allowlist lacked `learning_submission_files` (migration I), which made submissions fail with `permission denied` — added.
- **New draft (unregistered):** `20261115_learning_course_author_capability.sql` — `learning.course.author` for `instructor`/`school_admin`, `learning.course.publish` for `instructor` only. Idempotent.
- Known: the runtime-role security spec fails one assertion on a fresh clone (`TEMP` privilege on the database is inherited from `PUBLIC`); the draft never revoked it. Not changed (migration decision).
- Nothing was registered or applied anywhere except the disposable 55433 DB.

## 6. Actual test results (integrated code, disposable DB 55433)

| Gate | Result |
| --- | --- |
| API `tsc` | PASS 0 errors |
| Web `tsc` | 90 errors = develop's own baseline (unused imports etc.; none in files RC touched) — **not zero** (earlier "0" depended on the cleanup sweep that was not carried) |
| API Jest | PASS 79 suites / **889 passed**, 0 failed, 176 skipped (DB-gated) |
| DB integration (all `*.db.spec.ts`, 16 suites, guard temporarily pointed at 55433 and restored) | PASS **143 passed**, 6 skipped |
| `runtime-role-security` (opt-in) | 5 passed, **1 failed** (PUBLIC `TEMP`, see §5) |
| `iot-feedback.repository.int.spec` | NOT RUN (expects the Supabase-local DB on 54322) |
| Web Vitest | PASS 83 files / **578 tests** |
| API build / web build | PASS / PASS |
| Playwright, real browser + real API + isolated DB | PASS **13/13** (see below) |
| Symbolic-evaluation regression | PASS (develop's Jest specs run in the 889) |
| Python robot-runtime / twin / adapter suites | NOT RUN in this task |
| `scripts/run_database_safety_tests.py` | NOT RUN |

Playwright (all against the integrated code): seeded course publish + quiz; **Journey 1** (instructor creates, edits, previews, publishes a school course; school admin delivers it through develop's classroom flow; student sees it; refresh/relogin; foreign school 404 on every action); **Journey 2** (instructor authors two questions, builds the quiz with a 70% threshold, publishes, assigns on the Quizzes page; student fails then passes; no answer key to the student; duplicate submission is harmless); **Publishing policy** (School Admin authors and edits but the server refuses publish; Instructor publish reaches the rules); school admin classroom/enrolment; cross-school denial; Blockly submission → instructor review → **develop's release** → student grading; expired/forged tokens and validation errors; interrupted request + retry; responsive at 320/375/768/1024/1440 for the authoring pages and My Learning/Classrooms.

Compared with baselines: develop's Jest (including DB) and Vitest suites pass unchanged except where the team's own tests asserted the old contract (rows 6 and 9); RC's earlier 12/12 Playwright suite was rewritten for develop's UI (dialogs instead of prompts, Quizzes page, attempt history, quiz confirmation, release flow) and now has 13 tests.

## 7. Defects found in develop by the integrated run (fixed, minimal)

1. **Student quiz player showed every fresh attempt as already submitted** (`result_snapshot` defaults to `{}`; `Practice.tsx` treated any object as a prior result, disabling the quiz). Fixed: only a graded snapshot (numeric `score`) counts. This was blocking every student quiz on develop.
2. Runtime-role grants missing for `learning_submission_files` (draft updated).
3. Team DB specs' stubs assumed a system-admin-only publish; updated to the real authority.

## 8. Open decisions for the owner / team

- **D1 — policy conflict:** develop's tests deliberately restricted school offerings to *global* published courses; the owner's RC policy requires school-owned courses to be deliverable. Implemented the owner policy (own school only) — the team should confirm.
- **D2 — "Only Instructor may publish":** implemented as the new capability `learning.course.publish` (Instructor only; System Administrator for global courses). Question publishing by school authors was left as approved earlier. Please confirm the capability name and the draft migration.
- **D3 — migrations:** the capability draft and the trimmed role draft are unregistered; PUBLIC `TEMP` item above.
- **D4 — web TypeScript baseline** is 90 errors on develop; the cleanup sweep was intentionally not imported.

## 9. Not verified / limits

Digital Twin workspace UI from the checkpoint (not carried); Robot Lab real-stack flow; failed-upload recovery (no S3); the IoT feedback integration spec; Python suites; DB safety suite. No push, no PR merge, no AWS/production change, no physical robot, no shared database.

## 10. Safe for owner review?

Yes: a coherent branch (`integration/rc-on-develop-2026-11-16`) that builds, passes all unit/DB/browser suites listed above, preserves the team's contracts, and records the two policy decisions it had to make. It should not be pushed or opened as a PR until D1–D3 are answered.
