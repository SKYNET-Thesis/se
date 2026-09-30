# Gesture-directed pick and place: Phase 1 operator guide

Phase 1 lets a Quest operator select a tagged object and destination box on a
fixed overhead-camera panel, review the selection, and explicitly confirm a
guarded sequence on one SO-101 follower. Keep every trial supervised. A
`succeeded` status means the command sequence finished; it does **not** prove a
secure grasp or correct placement. Phase 1 must not be used unattended.

## What authorizes motion

Selection and preview are follower-free. They use the configured camera,
table calibration and fresh tags, and reserve the dashboard task slot. They do
not connect a follower, read its joints, run follower-dependent IK, configure
motors or change torque. Preview also works with hardware and motion disabled;
it is a logical task preview, not a completed reachability check.

Only confirmation of the current preview task ID can acquire the assigned
follower. The dashboard then requires `--enable-motion --hardware`, an
unlatched E-stop gate, the selected follower's assigned and available port,
saved follower calibration, and exclusive task ownership. It checks these gates
again in the execution worker before acquisition and runs measured-state/IK
preflight before the first command.

Before confirming, the follower must **already** be calibrated, configured for
the existing position-control workflow, safely supported or held, and
torque-enabled on every motor. Establish and verify that state through the
supervised setup/arming procedure, with its worker and serial ownership released
before the gesture task. If the setup procedure cannot leave that state ready,
do not confirm. A saved calibration file and an available port alone do not
prove the motor state is ready.

Gesture acquisition opens the bus with a read-only handshake, checks calibration,
and reads each motor's existing `Torque_Enable` register. It does not configure,
calibrate or arm the follower and rejects a disabled torque register. Release
closes the bus while preserving torque and the last servo target. Do not expect
Cancel, Stop, completion or dashboard shutdown to relax this follower.

## Run the automated offline checks first

From the repository root `se/`, use a Python environment with
`web/checkIk/dual_arm_vr_teleop/requirements.txt` and pytest installed. Frontend
dependencies must already be installed. Run:

```bash
cd web/checkIk/dual_arm_vr_teleop
python -m pytest tests/test_gesture_pick_models.py tests/test_gesture_pick_calibration.py tests/test_gesture_pick_localizer.py tests/test_gesture_pick_executor.py tests/test_gesture_pick_dashboard.py tests/test_gesture_pick_offline.py -q
node --test frontend/src/gesturePick.test.mjs
npm --prefix frontend run build
git diff --check
```

The end-to-end fixture loads runtime configuration and tabletop calibration,
generates AprilTag frames, and uses the real localizer, dashboard and executor.
Its follower and IK results are simulated. It verifies follower-free preview,
motion authorization, all nine stages, mapped target coordinates, confirmation
idempotency, tag-loss Hold, Cancel and E-stop. It never opens a physical camera
or serial device. These tests do not establish physical IK reachability,
collision clearance, bus timing, camera latency or grasp quality.

For laptop monitoring verification, from `se/` run:

```bash
cd web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564
node --test src/lib/gesturePickMonitor.test.mjs
npm run build
```

## Prepare camera, tags and table calibration

Mount the USB webcam rigidly above the entire working area. Keep its mount,
focus, image size, view and the table/follower placement fixed. Clear the
workspace and provide steady lighting. Camera-frame timestamps describe when a
read finishes, not guaranteed sensor exposure time; verify the displayed image
is actually updating as well as checking the reported frame age.

Print and apply AprilTags from the configured dictionary, with unique configured
IDs for objects and boxes. The committed
[`gesture_pick_config.example.json`](../../web/checkIk/dual_arm_vr_teleop/gesture_pick_config.example.json)
uses `DICT_APRILTAG_36h11`, object `7` and box `8`. Keep each selected tag readable
from above throughout the trial. Unknown, duplicate, missing or stale tags
cannot authorize motion. The default freshness limit is 0.5 seconds.

Keep machine-specific configuration and calibration JSON in
`web/checkIk/dual_arm_vr_teleop/runtime/` (ignored by Git). Copy the example and
edit `camera_path` to one exact device path, `tags` to the printed IDs,
`follower_side` to the prepared follower, and `calibration_path` to the saved
table calibration. `/dev/video*` in the example is a placeholder, not a wildcard
to use at runtime. Relative file paths use the dashboard's working directory.

Calibrate the table in the chosen follower's robot-base frame before each
changed camera setup. Measure four matching image-pixel `[x,y]` and robot-base
`[x,y]` metre corners in perimeter order, plus table height `table_z` in robot-base
metres. Use the CLI from `web/checkIk/dual_arm_vr_teleop`:

```bash
python -m backend.gesture_pick.calibrate_overhead_camera --help
```

Supply the measured JSON corner arrays with `--image-points` and
`--robot-points`, the exact configured `--camera-path`, measured `--table-z`,
and a local `--output` path. The CLI writes a versioned planar homography; it
does not estimate camera intrinsics or lens distortion. Distortion must be
negligible or corrected upstream with the same image geometry used at runtime.

Repeat calibration if the camera, framing, table, follower base or selected
follower changes. Matching camera paths alone cannot detect a moved camera.
Check several independently measured points across the workspace before motion.
All tag centres are treated as table-plane points; object height, tag placement,
parallax and gripper offsets still need physical validation. Use stationary
fixtures compatible with the fixed top-down grasp and approach heights.

## Rehearse selection with motion locked

From `web/checkIk/dual_arm_vr_teleop`, start the configured dashboard without
motion/hardware flags:

```bash
python backend/dashboard_server.py --gesture-pick-config runtime/gesture-pick.json
```

This rehearsal may read the explicitly configured physical camera but cannot
acquire a gesture follower. In another terminal, from the same directory:

```bash
npm --prefix frontend run dev
```

Open `https://<laptop-ip>:8081` in Quest Browser on the same network and enter VR.
Use the overhead-camera panel: point and pinch thumb/index, or press controller
Trigger, to select the object first and the destination second. Review both IDs,
projected coordinates and follower side. Confirm stays blocked while real motion
is locked. Cancel the preview and check that the task slot is released.

The laptop dashboard's `/gesture-pick` page monitors camera/calibration health,
selections, stage and reason. It offers Cancel and global Emergency Stop;
selection and confirmation belong to the Quest surface. The Quest page cannot
assign ports, calibrate, arm, unlock, recover or start a teleoperation bridge.
Do not launch a VR bridge or another managed worker during a gesture task.

## Supervised hardware acceptance

Do not mark hardware acceptance complete from the offline results. Record each
check and trial locally with the configuration, table calibration identity,
camera/follower placement, selected tags, stage/reason and observed outcome.

Before starting a motion-enabled dashboard:

- [ ] All offline tests and frontend builds pass.
- [ ] The camera is rigid, calibration matches this setup, coordinates have been
      independently checked, and both tags remain visible and fresh.
- [ ] One small tagged object and one empty tagged destination are stationary;
      the entire approach, lift, travel, placement and retreat path is clear.
      Phase 1 does not plan around obstacles or moving objects.
- [ ] The chosen follower has an available assigned port and saved calibration;
      every motor is already configured and torque-enabled through supervised
      setup. No other worker owns its bus. Its starting pose is safe.
- [ ] A human is continuously watching the physical follower with immediate
      access to a tested E-stop. Keep everyone outside the motion area.

Only after these checks, stop the locked rehearsal dashboard and start from
`web/checkIk/dual_arm_vr_teleop`:

```bash
python backend/dashboard_server.py --gesture-pick-config runtime/gesture-pick.json --enable-motion --hardware
```

Recheck the existing dashboard readiness and E-stop latch for the selected arm;
unlock only through the supervised dashboard readiness workflow if needed.
The flags permit confirmation but do not arm the follower. Re-select the object
and box, inspect the new preview, and deliberately confirm once. Acquisition and
IK preflight happen after that confirmation and may reject the task before any
movement.

Retain the executor's low-speed defaults for acceptance: 3 degrees/second and a
10-degree maximum total joint delta per stage. These are executor defaults,
not fields in the camera/tag configuration. Hover is 0.08 m and descent is
0.015 m above the calibrated table, with a fixed top-down orientation. Verify
these clear the actual object, box, gripper and table before confirming; Phase 1
does not infer object dimensions or contact.

Observe `open → approach → descend → close → lift → travel → place → release →
retreat`. First verify Cancel in preview produces no follower acquisition. During
a safe, cleared low-speed trial verify Stop/Cancel and E-stop prevent subsequent
motion commands, and E-stop latches the dashboard. Inspect the last held pose and
release behavior before any new task. Repeat trials only with continuous human
supervision and visual checks of the grasp and placement each time.

## Stop criteria and recovery

Stop immediately on any unexpected movement, wrong selected ID/follower,
incorrect mapped position, collision risk, contact, slipping/dropped object,
camera freeze/loss, missing/stale tags, guard/IK failure, bus error, or entry into
the motion area. Use the physical E-stop immediately when movement is unsafe;
the dashboard Emergency Stop also latches the software motion gate.

Cancel/Stop requests software Hold: guards prevent later commands and preserve
the last servo target. An already-issued transport write cannot be recalled.
Hold and software E-stop do not replace a physical E-stop or guarantee instant
mechanical arrest. Guard rejections report `held`; adapter failures can report
`failed`. Both require operator inspection, not automatic retry.

Keep clear until movement has stopped. Support the follower before any procedure
that removes torque. Wait for the execution worker to finish and bus release to
complete; a release failure retains ownership and requires Stop before another
task. Resolve the reported cause, verify camera/table/follower readiness again,
and use the existing explicit dashboard unlock procedure after E-stop. Create a
new reviewed preview for any further trial. Never leave Phase 1 running
unattended, including after `succeeded` or Hold.
