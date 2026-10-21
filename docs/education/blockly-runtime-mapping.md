# P0 Blockly to Robot Runtime Mapping

Date: 2026-10-18  
Status: proposed R1 contract, derived from audited code; no physical endpoint exists yet.

## Source and target representations

The editor has a richer local `vista.robot-program/commands` model. Before persistence it transforms only the proven subset to the Nest canonical format:

```json
{
  "kind": "robot_program",
  "schemaVersion": 1,
  "steps": [
    { "type": "arm.select", "arm": "left" },
    { "type": "home", "arm": "left" },
    { "type": "gripper.open" },
    { "type": "wait", "durationMs": 1000 },
    { "type": "gripper.close" }
  ]
}
```

`arm.select` sets execution context. The runtime must resolve each subsequent arm-dependent action to an explicit arm before commanding hardware. It must never infer an arm from the latest browser state.

## R1 allowed mapping

| Blockly block | Canonical step | Runtime resolved action | State/result requirement |
| --- | --- | --- | --- |
| Select Left / Right | `arm.select` | update run-local `selectedArm`; send no motor command | emit `step_skipped_context` / selected-arm event |
| Home | `home` plus selected arm or explicit `arm` | `move_to_home(side, profile)` | report target ID, measured convergence, timeout/failure |
| Open gripper | `gripper.open` | `set_gripper(side, open_calibration)` | report command, accepted value and measured state if available |
| Close gripper | `gripper.close` | `set_gripper(side, closed_calibration)` | same as open; do not claim grasp detection |
| Wait | `wait` | runtime-owned cancellable delay | report actual start/end timestamps and cancellation |

The runtime action names above are contract names, not existing CHECKIK functions. They are intentionally separate from low-level `send_action`.

## Explicitly unsupported in R1

- Cartesian and joint movement (`move_to`, `move_joint`).
- Both-arm home, dual-arm concurrency and synchronization.
- Repeat, conditions, sensor feedback and vision/AI blocks.
- Any raw motor position, arbitrary joint array, port or calibration path supplied by VISTA.

The frontend must keep showing compatibility errors for these blocks in the attempt-bound learning flow. R2 defines their safety/IK contract separately.

## Proposed private runtime contract

Only the server-to-server adapter may call this API. It binds to loopback or a private network, authenticates the calling service, and is not exposed to the browser.

```text
GET  /health
GET  /status
POST /runs                 # create one execution from an immutable ProgramVersion snapshot
GET  /runs/{runId}
POST /runs/{runId}/cancel  # cooperative immediate cancellation
POST /stop                 # operator/runtime emergency stop path; does not clear a latched E-stop
```

`POST /runs` must receive a server-created request containing `runId`, immutable `programVersionId`, canonical program snapshot, execution profile and VISTA actor/audit metadata. It must reject an unknown step, a missing arm context, multiple active runs, unhealthy CHECKIK status, locked motion, failed readiness, or an unapproved profile.

The adapter should translate runtime status into a minimum result shape:

```text
queued | preflight_failed | running | succeeded | failed | cancelled | stopped
```

Each step event includes index, canonical step type, resolved arm when applicable, monotonic timestamps, and a machine-safe error code. Raw serial paths, secrets and stack traces never return to students.

## Ownership flow

```text
Blockly workspace
  → VISTA canonicalization and ProgramVersion
  → Nest authorization + physical gate
  → private runtime /runs
  → CHECKIK readiness + exclusive follower ownership
  → checked CHECKIK follower adapter
  → LeRobot SO-101 follower
```

`Run on Robot` must call NestJS only. NestJS records the run request and polls/receives runtime state; it never sends a direct browser command to CHECKIK.
