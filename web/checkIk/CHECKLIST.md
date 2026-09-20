# Bimanual VR Teleoperation Checklist

## Phase 1 — Robot model and offline math

- [x] Keep `so101_new_calib.urdf` as the kinematics source.
- [x] Keep `arm.glb` as a visualization-only asset.
- [x] Parse the chain from `base_link` to `gripper_frame_link`.
- [x] Implement FK in metres/radians.
- [x] Implement bounded IK with `initial_q` continuity.
- [x] Verify every IK result through FK.
- [x] Reject unreachable and non-finite targets.

## Phase 2 — One-arm hardware adapter

- [x] Identify LeRobot 0.6.2 and its SO-101 API.
- [x] Confirm joint names and follower calibration.
- [x] Read follower joints without commanding motors.
- [x] Verify a guarded shoulder-pan movement.
- [ ] Implement continuous/unwrapped `wrist_roll` feedback.
- [ ] Unit-test circular angular differences at ±180 degrees.
- [ ] Re-enable the 5 mm Cartesian hardware test.
- [ ] Require measured Cartesian convergence before PASS.

> Hardware interlock: Cartesian motion remains disabled until the wrist-roll
> wrap-around issue is fixed and verified. Do not bypass the interlock.

## Phase 3 — WebXR input (no robot)

- [x] Install Node.js 20 and npm 10.
- [x] Add an HTTPS WebXR development server.
- [x] Read left/right controller grip poses.
- [x] Read trigger and grip button values.
- [x] Show controller state on the desktop and inside VR.
- [x] Add the official-style IWER Meta Quest 3 emulator and DevUI for desktop testing.
- [x] Test Enter VR in the Meta Quest Browser.
- [ ] Verify handedness and button indices on the real controllers.
- [ ] Measure controller update rate and disconnect behavior.

## Phase 4 — WebSocket transport (robot still disconnected)

- [x] Add a Python WebSocket endpoint behind the Vite HTTPS/WSS proxy.
- [x] Send `sequence`, `timestamp`, left/right pose and button state.
- [x] Use a latest-value-only queue; never accumulate stale poses.
- [x] Reject old, duplicate, non-finite or malformed packets.
- [x] Add a 250 ms deadman/watchdog timeout.
- [ ] Test browser reconnect and backend disconnect behavior.
- [x] Integration-test WebSocket packets with a synthetic controller client.

## Phase 5 — Coordinate transform and clutch (offline)

- [ ] Define Quest, WebXR and robot base coordinate conventions.
- [x] Capture `vr_origin` and `robot_origin` when clutch activates.
- [ ] Compute full relative pose transforms; the prototype currently tests translation only.
- [x] Add translation scaling in the offline prototype.
- [ ] Filter jitter and cap per-frame pose deltas.
- [x] Route simulated left/right translation targets through IK and FK only.

## Phase 6 — One-arm Cartesian teleoperation

- [ ] Connect one controller to one follower only.
- [ ] Start position-only; do not demand an arbitrary 6-DOF pose from a 5-DOF arm.
- [ ] Add weighted/limited orientation after position control is stable.
- [ ] Use current joint feedback as every IK seed.
- [ ] Validate joint limits, delta, velocity, workspace and FK error.
- [ ] Stop on IK failure, stale input, disconnect or clutch release.

## Phase 7 — Dual arm

- [ ] Add and calibrate a second follower with a unique ID and serial path.
- [ ] Keep connection, calibration, target, IK seed and watchdog independent per arm.
- [ ] Map left controller to left follower and right controller to right follower.
- [ ] Add inter-arm collision/workspace separation.
- [ ] Test each arm independently before simultaneous motion.

## Phase 8 — Visualization and data

- [x] Inspect whether `arm.glb` contains separately pivoted link nodes.
- [x] Instantiate two digital twins and map URDF joints to GLB nodes.
- [ ] Add cameras only after control is stable.
- [ ] Record synchronized controller, joint and image data.
- [ ] Export/validate the intended LeRobot dataset format.
