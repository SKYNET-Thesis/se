# Final defect register (2026-11-27)

| ID | Sev | Defect | Root cause | Status |
|---|---|---|---|---|
| D-01 | High | Twin returned 403 for the WF03 run's telemetry | `ProgrammingService.submit` revoked the attempt in the Twin before the run reported | **Fixed #253, deployed `43dcb60`; retest PASS** (Twin 202, 205 frames) + regression test #255 |
| D-02 | Medium | Student UI showed physical wording in simulation | readiness `runtimeMode` null in cloud simulation | **Fixed #253, deployed; PASS** |
| D-03 | **High (OPEN, blocks WF03 evidence acceptance)** | No evidence artifact for a successful cloud run | `physical-execution.service status()` IoT branch returned before the evidence step; no persisted last frame | #257 deployed in `430ad59` but **Production retest FAILED** (2026-11-27 13:25Z, experiment `31627072…`): `GET /me/physical-executions/:id` returns **HTTP 500** (`learning_experiment_artifacts_check` violation) and no artifact exists. Root cause (verified in API logs + IAM): the API instance role `vista-demo-education-api-instance` has no `s3:PutObject/GetObject` on `learning-media/experiments/*`, so the object write failed and a row without `storage_path` was inserted. Fix PR **#260** (no row without object; status never 500s; Terraform `ExperimentEvidenceObjectAccess`). **Needs owner: merge #260, release, `terraform apply` of the IAM change (not executed), then retest.** |
| D-04 | Low/Medium | ACK event `iot_ack_acknowledged` missing; worker logs `feedback sequence is stale` | ACK and status arrive via SQS out of order; ACK treated as stale after `executing` | **Open.** Run lifecycle and result unaffected. Handle in tomorrow's IoT integration (accept late ACK without regressing state) |
| D-05 | Process | Instructor/System Admin credentials needed owner-approved resets | seed sets passwords only on create; E2E mailboxes have no inbox | Closed (resets approved and done); do not repeat |
| D-06 | Low | Grade can be released without numeric rubric scores; later assessment is rejected `GRADE_RELEASED` | release not gated on rubric completeness | Open (observation; product decision) |
| D-07 | Low | Wrong-verb attempts (PUT) on assessment return generic 404 | test script error, not a product defect | Closed |

## NOT RUN on Production (reason)
Stop Execution (run lasts ~0.5 s), concurrent control, reconnect during a run, session expiry, quarantine, Emergency Stop, Desktop runtime, physical SO-101, VLA. Covered by real-PostgreSQL/CI tests where marked in the matrix; **not claimed accepted.**

| D-08 | High (regression from #257, in `430ad59`) | Run status endpoint 500 after a successful run | see D-03 | Fix in #260; not deployed |
| D-09 | Medium | Digital Twin viewer displays the Twin's own mock stream (robot `so101-mock`, controller `offline-fixture`, ~29 Hz, seq 11178+) during a run; the R1-relayed frame (robot UUID, seq 12, stored as `simulation_telemetry_latest`) is accepted by the Twin (202) but not what the browser received | Twin mock mode | **Provenance: browser frames NOT R1-synchronised (VERIFIED by comparing the two streams).** Product decision for tomorrow's integration |
| D-04 note | | Retest 13:24Z: `iot_ack_acknowledged` present this time → intermittent ordering | | Still open (low) |
| D-06 note | | Per-criterion scoring works; the top-level attempt `score` field is `null` in `/me/attempts/:id/grading` while the student UI shows `9 / 10` | | Observation; release without scores remains an owner product decision |
