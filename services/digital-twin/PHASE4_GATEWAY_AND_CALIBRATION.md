# Phase 4 — gateway, owner bridge and calibration readiness

## Authorization path

`POST /api/v1/robots/:robotId/digital-twin/viewer-scope` is protected by the
existing Supabase JWT guard. The Education API resolves the VISTA user, active
classroom membership, active role permission (`learning.experiment.execute`),
classroom allocation, and currently valid organization robot entitlement in
one server-side query. The browser-supplied robot ID is only a lookup key; the
organization ID is never accepted from the browser.

The response contains a 60-second HMAC scope for exactly one resolved
organization and robot. Claims are `kind=viewer`, `sub`, `org`, `robots`,
`aud=vista-digital-twin-viewer`, `exp`, and a random `jti`. Viewer and
publisher scopes have distinct audiences. The token lives only in React state,
is sent only in the WebSocket subprotocol, and is never persisted or logged.

There is no separate lease table in the current Prisma schema. The enforced
allocation is the active classroom allocation and its time-bounded entitlement.
Changing either blocks the next refresh; the short TTL bounds an already
issued token to one minute. Immediate server-side revocation would require a
durable lease/revocation source and is deliberately not faked here.

## Owner bridge

The LeLab reference worker now reads one raw observation, reuses it for its
existing UI broadcast, and optionally gives it to
`NonBlockingLeLabOwnerPublisher`. The publisher has a one-frame queue,
replaces stale pending frames, uses a 0.5 second HTTP timeout in a daemon
thread, and retries only when a later live observation arrives. A gateway
outage cannot block `get_action`, `send_action`, or shutdown.

The bridge activates only when all of these deployment-injected values exist:

```text
VISTA_TWIN_ENDPOINT
VISTA_TWIN_PUBLISHER_SCOPE
VISTA_TWIN_PHYSICAL_OWNER_ID
VISTA_TWIN_PHYSICAL_ORGANIZATION_ID
VISTA_TWIN_PHYSICAL_ROBOT_ID
```

`VISTA_TWIN_PUBLISHER_SCOPE` must be a signed, short-lived publisher scope
from the organization’s secret-management/deployment process. This change does
not create credentials, open a serial port, connect another follower, or issue
actions. The LeLab process must have the `vista_digital_twin` package available
on its Python path; otherwise the optional bridge logs a configuration error
and teleoperation continues without it.

## Calibration readiness

`CalibrationProfile` requires a robot ID, profile version, evidence records,
all six joints, monotonic source/target ranges, arm sign and zero metadata,
and an explicit percent-to-jaw linear gripper conversion. It has no defaults.
Physical adapter output remains `UNCALIBRATED` until a reviewed profile is
applied in a separate calibration procedure. The viewer therefore continues to
show raw values while freezing the physical 3D pose.

## Verification boundary

No serial device, owner identity, calibration, deployment secret, production
configuration, migration, or physical robot was changed or verified in Phase
4. The LeLab syntax check passed. Its pytest environment is not installed in
this workspace (both available Python environments lack `pytest`, and the
Digital Twin venv lacks LeLab's `httpx` test dependency), so its test suite was
not executed here.
