# Full regression report (2026-11-27 late) — LOCAL evidence, not Production

Candidate: `develop` `2d0b260` (#257–#262 merged) + PR #264 (`final/ui-wf-package-20261127`: UI composition polish, mobile table fix, stale-test alignment, docs). Environment: isolated loopback stack (`scripts/local_integration_stack.sh`: PostgreSQL 17 tmpfs, RustFS S3, Education API :3001, local JWKS identities), R1 :8015 + CHECKIK fake follower :8016 for WF-03 specs, real GoTrue harness (`scripts/local_student_auth_harness.sh`) for the auth suites. Synthetic data only. Heavy suites ran strictly sequentially (RAM). Runner and per-spec logs: `~/.vista-acceptance/regression/` (outside Git).

## Totals
| Suite | Discovered | Passed | Failed | Skipped | Blocked | Notes |
|---|---|---|---|---|---|---|
| Playwright, main config (50 spec files) | 208 | **188** | 0 | 4 | 16 | skipped = opt-in `qb-pilot-import` (2), `visual-audit` (2); blocked = `platform-invite-security` (11) and `platform-system-admin` (5): need `local-gotrue-proxy.mjs` + service-role/signing keys, no repository script provisions that harness |
| Playwright, GoTrue harness UI (`SA_WITH_UI=1`, 5 files) | 18 | **18** | 0 | 0 | 0 | |
| Playwright, GoTrue harness API (3 files) | 13 | **13** | 0 | 0 | 0 | first clean run; a repeat run hits the in-memory reissue limiter (HTTP 429, environmental) |
| Vitest (web) | 837 | **837** | 0 | 0 | 0 | 125 files |
| Jest unit (education-api, no DB flags) | 1425 | 1389 | 0 | 36 | 0 | 32 DB suites cannot start without the disposable-DB environment |
| Jest DB + S3 integration (36 suites, local stack DB) | 276 | **250** | 0 | 26 | 0 | `iot-feedback.repository.int` and `runtime-role-security.db` need CI-specific databases; both run in CI (`fresh-bootstrap` green on #260/#262) |
| Python Digital Twin (`--extra simulation`, mujoco installed via uv) | 73 | **72** | 0 | 1 | 0 | resolves the earlier local mujoco failure |
| Python R1 runtime | 35 | **35** | 0 | 0 | 0 | |
| TypeScript (web, API) | — | clean | 0 | — | — | |
| ESLint (web) | — | 0 errors | — | 463 warnings | — | pre-existing |
| Production build (web) | — | OK | — | — | — | |

## Failures found and how each was classified (first full pass: 162 passed / 11 failing specs / 35 skipped-after-failed-setup)
| Spec | Cause | Class | Resolution |
|---|---|---|---|
| `platform-route-inventory` | `/admin/robots` overflowed the document by 410 px at 390 px (absolutely positioned `sr-only` table caption escaped the scroll container) | **Real UI defect (D-12)** introduced with Robot Resources | fixed (`relative` on the table wrapper + `min-w-0` on `main`); 12/12 |
| `wf03-runtime-evidence`, `lms-robot-lab-access`, `lab-session-management` | no R1/CHECKIK processes and no `VISTA_ROBOT_RUNTIME_MAP`; shared-fixture pollution between specs | environment | passed on fresh stacks with R1 + adapter (1/1, 1/1, 4/4) |
| `digital-twin-websocket-revocation`, `digital-twin-revocation` | expected a final submission to revoke Twin viewers (behaviour removed by #253) and "replace robot" semantics (many-to-many since #243) | stale tests | updated to current contract (submission does not revoke; removing an allocation revokes; revocation idempotent); 11/11 and 6/6 — the attempt-bound viewer receiving run frames passes after #262 |
| `lms-independent` | legacy `PUT …/robot-allocation` now adds an allocation instead of replacing | **contract change, owner decision D-11** | expectation updated to the current behaviour; 9/9 |
| `global-course-question-authoring`, `lms-unlock-rule` | import dialog now needs the "I reviewed this preview" confirmation and shows "Imported N questions as published" | stale tests | updated; 1/1 each |
| `staff-auth-recovery-ui`, `student-auth-session-ui`, `student-auth-ui` | live password validation (#250) disables submit instead of showing an alert; `Email` label became `Email address`; reissue limiter exhausted by a previous run | stale tests + environment | updated; 18/18 |
| `platform-invite-security`, `platform-system-admin` | need `local-gotrue-proxy` | environment | **BLOCKED** (not fixed) |
No assertion was weakened to obtain green: expectations were changed only where the product contract had deliberately changed (#243, #250, #253, import confirmation) and each change is explained above; D-11 is flagged for the owner.

## Browser console / network
Specs that collect `pageerror` (`course-builder-delivery`, `student-auth-session-ui`, others) passed; `platform-route-sweep` and `platform-route-inventory` assert no error screen/404 and no horizontal overflow for every navigation link at desktop and mobile. **No separate global console/network error sweep was run.**

## Simulation safety cases (local)
Covered by real-PostgreSQL specs, all green in the DB run above: `lab-session.db.spec` (simultaneous Start ×5 → one winner, controlled termination, quarantine, expiry, Force End), `lab-session-safe-stop.spec`, `lab-session-stop.spec`, `iot-feedback.service.spec` (stale/duplicate feedback), `iot-publish-recovery.*`, Twin `test_attempt_scope` (revocation, isolation). Runtime disconnect on a live run and Stop Execution against a long run were **not executed end to end** (the CHECKIK fake follower completes in about 0.5 s; CC-4 adds a longer fixture).


## Addendum (2026-11-28) — rubric/grading changes (PR #265)
Local, fresh stacks with R1 + CHECKIK: `lms-assignment-grading` 1/1, `lms-beginner-lab` 1/1, `lms-independent` 9/9, `blockly-simulation` 1/1 pass against the new scoring panel (selectors `Points / N`, `Save assessment` preserved). Jest `rubric-score` 6, `assessment*.spec` 33, Vitest 282 (pages + queries) pass; tsc clean. **Not re-run after #265:** the full 208-test Playwright pass, the Jest DB suite and the GoTrue harness (the change touches only grading read paths and the instructor/student grading components; the grading-related specs above were re-run).
Remaining inconsistency: the student *assignment list* still derives `assessment_score/assessment_max` from scored rows only (`learning.service.ts` ~L537); it differs from the canonical `summary` only for a partially graded, already released legacy grade. Tracked as D-15.


## Addendum (2026-11-28) — simulation safety cases on a long-running isolated fixture (LOCAL, PASS 4/4)
`web/robot-edu/tests/e2e/wf03-safety-long-run.spec.ts` rewrites the disposable WF-03 fixture's submitted program to ~15 s of waits (disposable DB only; no Production timing, no hardware) and drives the real R1 + CHECKIK fake follower:
| Case | Result |
|---|---|
| Stop Execution (instructor): current run ends (not completed), reservation stays `active` | **PASS** |
| Concurrent control: a repeated start returns the SAME run (idempotent, no second command); another student cannot read or stop it | **PASS** (a second student's own start on a busy robot is covered by the real-PostgreSQL specs) |
| End Lab Session during a run: no new runs, safe stop requested, `released` after the runtime confirms | **PASS** |
| Session expiry (expired `expires_at`): session terminated, run stopped | **PASS** |
| Runtime disconnect mid-run: never reported `succeeded` (503/`failed`); End with the runtime unreachable → `quarantined`; after R1 restarts and the status is reconciled, release succeeds | **PASS** |
Findings: quarantine recovery needs the run's status to be reconciled after the runtime returns (a student/status read); nothing releases it autonomously — acceptable, documented in the handoff (CC-3).


## FINAL regression on the integrated candidate — develop `1f5402f` (2026-11-28, LOCAL; Production untouched)
Isolated stack, R1 + CHECKIK fake follower, real GoTrue harness; heavy suites strictly sequential. Per-spec logs: `~/.vista-acceptance/regression/` (outside Git).
| Suite | Discovered | Passed | Failed | Skipped | Blocked |
|---|---|---|---|---|---|
| Playwright main config (51 spec files, incl. the new safety spec) | 212 | **207** | 0 | 5 | **0** |
| Playwright GoTrue harness UI (5 files) | 18 | **18** | 0 | 0 | 0 |
| Playwright GoTrue harness API | 13 (9 on a UI-first run) | **13** (clean API-first run) | 0 | 0 | 0 — a UI-first run exhausts single-use fixtures/limiter (environmental, documented) |
| Jest, whole suite with real PostgreSQL + S3 flags | 1671 | **1645** | 0 | 26 | 2 suites need CI-only databases (`runtime-role-security.db`, `iot-feedback.repository.int`; green in CI `fresh-bootstrap`) |
| Vitest (web) | 837+ | all pass (last run 282 targeted + 837 full) | 0 | 0 | 0 |
| Twin pytest (+mujoco) / R1 pytest | 73 / 35 | 72 / 35 | 0 | 1 / 0 | 0 |
| Question Bank **pilot import** (`VISTA_PILOT_DIR`, normalized from the local pilot package: 180 Vietnamese + 60 English rows) | 2 | **2** | 0 | 0 | 0 |
| **Visual audit** (opt-in) incl. machine overflow check at 1440/390 | 2 | **2** | 0 | 0 | 0 (`overflow.json`: every screen 0 px) |
| Simulation safety (long-running fixture) | 4 | **4** | 0 | 0 | 0 |
Playwright skips: 4 opt-in specs now run separately (pilot import 2, visual audit 2 — counted passed above, not in the 207) plus 1 intentional skip in `platform-invite-security`.
**`platform-invite-security` (10 pass) and `platform-system-admin` (5 pass) were previously BLOCKED:** resolved by running the repository's `local-gotrue-proxy.mjs` (real GoTrue + signing key converted to PEM + service-role/anon keys from the harness directory) on :54323, and pointing `platform-system-admin` at the harness API (:3012, which has a real service-role key for GoTrue invitations).
Not done: a separate global browser console/network sweep beyond the suites' own `pageerror`/overflow/404 assertions and the visual-audit overflow check.


## Addendum (2026-11-28, after the policy resolution) — LOCAL
| Check | Result |
|---|---|
| **Global browser console + network sweep** (`console-network-sweep.spec.ts`: 45 routes across anonymous/admin/school admin/instructor/student): page errors, `console.error`, failed requests, HTTP ≥ 400 | **0 findings** (5/5 tests) |
| Quiz **taking** (weights shown before submission: total points, pass mark, per-question "1 point"/"2 points", question navigator, no answers revealed) | **Reviewed** — `docs/acceptance/screenshots/ui-final/quiz-taking-weights-visible.png` (`lms-module-quiz` passes) |
| Quiz results (exact-match note, weighted score, rating) | Reviewed (earlier) |
| D-06 release gate | Jest DB 90/90 (partial draft, feedback-only draft, `RUBRIC_INCOMPLETE`, explicit zero, release, lock, non-rubric unchanged); Playwright grading specs 4/4 |
| D-17 | unit 3/3; safety spec 4/4 with autonomous recovery |
| Gradebook | unit, component, real-PostgreSQL (partial → complete, student = instructor = Gradebook, `attempt.score` null) |
| Rubric levels (**needs migration T**, draft #272) | Jest DB level spec; Vitest templates (maxima 36/40/48/40); Playwright `rubric-levels-flow` passes: template → student sees descriptors → partial draft (3 of 5) → release refused → complete (4,3,3,4,2) = **31/36, 86.11 %, 8.61/10** → student result and Gradebook agree → locked |
Not re-run after these changes: the complete 212-test Playwright pass and the Jest full-suite (run on `cfaae15`; the changed areas were re-run as listed).


## FINAL integrated regression on develop `04fed8b` (2026-11-28, LOCAL)
| Suite | Result |
|---|---|
| Vitest (web) | **843/843**; TypeScript clean (web and API); production build OK; ESLint 0 errors |
| Jest, whole suite with real PostgreSQL + S3 flags | 1682 tests: **1656 pass, 0 fail**, 26 skipped; 2 suites need CI-only databases (`runtime-role-security.db`, `iot-feedback.repository.int`; green in CI `fresh-bootstrap`) |
| Playwright main config (50 spec files: grading, LMS, quiz, Gradebook-adjacent, Twin, WF-03 evidence, lab-session, safety, console/network sweep, …) | **197 pass, 0 fail, 4 skipped (opt-in)**; the five shared-fixture specs pass on fresh stacks (6+11+4+9+1) |
| GoTrue-proxy specs `platform-invite-security` / `platform-system-admin` | 10 + 5 pass (run earlier on `cfaae15`; unchanged code) |
| GoTrue harness UI 18 / API 13 | pass on `cfaae15` (auth code unchanged since) |
| Rubric levels (draft #272, needs T) | `rubric-levels-flow` pass on the T-applied disposable DB |
| Console/network sweep | 45 routes, **0 findings** |
Not re-run on `04fed8b`: GoTrue harness suites and Twin/R1 pytest (no changes in those areas).
