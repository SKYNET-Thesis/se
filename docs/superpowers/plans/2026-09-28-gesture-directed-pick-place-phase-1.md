# Gesture-Directed Pick-and-Place Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, single-follower VR workflow that lets an operator select a tagged cube and tagged box on an overhead-camera panel, confirm the task, and execute a guarded pick-and-place sequence.

**Architecture:** Add a deep `gesture_pick` module under the established dual-arm teleop backend. It owns tag detection, planar calibration, task validation and staged execution behind small task/status interfaces. `dashboard_server.py` remains the hardware ownership and safety-authorization seam; a new VR operator page only selects, previews and cancels tasks through allow-listed dashboard endpoints.

**Tech Stack:** Python 3, Pydantic 2, NumPy, OpenCV ArUco/AprilTag, existing SO-101 IK/controller/dashboard server, React/TypeScript/Vite, Three.js/WebXR, existing CHECKIK UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-28-gesture-directed-pick-place-phase-1-design.md`

## Global Constraints

- Use one fixed overhead webcam, one follower and planar tabletop calibration only.
- Use AprilTag markers for configured cubes and boxes; no trained model, passthrough registration or arbitrary-object detection.
- Only `dashboard_server.py` can authorize, start, stop or E-stop hardware work.
- Never send a motion command before preview confirmation, fresh detection, readiness and explicit real-motion authorization pass.
- Every motion failure, cancel, stale camera/tag and E-stop transition must prevent subsequent stages and leave the task in Hold/failed state.
- Keep hardware acceptance tests manual and low-speed; all automated integration tests use fakes and synthetic frames.

---

### Task 1: Define configuration and pure gesture-pick domain models

**Files:**
- Create: `web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/__init__.py`
- Create: `web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/models.py`
- Create: `web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/config.py`
- Create: `web/checkIk/dual_arm_vr_teleop/gesture_pick_config.example.json`
- Test: `web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_models.py`

**Interfaces:**
- Produces: `DetectedTag`, `PickPlaceTask`, `TaskState`, `TaskPhase`, `GesturePickConfig`, `load_config(path)`.
- Consumed by: localizer, calibration, executor and dashboard adapter.

- [ ] **Step 1: Write failing domain-model tests**

```python
def test_config_rejects_duplicate_or_unknown_tag_ids(tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"tags":{"1":"object","1":"box"}}')
    with pytest.raises(ValueError):
        load_config(path)

def test_task_state_exposes_safe_terminal_states():
    assert TaskPhase.HELD.is_terminal
    assert TaskPhase.FAILED.is_terminal
    assert not TaskPhase.EXECUTING.is_terminal
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `python -m pytest tests/test_gesture_pick_models.py -q`

Expected: FAIL because `backend.gesture_pick` does not exist.

- [ ] **Step 3: Implement immutable types and example configuration**

```python
class TaskPhase(str, Enum):
    IDLE = "idle"
    SELECTING_OBJECT = "selecting-object"
    SELECTING_BOX = "selecting-box"
    PREVIEW = "preview"
    EXECUTING = "executing"
    SUCCEEDED = "succeeded"
    HELD = "held"
    FAILED = "failed"

    @property
    def is_terminal(self) -> bool:
        return self in {self.SUCCEEDED, self.HELD, self.FAILED}
```

Use strict Pydantic models for tag IDs, kinds, follower side, timestamps and positions. The example JSON must name `/dev/video*` only as a placeholder, include unique tag IDs and contain no real calibration values.

- [ ] **Step 4: Run the model tests**

Run: `python -m pytest tests/test_gesture_pick_models.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the isolated domain-model change**

```bash
git add web/checkIk/dual_arm_vr_teleop/backend/gesture_pick web/checkIk/dual_arm_vr_teleop/gesture_pick_config.example.json web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_models.py
git commit -m "feat(gesture-pick): add task models and config"
```

### Task 2: Add AprilTag localization and planar calibration

**Files:**
- Modify: `web/checkIk/dual_arm_vr_teleop/requirements.txt`
- Create: `web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/calibration.py`
- Create: `web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/localizer.py`
- Create: `web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/calibrate_overhead_camera.py`
- Test: `web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_calibration.py`
- Test: `web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_localizer.py`

**Interfaces:**
- Consumes: `GesturePickConfig`, `DetectedTag`.
- Produces: `TableCalibration.image_to_robot_table(image_point) -> np.ndarray` and `AprilTagLocalizer.detect(frame, observed_at) -> list[DetectedTag]`.
- Consumed by: task preflight and dashboard tag endpoint.

- [ ] **Step 1: Write failing calibration/localizer tests**

```python
def test_homography_maps_table_corners_and_rejects_outside_points():
    calibration = TableCalibration.from_points(
        image_points=[[0, 0], [100, 0], [100, 100], [0, 100]],
        robot_points=[[0, 0], [1, 0], [1, 1], [0, 1]],
    )
    assert np.allclose(calibration.image_to_robot_table((50, 50)), [0.5, 0.5, 0])
    with pytest.raises(ValueError, match="outside"):
        calibration.image_to_robot_table((101, 50))

def test_localizer_ignores_unknown_and_stale_tags(fake_apriltag_frame):
    detections = localizer.detect(fake_apriltag_frame, observed_at=10.0)
    assert [item.tag_id for item in detections] == [7]
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `python -m pytest tests/test_gesture_pick_calibration.py tests/test_gesture_pick_localizer.py -q`

Expected: FAIL because calibration/localizer are undefined.

- [ ] **Step 3: Implement calibration and detection without hardware side effects**

Pin an OpenCV package that contains `cv2.aruco` after confirming it imports in the LeRobot environment. Implement camera-table homography from four ordered table corners, polygon containment and a `calibration_id` derived from camera path and saved data. `AprilTagLocalizer` must use the configured dictionary and ID map, map tag centres through `TableCalibration`, and return only fresh known detections. `calibrate_overhead_camera.py` saves a local runtime calibration JSON and never commands a robot.

- [ ] **Step 4: Run calibration/localizer tests**

Run: `python -m pytest tests/test_gesture_pick_calibration.py tests/test_gesture_pick_localizer.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the localization change**

```bash
git add web/checkIk/dual_arm_vr_teleop/requirements.txt web/checkIk/dual_arm_vr_teleop/backend/gesture_pick web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_calibration.py web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_localizer.py
git commit -m "feat(gesture-pick): localize configured AprilTags"
```

### Task 3: Build the guarded staged pick-and-place executor offline first

**Files:**
- Create: `web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/executor.py`
- Test: `web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_executor.py`

**Interfaces:**
- Consumes: fresh `DetectedTag`, `PickPlaceTask`, `TableCalibration`, existing `SO101Kinematics` and a narrow follower adapter exposing `get_joint_positions()`, `solve_end_effector()` and `move_joints()`.
- Produces: `PickPlaceExecutor.preview(task) -> TaskState`, `confirm(task_id) -> TaskState`, `cancel(reason) -> TaskState`, `status() -> TaskState`.
- Consumed by: dashboard controller.

- [ ] **Step 1: Write failing executor state-machine tests with a fake follower**

```python
def test_executor_runs_named_stages_in_order(fake_follower, fresh_object, fresh_box):
    executor = PickPlaceExecutor(fake_follower, clock=lambda: 10.0)
    preview = executor.preview(task_for(fresh_object, fresh_box))
    assert preview.phase is TaskPhase.PREVIEW
    assert executor.confirm(preview.task_id).phase is TaskPhase.SUCCEEDED
    assert fake_follower.stages == ["open", "approach", "descend", "close", "lift", "travel", "place", "release", "retreat"]

def test_cancel_or_estop_blocks_all_later_stages(fake_follower, fresh_object, fresh_box):
    executor = PickPlaceExecutor(fake_follower, clock=lambda: 10.0)
    preview = executor.preview(task_for(fresh_object, fresh_box))
    executor.cancel("operator_cancelled")
    assert executor.confirm(preview.task_id).phase is TaskPhase.HELD
    assert fake_follower.stages == []
```

- [ ] **Step 2: Run the executor tests to confirm failure**

Run: `python -m pytest tests/test_gesture_pick_executor.py -q`

Expected: FAIL because `PickPlaceExecutor` is undefined.

- [ ] **Step 3: Implement preflight and conservative execution**

Use constants in configuration for safe hover height, descent height, gripper open/closed values and speed. Before every stage, re-check cancellation/E-stop callback, tag freshness, table bounds, IK success, URDF limits and joint delta. Drive only the existing follower adapter; do not instantiate LeRobot internally. On any failed check, stop issuing further stages and return `HELD` or `FAILED` with the exact stage/reason.

- [ ] **Step 4: Run executor tests**

Run: `python -m pytest tests/test_gesture_pick_executor.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the offline executor**

```bash
git add web/checkIk/dual_arm_vr_teleop/backend/gesture_pick/executor.py web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_executor.py
git commit -m "feat(gesture-pick): add guarded offline executor"
```

### Task 4: Integrate gesture-pick ownership and allow-listed endpoints into the dashboard

**Files:**
- Modify: `web/checkIk/dual_arm_vr_teleop/backend/dashboard_server.py`
- Modify: `web/checkIk/dual_arm_vr_teleop/tests/test_dashboard_server.py`
- Create: `web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_dashboard.py`

**Interfaces:**
- Consumes: `PickPlaceExecutor` and its state interface.
- Produces: `GET /api/gesture-pick/status`, `GET /api/gesture-pick/detections`, `POST /api/gesture-pick/select`, `POST /api/gesture-pick/confirm`, `POST /api/gesture-pick/cancel`.
- Consumed by: browser dashboard and Quest frontend.

- [ ] **Step 1: Write failing HTTP/controller tests**

```python
def test_gesture_pick_requires_motion_readiness_and_exclusive_task(controller):
    with pytest.raises(PermissionError):
        controller.gesture_pick_confirm("task-1")
    controller.enable_ready_fake_follower()
    controller.gesture_pick_select({"kind": "object", "tagId": 7})
    with pytest.raises(ValueError, match="object.*box"):
        controller.gesture_pick_confirm("task-1")

def test_estop_cancels_active_gesture_pick_before_latching(controller):
    controller.start_ready_gesture_pick()
    controller.emergency_stop()
    assert controller.gesture_pick_status()["phase"] == "held"
    assert controller.state["latchedMotionLock"] is True
```

- [ ] **Step 2: Run dashboard tests to confirm failure**

Run: `python -m pytest tests/test_dashboard_server.py tests/test_gesture_pick_dashboard.py -q`

Expected: FAIL because gesture-pick endpoints/controller methods do not exist.

- [ ] **Step 3: Add dashboard adapter with exclusive ownership**

Add one `gesture_pick` field to `Controller`; construct it only from explicitly configured camera/follower information. Require the same readiness checks and `--enable-motion` state as real teleop before confirmation. Reject arbitrary camera paths, arbitrary tag IDs and overlapping managed tasks. Route normal Stop and E-stop through `gesture_pick.cancel()` before process termination/lock persistence. Add its sanitized status/detections to `snapshot()`.

- [ ] **Step 4: Run dashboard integration tests**

Run: `python -m pytest tests/test_dashboard_server.py tests/test_gesture_pick_dashboard.py -q`

Expected: PASS.

- [ ] **Step 5: Commit dashboard integration**

```bash
git add web/checkIk/dual_arm_vr_teleop/backend/dashboard_server.py web/checkIk/dual_arm_vr_teleop/tests/test_dashboard_server.py web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_dashboard.py
git commit -m "feat(gesture-pick): expose guarded dashboard task flow"
```

### Task 5: Add the Quest WebXR camera-panel selection surface

**Files:**
- Modify: `web/checkIk/dual_arm_vr_teleop/frontend/src/main.js`
- Modify: `web/checkIk/dual_arm_vr_teleop/frontend/src/style.css`
- Create: `web/checkIk/dual_arm_vr_teleop/frontend/src/gesturePick.js`
- Test: `web/checkIk/dual_arm_vr_teleop/frontend/src/gesturePick.test.mjs`

**Interfaces:**
- Consumes: dashboard gesture-pick endpoints and standard WebXR hand joints/ray information.
- Produces: `GesturePickSelection` state (`selecting-object`, `selecting-box`, `preview`, `executing`, terminal states) and selected tag IDs.
- Consumed by: VR rendering loop.

- [ ] **Step 1: Write failing pure selection tests**

```javascript
test('pinch selects an object, then a box, then opens preview', () => {
  let state = initialGesturePickSelection();
  state = applyPinch(state, { id: 7, kind: 'object' });
  state = applyPinch(state, { id: 22, kind: 'box' });
  assert.equal(state.phase, 'preview');
  assert.deepEqual(state.selection, { objectTagId: 7, boxTagId: 22 });
});

test('pinch debounce ignores a held pinch', () => {
  assert.equal(shouldAcceptPinch({ pinched: true, lastAcceptedAt: 10 }, 10.1), false);
});
```

- [ ] **Step 2: Run the browser-unit tests to confirm failure**

Run: `node --test frontend/src/gesturePick.test.mjs`

Expected: FAIL because `gesturePick.js` is absent.

- [ ] **Step 3: Implement the operator surface using existing Three.js primitives**

Request `hand-tracking` as an optional WebXR feature while retaining controller fallback. Render the existing `/api/cameras/stream` output on a camera-panel texture; project configured detections from their image coordinates onto it. Raycast the index-finger ray against the panel, use a debounced index-thumb pinch to select overlays, and issue dashboard selection requests. Render a persistent technical task rail with calibration/camera health, current selection prompt, selected object/box labels, preview details, explicit Confirm and Cancel/Stop controls. Respect disabled/error/terminal states and do not add automatic motion or decorative continuous animation.

- [ ] **Step 4: Run unit/build verification**

Run: `node --test frontend/src/gesturePick.test.mjs && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the Quest selection UI**

```bash
git add web/checkIk/dual_arm_vr_teleop/frontend/src/main.js web/checkIk/dual_arm_vr_teleop/frontend/src/style.css web/checkIk/dual_arm_vr_teleop/frontend/src/gesturePick.js web/checkIk/dual_arm_vr_teleop/frontend/src/gesturePick.test.mjs
git commit -m "feat(gesture-pick): add VR camera-panel selection"
```

### Task 6: Add laptop-dashboard observability and operator controls

**Files:**
- Modify: `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564/src/lib/backend.ts`
- Create: `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564/src/components/gesture-pick/GesturePickStatus.tsx`
- Create: `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564/src/pages/GesturePick.tsx`
- Modify: `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564/src/App.tsx`
- Test: `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564/src/components/gesture-pick/GesturePickStatus.test.tsx`

**Interfaces:**
- Consumes: dashboard gesture-pick snapshot/endpoints.
- Produces: a read-only detection/status view and Cancel action; it cannot confirm motion without the VR preview flow.
- Consumed by: operator monitoring and hardware test checklist.

- [ ] **Step 1: Write failing component tests**

```tsx
it('shows calibration blocking reason and disables task controls', () => {
  render(<GesturePickStatus state={{ phase: 'idle', reason: 'calibration required' }} />);
  expect(screen.getByText('calibration required')).toBeVisible();
  expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run the component test to confirm failure**

Run: `npm test -- GesturePickStatus.test.tsx`

Expected: FAIL because the component/page does not exist.

- [ ] **Step 3: Implement a safety-first monitoring page**

Extend typed backend snapshot models for gesture-pick state/detections. Add a route from the existing control navigation. Reuse existing cards, badges, camera feed and emergency-stop style; show calibration, camera freshness, selected follower, tag list, task stage and error reason. The only mutation action on the laptop page is Cancel while a task is active; confirmation remains exclusively on the VR preview surface.

- [ ] **Step 4: Run component and Vite build verification**

Run: `npm test -- GesturePickStatus.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the monitoring surface**

```bash
git add web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564/src
git commit -m "feat(gesture-pick): add operator monitoring page"
```

### Task 7: Verify offline end-to-end behavior and document supervised hardware acceptance

**Files:**
- Create: `web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_offline.py`
- Create: `docs/guides/gesture-pick-phase-1.md`
- Modify: `web/checkIk/dual_arm_vr_teleop/README.md`

**Interfaces:**
- Consumes: all gesture-pick module interfaces and dashboard endpoints.
- Produces: reproducible offline verification and a hardware checklist with stop criteria.

- [ ] **Step 1: Write the failing offline end-to-end test**

```python
def test_tag_selection_preview_confirm_executes_fake_follower_sequence(tmp_path):
    dashboard = configured_offline_dashboard(tmp_path)
    dashboard.gesture_pick_select({"kind": "object", "tagId": 7})
    dashboard.gesture_pick_select({"kind": "box", "tagId": 22})
    preview = dashboard.gesture_pick_status()
    assert preview["phase"] == "preview"
    completed = dashboard.gesture_pick_confirm(preview["taskId"])
    assert completed["phase"] == "succeeded"
```

- [ ] **Step 2: Run it to confirm failure before integration is complete**

Run: `python -m pytest tests/test_gesture_pick_offline.py -q`

Expected: FAIL until dashboard/localizer/executor integration is wired.

- [ ] **Step 3: Complete fixtures and write the operator guide**

Use only synthetic frame/detection data and a fake follower in automated tests. The guide must specify: mount camera rigidly, print/apply configured AprilTags, calibrate table before each changed camera setup, clear workspace, test offline first, run `--enable-motion --hardware` only after readiness, use low speed, keep a human at E-stop, and stop immediately on any unexpected movement. State that Phase 1 does not prove secure grasp and must not be used unattended.

- [ ] **Step 4: Run the complete verification suite**

Run: `python -m pytest tests/test_gesture_pick_models.py tests/test_gesture_pick_calibration.py tests/test_gesture_pick_localizer.py tests/test_gesture_pick_executor.py tests/test_gesture_pick_dashboard.py tests/test_gesture_pick_offline.py -q && node --test frontend/src/gesturePick.test.mjs && npm run build && git diff --check`

Expected: all tests/builds pass and no whitespace errors.

- [ ] **Step 5: Commit documentation and verification**

```bash
git add web/checkIk/dual_arm_vr_teleop/tests/test_gesture_pick_offline.py docs/guides/gesture-pick-phase-1.md web/checkIk/dual_arm_vr_teleop/README.md
git commit -m "test(gesture-pick): verify offline task flow"
```

## Plan Self-Review

- Spec coverage: Tasks 1–2 implement configuration, calibration and AprilTag detection; Task 3 implements staged safety execution; Task 4 preserves dashboard authority; Task 5 supplies VR selection/confirmation; Task 6 supplies monitoring; Task 7 verifies and documents hardware acceptance.
- Placeholder scan: no deferred implementation markers are used; each task specifies concrete files, interfaces, tests and verification commands.
- Type consistency: all task adapters exchange `DetectedTag`, `PickPlaceTask` and `TaskState`; only the executor commands the follower adapter, and only the dashboard constructs/authorizes it.
