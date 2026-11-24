# Digital Twin, Desktop Lab Station and AI/VLA handoff, 2026-11-24

Web is frozen. This is the integration boundary for the next phase. Statuses are NOT VERIFIED unless a verification is named.

Production release `ef95cddb540ef6f7059a9422bfe1c381ee425a89` (API `gitSha`, web `version.json`) was deployed on 2026-11-24 and checked on the running system. See "Post-deployment status" for what is verified and what is not.

## Deployed values (AWS, 2026-11-24; ap-southeast-1)
Verified in AWS on 2026-11-24 (IoT root 17 of 17 resources, no drift). Public identifiers only; no private key or secret exists in this repository, and no device certificate has been created yet.

| Item | Value |
| --- | --- |
| Robot (logical, `robots.id`) | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` (VISTA Classroom Demo Robot Resource, `VISTA-WF01-DEMO-ROBOT-01`). Linking it to a physical SO-101 is confirmed separately when the device is provisioned. |
| Thing / MQTT client id | `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| IoT data endpoint (ATS, 8883, mTLS) | `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com` |
| Topic prefix | `vista/demo/robots/f1c066c4-b5f2-45c4-b933-f034f3824dd9` (`/commands`, `/ack`, `/status`, `/telemetry`) |
| Thing policy | `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9-policy`: connect as that Thing, publish ack/status/telemetry, subscribe/receive commands, its own classic Shadow only. Attached to no certificate. |
| Cloud rule | forwards `ack`/`status` events that carry `commandId` to the API feedback queue (tested). Telemetry and device state are not forwarded. |
| Digital Twin viewer socket | `wss://api.skynex.best/ws/twin` (viewer scope token from the Education API in the `vista.twin.*` subprotocol; with no live state a viewer receives only the labelled `SIMULATION` mock frame of robot `so101-mock`; once real simulation or physical state exists a viewer without a valid scope is closed with code 4403) |
| Robot Recordings | upload through `POST /me/experiments/:experimentId/recordings/uploads` (student JWT); instructor read through `GET /submissions/:submissionId/experiments/:experimentId/recordings` and `.../recordings/:artifactId/download` (requires `learning.work.review` in the submission's classroom; deployed, routes answer 401 without a token, not yet exercised with a real instructor session) |
| Production MQTT command dispatch | **OFF** (`VISTA_IOT_ENABLED=false`). A test device must be an isolated Thing/certificate and a separate approval. |

Edge configuration: `iot.robotId` = the robot UUID above, `thingName` = the Thing name above, `endpoint` = the data endpoint above. Event contract: `eventId`, `sequence`, `occurredAtMs` on every event; execution lifecycle `executing` then `completed` or `failed`.

## Where each component runs
| Component | Role (from the code) | Runs |
| --- | --- | --- |
| Web (React) | learning UI; Digital Twin viewer; asks the Education API for a viewer scope | browser; static files on S3 and CloudFront |
| Education API | authN/Z, classroom and robot allocation, experiments and evidence, issues 60 s HMAC viewer scopes, pushes signed simulation telemetry to the Twin, device enrolment | AWS EC2 (deployed) |
| Digital Twin (`services/digital-twin`) | FastAPI **telemetry boundary**: latest-state per robot and attempt, `/ws/twin`, `/internal/simulation-telemetry`, `/internal/physical-telemetry`, `/internal/revoke-attempt`; MuJoCo is used to **validate and map joint state** (names and limits), not to step physics | local only; not deployed |
| Runtime R1 (`services/robot-runtime`) | private command runtime: canonical steps only (`arm.select`, `home`, `gripper.open`, `gripper.close`, `wait`), stop latch | local or edge; the API maps robots to **loopback** R1 URLs only |
| CHECKIK adapter | the only process allowed near a follower; `fake_follower` mode exists | edge or Desktop |
| Desktop Lab Station (`leduc121/vista_lab`, Codex) | SO-101 connection, calibration, teleoperation, LeLab flow, recording | workstation |
Do not put hardware access, adapters or recording on the Education API instance.

## Verified locally on develop `830dd96` (probe, no hardware)
Twin health and mock WebSocket (6 joints, schema 1, increasing sequence); SO-101 MuJoCo model loads and a simulation frame is `synchronized`; an out-of-range joint is not applied; out-of-order, other-organization, missing-token frames and a simulation frame labelled `LIVE_PHYSICAL` are rejected (403); physical ingest answers 404 until an owner is configured; R1 runs a five-step program on the fake follower to `succeeded`; unauthenticated 401; non-canonical step 400; `/stop` sets the latch and the next run is `preflight_failed`. Earlier suites: Twin 59, R1 16, adapter 19, viewer stale and reconnect, scope revocation and WebSocket closure, WF-03 evidence persistence.
**Not implemented in the Twin:** trajectory recording and replay (`REPLAY` exists only as a contract value; LeLab owns recording), a durable revocation store (the 60 s scope TTL bounds it). **Improve:** `mujoco_sync` reloads the model on every frame; cache it.

## Contract Codex must use (Education API, bearer Supabase JWT unless noted)
- Devices: `POST /devices/enroll/start`, `/enroll/complete`, `/auth/challenge`, `/auth/token` (rate limited), then `GET /devices/me`, `POST /devices/me/heartbeat`; administration under `education-admin/organizations/:org/devices` (register, suspend, resume, revoke, rotate-credential).
- Allocation and viewing: `GET /robots/digital-twin/availability`, `POST /robots/:robotId/digital-twin/viewer-scope`, `POST /me/attempts/:attemptId/digital-twin/viewer-scope` (requires an active classroom allocation, entitlement and `learning.experiment.execute`).
- Execution and evidence: `POST /me/attempts/:id/physical-executions` (and `/start`), `GET /me/physical-executions/:id`, `POST .../:id/stop`, `GET /me/attempts/:id/physical-executions/active`; experiments `POST /me/attempts/:id/experiments`, `/run-schematic`, `/evaluate-symbolic`, `GET /me/experiments/:id/{result,events,artifacts}`, evidence download. Physical execution stays gated by permission, supervisor approval, calibrated robot and a working stop.
- Twin wire contract v1: frame fields `schema_version, robot_id, source_mode (LIVE_PHYSICAL|SIMULATION|REPLAY), controller_id, measured_at, sequence, connection, measured[6]`; publishers use distinct HMAC audiences (`simulation-publisher`, `publisher`) and must match owner, organization and robot. Telemetry is never labelled physical unless it came from the configured owner.
Desktop checklist: SO-101 connect and calibrate (profile stays `UNCALIBRATED` until evidence is reviewed), leader-follower teleoperation in the existing single follower owner, local R1 and Twin startup and shutdown, live Twin sync, record and replay, evidence upload, safe stop, Windows, macOS and Linux installers (none built; no link may be published until built and verified). Physical acceptance: NOT VERIFIED.

## Twin on AWS (deployed 2026-11-24; original proposal kept below)
Not heavy: pure Python, one latest state per robot and attempt, 30 Hz, no GPU, tens of MB plus the SO-101 model file (`VISTA_TWIN_MUJOCO_MODEL_PATH`, from the Menagerie reference, outside the repository; check its licence before shipping). Smallest option: a second container on the existing instance behind nginx at `/ws/` (upgrade headers), a CloudFront behavior for `/ws/*` to the API origin, `wss://` only, `digital_twin_ws_origin` in PR #196, `VITE_DIGITAL_TWIN_WS_URL` in the web build, `DIGITAL_TWIN_SCOPE_SECRET` (shared with the API) and `DIGITAL_TWIN_TELEMETRY_URL` in the secret. Watch connection count on the t3.medium; move to its own small instance if live viewers grow. Rollback: remove the container and the behavior; the viewer is off when no URL is configured. R1, the adapter and any physical publisher stay local; Production MQTT stays disabled.

## AI / VLA checklist (metadata registry is not inference)
ACT and SmolVLA loading; Model Registry versions with checkpoint artifacts and dataset lineage (registry metadata is done and tested; inference is NOT VERIFIED); inference runtime and its resource needs (GPU), camera and robot-state observations, action validation and clamping to joint limits, simulation inference first, then supervised physical inference. Nothing here actuates hardware.

## Cloud to edge MQTT contract (authoritative, 2026-11-24)
Everything below is taken from the running code (`iot-command.service.ts`, `iot-feedback.*`, `services/robot-runtime/src/iot.py`) and is pinned by tests on both sides: `services/robot-runtime/tests/fixtures/edge-feedback-events.json` is generated by the edge bridge and read by `iot-edge-contract.spec.ts` in the API.

**Identity.** One robot id everywhere: the `robots.id` UUID of the robot in the Education database. It is the MQTT topic segment, the `robotId` in every envelope and the lifecycle key. The AWS Thing is named `vista-<env>-<robotId>` (MQTT client id and shadow only). Two defects found in this review are fixed in the edge bridge: it used the Thing name as `robotId` (so it rejected every real command and its acks failed the identity check), and it sent no `eventId`, `sequence` or `occurredAtMs` and never reported execution progress. Configure the edge with `iot.robotId` = that UUID.

**Transport.** AWS IoT Core data endpoint (ATS, `iot_endpoint` output of the IoT root), port 8883, TLS 1.2 or later, mutual TLS with the device certificate, QoS 1, client id = Thing name. Topics, with prefix `vista/demo/robots` (`VISTA_IOT_TOPIC_PREFIX`):
| Direction | Topic | Purpose |
| --- | --- | --- |
| cloud to edge | `<prefix>/<robotId>/commands` | run command (subscribe only) |
| edge to cloud | `<prefix>/<robotId>/ack` | command acknowledgement |
| edge to cloud | `<prefix>/<robotId>/status` | execution lifecycle events (with `commandId`) and device state (without) |
| edge to cloud | `<prefix>/<robotId>/telemetry` | fake-follower joints only; never sent for hardware that is not verified |
| edge to cloud | `$aws/things/<thing>/shadow/update` | Device Shadow `reported` state and last will |
The IoT rule forwards only `ack` and `status` messages that carry a `commandId` to the feedback queue; device state goes to the Shadow.

**Command** (API to edge): `{schemaVersion:1, kind:"run", commandId:<uuid>, robotId, sequence:<int, strictly increasing per robot>, issuedAtMs, expiresAtMs (TTL 1 to 60 s, default 10 s; an expired command is never executed), payload:<R1 run request>}` where the payload is `{runId, programVersionId, profile:"lesson", program:{kind:"robot_program", schemaVersion:1, steps:[arm.select | home | gripper.open | gripper.close | wait]}}`. Anything else is refused (`preview.move_xyz` included).
**Ack** (edge): `{schemaVersion:1, kind:"ack", robotId, commandId, status:"accepted"|"rejected", code?, eventId:"<commandId>:ack:<status>", sequence:<command sequence>, occurredAtMs, atMs}`. Codes: `command_invalid`, `command_invalid_json`, `command_identity_invalid`, `command_payload_invalid`, `command_expired`, `command_replayed`, `runtime_rejected` or the runtime's own error code (`hardware_not_commissioned`, `runtime_stopped`, ...).
**Execution status** (edge, only after an accepted ack): `{kind:"status", robotId, commandId, status:"executing"|"completed"|"failed", code?, eventId:"<commandId>:status:<status>", sequence:<command sequence>+1 for executing, +2 for completed or failed, occurredAtMs}`. R1 `running` is `executing`, `succeeded` is `completed`; `failed`, `preflight_failed`, `timeout`, `cancelled`, `stopped` are `failed` with the state or error code. Each event is sent once; a redelivered command re-sends the same `eventId`, so the worker deduplicates.
**Lifecycle in the API** (one transaction per event, never backwards): `pending_publish`, `publishing`, `queued`, `acknowledged`, `executing`, `completed` | `failed` | `timed_out`; publish failures end in `publish_failed` or `reconciliation_required` and a physical command is never replayed after an unknown outcome.
**Device Shadow reported state:** `{schemaVersion, connection, runtimeKind (MOCK_RUNTIME | UNVERIFIED_RUNTIME, never PHYSICAL_ROBOT from R1), hardwareEnabled, stopped, activeRunId, lastCommandSequence, reportedAtMs}`. "Robot online" in the UI must come from here and from a fresh heartbeat, never from the existence of a Thing.

**Environment variables (names verified in source).** API: `VISTA_IOT_ENABLED`, `VISTA_IOT_DATA_ENDPOINT`, `VISTA_IOT_TOPIC_PREFIX`, `VISTA_IOT_COMMAND_TTL_MS`, `VISTA_IOT_PUBLISH_RECOVERY_ENABLED`, `VISTA_IOT_PUBLISH_RECOVERY_INTERVAL_MS`, `VISTA_IOT_FEEDBACK_WORKER_ENABLED`, `VISTA_IOT_FEEDBACK_QUEUE_URL`, `VISTA_IOT_FEEDBACK_WORKER_CONCURRENCY`, `VISTA_IOT_FEEDBACK_VISIBILITY_SECONDS`, `VISTA_PHYSICAL_RUNTIME_MODES`, `DIGITAL_TWIN_SCOPE_SECRET`, `DIGITAL_TWIN_TELEMETRY_URL`, `DIGITAL_TWIN_REVOKE_RETRY_MS`. Edge: `VISTA_RUNTIME_TOKEN`, `VISTA_CHECKIK_ADAPTER_TOKEN`, `VISTA_IOT_ENDPOINT`, `VISTA_IOT_CA_PATH`, `VISTA_IOT_CERTIFICATE_PATH`, `VISTA_IOT_PRIVATE_KEY_PATH` (paths only; keys stay in a root-owned `0700` directory, never in Git, logs, the web bundle or the API secret).
**Safe provisioning.** 1) Owner supplies the robot UUID and applies the IoT root with it. 2) Create the certificate on the workstation, attach it and `<thing>-policy`, activate. 3) Edge config: `iot.enabled=true`, `fakeRobot=true`, `hardwareEnabled=false`, `deviceShadow` default on. 4) Verify: Shadow shows `MOCK_RUNTIME`; a command from a test script reaches `acknowledged`, `executing`, `completed` in the API. 5) Only then, supervised, with the owner's approval, hardware. Servo control, CHECKIK, calibration, teleoperation and the emergency stop stay local; the cloud only dispatches an authorised job and receives its lifecycle, telemetry and evidence.
**Test procedure.** `python3 -m unittest discover -s tests` in `services/robot-runtime` (26) and `npx jest src/modules/learning/iot-edge-contract.spec.ts` in `services/education-api`; both read the same fixture.

## Robot Recordings contract (deployed 2026-11-24; local and PostgreSQL verified, not yet exercised end to end in Production)
Authorised by the signed-in student who owns the real-robot run (no device migration is needed; the Desktop signs in as that student). Files go to the private recordings bucket; one manifest, uploaded last, makes the episode count.
1. `POST /me/experiments/:experimentId/recordings/uploads` with `{episodeId:<uuid>, files:[{name, sizeBytes, sha256, contentType, artifactType}]}`. Allowed only for the owner's `real_robot` experiment created in the last 24 h. Limits: 1 to 20 files, 256 MB each, 1 GB in total; names `[A-Za-z0-9._-]{1,80}` (not `manifest.json`); content types `video/mp4|video/webm|application/json|application/x-ndjson|text/plain|text/csv|image/png|image/jpeg|application/vnd.apache.parquet|application/octet-stream`; artifact types `video|trajectory|observation|log|metrics|image|other`. Response: one presigned POST per file (exact key, size, content type and `x-amz-meta-vista-sha256`, valid 15 min) and one for the manifest.
2. Upload every file with its presigned POST, then the manifest. Keys are `episodes/<robotId>/<experimentId>/<episodeId>/<name>`.
3. Manifest (`manifest.json`, at most 128 KB): `{schema:"vista.robot.recording.v1", episodeId, robotId, experimentId, startedAtMs, endedAtMs, declaredRuntimeKind:"SIMULATION"|"MOCK_RUNTIME"|"PHYSICAL_ROBOT"|"UNVERIFIED_RUNTIME", files:[same entries as step 1]}`. The identities must equal the key; the robot must be the one that ran the experiment.
4. The episode consumer (S3 event, then SQS with a DLQ, then the recordings worker) re-reads the manifest, checks every object's size and checksum, and registers each file as evidence in `learning_experiment_artifacts` (no new table). Idempotent; a missing artifact is retried and then dead-lettered; a mismatch or foreign identity is rejected for good. `declaredRuntimeKind` is stored as declared and `runtimeVerified` is always `false`: the API never turns a declaration into a verified physical run.
5. `GET /me/experiments/:experimentId/recordings` lists them (`availability`, `downloadPath`); `GET /me/experiments/:experimentId/recordings/:artifactId/download` returns a 5-minute signed URL. Owning student; instructors use the submission-scoped routes above. Teacher retrieval was added in #205.
Env (API and worker): `ROBOT_RECORDINGS_BUCKET`, `ROBOT_RECORDINGS_EVENTS_QUEUE_URL`, `VISTA_RECORDINGS_WORKER_ENABLED`. Tests: 12 unit and 5 PostgreSQL integration (idempotent under 6 concurrent deliveries, ownership, wrong robot, 24 h window).

## Post-deployment status (2026-11-24, release `ef95cddb`)
**Running and checked on the EC2 host and the public endpoints:**
- API `https://api.skynex.best/api/v1/health` and `/health/ready` return 200; `/api/v1/version` and the web `version.json` both report `ef95cddb540ef6f7059a9422bfe1c381ee425a89`.
- Digital Twin container healthy (read-only, 768 MB cap, about 36 MB used) on the private Docker network `vista-net`; the API reaches `http://vista-digital-twin:8767/health` (200). `wss://api.skynex.best/ws/twin` through nginx streams the labelled mock frames (6 joints, increasing sequence).
- AWS: Thing, policy (attached to no certificate), rule, feedback queue and DLQ, recordings bucket, recordings events queue and DLQ exist; the EC2 role reads the two work queues. Both DLQs are empty. The recordings queue holds one S3 `TestEvent` that the recordings worker must discard.
- `VISTA_IOT_ENABLED=false` and `VISTA_IOT_PUBLISH_RECOVERY_ENABLED=false`: the API publishes no MQTT command.
- Instructor and student recording routes exist (401 without a token).

**Not verified / pending (do not assume these work):**
- IoT feedback worker and recordings worker as real consumers: the first deployment started them with the wrong command (the image entrypoint ran the API). A corrected host script and worker restart are pending owner approval.
- Any end-to-end flow: a command from the API to a device and back, scoped telemetry from a real publisher, a recording upload and its registration, an instructor download.
- No device certificate exists; no physical SO-101 is linked to the robot UUID; calibration stays `UNCALIBRATED`.

## Telemetry schema and SO-101 joint mapping
Frame (schema 1): `{schema_version:1, robot_id, source_mode:"SIMULATION"|"LIVE_PHYSICAL"|"REPLAY", controller_id, measured_at, sequence, connection, measured:[{name, position, unit}]}` with exactly six readings, in this order: `shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`. Units are `deg` or `rad`; the Twin converts degrees to radians and rejects a joint outside the model range, an unknown unit, or a sequence that does not increase. A gripper in `percent` is not applied to the model (no approved transfer function). The model is the Apache-2.0 SO-101 from MuJoCo Menagerie (commit `98a70c5`, 26 files, `services/digital-twin/MODEL_MANIFEST.sha256`), installed on the host read-only. MuJoCo validates and maps joint state only; there is no physics simulation.

## Device provisioning and certificate requirements
1. Owner confirms which physical SO-101 is the robot `f1c066c4-b5f2-45c4-b933-f034f3824dd9`.
2. Create the device certificate on the workstation (the private key never leaves it and is never committed), register it in IoT Core, attach `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9-policy` and the Thing, then activate. This is a separate owner approval; a first test must use an isolated Thing.
3. The edge connects with client id = Thing name, mutual TLS, QoS 1, topics as above. The Desktop signs in as the student for upload authorisation and viewer scopes; it uses no AWS keys.
4. MQTT command dispatch stays off until the owner enables `VISTA_IOT_ENABLED` after a cloud-to-edge test with the isolated device.

## Desktop integration checklist
- [ ] Edge config: `robotId`, `thingName`, endpoint from "Deployed values"; `hardwareEnabled=false` and `fakeRobot=true` for the first connection.
- [ ] Event contract: ack then `executing` then `completed` or `failed`, each with `eventId`, `sequence`, `occurredAtMs`.
- [ ] Shadow reported state and last will; never report `PHYSICAL_ROBOT` from R1.
- [ ] Twin publisher with the publisher audience; frames follow the schema above.
- [ ] Recording upload: request, upload files, upload `manifest.json` last; check the registered evidence in the list route.
- [ ] Calibration profile stays `UNCALIBRATED` until reviewed; emergency stop path tested before any hardware command.
