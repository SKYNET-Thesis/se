# VISTA — Testing evidence (Report 5)

Revision under test: `develop` `7ac0d58` (merge of #219, 2026-11-26 09:54Z; contains #212–#219). The browser results in §2 were obtained on `18f2dfa` plus the #219 changes, which are identical in code to `7ac0d58`; the GoTrue results in §4 were run on `7ac0d58`. Statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT RUN**. Nothing is marked PASS without a recorded execution. This file consolidates; the detail lives in the linked reports.

## 1. Test levels and environments

| Level | Where it ran | Scope of the claim |
|---|---|---|
| Unit / component (Jest, Vitest) | GitHub Actions `api`, `web` jobs on every PR | code behaviour |
| Real PostgreSQL integration, fresh bootstrap | CI `fresh-bootstrap`, `database-safety` | schema and DB-backed services |
| Runtime and syntax checks | CI `runtime`, `syntax`, `validate-inventory`, `docker` | packaging and runtime contract |
| Browser end-to-end (Playwright, real Chromium) | **local disposable stack**, one spec at a time, local JWKS signer for identities | local simulation only |
| Real GoTrue authentication suite | not in CI; documented harness | see §4 |
| AWS, physical robot, Desktop↔Web | not executed | see §5 |

## 2. Integrated results on the merged tree (2026-11-26)

Environment: PostgreSQL 17 (tmpfs), RustFS, Education API built from the merged tree, CHECKIK adapter + R1 `fake_follower` (`MOCK_RUNTIME`), local Digital Twin. Detail table: [FINAL_SYSTEM_ACCEPTANCE_REPORT.md](FINAL_SYSTEM_ACCEPTANCE_REPORT.md) §3.

| Requirement / workflow | Spec | Status |
|---|---|---|
| WF-01 allocation, school admin, tenant isolation | platform-school-admin (6), lms-independent (9), lms-robot-lab-access | PASS |
| WF-02 assignment → grading → release | lms-assignment-grading, lms-authoring (5), lms-robot-lab-assignment | PASS |
| WF-03 run → evidence → teacher download | wf03-runtime-evidence | PASS (mock runtime) |
| WF-04 review → feedback | lms-assignment-grading, wf03 teacher download | PASS (metadata only; no AI assessment, per registered scope) |
| Integrated WF-01..04 | lms-beginner-lab, platform-full-journey | PASS |
| Authorization matrix | lms-security-matrix | FAIL → fixed (D-09) → PASS |
| Question Bank import | qb-import | PASS |
| Mini-quiz, weights, threshold, dashboard, recommendations | lms-module-quiz | PASS |
| Blockly | blockly-simulation | PASS |
| Digital Twin viewer | digital-twin-browser-viewer | PASS |
| Homepage Desktop section (+390/768/1440 px) | website-public-smoke | FAIL (stale test) → fixed (D-10) → PASS; re-run for the verified-download state on PR #221: Desktop case, 390/768/1440 px and chapters PASS (one case at a time) |
| Accessibility (axe A/AA) | platform-axe | PASS |

## 3. Earlier PR-branch evidence (not re-run; still valid because the code is unchanged)

| Evidence | Status |
|---|---|
| Backend Question Bank + import against real PostgreSQL (101 tests) | PASS (PR #215) |
| Quiz analytics 24, quiz-result service 7, progression controller route tests | PASS (PR #216); controller spec failure D-04 fixed |
| Experiment/physical/runtime/evidence service specs (71 + 25) | PASS (PR #212) |
| qb-pilot-import: 240 pilot questions as drafts, idempotent re-import | PASS (PR #215; needs the private content directory, so not re-runnable from the repo alone) |
| Web Vitest: authoring 119, learning 88, home-v2 52 | PASS (PR branches) |

## 4. CI results

| PR | Result |
|---|---|
| #212–#218 | required checks green at merge |
| #219 (full merged tree + fixes, head `d4131ab`) | api, web, docker, runtime, database-safety, fresh-bootstrap, syntax ×2, validate-inventory: **PASS**; `changes`, `schema-gate`, `deploy-api`, `deploy-web`: skipped by design (`github.ref == 'refs/heads/main'`) |
| Push to `develop` | no workflow runs (workflows trigger on pull_request and push to `main`) |

### Real Supabase GoTrue authentication (local disposable stack, 2026-11-26, merged tree `7ac0d58`)

Harness: `scripts/local_student_auth_harness.sh` (pinned `gotrue:v2.197.0`, real ES256/HS256 keys generated per run, disposable PostgreSQL, two Education API instances with the temporary-password flag ON and OFF). Each spec file ran alone, one worker. No hosted Supabase and no existing Supabase container was used or modified.

| Spec | Result |
|---|---|
| student-auth-api (10: temp password generated/shown once/not stored, forced change, expiry and reissue, idempotent import, authorization and isolation, legacy accounts, flag-off legacy flow, rate limits) | PASS 10/10 |
| student-auth-session-api (real tokens, refresh rotation, logout revocation, forged/tampered/unsigned/wrong-issuer tokens rejected, cross-tenant denial) | PASS 3/3 |
| student-auth-ui (5) | PASS 5/5 on a fresh API process. First run: 4/5; test 4 (reissue from the user list) failed because the preceding API spec had deliberately exhausted the per-administrator reissue limit (5/hour, in-process window) on the same API process. After restarting that API process all 5 passed. Test-order state, not a product defect |
| student-recovery-ui | PASS 1/1 |
| student-auth-session-ui | PASS 1/1 |
| staff-auth-recovery-ui (forgot/reset, forged recovery marker, change password) | PASS 4/4 |

Scope of the claim: the API verifies real GoTrue-issued JWTs and the login/recovery UI works against a real GoTrue. It does **not** verify the hosted Production Supabase project. The student temporary-password feature stays disabled by default and unreleased (needs an owner-approved migration).

## 5. Not run / blocked (do not overstate)

| Item | Status | Reason |
|---|---|---|
| Desktop Lab Station ↔ Web end-to-end | NOT RUN | needs the published Desktop release and ≥3 GiB free RAM |
| AWS IoT simulation E2E | BLOCKED | owner approval pending (`docs/operations/AWS_SIMULATION_E2E_REPORT.md`) |
| Physical SO-101 | BLOCKED | no hardware commissioning approval |
| Hosted Production Supabase project auth | NOT RUN | only a local real GoTrue was used |
| Production behaviour of this revision | NOT RUN | Production runs a pre-RC revision; no deployment authorized |
| Quiz dashboard on a phone viewport | NOT RUN | single-column layout, no dedicated check |
| Dark mode | N/A | the design system has no dark theme |
| Full 57-spec browser suite | NOT RUN | memory safety (two earlier OOM freezes) |

## 6. Defect register

| ID | Sev | Defect | Status |
|---|---|---|---|
| D-01 | P1 | `GET /me/experiments/:id/events` 500 (BigInt) | Fixed #212 |
| D-02 | P2 | Explicit-code re-import reported "invalid" | Fixed #215 |
| D-03 | P3 | CI lint BOM literal | Fixed #215 |
| D-04 | P3 | Controller spec missing `QuizResultService` provider | Fixed #216 |
| D-05 | P2 | Vietnamese pilot explanations repeat the correct option | Open — content review |
| D-06 | P3 | Import not one transaction (per-row) | Open — documented, accepted |
| D-07 | P3 | No dark mode | Open — out of scope |
| D-08 | P1 (release) | Desktop v0.1.0 Draft; download disabled | Open — owner action |
| D-09 | P1 | Import commit validated before authorizing the lesson | Fixed #219 |
| D-10 | P3 | Desktop smoke test asserted the old section | Fixed #219 |

No open P0. No open P1 in product code.

## 7. Limitations

Mock/simulated runs are never physical acceptance; local results are not Production results; no AI inference is registered or tested; the e2e browser suite is not part of CI and was run locally on selected specs.
