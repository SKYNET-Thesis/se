# VISTA — defense demo runbook (December 4, 2026)

**What this demo is:** the full student/instructor product on a **disposable local stack** with the **fake follower** runtime. Everything on screen is labelled `Simulation` / `Mock runtime`. It is **not** AWS acceptance and **not** physical-robot execution — say so when presenting. Production (`https://skynex.best`) can be shown read-only for the public site and sign-in page.

## Roles (no passwords are stored in the repo)

Local test identities are issued by the local JWKS signer, one per role: **System Admin**, **School Admin**, **Instructor**, **Student**, plus **Other-school Admin** and **Other-school Student** for the denial demonstrations. Sign in through the local signer page / token endpoint (`http://127.0.0.1:54323/token?sub=<authUserId>` for the automated path; the authUserIds are in the fixture JSON the seed script writes under `/tmp`). Production accounts are not used.

## Prerequisites (do these before the audience arrives)

1. ≥ 6 GB available RAM (the stack plus a browser needs ≈4 GB; two earlier acceptance runs froze a 14 GiB laptop when a full test suite ran alongside it, so do not run test suites during the demo); close browsers and IDEs. Docker running; ports 55497, 59000, 3001, 8015, 8016, 8767, 54323, 4173 free (the local Supabase may own 54321 — that is why the signer uses 54323).
2. `scripts/local_integration_stack.sh up` (PostgreSQL 17 + RustFS on tmpfs, schema bootstrap, runtime role, fixtures, API on :3001). Wait for `stack up`.
3. Start the fake-follower chain for the Robot Lab part: CHECKIK adapter (`VISTA_CHECKIK_MODE=fake_follower VISTA_CHECKIK_ADAPTER_TOKEN=<local> python3 web/checkIk/wf03_command_adapter.py --port 8016`), then R1 (`VISTA_RUNTIME_TOKEN=<local> VISTA_CHECKIK_ADAPTER_TOKEN=<local> python3 services/robot-runtime/src/server.py --config services/robot-runtime/config/runtime.fake-follower.example.json`), then restart the API with `VISTA_ROBOT_RUNTIME_MAP='{"<robotId from the WF-03 fixture>":{"baseUrl":"http://127.0.0.1:8015","logicalIdentity":"vista-demo-so101-001"}}'` and the same `VISTA_RUNTIME_TOKEN`. The Digital Twin is started by the WF-03 spec on :8767 (or `uvicorn vista_digital_twin.app:app` from `services/digital-twin`).
4. Web: `npm run dev -- --host 127.0.0.1 --port 4173` in `web/robot-edu` with `VITE_API_BASE_URL=http://127.0.0.1:3001/api/v1`, `VITE_SUPABASE_URL=http://127.0.0.1:54323`, `VITE_SUPABASE_ANON_KEY=local-e2e-anon-key-not-a-secret`, and `node tests/e2e/local-jwks-server.mjs` (port from `VISTA_E2E_JWKS_PORT=54323`).
5. Fixtures are **single use** (the WF-03 attempt is consumed by one run). Re-seed the WF-03 fixture before each rehearsal (`dist/scripts/wf03-local-e2e-fixtures.js seed`, then restart the API with the new robot id in the map).

## Order: core path 12–14 minutes (steps 1–4, 6–10); steps 5 and 11 only if time remains

| # | Step | Role | What to show / say |
|---|---|---|---|
| 1 (≈1.5 min) | School → Classrooms → classroom → Robot allocation | School Admin | allocate an entitled robot; other-school admin gets "not found" (WF-01) |
| 2 (≈1.5 min) | Teacher → Assignments: create with rubric and schedule, publish | Instructor | WF-02 |
| 3 (≈1 min) | My Learning → course → module reading | Student | learning navigation; module-end mini-quiz is last in the module |
| 4 (≈2.5 min) | Open the mini-quiz | Student | **points shown per question and total before submitting**; submit; weighted result, PASS/FAIL, rating, donut, difficulty bars, per-objective bars, Suggested review → **Review Lesson** link |
| 5 (optional, ≈2 min) | Import questions | Instructor | Quiz builder → Questions → Import questions: download the XLSX template, upload `docs/education/pilot/en-demo-course/en_beginner_lesson1.csv`, show mapping + default points (1/2/3), row errors and duplicates on a deliberately broken copy, download the error report, confirm → imported as **draft**; other-school user is refused (if time) |
| 6 (≈2 min) | Activity → Physical Experiment → checklist → **Confirm & Run Local Simulation** | Student | WF-03: status RUNNING → SUCCEEDED, banner states it is *not* physical execution |
| 7 (≈1 min) | Digital Twin viewer | Student | telemetry labelled `SIMULATION` |
| 8 (≈0.5 min) | Evidence | Student/Instructor | JSON telemetry evidence with `sourceMode: SIMULATION`, identifiers consistent with the run |
| 9 (≈1.5 min) | Teacher → Submission review → Download evidence → score + comments → Release | Instructor | WF-04; model metadata shows empty because no model is attached |
| 10 (≈0.5 min) | Student sees released feedback | Student | |
| 11 (optional) | Desktop Simulation Lab | — | demonstrate from the installed/dev Lab Station build **only if** the owner supplies it; otherwise show the Homepage Desktop section (download unavailable — release is a Draft) |

Rehearsal verified 2026-11-26 on `develop` `18f2dfa`: every step above has a passing automated equivalent (acceptance report §3). The Homepage Desktop section currently shows *Download unavailable* (release is Draft).

## Known limitations to state

Fake follower ≠ hardware; AWS E2E not run; physical robot blocked; Desktop v0.1.0 unpublished so the Homepage download is disabled; Vietnamese pilot explanations are source echo; English demo content is a generated draft pending instructor review; the app has no dark mode.

## Recovery

| Symptom | Action |
|---|---|
| API 500 / not healthy | `curl :3001/api/v1/health`; re-run `scripts/local_integration_stack.sh up` (≈1 min) and re-seed |
| Run does not start ("runtime not configured") | the API was restarted without the robot map for the current fixture's robot id |
| WF-03 shows "attempt already used" | fixture is single-use: re-seed |
| Browser/IDE slow, OOM | close other apps; the stack needs ≈4 GB |
| Cloud/network down | the demo does not need the Cloud |

## Fallback (clearly labelled)

If the live stack fails, show the recorded real-browser evidence: `docs/acceptance/screenshots/` (`wf03/`, `pilot/`, `quiz-dashboard/`) and the reports `WF03_ACCEPTANCE_REPORT.md`, `WEB_ACCEPTANCE_MATRIX_2026-11-26.md`, `QUIZ_RESULT_DASHBOARD.md`. State explicitly that these are local-simulation recordings from the isolated stack, not Production or AWS evidence. Automated alternative: run the matching Playwright spec headed.
