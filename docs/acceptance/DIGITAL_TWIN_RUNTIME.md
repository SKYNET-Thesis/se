# Digital Twin, Robot Runtime and AWS IoT — contracts, evidence and audit

Scope: development-side only. No Production MQTT, AWS resource, secret, policy or certificate was read or changed. Physical
motion stays disabled; "mock", "simulation" and "live physical" are distinct labels and only the first two were exercised.
This document is the API contract hand-off for Codex's Desktop work; the Desktop workspace was not modified.

## 1. Telemetry contract (`JointState`, schema_version 1)

Source of truth: `services/digital-twin/src/vista_digital_twin/contracts.py`; TS mirror
`web/robot-edu/src/components/digital-twin/twinTelemetry.ts`.

| Field | Rule |
|---|---|
| `schema_version` | literal `1` |
| `robot_id`, `controller_id` | non-empty strings |
| `source_mode` | `LIVE_PHYSICAL` \| `SIMULATION` \| `REPLAY`. **Mock data is `SIMULATION` with `controller_id = "offline-fixture"`**; the fake follower is `SIMULATION` from the R1 controller. Only `LIVE_PHYSICAL` may be presented as a physical robot. |
| `measured_at` | timezone-aware ISO-8601 |
| `sequence` | integer ≥ 0, strictly increasing per source; out-of-order frames are rejected |
| `connection` | `connected` \| `disconnected` \| `stale` |
| `measured` (also `calibrated`, `commanded` when present) | exactly six readings, each joint once: `shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper`; arm joints in `rad`/`deg`, gripper `percent`; finite numbers only |
| `calibration_status` | `NOT_APPLICABLE` \| `UNCALIBRATED` \| `VERIFIED`; `LIVE_PHYSICAL` must not be `NOT_APPLICABLE`; `VERIFIED` physical frames must carry `calibrated` |

Dual leader–follower support: the schema is per `robot_id`; a pair is represented by publishing one stream per follower
(leader readings may be sent as `commanded`). **No claim is made that four physical arms are connected**; only the mock and
the single-arm fake follower were exercised.

## 2. WebSocket `/ws/twin` (default `ws://127.0.0.1:8767/ws/twin`)

* Viewer authorization: sub-protocol `vista.twin.<viewerToken>`. The token is `v1.<base64url payload>.<HMAC-SHA256>`
  (kind `viewer`, org, robot ids, `exp`, `jti`), issued by `POST /api/v1/robots/:robotId/digital-twin/viewer-scope`
  (TTL 60 s, `GET /api/v1/robots/digital-twin/availability` first). Missing/invalid/expired scope → close code **4403**; the client
  must not retry blindly after 4403 (it asks the API for a new scope).
* Frames: one JSON `JointState` per new `sequence` (latest-frame semantics, slow readers skip frames). Source priority:
  physical owner → signed simulation publisher → mock.
* **Heartbeat (new, opt-in, backward compatible)**: connect with `?heartbeat=<seconds>` (clamped 0.25–10). When no new frame
  was sent for that long the server sends

  ```json
  {"type":"heartbeat","schema_version":1,"server_time":"…Z","origin":"mock|simulation|physical",
   "source_mode":"SIMULATION|…|null","robot_id":"…|null","sequence":4,"connection":"connected|stale|disconnected",
   "age_ms":12}
  ```

  `connection` is the server's own freshness verdict (`stale` after 0.5 s without a new measurement, pose preserved).
  **Clients that do not pass `?heartbeat=` never receive a heartbeat frame**, so existing consumers are unaffected. A heartbeat
  frame has a `type` field and no `measured`; a consumer must branch on `type` before parsing a `JointState`.
* Web client (`useTwinTelemetry`): opts in with `heartbeat=2`, treats 3 intervals (6 s) of silence on an open socket as a dead
  link, closes and reconnects after 2 s, drops frames with a mismatching `robot_id`, rejects malformed/out-of-order frames,
  and exposes `{frame, transport, ageMs, fresh, error, heartbeat}`. `fresh` is false unless transport is connected, the frame says
  `connected` and its age ≤ the stale window. The panel shows origin (mock / simulation / live physical) and heartbeat state.
* Session isolation: the viewer scope names org + robot ids; frames for other robots are not delivered; simulation state is
  keyed per robot and bound to the publisher's organization.

## 3. Ingest endpoints (private, bearer HMAC scope)

| Endpoint | Caller | Rule |
|---|---|---|
| `POST /internal/simulation-telemetry` | Education API after an R1 run | scope kind `simulation_publisher` (60 s TTL, org + robot); body `{organization_id, robot_id, experiment_id, telemetry}`; `source_mode` must be `SIMULATION`; duplicates are idempotent, out-of-order → 403; response reports `mujoco: synchronized | unavailable | model_unconfigured` |
| `POST /internal/physical-telemetry` | the single configured hardware owner | owner, org and robot must equal the process configuration; unconfigured → 404. Never accepts commands. |
| `GET /health` | anyone | `{"status":"ok","mode":"mock"}` (the label states mock explicitly) |

MuJoCo: `VISTA_TWIN_MUJOCO_MODEL_PATH` selects the SO-101 MJCF. Without it frames are accepted and reported
`model_unconfigured`. **The model file is not in this repository** (it is read from `mujoco-menagerie-reference`); see
`services/digital-twin/ASSET_PROVENANCE.md` and the blockers document.

## 3a. Evidence (this sprint)

* `services/digital-twin`: pytest 56/56 with `--extra simulation` (includes MuJoCo load/sync, bridge R1→CHECKIK fake→Twin→MuJoCo,
  signed scope matrix, out-of-order and stale handling, and the new heartbeat tests).
* `web/robot-edu`: Vitest `components/digital-twin` 21/21 (new: heartbeat parsing, silent-link timeout, opt-in URL).
* Playwright `wf03-runtime-evidence.spec.ts` 1/1: the real API published fake-follower telemetry and the running Twin answered
  `accepted` (`digitalTwinTelemetry: accepted`). The MuJoCo joint assertion is in the pytest bridge test, **not** in the browser journey.
* Not tested: heartbeat against a real network partition (unit/ASGI only), the 3-D viewer rendering a MuJoCo state in a browser,
  `LIVE_PHYSICAL` frames from a device.

## 4. Robot Runtime R1 (private, never browser-reachable)

Endpoints (bearer `VISTA_RUNTIME_TOKEN`): `GET /health`, `GET /status`, `POST /runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`,
`POST /stop`. Canonical steps only: `arm.select, home, gripper.open, gripper.close, wait`.

| Requirement | Status | Evidence / gap |
|---|---|---|
| Robot registration, availability, entitlement | Education API (`robots`, `org_entitlements`, eligible-robots query) | WF-01 DB suite + Playwright |
| Resource allocation | `PUT /education-admin/classrooms/:id/robot-allocation` | WF-01 |
| Lab-session authorization | `POST /me/attempts/:id/physical-executions[/start]` re-derives student, delivery, immutable version, symbolic PASS, allocation, entitlement and creates an owned control session | service unit + DB suites, WF-03 E2E |
| Command validation | `Runtime._validate_request`, per-profile `maxWaitMs`, arm context | pytest 17/17; `ai-integration` drift tests |
| Command acknowledgement / result | run state + sanitized events (`execution_failed`/`execution_cancelled`) | pytest |
| Telemetry | one validated `JointState` per step, `SIMULATION` only | pytest + E2E |
| Heartbeat | Twin WS heartbeat **(new)**; R1 has no heartbeat/lease of its own | gap |
| Disconnect handling | adapter errors → `failed/runtime_execution_failed`; API readiness `runtimeOnline=false`; SIGTERM releases the listener | pytest `test_server_shutdown`, API/runtime check |
| Session expiration | whole-run deadline (`maxRunMs`); control sessions expire in the API | pytest, API tests |
| Emergency stop | `POST /stop` latches (never clears; CHECKIK owns the hardware E-stop); `cancel` is cooperative | pytest; physical E-stop **not exercised** |
| Safe termination | cancelled/stopped runs end with an event and release the active slot | pytest |
| Audit events | API persists lifecycle events/provenance; R1 events carry no secrets | DB suites |
| Restart reconciliation | **absent**: R1 run state is in memory, a restart loses active runs | gap (documented, intentionally fail-closed) |

Safety: `hardwareEnabled` defaults to false; the fake-follower configuration never imports a real follower and never falls
back to one. The API refuses to start a local run unless the runtime reports `mode == fake_follower` and IoT is disabled.

## 5. Physical acceptance — BLOCKED

No commissioned SO-101 follower, calibration profile, per-arm safe-home/gripper values, E-stop, supervised session or operator
sign-off exists in evidence. See `SO101_PHYSICAL_TEST_RUNBOOK.md` and `services/digital-twin/PHASE5A_HARDWARE_READINESS.md`.
Nothing in this sprint requests or implies physical movement.

## 6. AWS IoT audit (read-only, repository only)

| Aspect | Finding | Source |
|---|---|---|
| Device identity | one demo Thing `vista-demo-so101-001`, one IoT policy, certificate-based (certificates issued out of band) | `infra/terraform/iot/main.tf`, runbook "Edge certificate provisioning" |
| Authorization | robot policy: `iot:Connect` for its client id, `iot:Publish` to its `telemetry`, `status` and `ack` topics, `iot:Subscribe/Receive` on its `…/commands` topic only; API role: `iot:Publish` on the single command-topic ARN; rule role: `sqs:SendMessage` only | main.tf, runbook "Topology and IAM boundary" |
| Topic naming | `<project>/<environment>/robots/<robot_id>/{commands,ack,status,telemetry}` (demo: `vista/demo/robots/so101-001/…`; `telemetry` is permitted by the device policy but unrouted) | main.tf rule SQL, `IOT_TOPIC_PREFIX` |
| Command contract | Education API `IotCommandService` publishes canonical steps with a UUID, TTL (`IOT_COMMAND_TTL_MS`), durable lifecycle row; crash-safe publish recovery runner | `iot-command.service.ts`, `iot-publish-recovery.*` |
| Feedback path | IoT rule → SQS (+DLQ, maxReceive 5) → `iot-feedback-worker` → `iot_command_lifecycles` | main.tf, `iot-feedback.*` |
| Robot ↔ session mapping | Robot id → runtime/identity via `VISTA_ROBOT_RUNTIME_MAP` (loopback only); control session owned by the student; IoT is refused locally while enabled for fake runs | `robot-runtime.client.ts`, `physical-execution.service.ts` |
| Device status | `status` topic captured by the rule; no heartbeat/last-seen topic and no presence table | gap |
| Telemetry over IoT | the device policy permits publishing to `…/telemetry`, but the only rule selects `ack` and `status`, and `digital-twin/iot_telemetry.py` is a 15-line stub — nothing consumes IoT telemetry today | gap |
| Multi-robot | policy/rule/topic are templated on **one** thing; adding robots means a per-robot thing + topic prefix (or `thing_names` variable) | design gap |
| Error handling | definite-failure vs unknown publish outcomes are distinguished and recovered; poison messages go to the DLQ | unit/DB tests |
| Live state | **UNKNOWN** — no AWS call was made | — |

Local adapters/tests that exist and pass: `iot-command.service.spec.ts`, `iot-feedback.*.spec.ts`,
`iot-publish-recovery.runner.spec.ts`, robot-runtime `iot.py` fake-robot mode (`iot.fakeRobot`, disabled in the example config).

**Approval plan for any infrastructure mutation (not executed):** (1) reviewed `terraform plan` of the IoT root only, no
`apply`; (2) adding a per-robot thing/policy requires a variable change plus review of the exact ARNs; (3) a telemetry/heartbeat
topic and rule requires a policy diff; (4) secrets (`VISTA_IOT_*`) changed only through the protected deploy workflow with the
previous secret version recorded for rollback; (5) certificates are issued by the operator on the device, never committed;
(6) enable MQTT in Production only after fake-telemetry evidence per `docs/operations/aws-iot-so101.md`. Each step needs the
owner's explicit approval.
