# Gesture-Directed Pick-and-Place Phase 1 Design

## Goal

Let an operator wearing Quest select a tagged cube and a tagged destination box on a fixed overhead-camera panel in VR, review the proposed task, then have one calibrated SO-101 follower execute a slow, guarded pick-and-place sequence. The feature proves the shared-autonomy interaction without training an AI model or relying on passthrough registration.

## Scope

- One fixed USB webcam looks down on the complete tabletop work area.
- Movable cubes and destination boxes carry distinct AprilTags from one configured dictionary.
- A hand ray and an index-thumb pinch select first one visible cube and then one visible box in the VR camera panel.
- The UI presents an explicit task preview and requires a second, deliberate confirmation before motion is requested.
- The system converts a tag centre in the calibrated image plane into a point in the selected follower's robot-base frame. All objects and boxes sit on the same planar table surface.
- The executor uses a fixed top-down grasp orientation and a conservative sequence: open, approach above object, descend, close, lift, travel above destination, descend, open, retreat.
- Existing dashboard readiness, explicit real-motion enablement, exclusive worker ownership, E-stop latch, follower calibration, joint limits and workspace checks remain mandatory.
- Stop, E-stop, camera loss, tag loss before execution, an unreachable pose, or a trajectory failure end the task in Hold and report a reason to the operator.

## Non-goals

- No trained object detector, segmentation model, VLA policy, Kaggle job, or model inference in this phase.
- No selection by pointing at unregistered physical passthrough imagery.
- No arbitrary-object grasping, moving-object tracking, collision geometry planning, bimanual tasks, or automatic retry after a failed grasp.
- No claim that gripper position alone proves a secure grasp. Phase 1 reports completion only after command execution; visual grasp verification belongs to Phase 2.

## Architecture

```text
fixed webcam -> AprilTag localizer -> tabletop calibration -> task preview
                                         ^                    |
Quest hand ray + pinch -> VR selection --+                    v
Dashboard safety gate <---- cancellation/status ---- PickPlaceExecutor
                                                           |
                                                   calibrated follower
```

The feature is a deep `gesture_pick` module behind a small task interface: callers submit a selected `PickPlaceTask`, query its state, or cancel it. Its implementation owns detection validation, coordinate conversion, preflight, staged motion and failure mapping; the UI and dashboard do not duplicate those rules.

`dashboard_server.py` remains the sole owner of process lifecycle and the hardware authorization seam. The gesture-pick adapter may receive an already-authorized calibrated follower, but never discovers serial devices, runs calibration, or directly bypasses the dashboard's motion/E-stop gates.

## Modules and Interfaces

### `backend/gesture_pick/models.py`

Defines immutable Pydantic models:

- `DetectedTag`: tag id, kind (`object` or `box`), image centre, robot-frame table point, observed timestamp and confidence/visibility information.
- `PickPlaceTask`: selected object and box identifiers, follower side, generated task id and request timestamp.
- `TaskState`: `idle`, `selecting-object`, `selecting-box`, `preview`, `executing`, `succeeded`, `held`, or `failed`, with a human-readable reason where applicable.

### `backend/gesture_pick/localizer.py`

Accepts a single camera frame and returns currently visible configured tags. It uses OpenCV's AprilTag/ArUco support, rejects unknown IDs, and never invents a stale detection. Tags are configured as either `object` or `box`; a tag cannot be both.

### `backend/gesture_pick/calibration.py`

Loads a committed calibration file containing camera intrinsics, distortion coefficients, four table-corner reference points in image pixels, their matching tabletop coordinates, and the selected follower base transform. It exposes `image_to_robot_table(point)` and rejects points outside the calibrated table polygon.

The calibration workflow must be explicit: capture calibration reference points while the camera is fixed; persist a versioned local file; invalidate it if the selected camera changes. A tag detection is usable only while this calibration is valid.

### `backend/gesture_pick/executor.py`

Validates the task against fresh detections and all existing safety gates, then drives the follower through named stages. Each Cartesian target is checked for calibrated-table bounds, reachability via the existing SO-101 IK, URDF limits, and conservative joint-step limits before a command is issued. The executor checks the cancellation/E-stop state between every stage and returns a terminal `TaskState`; it never retries a failed grasp automatically.

### Dashboard and VR adapters

The dashboard adds allow-listed endpoints for camera/calibration state, visible tags, task preview/submit/status/cancel, and starts at most one gesture-pick task. The Quest frontend displays the existing live camera feed as the primary VR panel, overlays available tags, casts the tracked hand ray onto that panel, recognizes a debounced pinch, and submits selection events. It exposes no direct actuator command.

## Interaction and Visual Design

Reading this as: a high-stakes VR operator surface, with a dark technical language, leaning toward the existing CHECKIK control-room visual system.

Design dials: `DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 7`.

- The live overhead camera is the dominant surface, not a small widget. It has a clear calibrated/not-calibrated state and a visible frame-time indicator.
- Tag overlays use shape, label and colour together: square outline for an object, rounded destination outline for a box; selection state is obvious at a glance.
- A narrow persistent task rail exposes only the current action: choose object, choose box, review, execute, or stop. It includes explicit cancellation on every non-terminal state.
- The preview names both selected labels, shows their projected positions, and uses a full-width confirm action with readable contrast. There is no auto-execution on pinch.
- Execution feedback is stage-based rather than a decorative progress animation. Motion remains minimal and respects reduced-motion settings.

## Errors and Safety

- No webcam frame, calibration missing, no visible tag, stale tag, ambiguous selection, unknown tag, table-bound violation or disconnected follower blocks preview/submission.
- Camera/tag freshness is rechecked immediately before the first motion stage. A loss after motion begins requests Hold and stops future stages.
- E-stop and dashboard motion lock override every UI state. Reset/recovery requires the existing readiness path; the UI cannot reset either lock.
- An operator can cancel during preview or execution. Cancellation causes Hold, not an uncontrolled return-to-home motion.
- The executor records stage, error and timestamps for dashboard telemetry. It does not store video or claim durable episode recording.

## Verification

- Unit tests for tag classification, stale/unknown tag rejection, table-polygon and image-to-robot conversion, selection-state transitions, preflight rejection and every executor terminal state.
- Tests that cancellation and E-stop prevent later trajectory stages from issuing commands.
- Dashboard handler tests for allow-listed input, exclusive task ownership and motion-lock/readiness enforcement.
- Browser-level test for camera panel selection, preview confirmation, disabled confirm states and visible failure/cancel states.
- Offline integration test with a synthetic calibration and fake follower to validate the complete staged sequence without hardware.
- Hardware acceptance only after offline tests pass: low speed, one tagged cube, empty surrounding workspace, one operator at E-stop, then repeated supervised trials.

## Dependencies and Configuration

- Add an OpenCV distribution that includes the ArUco/AprilTag module to the dual-arm teleop Python environment; pin it in `requirements.txt` after compatibility verification with the existing Python/NumPy environment.
- Introduce local, ignored runtime configuration for the webcam path, tag dictionary/IDs, camera calibration and follower/table transforms. Include a committed example schema without machine-specific paths or calibration values.
- Phase 3 may replace the `localizer` adapter with an AI vision adapter trained/evaluated externally (for example on Kaggle). Its output must retain the same `DetectedTag`-like object/box pose contract, so selection, safety and execution do not change.
