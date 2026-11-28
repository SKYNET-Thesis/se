# Robot Lab and runtime acceptance (2026-11-28)

Tested revision: `develop` `eceb8d1`. Environment: **LOCAL isolated**; runtime = R1 `services/robot-runtime` with the CHECKIK **`fake_follower`** adapter (software only, no serial driver imported), classification **`MOCK_RUNTIME`**, `hardwareEnabled` only a config flag of the mock. No AWS IoT, no MQTT broker, no hardware, no motor was touched. Classifications are never substituted: nothing here is `PHYSICAL_ROBOT`.

| Classification | Used in this cycle | Where |
|---|---|---|
| `SIMULATION` | Blockly/schematic engine and Twin telemetry frames | browser specs, pytest |
| `MOCK_RUNTIME` | R1 + fake follower runs | `wf03-runtime-evidence`, `wf03-safety-long-run` |
| `PHYSICAL_ROBOT` | **none — NOT RUN / BLOCKED** | Gate H/I |
| `UNVERIFIED_RUNTIME` | Shadow value for an Edge that is not a verified mock/physical runtime; unit-tested only (`iot-edge-contract.spec`) | jest |

## Results
| Requirement | Evidence | Status (local, `eceb8d1`) |
|---|---|---|
| Robot allocation and ownership (many-to-many, entitlement, tenancy) | jest `robot-allocation.db.spec` (in the 1656-pass DB+S3 run); `lms-independent` 9/9 (clean-stack rerun); `platform-school-admin` 6/6 | **PASS** |
| Allocation removal / replacement semantics | `digital-twin-revocation` (remove revokes, re-add revokes nothing); legacy `PUT` adds (409 on same robot) | **PASS as built; contract = OWNER-DECISION B5 (D-11)** |
| Concurrent allocation conflicts | `lms-independent` (409 on a second PUT of the same robot, observed again when fixtures were reused); jest DB spec uses row locks | **PASS** |
| Lab session creation / authorization | `lab-session-management` 4/4 (clean-stack rerun); jest `lab-session.db`, `lab-session-compat.db`; `lms-robot-lab-access` 1/1 (cross-school and unauthorised users refused) | **PASS** |
| Student execution request, attempt binding | `wf03-runtime-evidence` 1/1; jest `physical-execution.service.spec` (A–X: unauthenticated, other learner's version, unqualified version, failed symbolic evaluation, no entitlement, no allocation, busy control session, runtime offline, E-stop…) | **PASS** |
| Runtime command delivery, ACK handling | jest `iot-command.service.spec`, `iot-edge-contract.spec`, `iot-feedback.*` ; D-04 fix prepared (late ACK) | **PASS**; D-04 fix **not merged** |
| Execution state transitions | `iot-feedback.service.spec` (monotonic state order, no regression); `experiment-run.db.spec` | **PASS** |
| Concurrent execution prevention / duplicate command | physical-execution A–X (busy ControlSession); `iot-feedback.repository.int` duplicate-event and concurrent-worker specs; `iot-publish-recovery.runner.spec` (recovery publishes once) | **PASS** |
| Stop execution | `wf03-safety-long-run` 4/4 on a controlled long-running fixture: cancel mid-run; jest `lab-session-stop.spec` (`kind:"cancel"` published) | **PASS** (mock) |
| End Lab Session during execution | `wf03-safety-long-run`; jest `lab-session-safe-stop.spec` | **PASS** (mock) |
| Session expiry | jest `lab-session.db` / runner (`lab-session.runner`) | **PASS** (unit/DB); Production **NOT RUN** |
| Runtime disconnect / quarantine | `wf03-safety-long-run`: R1 killed mid-run → status truthful (never `succeeded`), End quarantines | **PASS** (mock) |
| Safe reconciliation, recovery, reconnect (D-17) | same spec: R1 restarted, reachable runtime reports the run lost, quarantined session releases without a student read; heartbeat alone never releases; `lab-session-run-lost.spec` | **PASS** (mock). IoT path keeps the authoritative Shadow rule (documented, not exercised without IoT) |
| Terminal state persistence | `iot-feedback.repository.int`, `experiment-run.db` | **PASS** |
| Cross-school / cross-attempt isolation | `lms-robot-lab-access`, `lms-security-matrix`, `digital-twin-attempt-scope`, `digital-twin-websocket-revocation` | **PASS** |
| Physical execution through Desktop runtime | — | **NOT RUN / BLOCKED** (Gate H/I) |

## Production
`PRODUCTION_TEST_CASE_MATRIX.md` (44 cases, executed 2026-11-27 at `43dcb60`/`430ad59`; counted from the status column: 24 PASS, 4 PASS with a qualifier — Advanced-only, CI-only, observed, with defect D-04 — 15 NOT RUN, 1 row deferred to the WF04 table; PASS rows include WF01 allocation, Lab Session start/end, WF02 and the WF03 run lifecycle). NOT RUN, 15 (Stop Execution — a Production run lasts about 0.5 s, concurrent control, reconnect, session expiry, quarantine, Emergency Stop, Desktop runtime, physical SO-101, VLA), D-03/D-08/D-09 FAIL as recorded. **Not re-executed this cycle (no Production writes were authorised).** Local PASS is not Production PASS.

## Notes on test hygiene found
* `wf03-safety-long-run` stops the runtime with `pkill -f 'robot-runtime/src/server.py'`, a system-wide pattern. It is acceptable on a disposable workstation with no other R1, but would also terminate any R1 started from that path elsewhere. Verified before running that no such process existed; recommend scoping it to the spawned PID.
* `iot-feedback.repository.int` "extends visibility while a real PostgreSQL feedback transaction is blocked" is timing-sensitive (passed 27/27 once, failed once with the machine under browser-suite load).
