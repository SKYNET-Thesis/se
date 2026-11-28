# Final Web closeout (2026-11-27)

## Revisions
| Item | Value |
|---|---|
| `main` / Production API+Web | `430ad59` (verified `/api/v1/version`, `version.json`; includes #257) |
| `develop` | `45a8a01` |
| Pending | PR #257 `bugfix/iot-run-evidence-20261127` (evidence for IoT runs), CI green, awaiting owner merge |
| Migration S | applied (run `45962239320`), ledger confirmed; deploy dispatch `45970542970` success |
| Containers / queues | education-api, iot-feedback-worker, recordings-worker, digital-twin healthy; all SQS queues and DLQs 0 |

## Status
- **Accepted on Production:** AUTH, SA, INST (session), STU, WF01, WF02, WF03 lifecycle + Twin, WF04 feedback/release, tenant isolation (see matrix).
- **Not accepted:** WF03 evidence artifact (D-03/D-08): #257 is deployed but the retest failed (IAM prefix missing → 500); fix PR #260 plus an owner-run Terraform apply are required; rubric scoring and instructor evidence opening (depend on D-03).
- **Open low defects:** D-04 (late ACK), D-06 (release without rubric scores).
- **Not run:** Stop/concurrency/expiry/quarantine on Production; Desktop, physical SO-101, VLA.

## Release steps still needed (owner)
1. Merge #260 → `develop`; release PR → `main`; approve `deploy-api`. 2. Owner runs the Terraform plan/apply for the IAM statement `ExperimentEvidenceObjectAccess` (not executed by me). 3. I retest WF03 evidence and WF04 evidence opening. Optional: merge UI polish #261 (tsc, vitest 834/834, build OK).

## Freeze
Feature freeze in force: only the evidence fix and docs remain. Education Platform readiness is reported separately from physical robotics (see `IOT_READINESS_20261128.md`). Verdict: **CONDITIONAL GO** pending #257 deployment and retest.

## Update: 430ad59 retest
WF04 scoring/release/student view PASS; telemetry provenance resolved as *not* R1-synchronised (D-09). LMS/quiz/admin Production regression, simulation safety cases and authenticated before/after UI screenshots were NOT RUN in this session. Paper MCP was not available; Taste-skill guidance was applied only to a minimal shared polish.

## Update: evening (open PRs and what is verified)
- **#260** evidence IAM + 500 fix: CI all green; read-only Terraform plan = 1 in-place change (`ExperimentEvidenceObjectAccess` on `learning-media/experiments/*`), 0 add, 0 destroy. Needs merge → deploy → owner `terraform apply` (with the live IoT/recordings variables) → retest.
- **#262** D-09 Twin run telemetry: root cause verified live (attempt-bound scope 404 after submission; robot-wide viewer closed 4403; fixture shown). Fix + tests; not deployed; live retest pending.
- **#261** UI polish: shared tokens plus consistent card layout on the instructor class page and mobile assignment titles; 14 pages x 4 viewports captured on an isolated local stack (synthetic data) before and after; 8 before/after pairs in `docs/acceptance/screenshots/ui-polish/`. Palette and light theme unchanged. Paper MCP was reachable but refused every call (account setup incomplete): **not used**. The Taste skill was read as guidance only; the application already followed a coherent design system, so the polish is deliberately small. Not deployed.
- Still NOT RUN on Production: LMS/Course Builder/Question Bank/Excel import/Quiz/Gradebook regression, simulation safety cases (need CC-4 long fixture).

## Update: release consolidation (late evening)
Local isolated stack, release-candidate web (UI branch), synthetic fixtures — **local evidence, not Production**:
| Suite | Result |
|---|---|
| Vitest | 834/834 |
| TypeScript, production build | clean / OK |
| ESLint | 0 errors (286 existing warnings across `src`) |
| Playwright `lab-session-management` (WF01) | 4/4 |
| Playwright `lms-assignment-grading` | 1/1 |
| Playwright `lms-module-quiz` | 1/1 |
| Playwright `lms-a11y-smoke` | 13/13 |
| Playwright `platform-route-sweep` | 22/23 before; the one failure is a **stale test** (`/admin/robots` is now a real page since #243, the test still expected a redirect) — expectation removed in #261; legacy-route group 5/5 afterwards |
| Not run | the other ~40 Playwright specs (WF03 runtime evidence, Twin browser specs, QB import, student-auth, …); browser console/network capture beyond what the suites assert |
Production (read-only, designated accounts, `430ad59`): instructor `GET /courses`, `/course-offerings`, `learner-progress` (2), `progress-summary`, `submissions` (4) all 200; student `/me/attempts` 200; student against instructor endpoints (`quiz-results`, `learner-progress`, `submissions`) 404 (isolation PASS). The E2E class has **no quiz delivered** (`published-quizzes` and `/me/quizzes` empty), and no course/quiz/Question Bank/Excel import authoring was performed on Production: those cases stay **NOT RUN/BLOCKED (needs authored test content in the Production E2E org)**.
Course Builder capture: the fixture course returned "Course was not found" for the school-admin route, so no Course Builder before/after exists.
Deployment coverage and the reviewed Terraform plan: `RELEASE_AND_APPROVAL_CHECKLIST_20261127.md`. Paper MCP re-checked: still "account setup incomplete".

## Update: completion sprint (final)
- #257–#262 are merged into `develop` (`2d0b260`); Production is still `430ad59` (re-checked); #263 (D-06) remains an unmerged draft.
- Follow-up PR #264 (not merged): UI composition polish, Robot Resources mobile overflow fix (D-12), stale-test alignment (D-13), WF-01..04 definition package, UI route audit, regression report, corrected architecture docs, IoT handoff verification, Production test-content approval request.
- Regression (local): Playwright 188 pass / 0 fail / 4 skipped / 16 blocked of 208 + harness 18 + 13; Vitest 837; Jest DB+S3 250 pass; Twin 72 pass; R1 35 pass — see `REGRESSION_REPORT_20261127.md`.
- Still open on Production: D-03/D-08 (needs deploy + Terraform apply), D-09 (needs deploy), Production LMS/quiz acceptance (needs approved test content), safety cases NOT RUN. Web Freeze remains **PENDING**.
