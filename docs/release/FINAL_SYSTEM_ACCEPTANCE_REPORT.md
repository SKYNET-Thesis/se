# VISTA — Final system acceptance report (release candidate, defense 2026-12-04)

Status: **Release candidate = `develop` `7ac0d58`** (all of #212–#219 merged on 2026-11-26). Integrated acceptance was run on `18f2dfa` plus the #219 changes (code-identical to `7ac0d58`). Local results are from a disposable stack on the merged tree, executed one spec at a time with one worker. Section 1 states which revision each result belongs to.

## 1. Source revision and PR status

| Item | Value |
|---|---|
| `develop` when the PRs were cut | `4fb7efe` (PR #211) |
| Integrated `develop` revision for the final pass | **`18f2dfa`** (merge of #218; PRs #212–#218 all MERGED, verified with `gh pr view`) |
| Fix PR from the integrated pass | #219 — **MERGED** 2026-11-26 09:54Z as `7ac0d58` (head `d4131ab`): authorization-ordering fix, Desktop smoke-test update, results docs. **Release candidate revision: `7ac0d58`** |
| CI on push to `develop` | none: workflows trigger on `pull_request` and `push: main` only, so the merged tree was verified by PR #219's CI (it contains the whole merged tree) and local runs |

| PR | Content | Head | Required CI at merge |
|---|---|---|---|
| #212 | WF-03 events BigInt fix + regression tests + WF-03 report/screenshots | `3f27655` | all green (deploy jobs skipped) |
| #213 | Education content validation report (docs) | `61d5b72` | all green |
| #214 | Web acceptance matrix, WF-04 requirement check, AWS E2E approval plan (docs) | `a68750c` | see §3 |
| #215 | Question Bank import extension + pilot normalization + English demo course | `391f12a` | see §3 |
| #216 | Quiz result dashboard, rating, deterministic recommendations | `0e0b90f` | see §3 |
| #217 | Homepage Ubuntu amd64 Desktop download (unavailable until verified) | `6b7128d` | see §3 |

Dependencies (historical, before merge): all branches are based on current `develop` (0 commits behind). Pairwise `git merge-tree` shows no conflicts (#215/#216 both touch `web/robot-edu/src/lib/api.ts` in different regions). No PR contains a database migration. Recommended merge order: #212 → #213 → #214 → #215 → #216 → #217.

## 2. Registered workflows (local, isolated PostgreSQL + real browser; **not** AWS, **not** physical)

| Workflow | Evidence | Result |
|---|---|---|
| WF-01 School Admin → Classroom → Robot Allocation → instructor visibility | lms-independent (allocation, cross-school denial) | PASS (local) |
| WF-02 Instructor → Assignment → Publish → Student access → Submission | lms-assignment-grading, lms-authoring, lms-independent | PASS (local) |
| WF-03 Student → Run → API → R1 → ACK/status → Telemetry → Twin → Experiment → Evidence | wf03-runtime-evidence ×4 fresh fixtures; 71 service specs | PASS (local, fake follower = `MOCK_RUNTIME`) |
| WF-04 Evidence + Model Metadata → Instructor review → Assessment → Feedback | wf03-runtime-evidence (teacher download), lms-assignment-grading; requirement check | PASS (local). Registered scope needs model **metadata**, not AI assessment (`WF04_REQUIREMENT_CHECK.md`); `modelMetadata` is empty when no model is attached |

## 3. Integrated acceptance on merged develop (`18f2dfa` + #219 changes), local, sequential

Each row is one spec file run alone (`--workers=1 --retries=0`), memory-guarded (abort below 3 GiB available). Disposable stack: PostgreSQL 17 (tmpfs), RustFS, Education API built from the merged tree, CHECKIK adapter + R1 in `fake_follower` (MOCK_RUNTIME), local Digital Twin, local JWKS signer.

| Checkpoint | Spec | Result |
|---|---|---|
| WF-03 student Run → R1 → ACK → telemetry → Twin → evidence → teacher download, events route, peer/foreign denial | wf03-runtime-evidence | PASS 1/1 |
| WF-01 school admin pages, roles, instructors, tenant isolation, phone layout | platform-school-admin | PASS 6/6 |
| WF-01..04 integrated: classroom, robot allocation, Blockly lab, auto simulation grading, review, release, reflection | lms-beginner-lab | PASS 1/1 |
| Robot Lab access/allocation/assignment and school isolation | lms-robot-lab-access, lms-robot-lab-assignment | PASS 1/1 each |
| WF-02 assignment, rubric, submit, grade, release, audited correction | lms-assignment-grading | PASS 1/1 |
| Authoring, quiz build, student result, publish policy, responsive | lms-authoring | PASS 5/5 |
| LMS independent flows incl. allocation, school scoping, relogin, viewport widths | lms-independent | PASS 9/9 |
| System Admin → School Admin → Instructor → Student → grade → verification | platform-full-journey | PASS 1/1 |
| Authorization matrix (other school, wrong role, classmate, unauthenticated, student multipart import) | lms-security-matrix | **FAIL, then PASS** after D-09 |
| Question Bank import (template, preview, errors, duplicates, confirm, import, quiz points, weighted result) | qb-import | PASS 1/1 |
| Mini-quiz weights, pass threshold, dashboard, recommendations, owner scope | lms-module-quiz | PASS 1/1 |
| Blockly build → validate → simulate → submit → review → release | blockly-simulation | PASS 1/1 |
| Digital Twin browser viewer (six joints, simulation label, stale/reconnect) | digital-twin-browser-viewer | PASS 1/1 |
| Seeded curriculum; beginner course needs no robot/AI | lms-curriculum | PASS 1/1 |
| Homepage: Ubuntu unavailable, Windows/macOS Coming Soon, no AppImage, copy disabled, 1440/768/390 px without overflow | website-public-smoke | **FAIL (stale test), then PASS** after D-10 |
| axe WCAG A/AA: school admin, instructor, student, dialogs | platform-axe | PASS 5/5 |

Not re-run here (earlier evidence is not re-claimed as integrated): the full 57-spec browser suite, qb-pilot-import (needs the private content directory; PR #215 evidence), real-GoTrue student/staff auth suites, Desktop E2E, mobile-viewport dashboard.
Full unit/typecheck/lint/build/DB regression was deliberately not run locally (earlier OOM freezes); it ran in GitHub Actions on PR #219, which contains the whole merged tree (see §10).

## 4. Feature acceptance

| Item | Result | Notes |
|---|---|---|
| XLSX template download | PASS | `Question_Bank_Template.xlsx`, generated by the same code as the API |
| Import: preview, row errors, duplicates, error-report CSV, explicit confirmation bound to file hash, draft by default, default points 1/2/3, point overrides, true/false | PASS (local) | per-lesson import; rows succeed/fail independently (documented, not one transaction) |
| Teacher access (not admin-only) | **PASS** | instructors of the owning school import (qb-import spec runs as the school instructor); System Admin for global courses; other school, student → 403/404 |
| Pilot: 240 questions (180 VI + 60 EN) imported as drafts, idempotent re-import | PASS (local) | VI explanations are source echo; EN explanations generated draft `PENDING_REVIEW` |
| Mini-quiz, auto grading, points before submission, pass threshold, retake | PASS | existing engine, unchanged |
| Dashboard: weighted score, PASS/FAIL, rating, type donut, difficulty, objective analytics, recommendations, Review Lesson | PASS (desktop viewport) | |
| Dashboard on mobile viewport; dark mode | **NOT RUN / N/A** | mobile dashboard not exercised; app has light tokens only |
| Homepage Desktop download | PASS as **unavailable state** | release is Draft; no public artifact |
| Real GoTrue authentication (API + UI) | **PASS** on `7ac0d58`, local disposable real GoTrue v2.197.0: API 13/13, UI 11/11 (one order-dependent rate-limit false failure, see Report 5 §4) | not the hosted Production Supabase project |
| Blockly, Twin viewer, axe | **PASS** on the merged tree (§3) | |

## 5. Classification of integration evidence (kept separate)

| Level | Status |
|---|---|
| Local isolated E2E (this report) | PASS as above |
| Desktop full E2E (Lab Station ↔ Web) | **NOT RUN** (needs ≥3 GiB free; Desktop v0.1.0 unpublished) |
| AWS Simulation E2E | **NOT RUN / BLOCKED** — approval request in `docs/operations/AWS_SIMULATION_E2E_REPORT.md` |
| Physical SO-101 | **BLOCKED** — no hardware availability / commissioning approval |

## 6. Defect register

| ID | Sev | Defect | Status |
|---|---|---|---|
| D-01 | P1 | `GET /me/experiments/:id/events` HTTP 500 (BigInt id) | Fixed in #212 |
| D-02 | P2 | Re-import of explicit-code rows reported "invalid" instead of "already imported" | Fixed in #215 |
| D-03 | P3 | CI lint: BOM literal in pilot spec (`no-irregular-whitespace`) | Fixed in #215 |
| D-04 | P3 | `ProgressionController` contract spec lacked `QuizResultService` provider | Fixed in #216 |
| D-05 | P2 | Question explanations in the Vietnamese pilot repeat the correct option | Open — content review needed |
| D-06 | P3 | Import is per lesson, rows not in one transaction | Open — accepted, documented |
| D-07 | P3 | Dark mode absent from the design system | Open — out of scope |
| D-09 | P1 | #215 regression: `importCommit` returned 400 (confirm validation) to an unauthorized student before authorizing the lesson | **Fixed in #219**, DB regression test added; found by lms-security-matrix (not part of CI) |
| D-10 | P3 | `website-public-smoke` asserted the pre-#217 three-platform section | Fixed in #219 (honesty assertions kept and tightened) |
| D-08 | P1 (release) | Desktop v0.1.0 still Draft; download cannot be enabled | Open — owner action |

No open P0. No open P1 in the web/API product code.

## 7. Known limitations

Fake follower is not hardware; local mock evidence is not AWS or physical acceptance; AI/VLA inference is not implemented (not registered as required); Desktop Robotics Profile needs an external Python environment and Edge checkout; Production runs a pre-RC revision.

## 8. Remaining blockers (owner)

1. Merge the closure documentation PR (Report 5/6, release notes). Release-candidate code revision is already `7ac0d58`.
2. Publish Desktop v0.1.0 (still Draft; DEB and SHA256SUMS return 404 anonymously, checked 2026-11-26), then verification and `DESKTOP_RELEASE.verification`.
3. Approve or revise the AWS E2E plan (`docs/operations/AWS_SIMULATION_E2E_REPORT.md`); physical commissioning approval for hardware.
4. Production deployment, if desired, needs explicit approval (`RELEASE_CANDIDATE_CHECKLIST.md`). Production runs a pre-RC revision and has not received these changes.

## 9. Recommendation

**Local demo: GO** on merged `develop` plus #219, from the local simulation stack per `DEFENSE_DEMO_RUNBOOK.md`, with every simulation screen labelled as such.
**Production: CONDITIONAL GO**: only after the owner opens/approves the `develop` → `main` release PR with green CI, approves the deployment, and the production smoke tests in the checklist pass. No production acceptance is claimed.
**NO-GO** for claiming AWS, Desktop-published or physical-robot acceptance.

## 10. Live CI table

PR #219 (full merged tree plus fixes, head `d4131ab`, now merged as `7ac0d58`), final: api, web, docker, runtime, database-safety, fresh-bootstrap, syntax ×2, validate-inventory = **9 pass**. Skipped by design: changes, schema-gate, deploy-api, deploy-web run only on `main` (`if: github.ref == 'refs/heads/main'` in `backend-ci.yml`). Failures found and fixed earlier: #215 lint (D-03); #216 api + fresh-bootstrap (D-04).
