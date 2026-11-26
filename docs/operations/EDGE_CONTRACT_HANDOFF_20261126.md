# Edge Runtime / Desktop contract handoff to Codex (2026-11-26)

Claude owns Education API, Web, AWS integration and backend contracts; Codex owns Desktop Lab Station and the Edge Runtime. This file is the exact contract the backend expects. All existing schemas stay unchanged; the additions below are optional and additive.

## 1. Identity and transport (unchanged)
- Robot UUID `f1c066c4-b5f2-45c4-b933-f034f3824dd9`; Thing and MQTT client id `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9`; endpoint `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com:8883` (mTLS, ATS root CA).
- Topics: subscribe `vista/demo/robots/<robot>/commands` (QoS1); publish `…/ack`, `…/status`, `…/telemetry`; classic Shadow `$aws/things/<thing>/shadow/{update,get}` (+ `/accepted|/rejected|/delta`). The Thing policy allows nothing else.
- Config: `iot.enabled=true`, `fakeRobot=true`, **`hardwareEnabled=false`** for all simulation acceptance.

## 2. Command (API → Edge)
`{schemaVersion:1, kind:"run", commandId, robotId, sequence, issuedAtMs, expiresAtMs, payload:{runId, robotId, programVersionId, profile:"lesson", program:{canonical steps arm.select|home|gripper.open|gripper.close|wait}}}`. Reject expired commands; never execute a replayed/old sequence; never arm or start motion on reconnect; unknown/malformed → `ack` rejected with a code.

## 3. ACK/status (Edge → API, via IoT rule → SQS → worker)
Every event carries `commandId`, `eventId` (unique), `sequence` (monotonic per run), `occurredAtMs`, `robotId`, `status` ∈ accepted/rejected/executing/completed/failed. Rule forwards only `ack`/`status` with a `commandId`. Duplicates are idempotent; out-of-order is ordered by sequence.

## 4. Device Shadow `reported` (schema v1 today)
Today: `schemaVersion, connection, runtimeKind (MOCK_RUNTIME|UNVERIFIED_RUNTIME; never PHYSICAL_ROBOT unless the deployment declares it), hardwareEnabled, stopped, activeRunId, lastCommandSequence, reportedAtMs`; last-will sets `connection:"disconnected"`.
**API requirements (implemented in PR #229):** the simulation start preflight accepts only `connection=connected`, `reportedAtMs` within 30 s, `stopped!=true`, `runtimeKind=MOCK_RUNTIME`, `hardwareEnabled=false`. **Therefore the Edge must publish a heartbeat that refreshes `reportedAtMs` at least every 10 s while connected** (today it only reports on change/connect) — required for tonight's simulation acceptance.
Requested optional additions (additive, same schema version): `runtimeVersion`, `firmwareVersion`, `calibration: {leftReady, rightReady}`, `armed` (bool, default false, only ever set by a local operator action), `fault` (null or code), `heartbeatAtMs`. Do not use `desired` for control; no motor commands via the Shadow.

## 5. Telemetry and Twin
Telemetry per the Twin schema v1 (joint order/units as in `services/digital-twin`), `source_mode` `SIMULATION` for fake follower. The Twin accepts telemetry only through the API-signed internal route; viewers need a 60 s scoped token. Never send physical telemetry from a hardware-disabled runtime.

## 6. Recordings and evidence (physical path only; separate from simulation evidence)
Student JWT `POST /me/experiments/:experimentId/recordings/uploads` → presigned S3 PUTs under `episodes/<robot>/<episode>/` → upload `manifest.json` last (`vista.robot.recording.v1`, file sizes and SHA-256) → S3 event → queue → worker verifies → instructor `GET /submissions/:id/experiments/:id/recordings[/…/download]`. The provenance checks must not be weakened.

## 7. Acceptance criteria for Codex (simulation, hardware disabled)
1. Edge connects with the owner-created certificate; Shadow shows connected/MOCK_RUNTIME/`hardwareEnabled=false`, heartbeat ≤10 s.
2. A student start produces `accepted → executing → completed` events with ids/sequence; expiry and duplicate cases behave per section 2–3.
3. Disconnect/reconnect: shadow flips to disconnected and back; no command replays; no automatic motion.
4. Evidence shows provenance MOCK_RUNTIME; Twin telemetry labelled SIMULATION reaches only the authorized viewer.
