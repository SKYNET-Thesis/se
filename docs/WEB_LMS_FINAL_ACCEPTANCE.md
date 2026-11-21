# VISTA Web LMS — final feature completion and acceptance (2026-11-21, final pass)

Worktree `/home/quangduc/Code/vista/se-sprint-90`, branch `release/db-scope-o-q`, HEAD `f9fc13f` plus uncommitted changes (section C). Nothing was committed, pushed, deployed or migrated. Desktop repository untouched. No Production write of any kind. Release delta, rollback and the Production acceptance plan are in [`WEB_LMS_RELEASE_READINESS.md`](WEB_LMS_RELEASE_READINESS.md).

Isolated environment: disposable PostgreSQL 17 (tmpfs, loopback `:55497`), RustFS S3 (`:59000`), Education API built from this tree (`:3001`), local JWKS token signer, Vite dev server, Chromium, created and removed by `scripts/local_integration_stack.sh up|down`; for the real-GoTrue suites also GoTrue `v2.197.0` via `scripts/local_student_auth_harness.sh`; for WF-03/Twin suites the repo's fake-follower adapter (`:8016`), R1 runtime (`:8015`) and Digital Twin (`:8767`). Stacks were recreated fresh before each suite group (fixtures are single-use). No shared Supabase, AWS or Production resource was used.

> **Addendum (later on 2026-11-21).** This report covers the 36 LMS features and remains accurate for them. Two things changed afterwards: (1) course-prerequisite enforcement (row 23, defect C3) is now **configurable and backward compatible**: `COURSE_PREREQUISITES_ENFORCED_FROM`, absent = disabled, grandfathering by enrolment date, unreachable prerequisites ignored, open attempts and completed work preserved, impossible configurations rejected at authoring/publish; (2) a P1 Course Builder defect (one activity's title/content overwritten by another) was found and fixed. The entire-website results (49 modules, 187 Playwright tests, updated Vitest/Jest counts) and the current statuses are in [`WEBSITE_WIDE_ACCEPTANCE.md`](WEBSITE_WIDE_ACCEPTANCE.md), [`WEBSITE_REMAINING_WORK.md`](WEBSITE_REMAINING_WORK.md) and [`WEBSITE_RELEASE_READINESS.md`](WEBSITE_RELEASE_READINESS.md). Where numbers differ, the website documents are newer.

## A. Feature completion matrix

Statuses: VERIFIED PASS / IMPLEMENTED / NOT VERIFIED / PARTIAL / MISSING / BLOCKED. Every row is a real browser + real API + real PostgreSQL workflow unless stated.

| # | Role | Feature | Frontend | API | Database | Tests | Status |
|---|------|---------|----------|-----|----------|-------|--------|
| 1 | Admin | Authentication and role-based access | yes | yes | yes | platform-system-admin, lms-security-matrix | VERIFIED PASS |
| 2 | Admin | Organization/school lifecycle, invitations, users and roles, disable/enable | yes | yes | yes | platform-lifecycle, platform-system-admin, platform-invite-security | VERIFIED PASS |
| 3 | Admin | Course administration | yes | yes | yes | lms-authoring, platform-full-journey | VERIFIED PASS |
| 4 | Admin | Tenant and permission isolation | yes | yes | yes | lms-security-matrix, platform-school-admin | VERIFIED PASS |
| 5 | Admin | Dashboard and navigation | yes | yes | yes | platform-route-sweep, platform-full-journey | VERIFIED PASS |
| 6 | Instructor | Dashboard, classes, class detail | yes | yes | yes | platform-route-sweep, lms-independent | VERIFIED PASS |
| 7 | Instructor | Course create/edit, metadata, level, tags, prerequisites | yes | yes | yes | lms-academic A/B, lms-authoring J1 | VERIFIED PASS |
| 8 | Instructor | Modules and lessons: create, edit, order | yes | yes | yes | platform-from-scratch, course-builder-delivery | VERIFIED PASS |
| 9 | Instructor | Learning media upload, archive, restore | yes | yes | yes | platform-media-archive | VERIFIED PASS |
| 10 | Instructor | Attach video/document/image to a lesson | yes | yes | yes | lms-lesson-media | VERIFIED PASS |
| 11 | Instructor | Quiz and question management | yes | yes | yes | lms-authoring J2, qb-import | VERIFIED PASS |
| 12 | Instructor | Quiz grading, weights, pass threshold, retake unlock | yes | yes | yes | lms-module-quiz, lms-unlock-rule | VERIFIED PASS |
| 13 | Instructor | Assignment create/publish, rubric, deadlines, attempt limits | yes | yes | yes | lms-assignment-grading, platform-from-scratch | VERIFIED PASS |
| 14 | Instructor | **Robot Lab assignment type**: UI configuration, persistence, grading rule, student view, start/resume, tenant isolation | yes | yes | yes | **lms-robot-lab-assignment (new)** | VERIFIED PASS |
| 15 | Instructor | Robot allocation visibility | yes | yes | yes | lms-independent, lms-robot-lab-access | VERIFIED PASS |
| 16 | Instructor | Course publishing and visibility rules | yes | yes | yes | lms-authoring, platform-lifecycle | VERIFIED PASS |
| 17 | Instructor | Student progress, submissions, grading, feedback, release, correction | yes | yes | yes | lms-assignment-grading, platform-full-journey | VERIFIED PASS |
| 18 | Student | Login, logout, session expiry (local JWKS signer) | yes | yes | yes | lms-authoring, platform-resilience | VERIFIED PASS |
| 19 | Student | **Real GoTrue**: login, refresh rotation, logout revocation, tampered/unsigned/foreign tokens, student authorization, cross-tenant denial, activation, temporary password, recovery | yes | yes | yes | student-auth-api (10) + **student-auth-session-api (3, new)**, student-auth-ui (4) + student-recovery-ui (1) + **student-auth-session-ui (1, new)** | VERIFIED PASS |
| 20 | Student | Dashboard / My Learning | yes | yes | yes | lms-p1-p2-regression, platform-from-scratch | VERIFIED PASS |
| 21 | Student | Catalog, course details, enrollment, access restrictions | yes | yes | yes | lms-catalog-enrollment, lms-independent | VERIFIED PASS |
| 22 | Student | Learning path | yes | yes | yes | lms-academic D/H, lms-curriculum | VERIFIED PASS |
| 23 | Student | **Course prerequisite enforcement** (server-side lock, UI explanation, unlock on completion, authors unaffected) | yes | yes | yes | **lms-prerequisite-enforcement (new)**, progression.service.spec (+4) | VERIFIED PASS |
| 24 | Student | Module/lesson navigation, video and media access | yes | yes | yes | lms-lesson-media, course-builder-delivery | VERIFIED PASS |
| 25 | Student | Quiz start, answer, submit, result | yes | yes | yes | lms-authoring J2, lms-module-quiz, course-builder-delivery | VERIFIED PASS |
| 26 | Student | **Quiz attempt history**: order, scores, refresh and re-login persistence, privacy | yes | yes | yes | **lms-unlock-rule (extended)** | VERIFIED PASS |
| 27 | Student | Assignment start/resume, submit, result history | yes | yes | yes | lms-assignment-grading, lms-robot-lab-assignment, platform-from-scratch | VERIFIED PASS |
| 28 | Student | Robot Lab visibility for allocated vs unauthorized users | yes | yes | yes | lms-robot-lab-access | VERIFIED PASS |
| 29 | Student | Progress synchronization and completion states | yes | yes | yes | platform-from-scratch, lms-academic | VERIFIED PASS |
| 30 | Shared | Responsive layout | yes | n/a | n/a | lms-independent, lms-authoring (320–1440 px), lms-a11y-extended | VERIFIED PASS |
| 31 | Shared | Navigation and route protection | yes | yes | yes | platform-route-sweep, lms-security-matrix | VERIFIED PASS |
| 32 | Shared | Loading, empty, error states, retry | yes | yes | n/a | platform-resilience, lms-independent | VERIFIED PASS |
| 33 | Shared | Form validation | yes | yes | yes | lms-authoring, lms-academic, lms-robot-lab-assignment | VERIFIED PASS |
| 34 | Shared | Media authorization | yes | yes | yes | lms-lesson-media, platform-media-archive | VERIFIED PASS |
| 35 | Shared | Accessibility of primary workflows | yes | n/a | n/a | platform-axe, lms-a11y-smoke, lms-a11y-extended | VERIFIED PASS |
| 36 | Shared | No console/page errors in primary flows | yes | yes | n/a | lms-authoring, route-sweep, new specs (`pageerror` asserted empty) | VERIFIED PASS |

Totals (36 mandatory rows): **VERIFIED PASS 36**, IMPLEMENTED / NOT VERIFIED 0, PARTIAL 0, MISSING 0, BLOCKED 0. Rows 14, 19, 23, 26 moved from the previous report's NOT VERIFIED/PARTIAL to VERIFIED PASS in this pass.

## B. Test evidence (final code, this session, nothing inferred from earlier sessions)

| Suite | Command (abridged) | Result | Exit |
|---|---|---|---|
| API typecheck / build | `npx tsc --noEmit`; `npm run build` | PASS / PASS | 0 / 0 |
| Web typecheck / build | `npx tsc --noEmit`; `npm run build` (`dist/favicon.svg` present, `index.html` links it) | PASS / PASS | 0 / 0 |
| Vitest | `vitest run` (single fork) | 98 files, **649/649** | 0 |
| Jest, no DB env | `jest --runInBand` | 96 suites passed, 27 skipped; **1069 passed**, 213 skipped, 0 failed (4 new prerequisite tests) | 0 |
| Jest, disposable PostgreSQL + RustFS S3 | `RUN_POSTGRES_INTEGRATION=1 RUN_LOCAL_S3_INTEGRATION=1 jest --runInBand` | 121 suites passed, 2 skipped; **1248 passed**, 34 skipped, 0 failed | 0 |
| Migration manifest | `validate_database_migration_manifest.py` | PASS (no new migration in this change) | 0 |
| **Playwright main** (lms-*, platform-*, qb-import, course-builder-delivery, visual-audit) | `npx playwright test tests/e2e/lms-*.spec.ts …` | **134 passed, 0 failed, 2 skipped** (the 2 skips are the opt-in `visual-audit` screenshot captures, `VISTA_VISUAL_AUDIT=1`; they would overwrite the existing untracked `docs/acceptance/screenshots/`, so they were not enabled); 10.3 min, fresh stack | 0 |
| Playwright real GoTrue, API | `playwright test -c playwright.student-auth.config.ts` | **13/13** | 0 |
| Playwright real GoTrue, browser | same config with `SA_WITH_UI=1` | **6/6** | 0 |
| Playwright WF-03 runtime contract (R1 + fake follower, software only) | `wf03-runtime-evidence.spec.ts` | **1/1** | 0 |
| Playwright Blockly simulation | `blockly-simulation.spec.ts` | **1/1** | 0 |
| Playwright Digital Twin attempt scope + revocation + real WebSocket revocation | `digital-twin-*.spec.ts` | **18/18** | 0 |
| **Playwright total** | | **173 passed, 0 failed, 2 skipped (opt-in, non-mandatory)** | |

Failures encountered on the way, all environmental or test-ordering, none hidden, none resolved by weakening an assertion:

1. Wrapper env: first runs lacked `VISTA_E2E_ADMIN_DATABASE_URL` / `LEARNING_MEDIA_S3_ACCESS_KEY` (specs call `psql` / `aws` for fixtures and cleanup). Re-run with the variables set.
2. Real-GoTrue UI: the reissue test failed with `API request failed (429)` because my API suite had just exhausted the *by-design* limit of 5 temporary-password reissues per administrator per hour (in-process). Not a defect. The `:3012` API process was restarted (limiter is in memory) and the UI suite run first: 6/6, then the API suite: 13/13.
3. Twin suites: first attempt collided with a Twin process I had started on `:8767` (the specs start their own). Helpers stopped, fresh stack, 18/18.
4. WF-03 first attempt: missing S3 credentials for the spec's own cleanup call; everything before it (run, evidence, scoped retrieval) passed. Fresh stack, 1/1.

Authentication evidence: real GoTrue password login, refresh-token rotation, logout revocation, unsigned/`alg:none`/tampered/foreign-issuer/truncated tokens all 401, student role denied on staff routes, cross-school reads 403/404 (session-api), plus the temporary-password, recovery and reissue journeys. Authorization/tenant evidence: lms-security-matrix, platform-school-admin/system-admin, lms-robot-lab-access/assignment, lms-prerequisite-enforcement (student 409, administrator 200), quiz-history privacy, Twin attempt scope. The plaintext-secret leak scan was not part of this run; it was re-run in the release safety review on 2026-11-21 (0 occurrences, `WEB_LMS_RELEASE_READINESS.md` §6).

### E2E journeys (all in the 134-test main run unless noted)

| Journey | Specs | Result |
|---|---|---|
| A Instructor course authoring | lms-authoring J1, platform-from-scratch, lms-lesson-media | PASS |
| B Course publishing | lms-authoring (publish policy), platform-lifecycle | PASS |
| C Quiz lifecycle (+ history) | lms-authoring J2, lms-module-quiz, lms-unlock-rule, qb-import | PASS |
| D Assignment lifecycle | lms-assignment-grading, lms-independent, platform-from-scratch | PASS |
| E Student learning progression (+ course prerequisites) | platform-from-scratch, lms-academic, lms-prerequisite-enforcement | PASS |
| F Robot Lab allocation and assignment type | lms-independent, lms-robot-lab-access, lms-robot-lab-assignment | PASS |
| G Media lifecycle | lms-lesson-media, platform-media-archive | PASS |
| H Role and tenant isolation | lms-security-matrix, platform-system-admin/school-admin, student-auth-session-api | PASS |

## C. Defects resolved (this pass and the previous one)

| ID | Defect | Root cause | Files | Fix | Regression test |
|---|---|---|---|---|---|
| C1 | Production favicon 403 on every page (P2) | `index.html` linked `/vite.svg`, absent from `public/`, so S3/CloudFront answers 403 | `web/robot-edu/index.html`, new `public/favicon.svg` | icon points at a shipped file; verified present in `dist/` | build check; post-deploy read-only check |
| C2 | Rubric editor lost typed criteria / Save disabled after a late refetch (P2, intermittent) | `useEffect` re-synced rows from server on every fetch | `AssignmentConfigPanel.tsx` | `dirty` ref skips sync while local edits are unsaved | `platform-from-scratch` (passed in 4 runs) |
| C3 | **Course prerequisites were displayed but not enforced** (P1 functional gap) | only the catalog/self-enrollment checked them; a student enrolled by a school could open lessons, sections, attempts and media | new `course-prerequisites.ts`; `progression.service.ts` (course path locks every unfinished lesson with `COURSE_PREREQUISITE_NOT_COMPLETED`; `assertPrerequisites` guards attempts, media, knowledge checks); `dto/course-path.dto.ts`; `CourseDetail.tsx`, `lib/api.ts` | server-side lock folded into the existing path and prerequisite queries (no extra round trip); UI banner naming the missing courses; authors unaffected; unlocks automatically once every lesson of the prerequisite is completed | `lms-prerequisite-enforcement` (student 409 on lesson and sections, admin 200, unlock after completion) + 4 unit tests |
| C4 | Student never saw the assignment type; a Robot Lab with no difficulty showed no details at all | `StudentAssignmentDetail` details block ignored `assignment_type` | `StudentAssignmentDetail.tsx` | type label shown ("Type: Robot Lab") | `lms-robot-lab-assignment` |
| C5 | No browser coverage for Robot Lab type, student Robot Lab access, quiz history, real-GoTrue refresh/logout/token rejection | gaps | new specs `lms-robot-lab-assignment`, `lms-robot-lab-access`, `student-auth-session-api/ui`; `lms-unlock-rule` extended; `playwright.student-auth.config.ts` | added | themselves |

No P0/P1 implementation defect is open. The product decision "prerequisites are advisory" recorded in `LMS_COMPLETION_HANDOFF.md` was an earlier engineer's choice, not an approved requirement (nothing in `docs/requirements`, `docs/ai`, the SRS or the master context says so); it is superseded by enforcement. Behaviour change to flag for approval: courses already delivered in Production to students with unmet prerequisites become locked after this release (see readiness document).

## D. Remaining blockers

| Sev | Item | Type |
|---|---|---|
| P1 (gate) | Production write acceptance of journeys A–H not run; needs named approval and an isolated fixture school | Production approval |
| P1 (gate) | Commit, push, merge, protected deploy of this change set; none performed | Approval |
| P2 | Enforcement changes behaviour for already-delivered Production courses; data impact review needed before release | Release risk |
| P2 | Production Web: static files carry no `Cache-Control`; no HSTS/`X-Content-Type-Options`/CSP/`Referrer-Policy` on the Web origin (compression works: brotli, 578 KB on the wire). Correction: an earlier version of this report said the bundle was uncompressed; a HEAD request misled that observation | Infrastructure (Terraform change proposed in `WEB_LMS_RELEASE_READINESS.md` §8, not applied) |
| P2 | Production authenticated reads, media permissions, migration ledger O–Q not re-verified (no credentials / DB read access) | Environment restriction |
| P2 | `visual-audit` screenshots (opt-in) not captured; real browser viewer against the Twin not run. (The GoTrue plaintext leak scan was re-run on 2026-11-21: 0 occurrences, see `WEB_LMS_RELEASE_READINESS.md` §6.) | Coverage |
| P3 | Hosted Supabase behaviour (mail, redirects), AWS-side media, physical SO-101, VLA inference | Out of Web LMS scope, previously documented |

## E. Completion percentages

Rules: a row counts only if VERIFIED PASS; unverified items are never added to PASS.

1. **Mandatory feature implementation completion** = (VERIFIED PASS + IMPLEMENTED) ÷ 36 = 36/36 = **100 %**.
2. **Isolated-environment acceptance coverage** = VERIFIED PASS ÷ 36 = 36/36 = **100 %**; journeys A–H 8/8. (Qualifier: two opt-in screenshot specs skipped, none mandatory.)
3. **Production acceptance coverage** (of the currently deployed `63c5ac8`) = passed Production checks ÷ defined checks. Defined 19: 11 read-only (web availability, API health, revision, authentication redirects, public routes, static assets, catalog requires auth, browser console/network, authenticated reads, media permissions, migration compatibility) + 8 write journeys A–H. Passed: 7 (availability, health, revision, redirects, public routes, static assets, 401 on catalog). Finding: console/network (favicon 403) counted as not passed. Not verified: authenticated reads, media permissions, migration compatibility, journeys A–H. **7/19 = 36.8 %**. (The previous report used a different 16-check list, 5/16; the lists are not comparable.) The release candidate itself has 0 Production checks because it is not deployed.

## F. Final verdict

**WEB LMS FUNCTIONALLY COMPLETE — READY FOR RELEASE APPROVAL**

Evidence: 36/36 mandatory features verified in real browser + API + database workflows; 173 Playwright tests passed with 0 failures; Vitest 649/649; Jest 1069 (no DB) and 1248 (DB + S3) passed with 0 failures; builds, typechecks and manifest validation exit 0; no open P0/P1 implementation defect; Production read-only checks that could be run pass except the cosmetic favicon 403, which the candidate fixes. It is **not** "ACCEPTED" and not 100 % complete formally, because the change set is uncommitted and undeployed, and Production write acceptance, authenticated Production reads and migration-compatibility reads are unverified.

What remains before formal acceptance: (1) you authorize committing the change set and a PR/merge through the protected pipeline; (2) review of the Production data impact of prerequisite enforcement; (3) approved deployment by the existing workflow; (4) post-deploy read-only checks (version SHA, favicon 200); (5) authorized Production acceptance on the isolated fixture school in the release-readiness plan; (6) only then may Production PASS be recorded. Exact approvals needed are listed in `WEB_LMS_RELEASE_READINESS.md` §6.
