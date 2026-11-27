# Final defect register (2026-11-27)

| ID | Sev | Defect | Root cause | Status |
|---|---|---|---|---|
| D-01 | High | Twin returned 403 for the WF03 run's telemetry | `ProgrammingService.submit` revoked the attempt in the Twin before the run reported | **Fixed #253, deployed `43dcb60`; retest PASS** (Twin 202, 205 frames) + regression test #255 |
| D-02 | Medium | Student UI showed physical wording in simulation | readiness `runtimeMode` null in cloud simulation | **Fixed #253, deployed; PASS** |
| D-03 | **High (blocks WF03 evidence acceptance)** | No evidence artifact for a successful cloud run | `physical-execution.service status()` IoT branch returned before the evidence step; no persisted last frame | **Fix PR #257 (CI running); not merged/deployed.** Retest only the affected flow after release |
| D-04 | Low/Medium | ACK event `iot_ack_acknowledged` missing; worker logs `feedback sequence is stale` | ACK and status arrive via SQS out of order; ACK treated as stale after `executing` | **Open.** Run lifecycle and result unaffected. Handle in tomorrow's IoT integration (accept late ACK without regressing state) |
| D-05 | Process | Instructor/System Admin credentials needed owner-approved resets | seed sets passwords only on create; E2E mailboxes have no inbox | Closed (resets approved and done); do not repeat |
| D-06 | Low | Grade can be released without numeric rubric scores; later assessment is rejected `GRADE_RELEASED` | release not gated on rubric completeness | Open (observation; product decision) |
| D-07 | Low | Wrong-verb attempts (PUT) on assessment return generic 404 | test script error, not a product defect | Closed |

## NOT RUN on Production (reason)
Stop Execution (run lasts ~0.5 s), concurrent control, reconnect during a run, session expiry, quarantine, Emergency Stop, Desktop runtime, physical SO-101, VLA. Covered by real-PostgreSQL/CI tests where marked in the matrix; **not claimed accepted.**
