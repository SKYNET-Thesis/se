# Phase 3 — LeLab follower telemetry bridge

## Hardware owner audit

At LeLab `84b6251cec3471195dfa35119827fbd1da2a801e`, the observed follower
owner is the teleoperation worker in `lelab/teleoperate.py`. It creates and
connects `SO101Follower`, calls `robot.get_observation()` in that worker, sends
leader actions, and disconnects in the worker's `finally` path. Its
`follower_lock` coordinates lifecycle only inside LeLab.

VISTA's `services/robot-runtime` does not expose measured joints and has no
LeLab subscriber interface. It remains a private, fail-closed command runtime.
There is no active VISTA-owned LeLab runtime integration to subscribe to in
this repository. Phase 3 therefore provides a push adapter for the current
owner rather than creating a second owner or polling the follower.

## Verified upstream interface

`lelab/teleoperate.py:get_joint_positions_from_robot()` calls
`robot.get_observation()` and maps six `<joint>.pos` keys. Its output is not a
safe physical input because a missing key or read error becomes zero and its
gripper conversion is not independently calibrated. The safe hook is the raw
`observation` mapping already obtained by the owner worker:

```python
observation = robot.get_observation()
twin_publisher.publish_observation(observation)
```

The deployed owner must reuse that observation from the loop. It must not
instantiate a second `SO101Follower`, call `connect()`, open a serial port, or
call a motor action method.

## Calibration and security

The bridge publishes arm `*.pos` readings as raw `deg` and gripper as raw
`percent`. No verified mapping from these values to VISTA's `so101_new_calib`
URDF has been supplied. Frames are `UNCALIBRATED`; the browser shows identity
and measured values but freezes the 3D pose. `VERIFIED` requires an approved
per-joint sign/zero/range profile plus a gripper conversion.

The owner publishes using a short-lived publisher scope. Browser clients need
their own viewer scope in WebSocket subprotocol `vista.twin.<scope>`. A VISTA
gateway must mint scopes after checking authenticated user, organization and
robot allocation. This repository has no production scope issuer or browser
token broker yet. The reusable React `DigitalTwinPanel` and
`useTwinTelemetry` accept an optional `viewerScopeToken` prop and forward it
only as that WebSocket subprotocol; `RobotLab` intentionally supplies none
until the gateway broker exists.

## Status

**IMPLEMENTED — NOT HARDWARE VERIFIED.** Tests use local observations only;
they import no LeRobot, open no serial port, and start no LeLab process.
