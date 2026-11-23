# VISTA Web LMS — release readiness and final safety review (2026-11-21)

Prepared, not executed. Nothing here was committed, pushed, merged, deployed, migrated, or written to Production. The only Production contact was read-only HTTP requests to the public Web/API. Test evidence is in [`WEB_LMS_FINAL_ACCEPTANCE.md`](WEB_LMS_FINAL_ACCEPTANCE.md); the pipeline and the 13-item release checklist are in [`operations/production-lms-deployment-acceptance-plan.md`](operations/production-lms-deployment-acceptance-plan.md), which this document extends.

## UPDATE (later on 2026-11-21): the three prerequisite defects below are fixed; the recommendation in §0 is superseded

The follow-up task fixed the problems this review identified, so the "hold the deployment" advice in §0 no longer applies as written. **Current recommendation: approve the PR; the code may be deployed with enforcement disabled (the new default); enabling enforcement is a separate, later, approved step gated by the impact query.** Details, evidence and the current status table are in [`WEBSITE_RELEASE_READINESS.md`](WEBSITE_RELEASE_READINESS.md) §0 and §2. What changed:

* **F1 (open quiz attempts could not be submitted): fixed.** Final submission and evidence-based completion skip the course-level rule; started or completed lessons, their media and retakes stay open.
* **F2 (existing students would lose lessons): mitigated by policy.** New `COURSE_PREREQUISITES_ENFORCED_FROM`: absent/invalid = **disabled** (nobody is locked); `always`; or an ISO-8601 date-time with a zone, which grandfathers every enrolment older than it (server-side `learning_enrollments.enrolled_at`). Production boot rejects an invalid value.
* **F3 (dead prerequisites lock forever): fixed.** Unpublished, lesson-less or unreachable prerequisites are ignored at runtime; authoring and publishing reject impossible configurations; archiving/unpublishing a course that a published course depends on is refused.
* **F4 (completed-lesson media/retakes refused): fixed** by the same exemption.
* The impact query (`operations/sql/prerequisite-enforcement-impact.sql`) now mirrors the new semantics (effective prerequisites, cutoff via `-v enforced_from=…`, exemptions, corrected "started" definition: enrolment pre-creates `not_started` progress rows). Still **not run on Production**.
* §4's options B/C/D are implemented as C (cutoff), with D (data fix) still available.
* **New P1 found and fixed in the same pass:** the Course Builder wrote one activity's title/content into another; it is present in the deployed build (see `WEBSITE_REMAINING_WORK.md` R-1).

Sections 1–12 below are kept as the original review record; where they conflict with this block, this block wins.

## 0. Final release recommendation (original review; superseded by the update above)

**APPROVE the commit and PR now. HOLD the Production deployment until the prerequisite-impact check (§3) has been run and reviewed.**

Why the split: the change set is safe to review and merge to a branch (no migration, no new environment variable, additive API fields, no secrets, tests green, rollback is application-only). The one thing that can hurt real users is that prerequisite enforcement is new: on the first request after deployment, every enrolled student whose course has unmet prerequisites loses access to the lessons they have not finished, and a student who is part-way through a quiz can no longer submit it (§2, findings F1–F2). Whether anyone is in that situation in Production is unknown, and I did not query Production.

Decision rule after the approved impact query (§3):

| Impact query result | Action |
|---|---|
| `students_losing_access = 0`, `students_with_open_attempt_blocked = 0`, no dead prerequisites | deploy as built |
| any of them > 0 | **do not deploy as built**; add the enrolment-date grandfathering of §4 option C (small, schema-free; needs a targeted retest and your approval), or have the schools complete/clear the prerequisites first |

## 1. Deployed state (read-only observation, 2026-11-21)

| Item | Observation |
|---|---|
| Deployed SHA | API `/api/v1/version` and Web `/version.json` both `63c5ac8d8e9110925c688c73737dbde69bcba190` = `origin/main` (PR #178 merge). `git diff HEAD 63c5ac8` is **empty**: Production's tree equals the local base; the candidate is only the uncommitted delta in §5 |
| API | `/api/v1/health` 200 ok (postgres up). CORS allow-list correct: `Origin: https://skynex.best` is echoed, `Origin: https://evil.example` gets no `Access-Control-Allow-Origin` |
| Web | `skynex.best`, `www`, CloudFront domain serve the SPA; unauthenticated protected routes redirect to `/login`; no overflow at 1280/390 px; no JS errors |
| Static assets | JS 200 and CSS 200. **Compression works** (a real GET with `Accept-Encoding` returns `content-encoding: br`, 578 KB on the wire for the 1.99 MB bundle; an earlier version of this document said "uncompressed" because a HEAD request misled me). `index.html` 200 |
| Gaps | `/vite.svg` → 403 on every page (fixed by the candidate); no `Cache-Control` on any static file; no security headers on the Web origin (§7); API sends `X-Powered-By: Express` and `Server: nginx/1.30.6` |
| Not verified | authenticated reads, media permissions, migration ledger O–Q (no credentials, no DB read access) |

## 2. Prerequisite enforcement: safety review

**What it does.** `unmetCoursePrerequisitesSql` (new `course-prerequisites.ts`) returns the course's prerequisite courses the student has not completed, where *completed* means: the prerequisite has ≥ 1 lesson and the student completed every one (same definition the catalog already used). `coursePathWithDb` locks every lesson the student has not completed while any is unmet (completed lessons stay open); `assertPrerequisites` (attempt start, quiz submission, symbolic progression, learning media) throws `409 COURSE_PREREQUISITE_NOT_COMPLETED`. Both fold the check into an existing query: no extra round trip. SQL is fully parameterised; the 409 body discloses prerequisite *course titles*, only to a student already authorised for that course (checks run after enrolment/classroom authorisation) and already visible in the catalog/learning path. Authors and administrators never take this path.

**Findings** (what I verified by reading the code, then by test where noted):

| # | Finding | Severity | Evidence |
|---|---|---|---|
| F1 | A student with an **open quiz attempt** when the release lands cannot submit it: `submitKnowledgeCheck` calls `assertPrerequisites` for any non-evaluated attempt (`progression.service.ts:160/165`). Saving drafts is not blocked; already evaluated attempts still read back | **P1 for rollout** | code read + the existing unit test of `assertPrerequisites`; not exercised end-to-end with a live in-flight attempt |
| F2 | Students part-way through a course lose the lessons they have not finished. By design, but it is a visible behaviour change for current users | **P1 for rollout** | `lms-prerequisite-enforcement` (409 on lesson and sections) |
| F3 | **Dead prerequisites** lock permanently: a prerequisite that is draft/archived, has zero lessons, or is never delivered to the student can never be satisfied, and nothing unlocks the course. Demonstrated on the disposable DB (prerequisite set to `draft` → still required) | P2 | SQL probe (§3), code read |
| F4 | Inconsistency for **already-completed lessons**: the course path keeps them open, but learning media and assignment (re)start for those lessons are refused because `assertPrerequisites` applies the course rule to every lesson | P3 | code read |
| F5 | Locked students get a clear message in the course page and API but no notification, and there is no audit/metric of lock events | P3 | — |
| F6 | No security regression: parameterised SQL, no new endpoint, no new data exposed beyond course titles to authorised students, staff paths untouched | — | review; `lms-security-matrix`, `lms-prerequisite-enforcement` (admin 200), 1248 DB-backed Jest |

**Newly enrolled students: intended rules verified.**

| Enrolment route | Rule | Evidence |
|---|---|---|
| Self-enrolment from the catalog | refused with `409 ENROLLMENT_NOT_ELIGIBLE` while a prerequisite is unmet; eligible once met | `lms-catalog-enrollment` (line 54: 409; catalog lists the reason `Complete … first`) |
| School adds the student to a classroom | enrolment is created, but the course is locked: lessons/sections 409, UI banner naming the missing course | `lms-prerequisite-enforcement` |
| Prerequisite completed afterwards | course unlocks with no other change | `lms-prerequisite-enforcement` (progress rows → 200 + banner gone) |

**Regression matrix** (all 134-test main run on the enforcement build, 0 failed): course progress and completion states (`platform-from-scratch`, `lms-academic`), lesson access and unlock rule (`lms-unlock-rule`), quiz attempts and weighting (`lms-module-quiz`, `lms-unlock-rule`, `qb-import`), learning media (`lms-lesson-media`, `platform-media-archive`) all pass; those courses have no course-level prerequisites, so the new rule is a no-op there. Locked-student behaviour for **media download, attempt start and quiz submission** is covered by the `assertPrerequisites` unit test and code reading, not by a browser/API test; F1 and F4 are therefore the least-tested paths.

## 3. Read-only impact query (prepared, NOT executed on Production)

File: [`operations/sql/prerequisite-enforcement-impact.sql`](operations/sql/prerequisite-enforcement-impact.sql). Run only with explicit approval, through an approved read-only role: `psql "$READONLY_URL" -v ON_ERROR_STOP=1 -f docs/operations/sql/prerequisite-enforcement-impact.sql`.

- One `BEGIN READ ONLY … ROLLBACK` script (the database rejects any write: verified, `cannot execute UPDATE in a read-only transaction`). Returns counts only: no names, e-mails or ids of users.
- Same access chain and same "completed" definition as the server (active enrolment, offering, classroom, classroom membership, school membership, published course).
- Result 1: a `TOTAL` row and one row per school/course with `students_locked`, **`students_losing_access`** (locked and already started: lesson/activity progress or an attempt), **`students_with_open_attempt_blocked`** (F1), `students_locked_not_started`, `pairs_unaffected_course_completed`. Result 2: prerequisites that can never be satisfied (F3).
- Validated on a disposable database in four states: prerequisite completed → 0 locked; prerequisite progress removed and the student started the course → 1 locked / 1 losing access / 0 open attempts, correct school and course; prerequisite switched to `draft` → listed as a dead prerequisite; completed again → 0. The `open_attempt` flag was not exercised with real data (no in-progress attempt existed); its predicate is a plain `status = 'in_progress'` join and runs without error.

## 4. Backward-compatible rollout strategy

1. **Gate (no code):** run §3 with approval. If all three numbers are 0, deploy as built; enforcement then only affects students enrolled from now on.
2. **If non-zero, preferred — option C, enrolment-date grandfathering** (recommended; not implemented): a new optional setting `COURSE_PREREQUISITES_ENFORCED_FROM` (ISO timestamp). The enforcement predicate applies only to enrolments with `learning_enrollments.enrolled_at >= that timestamp`. Set it to the deployment time: every existing enrolment keeps today's behaviour (including open attempts), every new enrolment is subject to the rule; unset it later (after schools adjust prerequisites) to enforce uniformly. Schema-free; one predicate in the two SQL sites plus a config read plus tests; unset = current tested behaviour. Cost: a targeted unit/E2E retest and one env var in the API task definition.
3. Alternative, option B — footprint grandfathering: skip students with any progress/attempt in the course. Smaller, no env var, but it silently exempts only started students and cannot be ended on a date.
4. Alternative, option D — data fix: schools complete, enrol into, or clear the prerequisite (Course Builder, audited) before release; no code change.
5. Independent of the option, fix F3 before wide rollout: treat prerequisites that are archived or have no lessons as satisfied (or reject saving them). And review F4.
6. Whatever is chosen, announce to schools before deploying and keep rollback ready (§9).

## 5. Complete uncommitted change set (11 modified + 10 new, nothing committed)

| Kind | Files |
|---|---|
| **Release** (API) | `services/education-api/src/modules/learning/course-prerequisites.ts` (new), `…/progression.service.ts`, `…/dto/course-path.dto.ts` |
| **Release** (Web) | `web/robot-edu/src/pages/CourseDetail.tsx`, `src/pages/StudentAssignmentDetail.tsx`, `src/components/assignments/AssignmentConfigPanel.tsx`, `src/lib/api.ts`, `index.html`, `public/favicon.svg` (new) |
| Tests | `…/progression.service.spec.ts` (+4 tests); new E2E: `lms-prerequisite-enforcement`, `lms-robot-lab-access`, `lms-robot-lab-assignment`, `student-auth-session-api`, `student-auth-session-ui`; `lms-unlock-rule.spec.ts` (history assertions); `playwright.student-auth.config.ts` (testMatch) |
| Docs / ops | `docs/WEB_LMS_FINAL_ACCEPTANCE.md`, `docs/WEB_LMS_RELEASE_READINESS.md`, `docs/operations/sql/prerequisite-enforcement-impact.sql` (all new), `docs/acceptance/LMS_COMPLETION_HANDOFF.md` (superseded-note) |

**Excluded from the commit:** `docs/acceptance/screenshots/` (untracked before this work; not mine), `web/robot-edu/test-results/` and `dist/` (git-ignored build/test output).

Review result: no unrelated modification (every changed file maps to a numbered item above); no migration, workflow, Terraform, package, lockfile or environment change; typechecks pass. **Secret scan** of every added line and new file: no keys, tokens, private keys, project references or ARNs. Only hits are the local-only fixture credentials `LocalFixturePass-*` for `@vista.test` accounts (already the convention in the tracked `student-auth-api.spec.ts`) and the deliberate negative-test issuer `https://evil.example`. **Safety guard added during this review:** both new real-GoTrue specs now refuse to run against a non-loopback API/auth host (the config they run under has no loopback guard of its own, and the specs use fixture credentials and a global logout).

**Authentication/authorisation review of the new code:** no new route; the lock is evaluated after the existing tenant/enrolment checks, never before, so it cannot reveal other tenants' courses; staff and system administrators bypass it as before; session/refresh/logout behaviour is unchanged and covered by the real-GoTrue session tests (token tampering, `alg:none`, foreign issuer, logout revocation).

## 6. GoTrue plaintext-leak scan (re-run 2026-11-21)

Fresh disposable stack + real GoTrue harness; UI suite 6/6 then API suite 13/13 generated **17 distinct secrets** (temporary passwords, changed passwords, recovery/setup codes) recorded to a private file. Scanned: a full `pg_dump` of the database (all schemas including GoTrue's `auth`, 693 KB), the Education API logs (three processes), the GoTrue container log, and the proxy log. Result: **0 plaintext occurrences** of any secret, and 0 of their URL-encoded or JSON-escaped forms. Positive controls pass (the dump contains the fixture e-mail and bcrypt hashes; the GoTrue log contains auth events). Limit: the proxy log was empty (it logs nothing), so it adds no evidence; hosted Supabase behaviour is not covered.

## 7. Production Web security and cache headers

Findings: the Web origin sets **no** HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy` or CSP, and static files have **no `Cache-Control`**. Cause, from the repository: `infra/terraform/cloudfront.tf` attaches no response-headers policy to the web behaviour (only the managed `CachingOptimized` cache policy and the SPA viewer-request function); `backend-ci.yml` runs a plain `aws s3 sync dist/ … --delete` with no `--cache-control`, then invalidates `/*`. Compression is already correct. CSS/JS are hashed by Vite, so long caching is safe for `assets/` only.

Proposed changes (**not applied; infrastructure/pipeline change needing its own reviewed PR and plan**):

1. Terraform: a `aws_cloudfront_response_headers_policy` attached to the web `default_cache_behavior` (not the API behaviour): `Strict-Transport-Security` max-age 15552000 (no `includeSubdomains`/`preload` initially), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation off), and a **`Content-Security-Policy-Report-Only`** first (the app needs same-origin API, the Supabase project URL, Three.js/Blockly assets; derive the allow-list from `VITE_SUPABASE_URL` and observe reports before enforcing). Do not enforce a CSP on the first release.
2. Workflow: three sync steps: `assets/` with `public,max-age=31536000,immutable`; other files (unhashed images, `favicon.svg`) with `public,max-age=3600`; `index.html` and `version.json` with `no-cache`. Keep `--delete` and the `/*` invalidation.
3. API (optional, application change): `app.disable('x-powered-by')`, `X-Content-Type-Options: nosniff`; hide the nginx version (`server_tokens off`).

None of these blocks the application release; the favicon fix does not depend on them.

## 8. Favicon and static asset output (verified from a fresh `npm run build`, exit 0)

`dist/favicon.svg` (237 B) is emitted; `dist/index.html` links `/favicon.svg` and no longer contains `vite.svg`; `dist/` contains no source maps, `.env*` or key files and no secret patterns (`service_role`, private keys, AWS key ids); `version.json` is added by the deploy job, not the build, and `dist/` is git-ignored. CloudFront's SPA function rewrites only extension-less paths, so `/favicon.svg` is served from S3 after `s3 sync` (post-deploy check: 200, `image/svg+xml`, and no `/vite.svg` request).

## 9. Commit scope, release steps and rollback

**Proposed commits** (on a new feature branch from `release/db-scope-o-q`; nothing was committed):
1. `fix(web): ship a real favicon; keep unsaved rubric edits; show assignment type to students` — `index.html`, `public/favicon.svg`, `AssignmentConfigPanel.tsx`, `StudentAssignmentDetail.tsx`.
2. `feat(education): enforce course prerequisites server-side` — `course-prerequisites.ts`, `progression.service.ts`, `course-path.dto.ts`, `progression.service.spec.ts`, `CourseDetail.tsx`, `api.ts`.
3. `test(web-lms): prerequisites, Robot Lab, quiz history and real-GoTrue session acceptance` — the six E2E files and `playwright.student-auth.config.ts`.
4. `docs(web-lms): final acceptance, release readiness, prerequisite impact query` — the four docs/ops files.

**Release steps (all need approval):** commit → push and PR → `Education CI` green → merge to `main` → `Auto Deploy` → `schema-gate` → `deploy-api` → `deploy-web` behind the reviewer-gated `aws-demo` environment → post-deploy read-only checks (both version SHAs equal the merge commit, `/favicon.svg` 200, health ok, navigation check).

**Rollback.** No schema change, so rollback is application-only and safe: `vista-rollback-api` restores the previous API image; republish the previous Web build. Both directions are additive-compatible: an old Web ignores the new response fields, a new Web treats `unmetPrerequisites` as optional. Without redeploying, an instructor/administrator can clear a course's prerequisites in the Course Builder (audited) to unlock it immediately. Do not edit applied migrations or the ledger. If the impact query was skipped and complaints arrive, roll the API back first (it restores access instantly).

## 10. Production acceptance plan (not executed; no Production resource was created)

Goal: prove workflows A–H once on Production in a removable fixture, after deployment and the post-deploy checks.

| Resource | Spec |
|---|---|
| Schools | `ACC-20261121 School` (+ `ACC-20261121 Other School` only for isolation checks), created by a System Administrator |
| Accounts | 1 School Admin, 1 Instructor, 2 Students (`student-a` enrolled, `student-b` outsider), 1 outsider-school admin; clearly named, no real student data, credentials delivered out of band |
| Content | `ACC Beginner` and `ACC Advanced` (prerequisite `ACC Beginner`), 1 module, 2 lessons, 1 reading + 1 small PNG/PDF, 1 weighted quiz (2 questions), 1 assignment with rubric, 1 `robot_lab` assignment (manual grading). Journey F is Web-side only unless an entitled test robot exists |

**Writes performed (each needs authorisation):** create schools/accounts, courses, one media object in the real private bucket, classroom/offering/enrolment, quiz attempts, one assignment submission and grade, media archive/restore, sign-in/refresh/logout sessions.

**Checks:** journeys A–H; prerequisite lock for `student-a` (API 409 + banner) and unlock after completing `ACC Beginner`; media authorised 200 / outsider 403–404 / archived not served on the **real** S3, IAM and CORS (item 8 of the existing checklist); cross-school 403/404; unauthenticated 401.

**Cleanup scope (exactly the fixture):** close both schools, disable the five accounts, archive the courses, archive the media object (soft archive; there is no hard delete). Hard deletion of rows or objects is not part of the plan. Record every created id before cleanup. A failed step stops the run; use §9 rollback for application faults; no Production database repair is planned or authorised.

## 11. Approvals required (exact)

| # | Approval | Needed for |
|---|---|---|
| 1 | Run `operations/sql/prerequisite-enforcement-impact.sql` against Production through an approved read-only role (or supply its output) | the deploy gate in §0 |
| 2 | Choose the rollout option in §4 (as built / C enrolment-date grandfathering / D data fix) and, for C or the F3 fix, authorise the extra code change and its targeted retest | deploy |
| 3 | Authorise committing the change set on a feature branch (suggested split in §9) | repository rule |
| 4 | Authorise push, PR, and later merge to `main` | pipeline |
| 5 | Approve the `aws-demo` deploy gates (`schema-gate`, API, Web) | deploy |
| 6 | Authorise the separate infrastructure/pipeline PR for headers and caching (§7), or defer it | hardening (not a release blocker) |
| 7 | Provide approved read-only Production credentials for authenticated reads and the migration-ledger check, or confirm out of scope | Production acceptance |
| 8 | Approve the Production acceptance writes and cleanup in §10 | Web LMS formal acceptance |

## 12. Risks (residual)

| Risk | Impact | Mitigation |
|---|---|---|
| Enforcement locks current students; open quiz attempts cannot be submitted (F1/F2) | user-visible, possibly lost work | §3 gate, §4 options, announce to schools, rollback ready |
| Permanent locks from dead prerequisites (F3) | students stuck | impact query part 2, fix F3 |
| Locked-student media/attempt/submission paths verified by unit test and code reading only (F1, F4) | undetected edge case | the Production acceptance in §10 includes the lock/unlock scenario; consider an API-level test before enabling for existing enrolments |
| Production media, S3/IAM/CORS, authenticated reads never exercised by this candidate | known gap | §10 |
| No security/cache headers on the Web origin | hardening gap, not a regression | §7, separate PR |
| In-memory rate limiters are per API task | pre-existing | `WEB_LMS_SECURITY_ACCEPTANCE.md` |
