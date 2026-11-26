# Web acceptance matrix — targeted browser run, 2026-11-26

Revision: `develop` 4fb7efe + PR #212. Environment: disposable PostgreSQL 17 + RustFS (tmpfs, loopback), Education API built from this revision, local JWKS signer (test identities), real Chromium via Playwright, one worker, sequential. **Scope: LOCAL isolated acceptance only.** No Production, AWS or hosted Supabase involved.

Command: `playwright test lms-independent lms-assignment-grading lms-security-matrix lms-module-quiz lms-authoring` → **17 passed, 0 failed (1.8 min)**. WF-03 (separate): 1 passed ×4 on fresh fixtures — see `WF03_ACCEPTANCE_REPORT.md`.

| Requested journey | Evidence (spec › test) | Result |
|---|---|---|
| School Admin classroom management | lms-independent › directory searches/filters/deep link; creates classroom and enrolls a student | PASS |
| WF-01 robot allocation → instructor visibility | lms-independent › WF-01 school admin allocates an entitled available robot and the authorized instructor sees it | PASS |
| RBAC / tenant isolation | lms-security-matrix › other-school admin, wrong role, non-owner classmate, unauthenticated refused; lms-independent › cross-school classroom/roster denied; instructor authoring school-scoped | PASS |
| Instructor assignment creation, rubric, schedule, publish | lms-assignment-grading › journey; lms-authoring › Publishing policy (School Admin cannot publish, Instructor can) | PASS |
| Course and lesson authoring → student sees published course | lms-authoring › Journey 1 | PASS |
| Student learning navigation, enrolment persistence | lms-independent › persists across refresh and relogin; My Learning recovers via Retry | PASS |
| Mini-quiz placement, **points visible before submission**, weighted scoring, **pass threshold**, retake unlocks next module | lms-module-quiz › module-end quiz | PASS |
| Question → quiz → assign → student submits → graded result | lms-authoring › Journey 2 | PASS |
| Student submission (ProgramVersion) → instructor assessment → feedback | lms-independent › Student submits a ProgramVersion and instructor assesses and returns feedback; lms-assignment-grading (grade, release, audited correction, re-release) | PASS |
| Robot Lab run → evidence → instructor review (WF-03/WF-04) | wf03-runtime-evidence (see WF03 report) | PASS (local fake follower) |
| Session expiry / validation errors | lms-authoring › Failure recovery | PASS |
| Responsive (320–1440) and console errors on core pages | lms-independent › no overflow; lms-authoring › pages | PASS |

## Not covered by this run (do not overstate)

- Authentication through real GoTrue (login UI, password recovery) uses a separate suite (`playwright.student-auth.config.ts`): **NOT RUN today**; the run used the local JWKS signer.
- Blockly authoring spec (`blockly-simulation`), Twin viewer specs, accessibility (axe) and route-sweep specs: **NOT RUN today** (earlier sprint results are not re-claimed).
- Production behaviour: **NOT VERIFIED**. Physical robot: **BLOCKED**. AWS E2E: **NOT RUN / BLOCKED**.
- No P0/P1 defect was found in this run; no fix was needed.
