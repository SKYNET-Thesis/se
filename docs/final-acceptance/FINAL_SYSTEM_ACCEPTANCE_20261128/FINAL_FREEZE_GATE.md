# Final freeze gate (2026-11-28)

Each gate is reported independently. Verdicts: **GO** (criteria met with evidence), **CONDITIONAL GO** (met locally, named conditions remain), **NO-GO** (criteria not met or prerequisite missing). The project is **not** declared complete: gates E–J are NO-GO. Revisions: develop `eceb8d1`, fix candidate `72efedd` (local combination of PR #276 and PR #277), Production `430ad59`, Desktop `12fd55b`.

| Gate | Verdict | Basis | What closes it |
|---|---|---|---|
| **A — Requirements coverage** | **CONDITIONAL GO** | 65 registered items traced (49 modules, 4 workflows, 6 FR, 6 NFR) with route/endpoint/entity/authorization/test/evidence columns; inventory complete (58 routes, 325 endpoints, 31 controllers, 88 models, jobs, topics, buckets). Not closed: **two contradictory requirement baselines (X-1)** and Reports 1–4 not individually reconciled | owner decision B6 (which baseline is authoritative; formal deferral of FR-02/FR-06/NFR-03/NFR-04) |
| **B — Local functional acceptance** | **CONDITIONAL GO** | 45 of 49 modules PASS locally, 4 workflows PASS locally (mock runtime), 0 local FAIL. Not PASS: B5 (owner decision), H3 (hardware), L4 (CSP, owner decision), J1 (browser text search NOT RUN) | B5/L4 owner decisions; J1 browser assertion; hardware for H3 |
| **C — Security and data integrity** | **CONDITIONAL GO** | see `SECURITY_ACCEPTANCE_REPORT.md`: authorization/tenancy/auth flows PASS, buckets, IoT policy and queues verified, IAM plan revalidated. Open: IAM statement not applied (D-03 FAIL in Production), CSP report-only, N-01 fix unmerged | apply IAM (B4), decide CSP (C11), merge N-01 fix |
| **D — Final regression** | **CONDITIONAL GO** | executed on `eceb8d1` and on candidate `72efedd` (`FINAL_REGRESSION_REPORT.md`): no failing test; skips and blocked items listed individually (41 DB-safety release-flow tests not reproducible with my local harness, `runtime-role-security.db` CI-only, #272 CI red). **The combined candidate has no CI run of its own**; each part is PR #276 / #277 with CI | obtain green CI on #276 and #277 (#276: all required jobs green, but its new integration test is not executed by CI, N-13); read #272 failure log; decide C14 |
| **E — Desktop integration contract** | **NO-GO** | Desktop tests pass (48 + 100, mock) but the contract is open: MQTT authorization bridge/attempt-session binding, Desktop `kind:"cancel"` not implemented, physical telemetry owner undecided, docs contradict each other (X-7) | Codex + owner decisions; `DESKTOP_BACKEND_INTEGRATION_MATRIX.md` items 5, 8, 9, 10 |
| **F — Owner release authorization** | **NO-GO** | no option chosen (A vs B), #266 has 0 reviews, nothing approved | owner: B1–B4, B7 |
| **G — Production deployment and acceptance** | **NO-GO** | Production still `430ad59`; D-03/D-08/D-09 FAIL there; 0 of 65 items accepted on Production | run `PRODUCTION_ACCEPTANCE_RUNBOOK.md` after approvals |
| **H — Actual one-pair physical robot acceptance** | **NO-GO (BLOCKED / NOT RUN)** | no hardware evidence supplied; physical safety profile absent; Codex owns commissioning | Codex supervised session, owner approvals D |
| **I — Physical WF-03 integration acceptance** | **NO-GO (BLOCKED)** | requires E and H | after E, H |
| **J — Feature and architecture freeze** | **NO-GO** | requires F, G, and the decisions in `OWNER_DECISIONS_AND_APPROVALS.md` (notably B5/D-11, B6, migration T timing) | after the above |

## Freeze checklist the owner can use
1. Decide B6, B5, B1 (option), B3 (T timing). 2. Merge/deploy per option; apply IAM; run the Production runbook. 3. Codex closes E (contract) and supplies H/I evidence. 4. Re-run `FINAL_REGRESSION_REPORT.md` suites on the released SHA. 5. Update the defect register; any open High (D-03/D-08/D-09, N-05) must be closed or explicitly deferred by the owner.

Nothing in this document changes product scope: exactly WF-01…WF-04, one SO-101 pair, dual-arm physical and physical VLA deferred.
