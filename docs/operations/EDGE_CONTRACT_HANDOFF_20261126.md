# Edge Runtime / Desktop contract handoff to Codex (final, 2026-11-27 eve)

Claude owns Education API, Web, AWS integration and backend contracts; Codex owns Desktop Lab Station and the Edge Runtime. Every value below is the **implemented, deployed contract** (Production `ebf344f`) unless marked **TO IMPLEMENT**. Nothing was run against hardware.

## 1. Fixed identifiers
| Item | Value |
|---|---|
| Production API | `https://api.skynex.best/api/v1` (Web `https://skynex.best`) |
| Robot UUID (`robots.id`) | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` (`VISTA-WF01-DEMO-ROBOT-01`) |
| IoT endpoint (ATS, port 8883, mTLS) | `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com` |
| Thing / MQTT **client id** | `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` (the policy allows only this client id) |
| Certificate files (Edge machine only, 0700 dir, key 0600) | `~/vista-edge-certs/device.pem.crt`, `~/vista-edge-certs/private.pem.key`, `~/vista-edge-certs/AmazonRootCA1.pem` (created by the owner, see `ROBOTICS_ACTIVATION_PLAN_20261126.md` §3) |
| Edge config | `iot.enabled=true`, `iot.robotId`, `iot.thingName`, `iot.endpoint` as above, `iot.topicPrefix=vista/demo/robots/<robot uuid>` |

## 2. Topics (the Thing policy allows exactly these)
Subscribe/receive `vista/demo/robots/<robot>/commands` (QoS 1). Publish `…/ack`, `…/status`, `…/telemetry`. Classic Shadow `$aws/things/<thing>/shadow/{get,update}` and `/get/*`, `/update/*`. Nothing else, no other robot.

## 3. Command (API → Edge) — implemented
Envelope: `{schemaVersion:1, kind:"run", commandId (uuid), robotId, sequence (= issue time in epoch ms), issuedAtMs, expiresAtMs (= issued + VISTA_IOT_COMMAND_TTL_MS, default 10 000), payload:{runId:"wf03-<experiment uuid>", robotId, programVersionId, profile:"lesson", program:{kind:"robot_program", schemaVersion:1, steps:[{type:"arm.select",arm:"left"},{type:"gripper.open"},{type:"gripper.close"},{type:"home",arm:"left"}, …]}}}`. Canonical steps only: `arm.select`, `home`, `gripper.open`, `gripper.close`, `wait`. The Edge (already implemented in `iot.py`): rejects invalid/identity-mismatch/expired/replayed (`sequence <= last`) commands with `ack rejected` + code, de-duplicates by `commandId`, never executes on reconnect.

## 4. ACK / status (Edge → API) — implemented
`{schemaVersion:1, kind:"ack"|"status", robotId, commandId, status, eventId:"<commandId>:ack:<status>"|"<commandId>:status:<status>", sequence, occurredAtMs, atMs, code?}`; ack `status` ∈ accepted|rejected; status `status` ∈ executing|completed|failed (`code` on failure). The IoT rule forwards **only** `ack` and `status` messages that carry a `commandId` to SQS; the worker is idempotent by `eventId`, orders by `sequence`, commits before delete, DLQ after retries.

## 5. Device Shadow `reported` — current schema v1 and what the API now enforces
Implemented today: `schemaVersion, connection ("connected"/"disconnected" + MQTT last will), runtimeKind (MOCK_RUNTIME|UNVERIFIED_RUNTIME), hardwareEnabled, stopped, activeRunId, lastCommandSequence, reportedAtMs`. Reported only; **never** use `desired` for control and never send motor commands through the Shadow.
**TO IMPLEMENT (Codex), priority order:**
1. **Heartbeat: refresh `reportedAtMs` at least every 10 s while connected** (today only on connect and after a command). The API refuses a start when `now - reportedAtMs > 30 s` (`VISTA_IOT_SHADOW_MAX_AGE_MS`, 5–300 s bounds).
2. `stopped=false` only when the runtime is genuinely ready (controller reachable, e-stop clear).
3. Additive fields (same schemaVersion): `adapterMode` (string, e.g. `fake_follower` for simulation, `so101_follower` for the real follower), `armed` (bool, **true only after a local operator action**, false by default and after every reconnect), `calibrationReady` (bool), `fault` (null or code).
4. Last will unchanged. No automatic arming, no motion on reconnect.

## 6. Start requirements the API enforces (PRs #229, #234)
**Simulation start** (`VISTA_IOT_START_MODE=simulation`): shadow `connection=connected`, fresh ≤30 s, `stopped!=true`, `runtimeKind=MOCK_RUNTIME`, `hardwareEnabled=false`. Run is stored as `fake_follower` ⇒ provenance **MOCK_RUNTIME**.
**Physical start** (`VISTA_IOT_START_MODE=physical_commissioning`, PR #234, off by default, a separate approved change): additionally the API requires the **approved robot id**, an **allowlisted user** (≤10), an **unexpired window** (`VISTA_PHYSICAL_COMMISSIONING_UNTIL`), the student's explicit safety confirmation, and a fresh connected shadow with `hardwareEnabled=true`, `armed=true`, `calibrationReady=true`, `fault=null`, and an `adapterMode` listed in `VISTA_PHYSICAL_RUNTIME_MODES` (a mock/fake mode is never accepted). The shadow is one condition among several and **not** the authorization for motion: the Edge Safety Controller, local arming, calibration, e-stop, command expiry/duplicate rejection and watchdog remain authoritative. Only declared adapter modes classify as PHYSICAL_ROBOT; simulation is never PHYSICAL_ROBOT.

## 7. Digital Twin telemetry — what exists and what does not
Verified from the code and AWS: the Twin accepts telemetry only over HTTP on the EC2 host's private network (`/internal/simulation-telemetry` from the API; `/internal/physical-telemetry` from a LeLab-owner publisher, which needs a configured hardware owner and network reach to `127.0.0.1:8767`). The only public Twin endpoint is the viewer WebSocket `wss://api.skynex.best/ws/twin` (60 s scoped viewer token). The IoT rule forwards no telemetry, the feedback worker consumes only ack/status, and the API's Twin client pushes only `source_mode:"SIMULATION"` snapshots that come from the loopback runtime. **Consequence: MQTT `…/telemetry` messages reach nothing today; Edge telemetry does not appear in the Web viewer. This is NOT IMPLEMENTED (a gap, not a configuration).** Proposed minimal design (no new infrastructure): the Edge embeds a Twin frame (`schema_version:1, robot_id, source_mode, controller_id, measured_at, sequence, connection, measured[6]`) in its `status` events; the feedback worker validates it and forwards it through the existing signed publisher routes. Decision pending with the owner; until then expect only the labelled `so101-mock` frame in the viewer.

## 8. Evidence and recordings (physical path; separate from simulation evidence)
Student JWT `POST /me/experiments/:experimentId/recordings/uploads` → presigned PUTs under `episodes/<robot>/<episode>/` in bucket `vista-demo-robot-recordings-…-sg` → `manifest.json` uploaded last (`vista.robot.recording.v1`, sizes + SHA-256) → S3 event → recordings queue → worker verifies and registers → instructor `GET /submissions/:submissionId/experiments/:experimentId/recordings[/…/download]`. Desktop device enrolment/auth: `docs/acceptance/DESKTOP_API_CONTRACTS.md`. Never weaken provenance checks. Simulation evidence is the experiment/lifecycle record produced by the API from ack/status events.

## 9. Safety, reconnect and shutdown (required behaviour)
Local operator arming only; arming state cleared on every reconnect/restart; local e-stop latch blocks motion until a local clear; watchdog stops/holds on loss of control link; joint and velocity limits enforced on the Edge regardless of the command; on shutdown publish `connection:"disconnected"` and stop any active run; never execute a command older than its `expiresAtMs`, never replay.

## 10. Acceptance dataset (Production, run R1126-1901)
| Entity | Id |
|---|---|
| Organization | `597cd591-ba63-4a27-af5d-12fede921fad` |
| Classroom (Advanced) / offering | `9c09e27d-a4d6-425d-824e-5474cb206e68` / `de508d2e-7ecb-4ad3-af03-495b075aec0c` |
| Instructor (app user) | `7dbc41c1-fdd6-4e2b-8e67-2b68c3262905` |
| Student 1 (app user) | `f9eb7496-9369-449f-9b9f-9368122fa410` |
| Course (5 modules) / Module 5 lesson | `eff5ec2e-da86-4c8d-8ff5-920e09d98271` / `fbaa2ac8-5d34-4dfa-af94-99a1ae0d53cf` |
| Module-4 Blockly assignment / classroom assignment | `dc1c85d4-d279-440b-bd81-3861f4abcb50` / `b148af29-378a-41e6-bc28-64e29bdb8eee` |
| Qualifying attempt → program → version | `6057647b-a84a-4fab-a0df-ff4fdac93aa5` → `92f8687a-2095-4694-b098-dd9f19183476` → `4583b824-5332-43b7-85ca-c04e80241bc1` |
| Schematic experiment → symbolic evaluation (passed) → submission | `9fb84446-f86f-4b96-95e5-387147dfb715` → `4497eaa1-e404-4196-b270-ef629ba41395` → `01bc0576-daf6-46cc-bc99-45ebba993526` |
| Robot | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` (not yet entitled to the organization or allocated to this classroom; eligibility today: `ROBOT_NOT_ALLOCATED`, `symbolicPassed:true`) |

## 11. Remaining Codex tasks (precise)
1. Shadow heartbeat ≤10 s (section 5.1), `stopped` semantics, and the additive fields `adapterMode, armed, calibrationReady, fault` (5.2–5.4), with unit tests.
2. `armed` handling: set only by a local operator action; reset on reconnect/restart.
3. Edge `status` events carrying an optional Twin `telemetry` frame **if** the owner approves the design in section 7.
4. Desktop sign-in as the student and the recording upload per section 8 (hardware phase).
5. Keep `hardwareEnabled=false`, `fakeRobot=true`, `adapterMode=fake_follower` for all simulation acceptance; verify ack/status ids, sequences and TTL behaviour against section 3–4.
