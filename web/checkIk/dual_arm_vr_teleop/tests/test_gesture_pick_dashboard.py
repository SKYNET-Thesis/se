"""Dashboard authorization and HTTP contracts; no camera or serial hardware."""

import cv2
import json
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend import dashboard_server as dashboard
from backend.gesture_pick.calibration import TableCalibration
from backend.gesture_pick.config import GesturePickConfig
from backend.gesture_pick.models import DetectedTag
from robot.ik import IKResult
from robot.kinematics import SO101Kinematics


class Follower:
    def __init__(self, should_cancel):
        self.model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
        self.q = np.zeros(5)
        self.gripper = 25.0
        self.is_connected = True
        self.should_cancel = should_cancel
        self.commands = []
        self.after_move = lambda: None
        self.after_solve = lambda: None

    def get_joint_positions(self):
        return self.q.copy(), self.gripper

    def solve_end_effector(self, position, *, initial_q, target_rotation):
        self.after_solve()
        return IKResult(True, np.asarray(initial_q) + 0.01, 0.0, 0.0, "verified")

    def move_joints(self, target_q, *, start_q, gripper, max_total_delta_deg, speed_deg_s):
        if self.should_cancel():
            raise RuntimeError("cancelled before command")
        self.commands.append(gripper)
        self.q = np.asarray(target_q).copy()
        self.gripper = gripper
        self.after_move()

    def disconnect(self):
        self.is_connected = False


@pytest.fixture
def rig(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "STATE_FILE", tmp_path / "state.json")
    monkeypatch.setattr(dashboard, "TELEMETRY_FILE", tmp_path / "telemetry.json")
    follower_profile = tmp_path / "follower.json"
    follower_profile.write_text("{}")
    monkeypatch.setattr(dashboard, "calibration_path", lambda _: follower_profile)
    table_path = tmp_path / "table.json"
    TableCalibration.from_points(
        [[0, 0], [100, 0], [100, 100], [0, 100]],
        [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]],
        camera_path="/dev/video-test", table_z=0.1,
    ).save(table_path)
    config = GesturePickConfig(camera_path="/dev/video-test", tags={7: "object", 22: "box"},
                               follower_side="right", calibration_path=str(table_path))
    tags = [DetectedTag(tag_id=7, kind="object", image_center=(25.0, 25.0),
                        robot_point=(0.1, 0.1, 0.1), observed_at=10.0),
            DetectedTag(tag_id=22, kind="box", image_center=(50.0, 50.0),
                        robot_point=(0.2, 0.2, 0.1), observed_at=10.0)]
    followers = []

    def factory(side, port, should_cancel):
        assert (side, port) == ("right", "/dev/ttyACM7")
        follower = Follower(should_cancel)
        followers.append(follower)
        return follower

    controller = dashboard.Controller(
        enable_motion=True, offline=False, gesture_pick_config=config,
        gesture_pick_follower_factory=factory, gesture_pick_detections=lambda: tags,
        gesture_pick_clock=lambda: 10.0,
    )
    controller.state["assignments"]["right-follower"] = "/dev/ttyACM7"
    monkeypatch.setattr(controller, "ports", lambda: [{"path": "/dev/ttyACM7", "present": True}])
    monkeypatch.setattr(controller, "cameras", lambda: [])
    yield SimpleNamespace(controller=controller, tags=tags, followers=followers,
                          follower_profile=follower_profile, config=config)
    controller.stop()


def preview(rig):
    controller = rig.controller
    assert controller.gesture_pick_select({"kind": "object", "tagId": 7})["phase"] == "selecting-box"
    state = controller.gesture_pick_select({"kind": "box", "tagId": 22})
    assert state["phase"] == "preview"
    assert rig.followers[0].commands == []
    return state["taskId"]


def finish(controller):
    controller.gesture_pick._worker.join(timeout=2)
    assert not controller.gesture_pick._worker.is_alive()
    return controller.gesture_pick_status()


def test_unconfigured_status_is_explicit_and_does_not_discover_hardware(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "STATE_FILE", tmp_path / "empty.json")
    controller = dashboard.Controller(enable_motion=False)
    assert controller.gesture_pick is None
    assert controller.gesture_pick_status()["configured"] is False
    assert controller.gesture_pick_status()["reason"] == "gesture-pick configuration required"
    assert controller.gesture_pick_detections()["detections"] == []
    with pytest.raises(PermissionError):
        controller.gesture_pick_confirm("task-1")


@pytest.mark.parametrize("change", ["motion", "offline", "estop"])
def test_confirmation_requires_hardware_motion_and_unlatched_lock(rig, change):
    controller = rig.controller
    if change == "motion":
        controller.enable_motion = False
    elif change == "offline":
        controller.offline = True
    else:
        controller.state["latchedMotionLock"] = True
    with pytest.raises(PermissionError):
        controller.gesture_pick_confirm("task-1")
    assert rig.followers == []


def test_confirmation_requires_both_object_and_box(rig):
    rig.controller.gesture_pick_select({"kind": "object", "tagId": 7})
    with pytest.raises(ValueError, match="object.*box"):
        rig.controller.gesture_pick_confirm("task-1")
    assert rig.followers == []


@pytest.mark.parametrize("missing", ["assignment", "calibration", "availability"])
def test_preview_requires_selected_follower_readiness_before_constructing_it(rig, monkeypatch, missing):
    controller = rig.controller
    controller.gesture_pick_select({"kind": "object", "tagId": 7})
    if missing == "assignment":
        controller.state["assignments"]["right-follower"] = None
    elif missing == "calibration":
        rig.follower_profile.unlink()
    else:
        monkeypatch.setattr(controller, "ports", lambda: [])
    with pytest.raises(ValueError, match="readiness"):
        controller.gesture_pick_select({"kind": "box", "tagId": 22})
    assert rig.followers == []


@pytest.mark.parametrize("payload", [
    {"kind": "object", "tagId": 999}, {"kind": "object", "tagId": 22},
    {"kind": "object", "tagId": True}, {"kind": "object", "tagId": "7"},
    {"kind": "object", "tagId": 7, "cameraPath": "/tmp/arbitrary"},
    {"kind": "object", "tagId": 7, "followerSide": "left"},
    {"kind": "object", "tagId": 7, "robotPoint": [1, 2, 3]},
    {"kind": "arm", "tagId": 7}, {"kind": "box", "tagId": 22},
    {"kind": [], "tagId": 7},
    {"kind": {"cameraPath": "/tmp/arbitrary"}, "tagId": 7},
])
def test_selection_accepts_only_configured_visible_typed_tags_in_order(rig, payload):
    with pytest.raises(ValueError):
        rig.controller.gesture_pick_select(payload)
    assert rig.followers == []


@pytest.mark.parametrize("fault", ["missing", "stale", "duplicate", "invisible", "outside"])
def test_invalid_detection_cannot_be_selected(rig, fault):
    if fault == "missing":
        rig.tags.pop(0)
    elif fault == "duplicate":
        rig.tags.append(rig.tags[0])
    else:
        update = {"stale": {"observed_at": 9.49}, "invisible": {"visible": False},
                  "outside": {"robot_point": (0.5, 0.1, 0.1)}}[fault]
        rig.tags[0] = rig.tags[0].model_copy(update=update)
    with pytest.raises(ValueError, match="visible"):
        rig.controller.gesture_pick_select({"kind": "object", "tagId": 7})
    assert rig.followers == []


def test_configured_preview_has_sanitized_status_and_detections(rig):
    task_id = preview(rig)
    snapshot = rig.controller.snapshot()["gesturePick"]
    assert snapshot["status"]["taskId"] == task_id
    assert snapshot["status"]["selection"] == {"objectTagId": 7, "boxTagId": 22}
    assert snapshot["status"]["followerSide"] == "right"
    assert snapshot["status"]["calibrationValid"] is True
    assert snapshot["detections"][0] == {
        "tagId": 7, "kind": "object", "imageCenter": [25.0, 25.0],
        "robotPoint": [0.1, 0.1, 0.1], "observedAt": 10.0,
        "confidence": 1.0, "visible": True,
    }
    assert "/dev/ttyACM7" not in json.dumps(snapshot)
    assert str(rig.config.calibration_path) not in json.dumps(snapshot)


def test_confirmation_runs_once_and_requires_matching_preview_id(rig):
    task_id = preview(rig)
    with pytest.raises(ValueError, match="task"):
        rig.controller.gesture_pick_confirm("unrelated")
    assert rig.followers[0].commands == []
    rig.controller.gesture_pick_confirm(task_id)
    state = finish(rig.controller)
    assert state["phase"] == "succeeded"
    assert state["stage"] == "retreat"
    assert rig.followers[0].commands == [75.0, 75.0, 75.0, 0.0, 0.0, 0.0, 0.0, 75.0, 75.0]
    rig.controller.gesture_pick_confirm(task_id)
    assert len(rig.followers[0].commands) == 9
    assert not rig.followers[0].is_connected


def test_readiness_is_rechecked_at_confirmation(rig, monkeypatch):
    task_id = preview(rig)
    monkeypatch.setattr(rig.controller, "ports", lambda: [])
    with pytest.raises(ValueError, match="readiness"):
        rig.controller.gesture_pick_confirm(task_id)
    assert rig.followers[0].commands == []


def test_managed_task_blocks_gesture_preview_before_follower_construction(rig):
    rig.controller.task = dashboard.ManagedTask(process=SimpleNamespace(poll=lambda: None),
                                                 kind="teleop", command=[])
    rig.controller.gesture_pick_select({"kind": "object", "tagId": 7})
    with pytest.raises(ValueError, match="already running"):
        rig.controller.gesture_pick_select({"kind": "box", "tagId": 22})
    assert rig.followers == []
    rig.controller.task = None


def test_gesture_preview_blocks_every_managed_start(rig, monkeypatch):
    preview(rig)

    def forbidden_process(*args, **kwargs):
        pytest.fail("an overlapping managed worker must never be launched")

    monkeypatch.setattr(dashboard.subprocess, "Popen", forbidden_process)
    with pytest.raises(ValueError, match="gesture-pick"):
        rig.controller._start("find-port", ["unused"])
    with pytest.raises(ValueError, match="gesture-pick"):
        rig.controller.start_vr_lekiwi("right-only")


@pytest.mark.parametrize("method,reason,latched", [
    ("gesture_pick_cancel", "operator_cancelled", False),
    ("stop", "operator_stop", False), ("emergency_stop", "estop", True),
])
def test_stop_and_estop_cancel_before_next_execution_stage(rig, method, reason, latched):
    task_id = preview(rig)
    rig.followers[0].after_move = lambda: getattr(rig.controller, method)()
    rig.controller.gesture_pick_confirm(task_id)
    state = finish(rig.controller)
    assert state["phase"] == "held"
    assert state["reason"] == reason
    assert rig.followers[0].commands == [75.0]
    assert rig.controller.state["latchedMotionLock"] is latched


def test_cancelled_blocking_move_keeps_ownership_until_it_returns(rig, monkeypatch):
    task_id = preview(rig)
    started, released = threading.Event(), threading.Event()

    def blocking_move():
        started.set()
        assert released.wait(2)

    rig.followers[0].after_move = blocking_move
    rig.controller.gesture_pick_confirm(task_id)
    assert started.wait(2)
    rig.controller.gesture_pick_cancel()
    with pytest.raises(ValueError, match="gesture-pick"):
        rig.controller._start("find-port", ["unused"])
    with pytest.raises(ValueError, match="execut"):
        rig.controller.gesture_pick_select({"kind": "object", "tagId": 7})
    released.set()
    assert finish(rig.controller)["phase"] == "held"
    assert len(rig.followers[0].commands) == 1


@pytest.fixture
def api(rig):
    handler = type("OfflineGestureHandler", (dashboard.Handler,), {"controller": rig.controller})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def request(path, body=None):
        req = Request(f"http://127.0.0.1:{server.server_port}{path}",
                      data=None if body is None else json.dumps(body).encode(),
                      headers={"Content-Type": "application/json"})
        try:
            response = urlopen(req, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    request.base_url = f"http://127.0.0.1:{server.server_port}"
    yield request
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def test_http_routes_return_sanitized_state_and_explicit_preview_flow(api, rig):
    status, payload = api("/api/gesture-pick/status")
    assert status == 200
    assert payload["configured"] is True
    status, payload = api("/api/gesture-pick/detections")
    assert status == 200
    assert [tag["tagId"] for tag in payload["detections"]] == [7, 22]
    assert api("/api/gesture-pick/select", {"kind": "object", "tagId": 7})[0] == 200
    status, payload = api("/api/gesture-pick/select", {"kind": "box", "tagId": 22})
    assert status == 200
    state = payload["gesturePick"]["status"]
    assert state["phase"] == "preview"
    assert rig.followers[0].commands == []
    assert api("/api/gesture-pick/confirm", {"taskId": state["taskId"]})[0] == 200
    assert finish(rig.controller)["phase"] == "succeeded"
    assert api("/api/gesture-pick/cancel", {})[0] == 200


@pytest.mark.parametrize("path,body", [
    ("/api/gesture-pick/select", {"kind": "object", "tagId": 7, "cameraPath": "/tmp/evil"}),
    ("/api/gesture-pick/confirm", {"taskId": "task", "followerSide": "left"}),
    ("/api/gesture-pick/cancel", {"command": "arbitrary"}),
    ("/api/gesture-pick/select", []),
])
def test_http_rejects_extra_fields_and_nonobject_payloads(api, path, body):
    assert api(path, body)[0] == 400


def test_http_locked_confirmation_returns_forbidden_and_unknown_route_is_not_found(api, rig):
    rig.controller.enable_motion = False
    assert api("/api/gesture-pick/confirm", {"taskId": "task"})[0] == 403
    assert api("/api/gesture-pick/command", {"command": "arbitrary"})[0] == 404


def test_estop_cancels_preview_before_persisting_the_motion_lock(rig, monkeypatch):
    preview(rig)
    previous_save = dashboard.save_state

    def checked_save(state):
        assert rig.controller.gesture_pick_status()["phase"] == "held"
        assert rig.controller.gesture_pick_status()["reason"] == "estop"
        assert state["latchedMotionLock"] is True
        previous_save(state)

    monkeypatch.setattr(dashboard, "save_state", checked_save)
    rig.controller.emergency_stop()
    restored = dashboard.Controller(enable_motion=True)
    assert restored.state["latchedMotionLock"] is True


def test_guarded_follower_blocks_each_actuator_write_when_cancelled():
    from robot.controller import RobotController

    sent = []
    stopped = threading.Event()
    raw = SimpleNamespace(send_action=lambda action: sent.append(action), config=SimpleNamespace(
        disable_torque_on_disconnect=True))
    controller = RobotController.__new__(RobotController)
    controller.robot = raw
    controller.model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    guarded = dashboard.GuardedGestureFollower(controller, stopped.is_set)
    guarded.controller.robot.send_action({"gripper.pos": 25.0})
    stopped.set()
    with pytest.raises(RuntimeError, match="cancel"):
        guarded.controller.robot.send_action({"gripper.pos": 75.0})
    assert sent == [{"gripper.pos": 25.0}]
    assert raw.config.disable_torque_on_disconnect is False


def test_guarded_follower_solver_verifies_requested_orientation():
    from robot.controller import RobotController

    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    q = np.array([0.0, 0.3, -0.5, -0.2, 0.0])
    pose = model.forward_kinematics(q)
    controller = RobotController.__new__(RobotController)
    controller.robot = SimpleNamespace(config=SimpleNamespace(disable_torque_on_disconnect=True))
    controller.model = model
    guarded = dashboard.GuardedGestureFollower(controller, lambda: False)
    result = guarded.solve_end_effector(pose.position, initial_q=q, target_rotation=pose.rotation)
    assert result.success
    assert result.orientation_error is not None and result.orientation_error <= 0.02
    assert result.position_error <= 0.0001


def test_camera_or_calibration_failure_stays_queryable_and_cannot_open_follower(rig):
    rig.controller.gesture_pick.cancel("operator_cancelled")
    rig.controller.gesture_pick.calibration = None
    assert rig.controller.gesture_pick_status()["calibrationValid"] is False
    assert rig.controller.gesture_pick_detections()["detections"] == []
    with pytest.raises(ValueError, match="calibration"):
        rig.controller.gesture_pick_select({"kind": "object", "tagId": 7})
    assert rig.followers == []


def test_assignment_cannot_change_a_reserved_gesture_follower(rig):
    preview(rig)
    with pytest.raises(ValueError, match="gesture-pick"):
        rig.controller.assign("right-follower", "/dev/ttyACM8")
    assert rig.controller.state["assignments"]["right-follower"] == "/dev/ttyACM7"


def test_cleanup_failure_remains_visible_and_keeps_exclusive_ownership(rig):
    preview(rig)
    disconnect = rig.followers[0].disconnect

    def unavailable_bus():
        raise OSError("private /dev/ttyACM7 error")

    rig.followers[0].disconnect = unavailable_bus
    state = rig.controller.gesture_pick_cancel()
    assert "release failed" in state["reason"]
    assert "/dev/ttyACM7" not in json.dumps(state)
    with pytest.raises(ValueError, match="gesture-pick"):
        rig.controller._start("find-port", ["unused"])
    rig.followers[0].disconnect = disconnect
    rig.controller.stop()
    assert rig.controller.gesture_pick.active is False


def test_adapter_failure_does_not_expose_serial_paths_in_public_status(rig):
    task_id = preview(rig)

    def adapter_error():
        raise RuntimeError("device /dev/ttyACM7 at /tmp/private-profile.json")

    rig.followers[0].after_move = adapter_error
    rig.controller.gesture_pick_confirm(task_id)
    state = finish(rig.controller)
    assert state["phase"] == "failed"
    assert state["stage"] == "open"
    assert "/dev/ttyACM7" not in json.dumps(state)
    assert "/tmp/private-profile.json" not in json.dumps(state)


def test_configured_camera_stream_and_localizer_share_one_capture(api, rig, monkeypatch):
    reads = []
    opened = []
    closed = []

    class Capture:
        def __init__(self, path):
            assert path == "/dev/video-test"
            opened.append(path)

        def set(self, *_):
            pass

        def read(self):
            reads.append(True)
            return True, np.full((100, 100, 3), 255, dtype=np.uint8)

        def release(self):
            closed.append(True)

    monkeypatch.setattr(cv2, "VideoCapture", Capture)
    rig.controller.gesture_pick._source = None
    assert api("/api/gesture-pick/detections")[0] == 200
    with urlopen(f"{api.base_url}/api/cameras/stream?path=/dev/video-test", timeout=3) as response:
        assert response.status == 200
        assert "multipart/x-mixed-replace" in response.headers["Content-Type"]
        assert b"Content-Type: image/jpeg" in response.read(100)
    assert opened == ["/dev/video-test"]
    assert len(reads) >= 2
    rig.controller.gesture_pick.close_camera()
    assert closed == [True]


def test_camera_discovery_does_not_probe_the_owned_capture(rig, monkeypatch):
    monkeypatch.setattr(dashboard.glob, "glob", lambda _: ["/dev/video-test", "/dev/video-other"])
    probed = []

    def probe(command, **_):
        probed.extend(command[3:])
        return SimpleNamespace(returncode=0, stdout=json.dumps([
            {"path": "/dev/video-other", "connection": "connected", "resolution": "640×480", "fps": 30}
        ]))

    monkeypatch.setattr(dashboard.subprocess, "run", probe)
    cameras = dashboard.Controller.cameras(rig.controller)
    assert probed == ["/dev/video-other"]
    assert {camera["path"] for camera in cameras} == {"/dev/video-test", "/dev/video-other"}


def test_estop_closes_motion_gate_before_the_persisted_latch_is_written(rig, monkeypatch):
    original_stop = rig.controller.stop

    def intercepted_stop(*, reason="operator_stop"):
        original_stop(reason=reason)
        if reason != "estop":
            return
        assert rig.controller.state["latchedMotionLock"] is False
        with pytest.raises(PermissionError):
            rig.controller.start_single_leader_teleop("ENABLE MOTION", "right")

    monkeypatch.setattr(rig.controller, "stop", intercepted_stop)
    rig.controller.emergency_stop()
    assert rig.controller.state["latchedMotionLock"] is True


def test_worker_launch_rechecks_latch_after_the_entry_point_check(rig, monkeypatch):
    original_start = rig.controller._start
    rig.controller.state["assignments"]["right-leader"] = "/dev/ttyACM8"

    def intercepted_start(kind, command, calibration=None):
        rig.controller.state["latchedMotionLock"] = True
        original_start(kind, command, calibration)

    def forbidden_process(*_, **__):
        pytest.fail("a worker must never launch after the E-stop gate closes")

    monkeypatch.setattr(rig.controller, "_start", intercepted_start)
    monkeypatch.setattr(dashboard.subprocess, "Popen", forbidden_process)
    with pytest.raises(PermissionError):
        rig.controller.start_single_leader_teleop("ENABLE MOTION", "right")


def test_vr_lekiwi_launch_rechecks_latch_after_preparing_command(rig, monkeypatch, tmp_path):
    cert, key = tmp_path / "cert.pem", tmp_path / "key.pem"
    cert.write_text("offline")
    key.write_text("offline")
    monkeypatch.setattr(dashboard, "VUER_CERT", cert)
    monkeypatch.setattr(dashboard, "VUER_KEY", key)
    monkeypatch.setattr(dashboard, "VR_LEKIWI_ROOT", tmp_path)

    def prepare_port():
        rig.controller.state["latchedMotionLock"] = True
        return 12345

    def forbidden_process(*_, **__):
        pytest.fail("the VR worker must never launch after the E-stop gate closes")

    monkeypatch.setattr(rig.controller, "_available_local_port", prepare_port)
    monkeypatch.setattr(dashboard.subprocess, "Popen", forbidden_process)
    with pytest.raises(PermissionError):
        rig.controller.start_vr_lekiwi("right-only")


def test_estop_during_blocking_command_is_held_even_before_cancel_delivery(rig):
    task_id = preview(rig)

    def interrupted_move(*_, **__):
        # Model the scheduling window after emergency_stop signals the gate,
        # before its executor.cancel call gets its next turn.
        rig.controller._estopping.set()
        if rig.followers[0].should_cancel():
            raise RuntimeError("actuator command interrupted")
        pytest.fail("the actuator command guard must observe E-stop")

    rig.followers[0].move_joints = interrupted_move
    rig.controller.gesture_pick_confirm(task_id)
    state = finish(rig.controller)
    assert state["phase"] == "held"
    assert state["reason"] == "estop"
    assert rig.followers[0].commands == []


def test_failed_real_factory_cleanup_cannot_release_partial_follower_ownership(rig, monkeypatch):
    import robot.controller

    failed = []

    class PartialController:
        def __init__(self, model, *, port, robot_id):
            assert port == "/dev/ttyACM7"
            assert robot_id == "my_awesome_bimanual_follower_right"
            self.model = model
            self.robot = SimpleNamespace(config=SimpleNamespace(disable_torque_on_disconnect=True),
                                         is_calibrated=True)
            self.is_connected = True
            self.fail_release = True
            failed.append(self)

        def connect(self):
            raise OSError("connection interrupted after opening the bus")

        def disconnect(self):
            if self.fail_release:
                raise OSError("bus cleanup failed")
            self.is_connected = False

    monkeypatch.setattr(robot.controller, "RobotController", PartialController)
    rig.controller.gesture_pick._factory = rig.controller._gesture_pick_follower
    rig.controller.gesture_pick_select({"kind": "object", "tagId": 7})
    state = rig.controller.gesture_pick_select({"kind": "box", "tagId": 22})
    assert state["phase"] == "failed"
    assert "release failed" in state["reason"]
    assert rig.controller.gesture_pick.active is True
    with pytest.raises(ValueError, match="gesture-pick"):
        rig.controller._start("find-port", ["unused"])
    failed[0].fail_release = False
    rig.controller.stop()
    assert rig.controller.gesture_pick.active is False
