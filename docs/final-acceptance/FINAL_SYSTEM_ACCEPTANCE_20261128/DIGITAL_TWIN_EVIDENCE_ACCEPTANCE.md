# Digital Twin and Evidence acceptance (2026-11-28)

Tested revision: `develop` `eceb8d1` unless stated. Environment: **LOCAL isolated** (PostgreSQL 17 on tmpfs, RustFS S3-compatible store, Education API, Twin started by the spec on :8767, R1 + CHECKIK `fake_follower`). Runtime classification of every run: **`MOCK_RUNTIME`** / telemetry `SIMULATION`. **Not Production. Not physical.** A database artifact row is never taken as proof of S3 persistence: the local specs read the object back from the object store.

## Result by requirement
| Requirement | Evidence (this cycle) | Local status | Production status |
|---|---|---|---|
| Correct robot identity in frames | `digital-twin-websocket-revocation` "a scope-authorized viewer really receives frames; a viewer with no valid scope is refused" 11/11; pytest `test_attempt_scope` (frames carry robot id, attempt) | **PASS** | NOT RUN at `eceb8d1` (earlier retest at `430ad59` FAIL, D-09; fix #262 undeployed) |
| Attempt-bound telemetry, cross-attempt isolation | pytest `test_each_attempt_sees_only_its_own_frames_and_everything_else_is_refused`; Playwright "final submission does NOT close the viewer … another attempt of the same student stays connected"; `digital-twin-attempt-scope` ("granted only to the owner of an in-progress attempt on its allocated, entitled robot") | **PASS** | NOT RUN |
| No unrelated fixture telemetry fallback (D-09) | pytest `test_attempt_viewer_receives_its_own_run_frames_and_never_the_offline_fixture` (asserts frame identity and sequence, not only count) | **PASS** | **FAIL at `430ad59`** (viewer got `so101-mock` / `offline-fixture`, root cause + fix #262 documented); retest after release required |
| Runtime identity / classification | `wf03-runtime-evidence` (artifact `sourceMode: SIMULATION`; run withheld from completing the physical lesson); readiness `runtimeMode` | **PASS** | partial (D-02 fixed, retest PASS earlier) |
| Six-joint mapping and units | web Vitest twin viewer/parser suites (843/843 total); `digital-twin-browser-viewer` "shows six joints from the real Twin, is labelled simulation"; pytest `test_joint_state` | **PASS** (simulation) | NOT RUN |
| Telemetry ordering, freshness, stale data | `digital-twin-browser-viewer` "goes stale on an outage and reconnects"; pytest `test_iot_telemetry`, `test_app` | **PASS** | NOT RUN |
| WebSocket authorization and revocation | `digital-twin-revocation` 6/6 (allocation removed, member/org suspended, account disabled → viewers closed 4403, reactivation restores); `digital-twin-websocket-revocation` 11/11 incl. idempotent revocation and retry when the Twin is down; pytest `test_revocation_closes_open_viewers…` | **PASS** (clean-stack rerun) | NOT RUN |
| Reconnection | same browser-viewer spec | **PASS** | NOT RUN |
| MuJoCo synchronisation | pytest Twin **73/73** with `--extra simulation` and `VISTA_TWIN_TEST_MODEL` (model directory lives outside the repository); with default extras 69 pass / 1 fail / 3 skip (N-03) | **PASS** (simulation only) | n/a |
| Hardware / physical telemetry | no physical frame exists | **BLOCKED** (Gate H/I) | **BLOCKED** |

## Evidence generation, upload and retrieval (D-03, D-08)
| Check | Evidence | Local status | Production |
|---|---|---|---|
| Evidence generated after a successful run | `wf03-runtime-evidence` 1/1: the run reaches a terminal success, evidence is retrievable, and `/events` returns a non-empty list with decimal-string ids in ascending `event_index` order (that is all the spec asserts; the exact event names `prepared → running → succeeded → physical_completion_withheld` and the single `vista.experiment.telemetry.v1` artifact come from the earlier `WF03_ACCEPTANCE_REPORT.md` run, not re-asserted here) | **PASS** | D-03 **FAIL** (see below) |
| Object really persisted | jest `experiment-evidence.storage.s3.int.spec` against the real S3-compatible store (inside the 1656-pass DB+S3 run); `wf03-runtime-evidence` reads the object, then deletes it and asserts the API answers `unavailable` rather than fabricating a link | **PASS** | **FAIL** until IAM applied |
| No artifact row without an object; status never 500 (D-08) | jest `experiment-evidence.unavailable.spec`, `iot-run-evidence.spec` | **PASS** | **FAIL** at `430ad59` (HTTP 500 observed 2026-11-27); fixed on develop (#260), undeployed |
| Idempotent retry / failure recovery | advisory lock + existing-row check + same object key (unit/DB specs above) | **PASS** | NOT RUN |
| Instructor and student retrieval, authorization | `wf03-runtime-evidence`: owner and instructor read; peer student and foreign-school teacher get 403/404 | **PASS** | NOT RUN |
| Persistence boundary on AWS | live role `vista-demo-education-api-instance` re-read 2026-11-28: **no `ExperimentEvidenceObjectAccess` statement**; Terraform plan 0/1/0 adds exactly it (not applied) | — | **FAIL (known, awaiting owner approval B2/B4)** |

## Production-specific facts re-verified read-only this cycle
Production API/Web `430ad59`; media/web/recordings buckets have all four Block Public Access flags on; feedback/recordings queues and DLQs at 0; one IoT Thing, one ACTIVE certificate, device policy scoped to its own client id, command/status/telemetry topics and Shadow. Twin container image tag was **not** verified (no SSM/ECR access used).

## Not accepted / still open
D-03/D-08/D-09 stay **FAIL on Production** until: merge #266 → deploy API+Twin+Web → owner-approved IAM apply → retest with the runbook cases W3.x in `PRODUCTION_ACCEPTANCE_RUNBOOK.md`. Physical Twin synchronisation and physical evidence are **BLOCKED** pending Codex hardware evidence.
