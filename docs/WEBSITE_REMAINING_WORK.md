# VISTA website — remaining work (2026-11-21)

Companion to [`WEBSITE_WIDE_ACCEPTANCE.md`](WEBSITE_WIDE_ACCEPTANCE.md) (module IDs such as B5 refer to its matrix). Classification: **P0** blocks use of the site, **P1** corrupts data or blocks a release, **P2** degraded behaviour or a missing verification, **P3** polish. Types: *implementation defect*, *missing feature*, *product decision*, *environment restriction*, *approval requirement*, *test gap*.

## 1. P0 / P1

| ID | Sev | Type | Item | Files / owner | Next step |
|---|---|---|---|---|---|
| R-1 | **P1** | implementation defect, **already in Production** | The Course Builder cross-activity overwrite (D-1 in the acceptance document) is present in the deployed build `63c5ac8`. It is fixed in the uncommitted candidate | `web/robot-edu/src/components/authoring/CourseContentEditor.tsx` (fix), `tests/e2e/lms-draft-discard.spec.ts` (regression) | Commit and deploy through the pipeline (approval). Consider a read-only Production query for activities whose title duplicates a sibling's in the same lesson to find possibly damaged content (heuristic only, see `WEBSITE_RELEASE_READINESS.md` §6) |
| R-2 | **P1** (gate) | approval requirement | Production write acceptance (journeys A–H and the new flows) has not been run | `docs/WEB_LMS_RELEASE_READINESS.md` §10 | Authorise the isolated fixture plan |
| R-3 | **P1** (gate) | approval requirement | Nothing is committed, pushed, merged or deployed (52 files incl. docs) | — | Authorise commit / PR / merge / protected deploy |

No P0 is open.

## 2. P2

| ID | Type | Item | Module | Files | Next step |
|---|---|---|---|---|---|
| R-4 | product decision | Profile management: profile fields (name, contact) are read-only; there is no backend endpoint to edit them. Students cannot change their own password after the first-login change (the server accepts it only while a first-login change is pending, by design: admins never set passwords, recovery is by Recovery Code) | B5 | `web/robot-edu/src/pages/AccountSettings.tsx`, `services/education-api/src/modules/education-admin/student-auth.service.ts` (`changeFirstLoginPassword`) | Decide whether a self-service profile / student voluntary change is in scope; if yes it is a new backend workflow and needs its own tests |
| R-5 | environment restriction | Staff password recovery is verified with a link generated through GoTrue's admin API; e-mail delivery, redirect URL allow-list (`/reset-password`), link lifetime and send-rate limits on hosted Supabase are **not verified** | B4 | `web/robot-edu/src/pages/ForgotPassword.tsx`, `ResetPassword.tsx`; hosted Supabase Auth settings | Operator checklist: add `https://skynex.best/reset-password` to the redirect allow-list, send a real reset mail from a test staff account |
| R-6 | environment restriction | MuJoCo SO-101 model is read from outside the repository; 2 Twin tests are skipped without it; no hardware synchronisation is claimed or verified | H3 | `services/digital-twin` (`ASSET_PROVENANCE.md`), `docs/acceptance/ROBOT_3D_DIGITAL_TWIN_HANDOFF.md` | Vendor the licensed asset or document the external path in CI; hardware needs a supervised commissioning session (BLOCKED) |
| R-7 | environment restriction | Physical Robot Lab path (WF-03 physical): only the software fake-follower runtime is verified; no hardware, none commanded | G2 | `services/robot-runtime`, `web/checkIk/wf03_command_adapter.py` | Supervised hardware commissioning gates (outside Web scope) |
| R-8 | missing infrastructure | Web origin sends no `Cache-Control`, HSTS, `X-Content-Type-Options`, frame, referrer, permissions or CSP headers; API sends `X-Powered-By: Express` and the nginx version | L4 | `infra/terraform/cloudfront.tf`, `.github/workflows/backend-ci.yml` (`aws s3 sync`), `services/education-api/src/main.ts` | Separate infrastructure PR; proposals are in `WEB_LMS_RELEASE_READINESS.md` §7 |
| R-9 | product decision | Enabling prerequisite enforcement for existing Production courses: the policy exists (`COURSE_PREREQUISITES_ENFORCED_FROM`, default disabled) but the value and date are an operator decision | C7 | API task environment (not in this repo's tracked config) | Run the approved read-only impact query, choose the date, set the variable |
| R-10 | test gap | Production authenticated reads, media permissions, migration ledger O–Q never re-verified | all | — | Read-only credentials |
| R-11 | test gap | Search: browser assertions cover filters and people/member search; catalog/course free-text search and the organisation filter are covered by API/unit tests only | J1 | `web/robot-edu/src/pages/CourseCatalog.tsx`, `Courses.tsx`, `admin/AdminOrganizations.tsx` | Add browser assertions |

## 3. P3 and notes

| ID | Item | Files |
|---|---|---|
| R-12 | The error boundary is verified by a unit test; a forced render crash was not staged in a real browser | `web/robot-edu/src/components/ui/AppErrorBoundary.tsx` |
| R-13 | `visual-audit` screenshot specs (opt-in) were not run: they overwrite the existing untracked `docs/acceptance/screenshots/` | `web/robot-edu/tests/e2e/visual-audit.spec.ts` |
| R-14 | Multiple-choice quiz grading is covered by DB/unit suites; the browser journeys use single-choice questions | `web/robot-edu/tests/e2e/lms-module-quiz.spec.ts` |
| R-15 | No audit-log viewer or settings UI exists (no requirement defines them); `WebSettings` is an honest placeholder | `web/robot-edu/src/pages/WebSettings.tsx` |
| R-16 | Desktop installers do not exist; the homepage says so. Real download links may only be added after signed builds are published (Desktop repository, Codex) | `web/robot-edu/src/components/home-v2/DesktopDownloadChapter.tsx` |
| R-17 | Staff `Forgot password?` is a link to a separate page; the student recovery remains inside the sign-in page | `web/robot-edu/src/pages/Login.tsx` |

## 4. Integration blockers

None internal to the website. External: hosted Supabase Auth configuration (R-5), AWS/CloudFront headers (R-8), Production credentials (R-10), hardware (R-6, R-7).

## 5. UX / responsive

No open responsive defect: public pages, sign-in, forgot-password and the LMS pages fit 1440, 768 and 390 px without horizontal scrolling (E2E). The locked-course banner (C7) and the assignment-type label (G1) were added without redesigning existing screens.

## 6. Production acceptance gaps

49 required modules; 3 accepted on Production (A1–A3, read-only). The other 46 need authenticated or write access, i.e. the approved fixture plan in `WEB_LMS_RELEASE_READINESS.md` §10, which also has to cover the new candidate flows (staff password recovery on hosted Supabase, prerequisite lock/unlock, draft discard).
