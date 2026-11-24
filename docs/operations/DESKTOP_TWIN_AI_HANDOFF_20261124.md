# Digital Twin, Desktop Lab Station and AI/VLA handoff, 2026-11-24

Web is frozen. This is the integration boundary for the next phase. Statuses are NOT VERIFIED unless a verification is named.

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

## Twin on AWS (proposal, nothing created)
Not heavy: pure Python, one latest state per robot and attempt, 30 Hz, no GPU, tens of MB plus the SO-101 model file (`VISTA_TWIN_MUJOCO_MODEL_PATH`, from the Menagerie reference, outside the repository; check its licence before shipping). Smallest option: a second container on the existing instance behind nginx at `/ws/` (upgrade headers), a CloudFront behavior for `/ws/*` to the API origin, `wss://` only, `digital_twin_ws_origin` in PR #196, `VITE_DIGITAL_TWIN_WS_URL` in the web build, `DIGITAL_TWIN_SCOPE_SECRET` (shared with the API) and `DIGITAL_TWIN_TELEMETRY_URL` in the secret. Watch connection count on the t3.medium; move to its own small instance if live viewers grow. Rollback: remove the container and the behavior; the viewer is off when no URL is configured. R1, the adapter and any physical publisher stay local; Production MQTT stays disabled.

## AI / VLA checklist (metadata registry is not inference)
ACT and SmolVLA loading; Model Registry versions with checkpoint artifacts and dataset lineage (registry metadata is done and tested; inference is NOT VERIFIED); inference runtime and its resource needs (GPU), camera and robot-state observations, action validation and clamping to joint limits, simulation inference first, then supervised physical inference. Nothing here actuates hardware.
