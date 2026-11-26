# Edge Runtime / Desktop contract handoff to Codex (final, 2026-11-27 eve)

Claude owns Education API, Web, AWS integration and backend contracts; Codex owns Desktop Lab Station and the Edge Runtime. Every value below is the **implemented, deployed contract** (Production `ebf344f`) unless marked **TO IMPLEMENT**. Nothing was run against hardware.

## 0. What already exists, what to reuse, and what Codex must implement (verified 2026-11-27)
**Backend (DEPLOYED/READY, do not rebuild):** command lifecycle, feedback worker, simulation and physical telemetry bridges, Twin freshness, start gates, recordings API/worker, entitlement/allocation, evidence/review. All telemetry bridges and physical mode are **off** until the owner activates them.
**Reuse, do not rebuild (Desktop `leduc121/vista_lab`, local `/home/quangduc/Code/vistadesktop/vista-lab-station`):** `checkIk/` (hardware safety controller, calibration/audit tools `audit_so101_hardware.py`, pose/observation readers, teleoperation backends), `edge-supervisor.js` + `robot-runtime.js` (process supervision), `recording-manager.js` (episodes/manifest), `device-provisioning.js`/`api.js` (student sign-in and API calls), the MuJoCo workspace and Twin viewer. **Reuse and extend, do not rewrite, the Edge R1 runtime in this repository** `services/robot-runtime` (`iot.py`: mTLS MQTT, command handling, ack/status, Shadow, last will; `runtime.py`: command preflight).
**Confirmed gap that blocks the physical run:** R1's preflight (`runtime.py` `_preflight`) rejects every `adapterMode` except `fake_follower` (`adapter_mode_not_supported`), and `iot.py` can only report `MOCK_RUNTIME`/`UNVERIFIED_RUNTIME`. There is **no physical adapter yet**. The value `VISTA_PHYSICAL_RUNTIME_MODES=so101_follower` is therefore a **contract value Codex must implement**, not an existing one; the identifier may be changed only together with the secret.
**Codex tasks (concrete, in order):**
1. **Physical adapter in R1** (`adapterMode:"so101_follower"`): execute the canonical steps (`arm.select`, `home`, `gripper.open`, `gripper.close`, `wait`) on the single configured follower **through the existing CHECKIK safety controller** (never around it); refuse motion unless the local operator has armed, calibration is ready, no fault, no e-stop latch; keep velocity/joint limits and the watchdog in the Edge; no motion on reconnect.
2. **`iot.py` Shadow**: heartbeat ≤10 s refreshing `reportedAtMs`; fields `adapterMode`, `armed` (true only after a LOCAL operator action; false after every connect/reconnect/restart), `calibrationReady`, `fault`; `runtimeKind` = `MOCK_RUNTIME` for `fake_follower`, otherwise `UNVERIFIED_RUNTIME` (the API, not the Edge, decides PHYSICAL_ROBOT from the declared adapter modes); `stopped=false` only when genuinely ready; keep the last will.
3. **Telemetry publishers** (≤2 Hz, ≤120 frames/run, only while the command is executing): `status:"telemetry"` frames (SIMULATION, fake_follower only) and `status:"physical_telemetry"` messages built from the follower's **measured** `<joint>.pos` observation (the CHECKIK/LeLab reader already returns it), exactly as in §7/§7b.
4. **Desktop supervisor** (`edge-supervisor.js`): pass the certificate paths, robot UUID, Thing name and endpoint (§1) to R1; hardware stays disabled unless the operator arms locally.
5. **Recording** (physical phase): reuse `recording-manager.js` to upload through the student's authenticated session (§8).
Do not implement any Backend, Twin or AWS change: they are done. Do not assign dual-arm cloud work: one follower only.

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

## 6. Start requirements the API enforces (PRs #229, #234 and the physical-twin PR)
*Correction found while testing:* in #234 the AWS Device Shadow reader was created only for `simulation`, so `physical_commissioning` could never start; the physical-twin PR fixes it (reader for both modes, test added). Until that PR is deployed the physical start does not work.
**Simulation start** (`VISTA_IOT_START_MODE=simulation`): shadow `connection=connected`, fresh ≤30 s, `stopped!=true`, `runtimeKind=MOCK_RUNTIME`, `hardwareEnabled=false`. Run is stored as `fake_follower` ⇒ provenance **MOCK_RUNTIME**.
**Physical start** (`VISTA_IOT_START_MODE=physical_commissioning`, PR #234, off by default, a separate approved change): additionally the API requires the **approved robot id**, an **allowlisted user** (≤10), an **unexpired window** (`VISTA_PHYSICAL_COMMISSIONING_UNTIL`), the student's explicit safety confirmation, and a fresh connected shadow with `hardwareEnabled=true`, `armed=true`, `calibrationReady=true`, `fault=null`, and an `adapterMode` listed in `VISTA_PHYSICAL_RUNTIME_MODES` (a mock/fake mode is never accepted). The shadow is one condition among several and **not** the authorization for motion: the Edge Safety Controller, local arming, calibration, e-stop, command expiry/duplicate rejection and watchdog remain authoritative. Only declared adapter modes classify as PHYSICAL_ROBOT; simulation is never PHYSICAL_ROBOT.

## 7. Digital Twin telemetry — FINAL contract (PR "twin telemetry bridge", code only, no new infrastructure)
**Transport.** The Edge publishes a telemetry frame as a **`status` message** on `vista/demo/robots/<robot>/status` (the topic the existing IoT rule already forwards when `commandId` is present) — no rule, queue, IAM or Terraform change. The feedback worker (EC2) recognizes `status:"telemetry"` **before** the lifecycle repository and relays it to the private Twin (`/internal/simulation-telemetry`, 60 s HMAC publisher token the API signs; the Edge holds no AWS or Twin credential). The private Twin endpoint is not exposed.
```
{ "schemaVersion":1, "kind":"status", "status":"telemetry", "robotId":"<robot uuid>", "commandId":"<active command uuid>",
  "eventId":"<commandId>:telemetry:<sequence>", "sequence":<int, strictly increasing per command, continuing after the ack/executing sequences>,
  "occurredAtMs":<epoch ms>, "telemetry": { "schema_version":1, "robot_id":"<robot uuid>", "source_mode":"SIMULATION", "controller_id":"<edge id>",
    "measured_at":"<ISO-8601 with timezone>", "sequence":<int>, "connection":"connected",
    "measured":[ {"name":"shoulder_pan","position":<finite>,"unit":"rad|deg"}, {"name":"shoulder_lift",…}, {"name":"elbow_flex",…}, {"name":"wrist_flex",…}, {"name":"wrist_roll",…}, {"name":"gripper","position":<finite>,"unit":"rad|deg|percent"} ] } }
```
Joint order is exactly `shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper`; only the gripper may use `percent`.
**What the simulation worker enforces (each failure drops that frame; nothing else happens):** envelope fields valid; frame `source_mode` **SIMULATION only** and `robot_id` equal to the envelope robot; `connection:"connected"`; six joints in order with finite numbers and allowed units; `occurredAtMs` and `measured_at` not older than 10 s and not more than 2 s in the future; per-command strictly increasing `sequence`; at most **5 frames per second per robot** (the Edge sends **≤ 2 Hz, ≤ 120 frames per run**); the `commandId` must exist, belong to that robot and be `acknowledged`/`executing`; the persisted runtime provenance must be **MOCK_RUNTIME**. Organization, experiment and attempt come from the lifecycle record, never from the frame. A Twin outage or any internal error drops the frame; telemetry never reads or writes the lifecycle/experiment/session tables (the repository also rejects `status:"telemetry"` and `status:"physical_telemetry"` as lifecycle events). Activation flag: `VISTA_IOT_TELEMETRY_BRIDGE_ENABLED=true` (default off ⇒ acknowledged and dropped).

### 7b. PHYSICAL telemetry — separate message, separate worker branch, separate Twin route (this PR)
**Transport (no new infrastructure, nothing exposed publicly, no credential on the Edge):** Edge measured joint state → authenticated MQTT (`…/<robot>/status`, existing rule) → SQS → feedback worker (EC2) → `IotPhysicalTelemetryBridge` → private Twin `POST /internal/physical-telemetry` (publisher token minted by the worker from `DIGITAL_TWIN_SCOPE_SECRET`; Twin container on the private Docker network, loopback port only) → authorized WebSocket viewer. It never uses the simulation route/token, and the simulation bridge refuses this message and vice versa.
```
{ "schemaVersion":1, "kind":"status", "status":"physical_telemetry", "robotId":"<robot uuid>", "commandId":"<active command uuid>",
  "eventId":"<commandId>:physical:<sequence>", "sequence":<int, strictly increasing per command>, "occurredAtMs":<epoch ms>,
  "adapterMode":"<the same adapterMode the shadow reported and the start recorded>",
  "measuredAt":"<ISO-8601 with timezone: when the joints were MEASURED>",
  "observation": { "shoulder_pan.pos":<deg>, "shoulder_lift.pos":<deg>, "elbow_flex.pos":<deg>, "wrist_flex.pos":<deg>, "wrist_roll.pos":<deg>, "gripper.pos":<percent 0..100> } }
```
Arm joints are raw motor observations in degrees, `|v| ≤ 180` (LeLab `use_degrees=True`; not a claim of URDF frame); the gripper is percent. All six keys, finite numbers.
**What the worker trusts and checks:** nothing the Edge claims about itself. It requires: physical commissioning configured and **window open** (`VISTA_PHYSICAL_COMMISSIONING_UNTIL`); `robotId` = the **approved robot**; the command's persisted records say: robot match, **learner in the allowlist**, state `acknowledged`/`executing`, and runtime provenance **PHYSICAL_ROBOT** (a real_robot run whose persisted adapter mode is in `VISTA_PHYSICAL_RUNTIME_MODES`; a mock/fake mode can never qualify) and equal to the message `adapterMode`; then freshness (≤10 s, not future), per-command ordering/duplicates, 5 frames/s/robot, six-joint range check. Organization/experiment/attempt/learner always come from the lifecycle→control session→experiment records. The Twin additionally binds the publisher token to its configured hardware **owner, organization and robot** and re-validates the observation; a token for another robot/org/owner, a simulation token, or a viewer token is rejected. Failure of the Twin, DB or any check drops that one frame (acknowledged, no retry, no DLQ); a physical frame can never complete, fail or reorder a command. Activation flag `VISTA_IOT_PHYSICAL_TELEMETRY_BRIDGE_ENABLED=true` (default off) plus the Twin settings in 7c.
**Twin viewer authorization (existing):** a viewer token (60 s HMAC, issued by the authenticated API) must name the robot and the **owner organization**; others are closed with 4403. NOTE the Twin keeps **one** physical state for its single configured owner (not per attempt): every student/instructor of that organization who is entitled to the robot sees it while it is live.

### 7c. Freshness (honest latency) — Twin PR changes, default behaviour unchanged
Source of the earlier "1–3 s" was an estimate, not a measurement: the path is IoT rule → SQS → long-polling worker → one DB lookup → HTTP to the Twin; typically a few hundred ms, bounded by the 10 s drop rule. **It must be measured on the first cloud run** (heartbeat `timing.transport_delay_ms`). The Twin now separates four things instead of widening one threshold: the **measurement time** (`measured_at`, never rewritten), the **cloud receipt time** (Twin clock when the frame arrived), the **viewer delivery time** (`server_time` in the heartbeat) and **connectivity**. Heartbeat (`?heartbeat=<s>`) now carries `timing:{measurement_age_ms, received_age_ms, transport_delay_ms}` next to `age_ms`; frames are unchanged. In relay mode a frame is `stale` when **no frame was received for `VISTA_TWIN_RELAY_STALE_AFTER_SECONDS`** or the **measurement is older than `VISTA_TWIN_MAX_MEASUREMENT_AGE_SECONDS`**. Recommended: `3.0` and `5.0` (≥ 6 frame intervals at 2 Hz plus margin; any delivery older than 5 s is stale however it was received). Unset ⇒ the legacy direct rule (stale when the measurement is >0.5 s old), which is right only for a publisher with no cloud hop. A delayed stream must be described as **delayed, not real-time**; the viewer should show the transport delay.
Twin settings reach the container through the host deploy script (whitelisted `VISTA_TWIN_*` keys copied from the secret-derived `api.env`; needs the host-script refresh): `VISTA_TWIN_PHYSICAL_OWNER_ID`, `VISTA_TWIN_PHYSICAL_ORGANIZATION_ID` (= `597cd591-ba63-4a27-af5d-12fede921fad`), `VISTA_TWIN_PHYSICAL_ROBOT_ID` (= `f1c066c4-…`), optional `VISTA_TWIN_PHYSICAL_FOLLOWER_ID`, `VISTA_TWIN_RELAY_STALE_AFTER_SECONDS`, `VISTA_TWIN_MAX_MEASUREMENT_AGE_SECONDS`. The API/worker side needs the same owner id in `VISTA_TWIN_PHYSICAL_OWNER_ID`. Without the three physical identity keys the Twin's physical route stays disabled (404).

### 7d. Arms and robot identity — what is and is not supported
- **One robot UUID = one Thing = one Twin hardware owner = one six-joint follower.** The Twin contract (`SO101_JOINTS`, one `LeLabFollowerTelemetryAdapter` with one robot/follower id), the IoT policy/queues/bucket, the EC2 role and the commissioning allowlist are all single-robot. **Only ONE follower arm streams measured joint telemetry** (the arm whose `*.pos` observation the Edge reports; the Edge config chooses left or right). Leader arms are operator input devices: they have no cloud identity and no Twin telemetry.
- **Dual-arm cloud acceptance is NOT supported and must not be claimed.** A second follower would need a second robot identity (new robot row, Thing, policy, queues, EC2 role statements, worker multi-queue support and a second Twin owner or a Twin schema change to 12 joints): not a Backend task for tomorrow. **Plan: verify the single-follower path first** (choose one follower; map its serial port in the Edge; Twin model = one SO-101 arm, units deg/percent as above). Dual-arm local teleoperation on the Edge machine is outside this cloud contract.

## 8. Evidence and recordings (physical path; separate from simulation evidence)
**Desktop authentication:** the Desktop Lab Station signs in as the student with the student's Supabase session (`Authorization: Bearer <student JWT>`) and calls only the API routes below; it holds **no AWS credential and no Twin secret** (the Edge machine's identity is the IoT certificate, not a token). Device enrolment: `docs/acceptance/DESKTOP_API_CONTRACTS.md`.
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
3. Publish the SIMULATION frames of section 7 (hardware-disabled runtime only) and, in the physical phase, the `physical_telemetry` messages of section 7b — each ≤2 Hz, ≤120 per run, only while the command is `executing`, only from the single configured follower; never mix the two message types and never send physical data from a mock runtime.
4. Desktop sign-in as the student and the recording upload per section 8 (hardware phase).
5. Keep `hardwareEnabled=false`, `fakeRobot=true`, `adapterMode=fake_follower` for all simulation acceptance; verify ack/status ids, sequences and TTL behaviour against section 3–4.
