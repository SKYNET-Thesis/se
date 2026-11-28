# Executive acceptance summary (2026-11-28)

> **Later update (release package):** all independently actionable work is merged into `develop` (RC `b79067f5215320561c559ed301e8a3075e8bcd10`; PRs #276–#285 and #272) and the final regression on that exact RC passed (269 browser tests, 0 failed). What remains needs the owner: `../FINAL_RELEASE_PACKAGE_20261128/00_OWNER_FINAL_ACTIONS.md`. The sections below describe the earlier baseline and are kept for history.

**Update 2026-11-28 (later): account provisioning and first-login policy implemented and locally accepted (23 of 30 ACCT cases PASS, 7 NOT RUN), see `AUTH_PROVISIONING_ACCEPTANCE.md`; Authentication, WF-01 and Web Production Acceptance remain NOT complete.**

**Outcome: a verified local acceptance baseline, not project completion.** The software passes everything that can be executed on a workstation. It is **not accepted on Production** and **not accepted on physical hardware**. Gates E–J are NO-GO; A–D are CONDITIONAL GO. No completion percentage is given on purpose.

## Revisions
| Item | Revision |
|---|---|
| `develop` (tested, "R0") | `eceb8d1d0cfabdb0ca96906eeaaa9f5e9cf5b69f` (code identical to `04fed8b`; 3 doc files differ) |
| Fix candidate ("R1"), **local combination, no CI of its own** (the two fixes are open as PR #276 and PR #277; this documentation is PR #278) | `72efedd21701fdad8492af86f19e1390e9d457fa` = R0 + D-04 fix `54b876d` + symlink fix `72efedd` (also available as separate branches `bugfix/late-ack-d04-20261128`, `bugfix/untrack-node-modules-symlink-20261128`) |
| Production `main` (API and Web, read-only) | `430ad594d8fc1087d16870104d5eb037b4fca864` |
| PR #266 (develop → main) | head `eceb8d1`, open, CLEAN, **0 reviews**, no migration |
| PR #267 / #272 (drafts) | `08e77706…` / `17c9c54710d3006ff0749c934eb29d92aa96b536` — #272 CI `fresh-bootstrap` **FAILED** |
| Desktop `codex/final-overnight-completion` | `12fd55b83b8540489a69cb7df7d8ff4a359064ef`, clean, **not modified** |

## Counts (65 registered items: 49 website modules + 4 workflows + 6 FR + 6 NFR)
| | PASS | FAIL | BLOCKED | NOT RUN | DEFERRED |
|---|---|---|---|---|---|
| Local isolated (R0), items | **50** | 0 | 7 | 4 | 4 |
| Production (`430ad59`), re-executed this cycle | 0 | — | — | 65 | — (earlier matrix: 24 PASS, 4 PASS-with-qualifier, 15 NOT RUN of 44; D-03/D-08/D-09 FAIL) |
| Physical SO-101 | 0 | — | BLOCKED | NOT RUN | — |

Tested (at least one executed test this cycle): **54 of 65**. Not tested: 11 original-SRS FR/NFR items that describe the dual-arm/VLA pipeline.

## Results per component
| Component | Result |
|---|---|
| Web | tsc clean, Vitest 843/843, lint 0 errors, build OK |
| Backend | tsc/build clean; Jest with PostgreSQL + S3: R0 1656 pass / 0 fail / 34 skip; R1 1692 / 0 / 8 |
| Browser journeys (Playwright) | 256 passed, 0 failed, 1 skipped (after clean-stack reruns of 6 fixture-polluted specs) |
| Real GoTrue authentication | UI 18/18, API 13/13, invitation security 10 + 1 skip, system admin 5/5 |
| Robot runtime R1 / Digital Twin | 35/35; 73/73 with the simulation extra (default extras: 1 environment failure, N-03) |
| Database | bootstrap, manifest, workflow safety PASS; 41 release-flow tests **blocked locally**, CI green |
| Desktop (clean export) | Node 48/48, Edge Python 100/100 (mock); installers NOT RUN; physical NOT RUN |
| Infrastructure (read-only) | buckets private, queues empty, IoT policy device-scoped, IAM least-privilege; IAM plan revalidated 0/1/0, **not applied**; CSP report-only |

## Results per workflow
| Workflow | Local | Production | Physical |
|---|---|---|---|
| WF-01 | PASS | PARTIAL → not accepted | n/a |
| WF-02 | PASS | PARTIAL → not accepted | n/a |
| WF-03 | PASS (`MOCK_RUNTIME`) | **FAIL** (D-03, D-08, D-09) | BLOCKED |
| WF-04 | PASS | PARTIAL → not accepted | n/a |
Rubric levels (Migration T): PASS locally on #272 only; unreleased.

## Remaining defects (see `FINAL_DEFECT_REGISTER.md`)
High: **D-03/D-08** (IAM statement absent in Production — fix in develop, undeployed, `terraform apply` needs approval), **D-09** (Twin fixture shown; fix #262 undeployed), **N-05** (#272 CI red), **N-06/X-1** (contradictory requirement baselines). Medium: N-01 (committed symlink; fix PR #277), N-04 (CSP report-only), **N-13 (CI never runs 3 integration suites, incl. the S3 evidence-storage one)**. Low/Info: N-02/D-04 late ACK (fix PR #276), N-03, N-07 (8 API-only endpoints, no UI to rotate device credentials), N-08, N-11, D-14 (resolved with proxy variables; script change pending), D-11 (owner decision). One incident was caused by this cycle's own tooling: `npm ci` followed that committed symlink and emptied another worktree's `node_modules` (rebuilt from its lockfile, Prisma client regenerated; no source lost, nothing committed there).

## Owner decisions (see `OWNER_DECISIONS_AND_APPROVALS.md`)
B1 release option A or B · B2 merge #266 and approve deploy-api/deploy-web · B3 Migration T text and timing · B4 `terraform apply` of the revalidated IAM plan · B5 D-11 · **B6 which requirement baseline is authoritative and formal deferral of FR-02/FR-06/NFR-03/NFR-04** · B7 Production test content · C1–C14 (Lab Session limits, CSP enforcement, pilot-content rules, Playwright in CI, symlink fix, running `*.int.spec.ts` in CI, …).

## Production prerequisites
merge #266 → Auto Deploy (`schema-gate`) → approve `deploy-api` (+Twin image) → approve `deploy-web` → verify versions/Twin tag/queues → approve IAM apply → run `PRODUCTION_ACCEPTANCE_RUNBOOK.md` (cases W3.1–W3.6, W4.1–W4.2, W1.1, SEC). Nothing was deployed, merged, migrated or applied.

## Physical commissioning prerequisites (Codex)
Hardware owner approvals (safety profile, named operator, E-stop access, device roles, calibration files); Desktop `kind:"cancel"` (EDGE §14); decision on the MQTT authorization bridge and on who forwards physical telemetry; reconcile Desktop/EDGE documents (X-7); supervised session evidence (runbook steps 1–20). No mock result is offered as a substitute.

## Release options (not chosen)
**A** — #266 only: no migration; closes the Production WF-03 failures after IAM; excludes rubric levels. **B** — A + Migration T + #272: adds rubric levels; needs owner approval of the SQL, a promotion PR, the Production DB release workflow and a green #272 CI. Details in `PRODUCTION_RELEASE_OPTIONS.md`.

## Gate verdicts
A CONDITIONAL GO · B CONDITIONAL GO · C CONDITIONAL GO · D CONDITIONAL GO · **E NO-GO** · **F NO-GO** · **G NO-GO** · **H NO-GO** · **I NO-GO** · **J NO-GO** (`FINAL_FREEZE_GATE.md`).

## Evidence paths
Repository: `docs/final-acceptance/FINAL_SYSTEM_ACCEPTANCE_20261128/` (17 files). Outside Git: `~/.vista-acceptance/20261128-final/` — `screenshots/fullpage/` (73 PNG, 1440/768/390), `screenshots/` (WF-03 run captures), `logs/{playwright,jest,desktop,terraform}/`, `module_status.json`, `endpoints.json`, `routes.json`, `normalization_report.json`.
