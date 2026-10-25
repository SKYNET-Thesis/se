# VISTA Robot Runtime (R1 foundation)

This is the private execution boundary between VISTA NestJS and CHECKIK. It is
not a browser API and it does not expose raw joints, serial ports, calibration
paths, or VR commands.

## Safety default

`hardwareEnabled` defaults to `false`. In that mode `/runs` rejects every
request with `preflight_failed` after validating the request. Enabling hardware
requires a reviewed local configuration containing a safe home target and
gripper endpoints for every enabled arm; that commissioning configuration is
intentionally not committed.

## Contract

- `GET /health` — liveness only.
- `GET /status` — fail-closed readiness summary; may read CHECKIK's local
  `/api/status` endpoint.
- `POST /runs` — private bearer-authenticated run request containing a VISTA
  run ID, immutable ProgramVersion ID, profile and canonical `robot_program`.
- `GET /runs/{runId}` — run state and sanitized events.
- `POST /runs/{runId}/cancel` — cooperative cancellation.
- `POST /stop` — runtime-wide stop latch; it never unlocks CHECKIK E-stop.

Only `arm.select`, `home`, `gripper.open`, `gripper.close`, and `wait` are
accepted. This first commit implements validation, run state, cancellation,
readiness and the HTTP contract. A hardware driver is deliberately not enabled
until the per-arm commissioning values are supplied and verified.

## WF-03 fake-follower adapter

`config/runtime.fake-follower.example.json` explicitly selects the checked
`fake_follower` adapter. Start the private CHECKIK adapter separately with
`VISTA_CHECKIK_MODE=fake_follower` and `VISTA_CHECKIK_ADAPTER_TOKEN`, then start
R1 with the same adapter token plus `VISTA_RUNTIME_TOKEN`. This configuration
never imports or opens a real follower and never falls back to one.

## Local non-hardware check

```bash
cd services/robot-runtime
VISTA_RUNTIME_TOKEN=local-dev-token python3 -m unittest discover -s tests -v
VISTA_RUNTIME_TOKEN=local-dev-token python3 src/server.py --config config/runtime.example.json
```

The example config is intentionally hardware-disabled.
