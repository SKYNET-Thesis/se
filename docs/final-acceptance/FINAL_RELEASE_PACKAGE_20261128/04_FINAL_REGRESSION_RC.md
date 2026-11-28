# Final regression on the exact release candidate

**Release candidate:** `develop` **`b79067f5215320561c559ed301e8a3075e8bcd10`** (code-final; only documentation is added afterwards, verified by `git diff --stat`). Production: `main` `430ad594…` (untouched). Environment: **LOCAL isolated** — real Chrome, real Education API with the runtime database role, PostgreSQL 17, RustFS S3-compatible store, pinned real GoTrue for the authentication suites, R1 + CHECKIK `fake_follower` (**`MOCK_RUNTIME`**) for WF-03. No Production write, no AWS mutation, no Terraform apply, no hardware, no MQTT. Everything ran sequentially; per-spec logs and result files: `~/.vista-acceptance/20261128-final/rc/`.

## Results
| Suite | Result |
|---|---|
| Fresh database bootstrap (baseline + 16 manifest migrations incl. T and U, pinned fingerprint `90ef09de…`) | PASS |
| Migration manifest validation, workflow safety | PASS / PASS |
| Backend `tsc`, build | PASS / PASS |
| Backend Jest, no database | **1427 passed, 0 failed**, 288 skipped (the DB/S3 suites, executed below) |
| Backend Jest, **real PostgreSQL + real S3-compatible store + IoT-feedback integration** (full suite) | **1707 passed, 0 failed, 8 skipped** — the 8 are `runtime-role-security.db` (needs the CI fixture; CI `fresh-bootstrap` runs it with "none skipped") |
| Web `tsc`, Vitest, ESLint, production build | PASS · **853 / 853** · 0 errors (481 pre-existing warnings) · PASS |
| Runtime R1 pytest | **35 / 35** |
| Digital Twin pytest | **73 / 73** with the `simulation` extra and the SO-101 model; default extras 72 passed + 1 documented skip (the MuJoCo-dependent test now skips instead of failing) |
| Playwright — main config (49 spec files; real browser + real API + real PostgreSQL + real object store) | **201 passed, 0 failed, 0 skipped** (7 specs that share single-use fixtures were re-run each on its own fresh stack: all passed) |
| Playwright — real GoTrue: student API (staff flag ON) | **13 / 13** |
| Playwright — real GoTrue: staff direct accounts API | **11 / 11** (ACCT-01…13, 18…20, 24…30 incl. resend invitation and the People list) |
| Playwright — real GoTrue: UI group (student auth, bulk import, recovery, session, staff recovery, **staff direct accounts UI, staff invitation UI**) | **24 / 24** |
| Playwright — `platform-invite-security` / `platform-system-admin` against the harness proxy | **10 passed + 1 documented skip** / **5 / 5** |
| Playwright — WF-03 (R1 fake follower, Twin on :8767, real S3 evidence): runtime evidence / long-running safety | **1 / 1** / **4 / 4** |
| **Playwright total** | **269 passed, 0 failed, 1 skipped** |
| Database-safety tests (`run_database_safety_tests.py`) | the release-flow tests need PostgreSQL **17** client tools (this workstation has 18): **CI is authoritative and green on every PR that touched `database/`** (#280, #281, #282, #284, #285 and the release PR #266: `database-safety` + `fresh-bootstrap`, which runs them "none skipped") |
| T-U verifier and upgrade tests (`tests/database/test_tu_verifier_postgres.py`) | 6 / 6 (static scope pins; verifier on a real bootstrapped DB incl. detected violations; upgrade test in one rolled-back transaction: old shape + legacy data → T,U twice → legacy intact → old-API statement works → rollback → re-apply) |
| Terraform IAM plan (live variables, `-lock=false`, **not applied**) | `Plan: 0 to add, 1 to change, 0 to destroy`; only `aws_iam_role_policy.ec2`; 11 → 12 statements; 0 removed; adds `ExperimentEvidenceObjectAccess` on `learning-media/experiments/*`; live role policy still lacks it |
| GitHub CI on the release PR #266 | all required checks pass: `api`, `web`, `runtime`, `docker`, `database-safety`, `fresh-bootstrap`, `syntax`, `validate-inventory` |

## Failures met during the cycle, and their classification (nothing weakened, nothing skipped to go green)
| Finding | Class | Resolution |
|---|---|---|
| `platform-lifecycle` asserted the old status word "Invited" | **real regression of mine** (#279 renamed it to the required "Pending invitation"; CI does not run browser specs) | #285: specs aligned |
| School Admin People list showed a directly created instructor as "Active" and had no recover/reset actions | **real gap** against requirement 6 | #285: accurate status + row actions |
| Invitation: no page to set a password | **real defect**, root cause of accounts without a usable password | #283 |
| Resend invitation existed only for School Admins | **real gap** against requirement 4 | #285 |
| IoT visibility-extension integration test: exact timer count / 5 s timeout under load | test flake (surfaced because N-13 made it gate CI) | #282, #284 |
| 7 browser specs share single-use fixtures (allocation `PUT` 409 on reuse, student auth DB state) | environment: order dependence | each re-run on a fresh stack: all pass; recorded as N-11 |
| GoTrue UI group failed once when the student reissue limiter (in-memory, 5/hour) was exhausted by the preceding API suite | environment | API restarted before the group; 24/24 |
| Database-safety release-flow tests locally | environment (client 18 vs server 17) | CI green |

## Skips and not-run, individually
* `platform-invite-security`: "token without an e-mail claim" — this GoTrue image disables phone/anonymous sign-in; covered by `SupabaseAuthGuard` unit tests.
* `runtime-role-security.db` (8): CI fixture; CI green.
* Real e-mail delivery (ACCT-14, 16, 22, 23): no mail transport locally — **NOT RUN** (needs the Supabase SMTP configuration and a Production run).
* Physical SO-101, Desktop installers, AWS IoT/MQTT: **NOT RUN / BLOCKED** (Gates H, I; Codex).
* Production: **nothing executed** — see `03_PRODUCTION_ACCEPTANCE_PLAN.md`.

## Verdict
**Gate D: GO** for the exact candidate. Gate F/G require the owner's actions in `00_OWNER_FINAL_ACTIONS.md`.
