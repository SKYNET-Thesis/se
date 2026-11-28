# Pull-request ledger and defect status at the release candidate

Release candidate: `develop` — exact SHA in `04_FINAL_REGRESSION_RC.md`. Production: `main` `430ad594d8fc1087d16870104d5eb037b4fca864` (unchanged by this work).

## Merged into `develop` in this phase (all with green required CI)
| PR | Content | Item |
|---|---|---|
| #276 | late accepted ACK recorded exactly once (D-04) | 7 |
| #277 | stop tracking the `node_modules` symlink (N-01) | 6 |
| #278 | final system acceptance reports (17 files) | docs |
| #279 | direct staff account creation, server-enforced first-login change, recovery of pending accounts, Create-account / Send-invitation UI | 5 |
| #280 | **migrations T and U promoted to the manifest, scope `T-U`, verifier `tu`, upgrade/compatibility tests** | 4 |
| #281 | CI now runs the three `*.int.spec.ts` suites and fails if any skips (N-13) | 3 |
| #282 | N-03 Twin test skips without mujoco, N-08 dead route, D-14 harness proxy variables, IoT visibility test no longer asserts an exact timer count | 6 |
| #272 | rubric achievement levels, descriptors, templates, level scoring, student preview (CI was red only because the bootstrap database lacked T; also one DB spec updated for the new `descriptors` field) | 2 |
| #283 | **invitation acceptance page `/accept-invitation`** — invited users could never set a password (root cause of accounts without a usable password) | 5 |
| #284 | explicit 30 s budget for the IoT visibility integration test (timed out at 5 s under full-suite load) | 3 |
Closed as superseded: **#267** (staged T; promoted by #280).

## Open, intentionally not merged
| PR | Reason |
|---|---|
| **#266** `develop → main` | the release PR. **Owner-only merge.** Updated to describe the final candidate |
| #224, #183, #172, #162, #153 | stale (157–443 commits behind `develop`; #172 targets `main`, #153 targets an old feature branch; #224's runbook is superseded by `02_PRODUCTION_DB_AND_DEPLOYMENT_SEQUENCE.md`). Not qualified; no code from them is required by any acceptance item. Owner may close them |

## Defect register changes (see `../FINAL_SYSTEM_ACCEPTANCE_20261128/FINAL_DEFECT_REGISTER.md` for history)
| ID | Status now |
|---|---|
| N-01 symlink | **FIXED and merged** (#277) |
| N-02 / D-04 late ACK | **FIXED and merged** (#276); Production verification = runbook case W3.6 |
| N-03 Twin test hygiene | **FIXED and merged** (#282) |
| N-05 #272 CI | **CLOSED** — cause was the bootstrap database lacking T; T is now in the manifest; #272 merged |
| N-07 API-only endpoints | open, informational (8 endpoints; no UI to rotate a device credential) |
| N-08 duplicate route | **FIXED and merged** (#282) |
| N-11 Playwright not in CI | open (process): browser suites are run locally by the acceptance harness, not by CI |
| N-13 CI misses integration suites | **FIXED and merged** (#281, hardened by #282/#284) |
| N-14 first-login gate for staff | **FIXED and merged** (#279); needs migration U + flag in Production |
| N-15 login signed the user out during the forced change | **FIXED and merged** (#279) |
| N-16 same-second `iat` race on credential re-issue | **FIXED and merged** (#279) |
| N-17 invitation redirect / SMTP / accounts without password | **Code root cause found and FIXED** (#283: no invitation page existed). **Configuration still owner-only**: Supabase Site URL/allow-list/SMTP and `SUPABASE_INVITE_REDIRECT_URL` — `01_SUPABASE_AND_SMTP_CONFIGURATION.md` |
| N-18 "Expired invitation" account state | open (low): expired links now show an explicit page; the list does not compute an expired state (needs an owner definition of expiry) |
| D-03 / D-08 / D-09 | **FIXED in code (develop)**; **FAIL on Production until** deploy + IAM apply + retest (`03_PRODUCTION_ACCEPTANCE_PLAN.md` WF-03) |
| D-11 legacy `PUT` allocation | owner decision unchanged (recommendation: keep "add", deprecate `PUT`) |
| D-14 harness | **FIXED and merged** (#282) |

## Your 12 items — status
| # | Item | Status |
|---|---|---|
| 1 | merge all qualified PRs | done (10 merged); stale PRs listed above; #266 owner-only |
| 2 | finish #272 and CI | done, merged |
| 3 | N-13 integration CI | done, merged, gate verified in CI |
| 4 | finalize T and U with compatibility/upgrade tests | done: manifest, scope, verifier, 6 tests; **application to Production = owner-approved workflow** |
| 5 | authentication, direct creation, first-login change, invitation, recovery | code complete and merged; **Production needs migration U, flag, Supabase/SMTP/redirect config** |
| 6 | remaining Web defects | all confirmed ones fixed (table above); N-07, N-11, N-18 informational/process |
| 7 | AWS IAM evidence + Twin | plan revalidated on the RC (0/1/0, additive); apply and deploy are approval steps |
| 8 | final regression on the exact RC | `04_FINAL_REGRESSION_RC.md` |
| 9 | develop → main release PR | #266 updated |
| 10 | Supabase and SMTP values | `01_…` |
| 11 | Production DB action and deployment sequence | `02_…` |
| 12 | Production acceptance for four roles and WF-01…04 | `03_…` |
