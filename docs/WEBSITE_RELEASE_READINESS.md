# VISTA website — release readiness (2026-11-21)

Prepared, not executed. Nothing was committed, pushed, merged, deployed, migrated or written to Production; no Terraform or AWS call was made; the Production prerequisite-impact query was **not** run; the Desktop repository was not touched; no physical robot was commanded. Production contact was limited to read-only public GET requests and a browser that only loaded pages and clicked tabs. Evidence: [`WEBSITE_WIDE_ACCEPTANCE.md`](WEBSITE_WIDE_ACCEPTANCE.md). Open items: [`WEBSITE_REMAINING_WORK.md`](WEBSITE_REMAINING_WORK.md). LMS-specific details (impact query, Production acceptance plan, header proposals): [`WEB_LMS_RELEASE_READINESS.md`](WEB_LMS_RELEASE_READINESS.md).

## 0. Five separate statuses (not to be conflated)

| Status | Answer | Basis |
|---|---|---|
| **Functionally complete** | **NO, not for the entire website.** 46 of 49 required modules are fully implemented (93.9 %). Partial: B5 profile management (product decision), H3 MuJoCo rendering and hardware sync (external asset, hardware), L4 cache/security headers (infrastructure). The approved LMS scope is complete (36/36). | acceptance §3, §6 |
| **Isolated tests passed** | **YES** for everything that can run locally: 187 Playwright tests passed, 0 failed (2 opt-in skips); Vitest 657/657; Jest 1109 and, with disposable PostgreSQL + S3, 1299 passed; builds, typechecks and manifest validation exit 0; GoTrue leak scan 0 occurrences of 50 secrets. 44 of 49 modules are fully verified end to end (89.8 %) | acceptance §2, §6 |
| **Ready for PR review** | **YES** | §1: a bounded, explained change set; no migration; no secrets; tests included |
| **Ready for Production deployment** | **CONDITIONALLY YES, once approved.** Technically deployable as is: no schema change, no new required environment variable, prerequisite enforcement is **off by default**, rollback is application-only. Not yet approved or run through the pipeline. Deploying soon is recommended because Production currently contains the P1 Course Builder overwrite defect (R-1) | §2–§6 |
| **Production accepted** | **NO.** 3 of 49 modules (6.1 %: A1–A3) accepted read-only; the rest need authenticated or write access | acceptance §6 |

## 1. Change set (uncommitted; 25 modified + 27 new = 52 files)

| Group | Files |
|---|---|
| **Prerequisite policy and safety** (API) | new `modules/learning/course-prerequisites.ts`; `progression.service.ts`, `learning.service.ts`, `unpublish.service.ts`, `course-discovery.service.ts`, `dto/course-path.dto.ts`, `config/production-config.ts` |
| Prerequisite tests | new `course-prerequisites.spec.ts`, `course-prerequisite-enforcement.db.spec.ts` (11 tests on real PostgreSQL); `progression.service.spec.ts`, `learning.service.spec.ts`, `config/production-config.spec.ts`; E2E `lms-prerequisite-enforcement`, `lms-unlock-rule` (history) |
| **Staff account recovery** (Web) | new `pages/ForgotPassword.tsx`, `pages/ResetPassword.tsx`, `lib/passwordPolicy.ts` (+ spec); `pages/AccountSettings.tsx`, `pages/Login.tsx`, `contexts/SupabaseSessionContext.tsx`, `App.tsx`; Vitest `StaffPasswordRecovery.spec.tsx`; E2E `staff-auth-recovery-ui` |
| **Course Builder data-corruption fix** (Web) | `components/authoring/CourseContentEditor.tsx`; E2E `lms-draft-discard` |
| Other UI | `components/ui/AppErrorBoundary.tsx` (+ spec), `pages/CourseDetail.tsx`, `lib/api.ts`, `pages/StudentAssignmentDetail.tsx`, `components/assignments/AssignmentConfigPanel.tsx`, `index.html`, `public/favicon.svg` |
| Acceptance tests | new E2E `website-public-smoke`, `website-notifications`, `digital-twin-browser-viewer`, `lms-robot-lab-access`, `lms-robot-lab-assignment`, `student-auth-session-api`, `student-auth-session-ui`; `playwright.config.ts` (ignore pattern), `playwright.student-auth.config.ts` (match list) |
| Test harness | `scripts/local_integration_stack.sh` (adds `COURSE_PREREQUISITES_ENFORCED_FROM=2026-01-01T00:00:00Z` to the **local** stack only) |
| Docs / ops | new `docs/WEBSITE_WIDE_ACCEPTANCE.md`, `WEBSITE_REMAINING_WORK.md`, `WEBSITE_RELEASE_READINESS.md`, `WEB_LMS_FINAL_ACCEPTANCE.md`, `WEB_LMS_RELEASE_READINESS.md`, `operations/sql/prerequisite-enforcement-impact.sql`; `docs/acceptance/LMS_COMPLETION_HANDOFF.md` (superseded note); `docs/operations/WEB_LMS_PRODUCTION_READINESS.md` (new variable row) |

Excluded from any commit: `docs/acceptance/screenshots/` (untracked before this work), `web/robot-edu/test-results/`, `dist/` (git-ignored). No migration, workflow, Terraform, package or lockfile change.

**Suggested commits (on a new feature branch; none made):** (1) `fix(web): Course Builder no longer writes one activity's title/content into another` — the editor fix and its E2E; (2) `feat(education): configurable, backward-compatible course prerequisite enforcement` — the API policy, validation and their tests; (3) `feat(web): staff password recovery and change; application error boundary; locked-course and assignment-type UI; favicon` ; (4) `test(web): website-wide acceptance (public site, notifications, Twin viewer, real-GoTrue sessions, Robot Lab)`; (5) `docs: website acceptance, release readiness, prerequisite impact query`. Commit 1 can be released independently and first if the rest needs more review.

## 2. Prerequisite enforcement: what changed since the previous review, and the rollout

The three defects found in the previous review are fixed and regression-tested (acceptance §5, D-2 and D-3):

| Requirement | Implementation | Evidence |
|---|---|---|
| Configurable cutoff, safe when absent/invalid | `COURSE_PREREQUISITES_ENFORCED_FROM`: **absent, empty, `disabled`, `off`, `false`, `0`, `none` → disabled** (nothing is locked); `always` → everyone; an ISO-8601 date-time **with a time zone** → enforced only for learners with no active/completed enrolment in the course older than the cutoff (`learning_enrollments.enrolled_at`, `NOT NULL DEFAULT now()`, set at first enrolment and never rewritten by the sync, so reliable; a NULL, which the schema forbids, would count as legacy). Invalid text → disabled and logged; **production boot refuses an invalid value** so a typo fails the deployment instead of changing who is locked | 53 unit tests on the parser/config; 11 PostgreSQL tests |
| Existing students keep access | grandfathering by `enrolled_at`; completed or in-progress lessons, their media, retakes and any lesson with a prior attempt stay open even for new enrolments | PostgreSQL spec, E2E |
| Open quiz attempts can be submitted | final submission and evidence-based completion call the prerequisite check with `courseLevel: false`; ownership, window and tenant checks are unchanged | unit test inspects the SQL actually sent |
| No impossible configuration | authoring rejects missing, archived, cross-school and (for a published course) draft or lesson-less prerequisites, plus cycles and self-reference (existing); publishing a course re-validates; archiving/unpublishing a course that a published course depends on is refused; at runtime a prerequisite that is unpublished, lesson-less or unreachable (the learner is not enrolled in it and the learner's school has no active offering) is ignored, so nothing can lock a learner forever. Self-enrolment from the catalog applies the same reachability rule | PostgreSQL spec (5 cases), E2E (6 authoring cases) |
| Newly enrolled students are subject to the rule | verified: school-added students are locked until the prerequisite course is completed (lessons/sections 409, banner), self-enrolment is refused with 409 | E2E |

**Policy decisions to approve (flagged, not silently assumed):** (a) default **disabled**: deploying the code changes nothing for any student; enforcement begins only when an operator sets the variable; (b) a prerequisite that cannot be satisfied is *ignored* rather than blocking (fail open); (c) "completed" means every lesson of the prerequisite is completed; (d) started or completed work is never locked.

**Rollout:** (1) deploy with the variable unset: no behaviour change. (2) With approval, run `operations/sql/prerequisite-enforcement-impact.sql` read-only (optionally `-v enforced_from=<planned cutoff>`; at or after the deployment time it must report 0 locked students) and fix the dead prerequisites it lists. (3) With approval, add `COURSE_PREREQUISITES_ENFORCED_FROM=<deployment time, UTC, with Z>` to the Production API secret (the same secret mechanism as `STUDENT_TEMP_PASSWORD_ENABLED` in `docs/operations/production-release-n-runbook.md`; **not performed**) and redeploy the task. (4) Later, after schools reviewed their prerequisites, change it to `always` or remove the date. Turning it off again is the instant mitigation and needs no code rollback.

## 3. Security review of the whole change set

| Area | Result |
|---|---|
| Secrets | scanned every added line and new file: no keys, tokens, private keys, project references or ARNs; only the local fixture passwords (`LocalFixturePass-*`, `@vista.test`), fake unit-test passphrases and the local `twsecret_local` placeholder (already rejected by the production config validator) |
| Dangerous frontend patterns | none added (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, token/password in `localStorage`) |
| New public surface | `/forgot-password` and `/reset-password` only. Forgot-password gives the **same answer for known and unknown addresses** and reports only a rate limit. The reset form appears **only after supabase-js emits `PASSWORD_RECOVERY`** (a validated recovery token); during this review I removed an earlier shortcut that also trusted a `type=recovery` URL fragment, because a signed-in user could have forged it to set a password without the current one. A regression E2E now asserts that forged fragments show no form. After a reset all sessions are revoked (`signOut({ scope: 'global' })`) and the used link is rejected |
| Account Settings | password change verifies the current password first, then revokes other sessions; students see only the Recovery Code route (no new student endpoint) |
| Error boundary | shows a generic message, never the error text; details go to the console only (unit-tested with a "secret" in the thrown message) |
| API | no new route; prerequisite SQL is parameterised; the lock runs after the existing tenant/enrolment checks so it cannot reveal other tenants' courses; 409 bodies name prerequisite *course titles* only to an already authorised learner; staff/administrators bypass the learner path as before |
| Test tooling | the new real-GoTrue specs refuse to run against a non-loopback endpoint (the config they run under has no guard of its own) |
| Authentication integrity | real-GoTrue suites 10/10 UI and 13/13 API, including token tampering, `alg:none`, foreign issuer, logout revocation, cross-tenant denial; **leak scan: 0 plaintext occurrences of 50 secrets** in a 756 KB all-schema dump, four API logs and the GoTrue log (positive controls pass; the proxy log is empty) |

## 4. Production database impact and migration state

No migration, no DDL, no data write. The candidate reads only `learning_courses.prerequisite_course_ids`, `learning_enrollments.enrolled_at` and existing tables/columns that the deployed API already uses. `database/migrations/manifest.json` is unchanged and validates. Production's migration ledger (O–Q reported applied) was **not re-verified** (no read access). The read-only impact query is prepared and was validated on a disposable database; it must not run on Production without approval.

## 5. Static assets, cache and security headers (observed read-only)

* `dist/favicon.svg` is emitted, `index.html` links it, no `vite.svg` reference remains, no source maps/`.env`/key files in `dist/`, no secret patterns in the bundles. Production currently returns **403 for `/vite.svg`** on every page; fixed by the candidate.
* Compression works (brotli, 578 KB on the wire for the 1.99 MB bundle). **No `Cache-Control` on any static file** (`aws s3 sync` without `--cache-control`); **no HSTS, `X-Content-Type-Options`, frame, referrer, permissions or CSP headers** (Terraform attaches no response-headers policy); the API sends `X-Powered-By: Express` and the nginx version. CORS is correct (foreign origin gets no `Access-Control-Allow-Origin`). Proposals (not applied) are in `WEB_LMS_RELEASE_READINESS.md` §7; they are an infrastructure/pipeline PR and not a blocker for this release.

## 6. Read-only Production findings

| Check | Result |
|---|---|
| `https://skynex.best` + `www` + CloudFront; API `/health` | 200, ok |
| Deployed SHA | API `/api/v1/version` and Web `/version.json`: `63c5ac8d8e9110925c688c73737dbde69bcba190`; its tree equals the local base |
| Public browser check (19 of 21 pass): homepage, 9 nav anchors, links, no self-registration link, Desktop section (3 tabs, 3 disabled "Download unavailable", no installer links), no overflow at 768/390, 8 protected routes redirect to `/login` | the two failures are `/vite.svg` 403 and the staff-recovery page (not deployed) |
| Authenticated reads, media permissions, migration ledger | **not verified** (no credentials/DB access) |
| **Possible damage from the Course Builder defect (R-1)** | cannot be measured without Production DB read access. A heuristic read-only query (needs approval; aggregate course/lesson titles only): `SELECT c.title AS course, l.title AS lesson, lower(a.title) AS activity_title, count(*) FROM learning_activities a JOIN learning_sections s ON s.id=a.section_id JOIN learning_lessons l ON l.id=s.lesson_id JOIN learning_courses c ON c.id=l.course_id GROUP BY c.id,c.title,l.id,l.title,lower(a.title) HAVING count(*) > 1;` Duplicate titles within one lesson can be legitimate; results need instructor review, nothing can be repaired automatically |

## 7. CI/CD requirements and rollback

* `Education CI` (api, web, docker, database-safety, inventory) must be green on the PR; the Playwright, real-GoTrue, Twin and WF-03 suites are **local-only** and are not run by CI today (a gap noted in R-10/R-11 context: their results are evidence from this session, not from the pipeline).
* Pipeline after merge to `main`: `Auto Deploy` → `schema-gate` → `deploy-api` → `deploy-web`, each behind the reviewer-gated `aws-demo` environment; the web job verifies `version.json` against the merge SHA.
* **Rollback is application-only and safe** (no schema change): `vista-rollback-api` for the previous API image, republish the previous Web build. Both directions are compatible: the API adds optional response fields; the Web treats them as optional. Prerequisite enforcement can additionally be switched off with the variable alone. Never edit applied migrations or the ledger.
* Post-deploy read-only checks: both version SHAs equal the merge commit; `/favicon.svg` 200 and no `/vite.svg` request; `/forgot-password` renders; health ok; rerun the public browser check.

## 8. Production acceptance requirements (not executed)

Reuse the fixture plan in `WEB_LMS_RELEASE_READINESS.md` §10 (isolated `ACC-20261121-` school, dedicated staff and students, archive-only cleanup) and add: staff password recovery on **hosted Supabase** (real reset e-mail, redirect allow-list for `https://skynex.best/reset-password`, link single-use, sessions revoked); prerequisite lock and unlock plus the enrolment-date cutoff; draft discard/save in the Course Builder with a title/content assertion; Twin viewer in Simulation mode; the public checks. Writes need explicit authorisation naming the target and scope.

## 9. Final release recommendation

1. **Approve the PR review now.** The change set is bounded, explained, tested, free of secrets and migrations.
2. **Deploy the code with enforcement disabled (default) as soon as approvals allow**, because it removes a live P1 data-corruption defect and adds staff recovery, an error boundary and the favicon fix without changing any student's access.
3. **Treat enabling prerequisite enforcement as a separate, later, approved step** (§2), gated by the read-only impact query.
4. Do not claim the website complete: 3 modules are partial and 1 workflow is unverified on hardware (see acceptance §7).

## 10. Exact approvals needed

| # | Approval | For |
|---|---|---|
| 1 | Commit the change set on a feature branch (suggested split §1) | repository rule |
| 2 | Push, open the PR, and later merge to `main` | pipeline |
| 3 | Approve the `aws-demo` deploy gates (`schema-gate`, API, Web) | deployment |
| 4 | Decide the profile-management / student self-service password scope (R-4) | B5 |
| 5 | Authorise the read-only Production impact query, and later add the enforcement variable to the Production API secret (a Secrets Manager change) with a chosen cutoff | enabling enforcement |
| 6 | Authorise the read-only duplicate-title query for R-1 (and review of its results by instructors) | damage assessment |
| 7 | Configure hosted Supabase for `/reset-password` (redirect allow-list) and approve a test reset mail | B4 acceptance |
| 8 | Authorise the separate infrastructure/pipeline PR for headers and caching, or defer it | L4 |
| 9 | Approve the Production acceptance writes and the archive-only cleanup | formal acceptance |
| 10 | Provide read-only Production credentials (authenticated reads, migration ledger) or confirm out of scope | acceptance |
