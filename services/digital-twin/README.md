# VISTA Digital Twin — Phase 4 telemetry boundary

The service imports no LeRobot or CHECKIK hardware driver, opens no serial
port, and has no motor-command, calibration, recording, or robot-control route.
The existing Blockly preview is a separate learning surface. Mock simulation is
always available. Physical state is accepted only as a private push from the
single existing follower owner, after a signed scope check.

## Recreate the environment

Use Python 3.12 (verified here with 3.12.14). The host's default `python3`
may be another version. From this directory:

```sh
python3.12 -m venv .venv
UV_CACHE_DIR=/tmp/vista-digital-twin-uv-cache uv sync --locked --extra dev --extra simulation --python .venv/bin/python
.venv/bin/python -m pytest -q
```

`pyproject.toml` declares direct versions; `uv.lock` pins the full dependency
graph. The simulation extra is needed only for MuJoCo model inspection, not
for the mock service. No system Python or global package is changed. This
project does **not** install LeLab, LeRobot, PyTorch, CUDA, or hardware extras.

## Run the read-only mock

From this directory, bind to loopback explicitly:

```sh
PYTHONPATH=src .venv/bin/uvicorn vista_digital_twin.app:app --host 127.0.0.1 --port 8767
```

`GET /health` returns `{"status":"ok","mode":"mock"}`. Subscribe to
`ws://127.0.0.1:8767/ws/twin` for JSON frames. The default fixture cycles
through three poses at 30 Hz. A client that falls behind receives the newest
frame; the service stores one latest state, not an accumulating queue.

For a local disconnect/reconnect demonstration, set the optional values in
`.env.example` before starting Uvicorn, for example:

```sh
VISTA_TWIN_MOCK_DISCONNECT_AT=60 VISTA_TWIN_MOCK_RECONNECT_AT=120 PYTHONPATH=src .venv/bin/uvicorn vista_digital_twin.app:app --host 127.0.0.1 --port 8767
```

These are sequence numbers. Disconnected frames retain the last measured
position **and its original measurement time**. Reconnection resumes fixture
updates. `VISTA_TWIN_MOCK_RATE_HZ` accepts values above zero through 100;
the default is 30. This is a development fixture, never physical telemetry.

## Contract v1

Each `/ws/twin` frame contains `schema_version`, `robot_id`, `source_mode`,
`controller_id`, timezone-aware `measured_at`, nonnegative `sequence`,
`connection`, and six `measured` readings with `name`, `position`, and `unit`.
`commanded` is optional and remains separate from `measured`; the mock never
sets it. Source modes are `LIVE_PHYSICAL`, `SIMULATION`, and `REPLAY`.
`LEARNING_PREVIEW` is deliberately outside this contract. Valid arm units are
`rad` or `deg`; `gripper` may use `percent`, `rad`, or `deg` until a specific
hardware calibration and asset mapping are verified. No unit conversion is
performed implicitly. Staleness is detected by `LatestState` using the
original measurement timestamp; consumers must also display connection state.

The fixture lives at `fixtures/so101_joint_states.json`. The source and
contract tests are offline. The ASGI tests exercise the real HTTP and
WebSocket routes in memory and do not bind a port.

## Source references and boundaries

- LeLab reference: `../../../lelab-reference` at
  `84b6251cec3471195dfa35119827fbd1da2a801e` (`main`, Apache-2.0).
  This is a separate checkout, not a VISTA dependency. See
  [LELAB_INTEGRATION.md](LELAB_INTEGRATION.md).
- MuJoCo Menagerie reference: `../../../mujoco-menagerie-reference` at
  `98a70c569c4c1b6da467a20012f766ee1f8dc521` (`main`, SO-101 model
  Apache-2.0). MuJoCo 3.3.6 loaded its `robotstudio_so101/so101.xml` and
  completed `mj_forward()` headlessly. The reference checkout is outside VISTA.
- Existing GLB metadata and unresolved rights are in
  [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md).

## VISTA Web viewer (Phase 2)

The authenticated `/lab` Robot Lab page mounts
`web/robot-edu/src/components/digital-twin/DigitalTwinPanel.tsx`. Its own
`So101DigitalTwinViewer` uses `so101_new_calib.urdf` and 13 STL files under
`web/robot-edu/public/assets/so101/`; it does not use CHECKIK GLB or alter
the Blockly preview. See [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) for exact
source and joint mapping.

Start the mock as above, then in `web/robot-edu` run `npm run dev` and open
`/lab` with an existing VISTA login. Local development defaults to
`ws://127.0.0.1:8767/ws/twin`; set `VITE_DIGITAL_TWIN_WS_URL` to a full
`ws://` or `wss://` URL when required. Non-local hosts require explicit
configuration. Keep the mock service bound to loopback; do not publish it.

The client accepts only schema v1 `SIMULATION` frames for `so101-mock`, checks
all six measured readings, joint limits, monotonically increasing sequence,
and timestamp order. It reconnects after two seconds and clears the previous
stream. A one-second timeout marks telemetry stale and stops interpolation.
Commanded positions never drive the viewer. The panel always says
**SIMULATION — MOCK DATA**. The fixture's gripper percentage is shown as a
number; `Jaw` remains at the URDF zero angle because no percent-to-radian
calibration is available; a future mock frame expressed directly in URDF
`rad` or `deg` can animate the jaw within its limits. The white printed-shell material is a visual
override of the source URDF's yellow material, not a different robot asset.

Frontend tests: `cd web/robot-edu && npm test -- src/components/digital-twin`
and `npm run build`. Backend tests: run `.venv/bin/python -m pytest -q` here.

## Phase 4 physical publisher and gateway

Set all four physical settings in `.env.example` to enable the private
`POST /internal/physical-telemetry` input. Partial configuration fails at
startup. The endpoint accepts a `Bearer` publisher scope issued by the
authenticated VISTA gateway; it is never a browser credential. Its scope binds
an owner ID, organization ID and robot ID. The service verifies that these
match its configured owner before it accepts a frame.

`/ws/twin` requires a separate signed viewer scope if a physical frame is
active. The scope must name the same organization and robot; missing or wrong
scopes close the socket with `4403`. Scope issuance must be performed by the
authenticated VISTA gateway; this standalone service only verifies scopes and
has no endpoint that mints them.

The authenticated Education API now provides
`POST /api/v1/robots/:robotId/digital-twin/viewer-scope`. It checks active
membership, `learning.experiment.execute`, classroom allocation and valid
organization entitlement before signing a 60-second scope bound to the resolved
organization and robot. The browser keeps the response only in memory and
refreshes it before expiry. A 4403 closure removes physical access and requests
a replacement; simulation remains available.

The LeLab worker uses `NonBlockingLeLabOwnerPublisher` when all deployment
variables are supplied. It queues an observation already read by the worker in
one bounded slot and posts from a daemon thread. It has no hardware API and
never delays the action loop. Its publisher scope is a deployment-injected,
short-lived credential, never a browser value. See
[PHASE4_GATEWAY_AND_CALIBRATION.md](PHASE4_GATEWAY_AND_CALIBRATION.md) for the
claims, environment variables, revocation limit and calibration contract.

`LeLabFollowerTelemetryAdapter` accepts all six `*.pos` measurements only. It
rejects missing, non-finite and implausible raw values, never zero-fills, never
uses `*.goal_position`, and emits `LIVE_PHYSICAL` with `UNCALIBRATED`. The raw
arm readings remain degrees and gripper remains percent. Until a reviewed
calibration profile establishes signs, zero offsets, ranges and a gripper
transfer function, the VISTA viewer displays values but does not animate a
physical pose.

Run all service tests with `.venv/bin/python -m pytest -q`.
