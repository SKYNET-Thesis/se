# 8. Production acceptance record (2026-11-27)

Production: Web and API `f148ecd` (main `f148ecd`; `develop` `fba6055` also holds the docs and later PRs). Migration S **applied** through the *Production Database Release* workflow (preflight, backup, apply, resume-deployment all succeeded; the first deploy dispatch correctly stopped at schema-gate until S was applied; the second deploy: schema-gate, deploy-api, deploy-web succeeded). Phase A configuration intact: `VISTA_IOT_ENABLED=true`, `START_MODE=simulation`, telemetry bridge on, physical telemetry/commissioning unset; queues and DLQs empty; Edge = R1 + CHECKIK fake follower (`MOCK_RUNTIME`, `hardwareEnabled=false`). **No physical robot, no Desktop, no MuJoCo was involved.**

## Results (real browser/API against https://skynex.best, synthetic accounts)
| Area | Result | Evidence |
|---|---|---|
| Main System Admin login (admin@vista.demo), Organizations, Robot Resources, Student accounts, refresh, logout/login | **PASS** | screenshots `production-final/prod-admin-*.png` |
| Bulk import 10 students via `/admin/students` (XLSX): preview 10 Ready, 10 accounts created, distinct 32+ char one-time passwords | **PASS** | `prod-import-preview.png` (no passwords) |
| First-login password change on Production (new UI): restricted session, deep links blocked, live confirmation (empty / mismatch / match / original changed), submit disabled until valid, dashboard after change, refresh keeps session | **PASS** (VTEST112701) | `prod-password-change-masked.png` |
| Authorization / tenant isolation: student gets 404 on admin robots, organizations, parse-file, start Lab Session; student opening /admin/students lands on My Learning; no horizontal overflow at 390 and 768 px | **PASS** | script output |
| WF01: entitlement + allocation present; instructor sees the robot; Start Lab Session in the UI reserves it ("Reserved for this classroom", 120 min); student eligibility turns from `LAB_SESSION_NOT_ACTIVE` to eligible; End Lab Session releases it ("Available") and blocks the student again | **PASS** | `prod-instructor-lab-session.png`, `prod-instructor-after-end.png` |
| WF02: student attempt, program version, schematic run, symbolic **PASS**, submission; instructor feedback and result release; student sees released result + feedback | **PASS** (numeric rubric scoring **NOT RUN**: no rubric criteria were scored) | API responses |
| WF03: student start → API → AWS IoT → R1 → CHECKIK fake follower; correlated lifecycle `physical_execution_prepared, queued, iot_ack_acknowledged, iot_status_executing, iot_status_completed`; run provenance `MOCK_RUNTIME`, `fake_follower`, `physical:false` | **PASS** (simulation only) | experiment events |
| WF03: Digital Twin telemetry for that run | **FAIL → fix in PR #253**: the Twin returned 403 (`twin_rejected`) because the final submission had revoked the attempt in the Twin; evidence artifact not produced for the simulation run | worker + Twin logs |
| WF03: Stop Execution, concurrent control, runtime disconnect/reconnect, expiry, quarantine on Production | **NOT RUN** (the CHECKIK run lasts ~0.5 s; covered by real-PostgreSQL tests only) | |
| WF04: instructor reviews the submission (detail shows the real-robot-mode simulation run and the schematic run), feedback + release visible to the student | **PASS** | API responses |
| Student UI wording in simulation (physical "Confirm & Execute on Robot" shown) | **DEFECT, fix in PR #253** | |

## Measured latency (one run, laptop Edge, UTC)
Click → start API response 3.28 s (Shadow read, DB, IoT publish); `queued` recorded +2.5 s after prepare; Edge ACK received within the same second; Edge executing → completed 0.51 s; run visible as `succeeded` 6.1 s after the click; completed event reached the Twin relay ~1.7 s after the Edge completed. Single sample: not a performance claim.

## Defects found and status
1. **Twin rejects WF03 telemetry after submission** (confirmed root cause: `ProgrammingService.submit` revoked the attempt in the Twin) — fixed in PR #253, **not deployed**.
2. **Simulation shown with physical wording** (readiness `runtimeMode` was null in cloud simulation) — fixed in PR #253, **not deployed**.
3. Instructor/School Admin credentials had to be recovered with owner approval (E2E instructor password set); the E2E instructor e-mail has no inbox.

## Deferred (explicit boundaries)
Desktop Edge runtime, physical SO-101 execution, physical stop/Emergency Stop acceptance, VLA — **not accepted, not claimed**.
