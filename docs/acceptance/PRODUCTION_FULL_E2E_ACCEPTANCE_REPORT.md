# Production full end-to-end acceptance report — run R1126-1901

Date 2026-11-26 · Target `https://skynex.best` (API `https://api.skynex.best/api/v1`) · deployed revision **`0b77ad2`** (web and API) · real Chromium, real hosted Supabase authentication, one browser/one case at a time. Companion files: [test case matrix](PRODUCTION_E2E_TEST_CASE_MATRIX.md), [defect register](PRODUCTION_E2E_DEFECT_REGISTER.md), [test-data manifest](PRODUCTION_E2E_TEST_DATA_MANIFEST.md), screenshots in `screenshots/production-e2e/`.

## 1. Result in one table

| Measure | Value |
|---|---|
| Planned (applicable) cases | 93 (one further case not applicable) |
| Executed | 80 |
| PASS / FAIL / BLOCKED / NOT RUN | 74 / 6 / 5 / 8 |
| Execution coverage | 86.0% |
| Pass rate among executed (failures included) | 92.5% |
| Defects | P0 0 · **P1 1** · **P2 3** · P3 6 (3 fixed in open PRs #225, #226, #227; 7 open) |

## 2. Authentication root cause (first reported problem)

The `invalid_credentials` response came from a login attempt with **`admin@vista.demo`** and the password stored in the project's local `.env`. The login form, the Supabase client, the project URL and the public key are correct: the same request sent outside the browser failed identically, and the demo school-admin, instructor and student passwords from the same `.env` match their hosted accounts (read-only bcrypt comparison in the database). The stored hash of `admin@vista.demo` does not match the `.env` value, i.e. the credential in the file is stale. The application has a second System Administrator (a personal account) whose credentials were never supplied to this run. **No implementation defect was found, no existing password was reset, no existing user was changed.** A dedicated E2E System Admin was provisioned and used through the real login form (details and disclosure of the service-role/SQL use in defect register F01).

## 3. Journey outcome

| Step | Result |
|---|---|
| System Admin signs in; creates organization; duplicate refused; search; persistence | PASS |
| School Admin assigned and signs in (new account, not an existing one) | PASS, **by pre-created auth identity**: staff e-mail invitations are blocked by the hosted Supabase e-mail rate limit (**D01, P1**) |
| School Admin: instructor, 2 students, bulk import (3 new, 1 invalid, 1 existing), reissue | PASS (D06: existing code shown as Ready) |
| Student temporary-password lifecycle: forced change, restricted routes, old password and stale session rejected, new login, persistence | PASS ×2 students |
| Offerings, classroom, members, instructor visibility | PASS |
| **WF01 robot allocation** | **BLOCKED**: no UI to register/entitle a robot (L01); new organizations are never eligible; operational robots not touched |
| Course authoring: 2 courses, modules/lessons/activities, rich text, 4 media files via S3 (presign, upload, complete), publish via readiness review | PASS |
| Question Bank: manual single/multiple choice, XLSX template, import preview/duplicates/invalid/default+explicit points/draft default | PASS; **True/False manual authoring FAIL (D04, fixed in #225)**; **drafts cannot be published from the UI (D05)** |
| Mini-quiz authoring (points 1/3/4/2 = 10, pass 70%) and classroom delivery | PASS |
| **WF02** Blockly challenge → classroom assignment with rubric and schedule → publish → student sees it | PASS |
| Student learning: course tree, text, S3 image, attachments, completion, persistence | PASS (video playback and progression-skip not exercised) |
| Quiz: points visible before submit; Student 1 10/10 PASS (Excellent); Student 2 3/10 FAIL (Needs Review) | PASS — matches hand calculation |
| Analytics and recommendations (type, difficulty, topic, objective, High-priority ranking, Review Lesson links) | PASS — values reconciled by hand (section 4) |
| Quiz dashboard on a 390 px phone | PASS (renders, no horizontal overflow; previously NOT RUN) |
| **WF03** Blockly build/save/restore/validate/version/simulate/evaluate/submit | PASS for the browser/schematic simulation and server symbolic evaluation |
| WF03 Production runtime, Digital Twin telemetry, evidence upload | **BLOCKED** (L02): Robot Lab states the backend is not connected; no robot; MQTT intentionally off |
| **WF04** instructor review of program, evaluation, experiment evidence; rubric scores; unreleased hidden; release; student sees score, comments, feedback | PASS (registered scope; no model metadata/recording for a schematic run) |
| Dashboards: instructor, School Admin, System Admin counts | PASS (D07 roster label, D08 instructor status) |
| Authorization/tenant isolation with a second dedicated organization | PASS (404/401 as expected; O02 validation-before-tenant order) |
| axe WCAG 2.1 A/AA on 11 pages | 9 clean; **/login and instructor submission review failed (D09, fixed in #227)** |
| Desktop download | PASS (Phase 01); **Desktop-to-Web integration NOT RUN** |

## 4. Independent calculation of the quiz results

Quiz (10 points): Q1 single, easy, 1 pt, LO-1; Q2 multiple (2 correct), medium, 3 pts, LO-2; Q3 true/false, hard, 4 pts, LO-1, topic Safety; Q4 single, medium, 2 pts, LO-1, topic Blockly (Q1/Q2 have no topic).
Student 1 answered everything correctly: 1+3+4+2 = **10/10 = 100%**, PASS, Excellent (≥90). Student 2: Q1 ✓ (1), Q2 selected one of two correct answers → exact-match, 0 (no partial credit), Q3 ✗ (0), Q4 ✓ (2): **3/10 = 30%**, FAIL (<70), Needs Review (<50); question accuracy 2/4 = 50% (shown separately). Breakdowns observed and matching: multiple 0/1, single 2/2, true/false 0/1; easy 1/1 (1 pt), medium 1/2 (2 of 5 pts), hard 0/1 (0 of 4); LO-1 2/3 correct, 3 of 7 pts (lost 4, 57% → High); LO-2 0/1, 0 of 3 pts (lost 3, 100% → High); topics Blockly 2/2, Safety 0/4, Unspecified 1/4; recommendations ranked by lost points (LO-1 then LO-2) with Review Lesson links.

## 5. Workflow acceptance

| Item | Status |
|---|---|
| WF01 | **BLOCKED** (classroom, negative eligibility and isolation PASS; allocation impossible without a robot entitlement UI/test robot) |
| WF02 | **PASS** |
| WF03 | **PARTIAL**: simulation and evaluation PASS (Production); runtime/Twin/evidence **BLOCKED**; never labelled physical |
| WF04 | **PASS** within the registered scope |
| Complete LMS lifecycle | **PASS with defects** (D04, D05 workarounds; D01 workaround) |
| Hosted authentication | **PASS** for password sign-in, session persistence/rotation and student temporary-password lifecycle; invitation e-mail, recovery e-mail, SMTP/redirect/Site URL **BLOCKED/NOT RUN** (D01) |
| Desktop integration | Download PASS; integration NOT RUN |
| AWS integration | NOT RUN (approval pending); Production MQTT remains off |

## 6. Fix pull requests (targeting develop; not merged, not deployed)

#225 True/False option IDs (D04) · #226 teacher roster label (D07) · #227 login and submission-review accessibility (D09). Each needs a web deploy and a re-test of its Production case.

## 7. Recommendation

**Production: CONDITIONAL GO** for the school LMS lifecycle (organization → classroom → course → quiz/assignment → grading → feedback works end to end on the deployed system with no P0 and correct authorization). Conditions: (1) fix staff e-mail delivery (D01: custom SMTP or higher limit) before onboarding schools by invitation; (2) merge/deploy #225–#227 and re-test; (3) decide on D05 (draft publication UI) or document the Publish-immediately path; (4) WF01 allocation and WF03 runtime acceptance remain **NOT ACCEPTED** until a simulation-only test robot, an entitlement path and a connected runtime are provided. **Not claimed:** physical robot, AWS IoT, Desktop-to-Web integration, hosted Supabase e-mail/redirect settings.

## 8. Cleanup and data

All test data is preserved for review (manifest). Disposable browser profile and credential files remain under `/tmp/vista-prod-e2e` (owner can delete). No Production configuration, secret, infrastructure or existing real data was modified.
