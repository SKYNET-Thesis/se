# Robot providers — hardware boundary

```
Screens (Connect, Calibrate, Status, Manual, Phone, Home…)
  │  hooks: useRobotSummary / useRobotSetup / useRobotLink / useCalibrationTelemetry
  ▼
Domain / store            data/robot.ts            arms, active setup, readiness, connect/calibrate/bind actions
                          data/calibrationTelemetry.ts   joint telemetry for one arm
                          data/robotCommands.ts    joint commands + the shared safety gate (Manual)
                          data/robotPoseControl.ts Phone controller session + pose gate (Phone)
  │  RobotProvider contract (robotProviders/types.ts)
  ▼
Provider                  prototype.ts (active)  ·  hardware.ts (SO-ARM101 placeholder, inactive)
  │  transport — provider-internal
  ▼
Bridge / native transport → LeRobot / Feetech bus → physical SO-ARM101
```

## Control paths

```
Manual:  UI → robotCommands (gate) → provider.command      (capability jointControl)
Phone:   UI / sensors
           → logical armId (domain picks the controlled follower)
           → robotPoseControl safety gate (every send)
           → arm binding → RobotPoseTarget
           → provider.poseControl session                   (capability poseControl)
           → lerobotBridgePoseTransport.ts → LeRobot bridge (WebSocket, protocol v1)
           → legacy wire arm "right"
```

Phone's transport is the existing LeRobot bridge protocol (`hello`,
`phone_pose`, `control_disabled`, `recenter` on `ws(s)://host:port/ws`),
unchanged — it lives below the provider boundary in
`lerobotBridgePoseTransport.ts`. The Phone screen sees only the session
state (disconnected / connecting / connected), whether a session is possible,
and open / error / close / target_lost events. That session is NOT the arm's
connection.

**Arm scope.** A Phone session is created for one logical arm (default
`getControlledFollowerArmId()`) and stays on it — never switching to another
arm. Every pose re-checks that this arm is still in the active setup,
connected, calibrated, not calibrating, bound to the same device, and that
the provider hasn't changed; when that stops being true, control ends, a
stop goes out if control was active, and a new deliberate hold is required.

**`"right"` is a bridge protocol value, not SkyNex identity.** Protocol v1
has one fixed phone channel, `arm: "right"`, sent in `hello`. The transport
maps every logical target to it (`legacyBridgeArm()`); nothing infers arm
identity from it. Multi-arm bridge support replaces only that mapping.

**Temporary hybrid.** The prototype provider simulates arm connection,
calibration, joint telemetry and joint commands, but its `poseControl` is the
REAL LeRobot bridge (as Phone always used). So provider `mode` currently
describes the robot setup / data source, not proof that every capability is
simulated. Capability routing gets resolved in the real-hardware phase. The
hardware placeholder has `poseControl: false`: with it active, Phone can't
open a session.

Screens never import this folder. Providers never write app state, navigate,
return UI copy, or decide whether motion is safe.

## Identity

- **Logical arm id** (`RobotArmState.id`, e.g. `arm_01`): the app's stable
  identity. Screens, navigation params and per-arm state all use it.
- **Name** (`leader_left`): user label only. Never parsed; rename changes
  nothing else.
- **Physical device id** (`binding.deviceId`, e.g. `prototype-arm-01`, later
  something like `so101-usb-abc123`): the provider's stable id for a device.
  Never a COM port or USB path — transport addresses stay inside the provider.
- **Binding** (`{ providerId, deviceId }`): which device an arm is.
  `bindRobotArm` / `unbindRobotArm`. Bound ≠ connected. Binding a different
  device takes the arm offline and clears its calibration. An arm bound to
  another provider's device is `unavailable`.
- **Provider id** (`prototype`, `so101-hardware`): who serves devices. Its
  `mode` (`prototype` | `hardware`) drives every "Chế độ thử nghiệm" note via
  `getRobotLinkMode()`.

## State and readiness

- All per-arm state (`connected`, `calibrated`, `connecting`, `calibrating`,
  `lastError`) is written only by domain actions in `robot.ts`.
- Late results are ignored: each arm has its own connect / calibration
  attempt counters. Cancel, disconnect, rebind and provider swap invalidate
  that arm only (provider swap: every arm).
- Aggregate readiness over the active arms is derived in one place
  (`aggregateLink` → `resolveReadiness`), exposed as `useRobotSummary()` and
  `getLiveReadiness(emergencyStopped)`.

## Safety

- **E-STOP is global and owned by `App.tsx`.** Providers never see, set or
  reset it.
- **Joint motion goes through `robotCommands.ts` only.** `jogRobotJoint` /
  `recenterRobotArm` check, at call time: E-STOP, live readiness,
  the user's deliberate enable (`controlEnabled`), and the arm's own
  connection, calibration and binding. Only then is the provider called.
  `stopRobotMotion` is never gated.
- **Pose motion goes through `robotPoseControl.ts` only.** Every
  `sendPose` checks, at call time: E-STOP, live readiness, the dead-man
  hold (`controlEnabled`) plus a deliberate `beginControl()` since the last
  stop, the session's target arm (see Arm scope), and that the session is
  open. `stopMotion` (`control_disabled`) is never gated; `recenter` is
  blocked under E-STOP or after a provider change.
- Screens keep their own live checks too (Manual's tick gate, Phone's 50 ms
  sender gate); the domain gate is in addition, not instead.
- Nothing reconnects or resumes control by itself; a reopened session still
  needs a new deliberate hold.

## Adding the real hardware provider

Implement `RobotProvider` in `hardware.ts` (or a sibling), set its
capabilities truthfully, register it in `registry.ts`, and bind arms to its
device ids. No screen changes. Telemetry positions use the provider's
`positionScale` (SO-ARM101: encoder counts 0–4095, `so101.ts`).

Dev only: `globalThis.__skynexRobotLink.setProvider("so101-hardware")` — every
operation then reports `unavailable`.
