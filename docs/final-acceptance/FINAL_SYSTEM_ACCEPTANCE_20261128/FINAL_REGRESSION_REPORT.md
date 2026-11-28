# Final regression report (2026-11-28)

Nothing here reuses an earlier count. Two revisions were tested; both numbers are shown.

| Label | Revision | Content |
|---|---|---|
| **R0** | `develop` `eceb8d1d0cfabdb0ca96906eeaaa9f5e9cf5b69f` | the release baseline; last code change `04fed8b` |
| **R1** | candidate `72efedd21701fdad8492af86f19e1390e9d457fa` (local branch `candidate/final-20261128`; its two parts are PR #276 and PR #277, each with its own CI) | R0 + fix N-02/D-04 (`54b876d`) + fix N-01 (`72efedd`): 5 non-doc files, all under `services/education-api/src/modules/learning/iot-feedback.repository*` and `.gitignore`/the symlink; **no web, runtime, Twin or database change** |
| **#272** | `17c9c54710d3006ff0749c934eb29d92aa96b536` + Migration T | tested on a separate worktree and database |

Environment: workstation, PostgreSQL 17 (tmpfs) on loopback, RustFS S3-compatible store, Education API with the runtime role, Chrome. Suites were run **strictly sequentially** (one heavy workload at a time; 14 GB RAM, no OOM). Synthetic data only. **No Production write, no AWS mutation, no Terraform apply, no hardware.** Logs and per-spec results are in the session scratch directory; screenshots in `~/.vista-acceptance/20261128-final/`.

## 1. Results
| Suite | R0 `eceb8d1` | R1 `72efedd` | Notes |
|---|---|---|---|
| Backend `tsc --noEmit` / `npm run build` | 0 / — | 0 / 0 | |
| Backend Jest, **no database** | 1404 passed, 0 failed, 286 skipped (121 of 157 suites; 36 suites need DB/S3) | 1413 passed, 0 failed, 287 skipped | +9 new unit tests in R1 |
| Backend Jest, **real PostgreSQL + real S3-compatible store** | **1656 passed, 0 failed, 34 skipped** (155 of 157 suites; 2 suites skipped) | **1692 passed, 0 failed, 8 skipped** (156 of 157) | R0 skips: `iot-feedback.repository.int` 26 + `runtime-role-security.db` 8. R1 runs the iot-feedback integration suite (27/27 on one run; on an earlier run one unrelated timing-sensitive test, "extends visibility while a real PostgreSQL feedback transaction is blocked", failed under browser-suite CPU load and passed on rerun). R1 remaining skips: 8 `runtime-role-security.db` (CI fixture; CI `fresh-bootstrap` runs it "none skipped") |
| Web `tsc`, Vitest | clean; **843 / 843** (127 files) | clean; **843 / 843** | web tree identical R0/R1 |
| Web ESLint | 0 errors, 466 warnings | 0 errors, 466 warnings | warnings are pre-existing |
| Web production build | OK | OK | |
| Runtime R1 pytest (`services/robot-runtime`) | **35 / 35** | 35 / 35 | |
| Digital Twin pytest | `--extra simulation` + `VISTA_TWIN_TEST_MODEL`: **73 / 73**. Default extras: 69 passed, **1 failed**, 3 skipped (N-03: the R1-bridge test fails instead of skipping when MuJoCo is absent) | 73 / 73 (same invocation) | the model directory lives outside the repository |
| Database-safety tests (`run_database_safety_tests.py`) | 385 ran, 0 failed, **98 skipped** (databases required); the runner exits non-zero on skips by design. With my loopback harness, after fixing three wiring mistakes of mine (project-ref label, runner database name, audio-migration database), 41 of the database-backed tests (the `ReleaseFlowTests` and the runner-rollback test) still failed or errored with "approved plan is missing" / template-database messages; these are harness failures, **not counted as product failures**, and are **BLOCKED locally**. CI `database-safety` **and** `fresh-bootstrap` ("none skipped") are **SUCCESS on #266 head `eceb8d1`** | 385 ran, 0 failed, 98 skipped | CI evidence required for R1 once pushed |
| Migration manifest, workflow safety | pass / "no database migration execution commands found" | pass | |
| Fresh database bootstrap | PASS (several fresh databases, incl. M and R applied) | PASS | + #272: bootstrap + M + R + T PASS |
| Playwright — main config | **200 passed, 0 failed, 0 skipped** over 49 spec files after clean-stack reruns (see §2) | not re-run (no web/API behaviour change outside the iot-feedback repository, covered by Jest DB) | |
| Playwright — real GoTrue harness | UI **18 / 18** (5 files); API **13 / 13** (3 files, clean DB) | — | |
| Playwright — WF-03 runtime, safety, pilot, security, full-page | `wf03-runtime-evidence` 1/1, `wf03-safety-long-run` 4/4, `qb-pilot-import` 2/2, `platform-system-admin` 5/5, `platform-invite-security` 10 passed + **1 skipped**, full-page audit 2/2 | — | |
| Playwright — #272 + Migration T | `rubric-levels-flow` **1 / 1**; backend Jest DB (3 suites) 46/46; Vitest `src/queries` 71/71; `tsc` clean | — | CI `fresh-bootstrap` on #272 is **red** (N-05) |
| Desktop (clean export of `12fd55b`, **repo untouched**) | Node `npm test` **48 / 48** (26 + 22); Edge Python **100 / 100** (`uv`, py 3.12, mujoco 3.17, paho 2.2, pyserial 3.5). With system Python 3.14 and no MuJoCo: 3 failed + 1 error (environment) | — | installer build NOT RUN |
| Long-running execution safety | `wf03-safety-long-run` 4/4 (cancel mid-run, End during run, disconnect → quarantine, recovery) on a controlled long-running fixture | — | mock runtime only |
| Security and authorization | `lms-security-matrix`, `platform-invite-security`, GoTrue suites, jest guards — all above | — | |

**Playwright total this cycle: 256 passed, 0 failed, 1 skipped** (200 main + 31 GoTrue + 1 + 4 + 2 + 5 + 10 + 2 full-page + 1 on #272), counting each rerun once.

## 2. Failures encountered and how each was classified (none weakened or skipped)
| Spec | First result | Class | Resolution |
|---|---|---|---|
| `digital-twin-revocation`, `digital-twin-websocket-revocation`, `lms-independent`, `lms-robot-lab-access`, `lab-session-management` | 409 on the allocation `PUT` in a single-stack pass | **Environment: single-use fixture polluted by earlier specs** (the second allocation of the same robot is the D-11 behaviour) | each re-run on its own fresh stack: 6/6, 11/11, 9/9, 1/1, 4/4 PASS |
| `platform-resilience` | one 5 s heading timeout under load | environment (CPU contention) | clean rerun 6/6 |
| `student-bulk-import-ui` | "No tests found" without harness env | environment | passed inside the GoTrue UI group (18/18) |
| `student-auth-api` E2E-13 (API suite run after the UI group) | 2 leftover rows from the UI suite's bulk-import spec | **environment: order-dependent shared database** | API suite on a clean database 13/13 |
| `platform-invite-security`, `platform-system-admin` | `/__test/users` 404/503 | environment: needs the GoTrue proxy **configured** with service key, fixture password and signing key (the harness script starts it without them — D-14) | with those variables supplied from the harness's own keys: 10 passed + 1 skipped, and 5/5 |
| Digital Twin pytest default extras | 1 failed | environment (no MuJoCo) → N-03 | `--extra simulation`: 73/73 |
| 41 `tests/database` release/rollback-flow tests | failed/errored with my harness | harness (needs the `vista_baseline_test_*` template workflow), not product | BLOCKED locally; CI `database-safety` and `fresh-bootstrap` green |
| #272 CI `fresh-bootstrap` | FAIL at the DB integration step | probable: CI applies M and R only (N-05) | OPEN |

## 3. Skips and blocked items, individually
* `platform-invite-security`: "token without an e-mail claim" — GoTrue image disables phone/anonymous sign-in; covered by `SupabaseAuthGuard` unit tests. (1)
* Jest, R1 with DB: `runtime-role-security.db.spec.ts` — 8 tests, need the CI-prepared runtime-role fixture; CI-only (`fresh-bootstrap`, green at `eceb8d1`).
* Jest, R0 only: `iot-feedback.repository.int.spec.ts` — 26 tests, opt-in env (`RUN_IOT_FEEDBACK_INTEGRATION=1`); run in R1.
* Jest without a database: 286/287 tests in 36 suites (require PostgreSQL or S3) — executed in the DB run, not skipped overall.
* `database-safety`: 98 skipped without databases; 41 release/rollback-flow tests could not be reproduced locally — CI evidence only.
* `visual-audit.spec.ts` (2 opt-in tests): not run as written (it crops a 2400 px viewport); replaced by a scratch full-page copy, 2/2.
* Digital Twin: 3 skips and 1 failure with default extras (MuJoCo model/package absent).
* Desktop installers/packaging, physical teleoperation, MQTT/IoT against AWS: **NOT RUN**.
* CI-only evidence at `eceb8d1` (from the PR #266 check rollup): `syntax`, `fresh-bootstrap`, `validate-inventory`, `api`, `runtime`, `web`, `database-safety`, `docker` = SUCCESS; `schema-gate`, `rollback-guard`, `deploy-*` skipped by design.

## 4. Verdict (Gate D)
**CONDITIONAL GO.** No failing test remains on R0 or R1. The conditions: obtain CI for R1 (push the two fix PRs), read the #272 failure log, and accept the CI-only status of `runtime-role-security.db` and the 41 release-flow database tests.
