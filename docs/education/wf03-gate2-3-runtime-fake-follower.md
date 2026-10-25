# WF-03 Gate 2 + Gate 3: Runtime and Fake Follower

## Architecture

The physical execution path is server-owned:

`Student browser -> Education API -> R1 Robot Runtime -> CHECKIK command adapter -> explicit fake follower`

The browser provides only an Attempt or physical Experiment ID. The Education
API reloads the submitted immutable ProgramVersion, persisted matching symbolic
PASS, Classroom Robot allocation, entitlement, and ownership before starting.
It never accepts commands, runtime URLs, CHECKIK URLs, ports, or Robot identity
from the browser.

The existing VR path remains separate and unchanged.

## Robot-to-runtime configuration

The Education API requires server-only environment configuration:

```text
VISTA_ROBOT_RUNTIME_MAP={"<robot-db-uuid>":{"baseUrl":"http://127.0.0.1:8015","logicalIdentity":"vista-classroom-fake"}}
VISTA_RUNTIME_TOKEN=<private-shared-token>
```

Only loopback R1 URLs are accepted in this bounded MVP. An unmapped Robot fails
closed; there is no default Robot or `VISTA-01` fallback. These values must
never use a `VITE_` prefix.

R1 fake-follower configuration is demonstrated by
`services/robot-runtime/config/runtime.fake-follower.example.json`. R1 and the
CHECKIK adapter share `VISTA_CHECKIK_ADAPTER_TOKEN`. CHECKIK additionally
requires the explicit operator setting:

```text
VISTA_CHECKIK_MODE=fake_follower
```

No fake-to-real or real-to-fake fallback exists.

## Authority and lifecycle

R1 accepts only canonical v1 programs containing `arm.select`, `home`,
`gripper.open`, `gripper.close`, and `wait`. `preview.move_xyz` remains
rejected. The Education API derives a stable run ID from the persisted physical
Experiment, making repeated Start requests idempotent.

Runtime state maps centrally to persistent state:

| R1 | Experiment | Control Session |
| --- | --- | --- |
| queued | pending | created |
| running | running | running |
| succeeded | succeeded | completed |
| cancelled | cancelled | cancelled |
| stopped | stopped | stopped |
| preflight_failed | failed | preflight_failed |
| timeout | failed | timed_out |
| failed/lost run | failed | failed |

Only transitions create Experiment events. Terminal state and sanitized output
are persisted before the Student receives a durable terminal response. A lost
R1 in-memory run is failed safely and is never replayed automatically.

Student Stop calls the Education API, which checks execution ownership before
calling R1 cancel. It does not expose CHECKIK unlock or E-stop reset.

## Student UI

Eligibility, start, status, Stop, and reload recovery use Education API routes
only. Local Blockly evaluation is informational and cannot authorize physical
execution. Confirmation shows the safe Robot identity, immutable
ProgramVersion ID, and authoritative persisted PASS.

## Offline verification

The process-level loopback path was executed with two independent processes:
R1 and the CHECKIK fake-follower adapter. The canonical gripper program reached
`succeeded`. A second run containing a long wait was cancelled and reached
`cancelled`. No real driver was imported or opened.

## Known limitations

- `DB_CONCURRENCY_LIVE_TEST_DEFERRED`: the configured remote Supabase database
  is not verified as a safe development/test database, so no synthetic
  PostgreSQL concurrency fixture was created.
- Full Education API plus persistent-database fake-follower E2E remains
  `HOST_TEST_DEFERRED` until a safe test database is configured.
- R1 run state is in memory. The Education API marks a missing run as failed;
  it never automatically replays physical commands.
- Real hardware, calibration, and commissioning are not verified.
- No database migration was added.
