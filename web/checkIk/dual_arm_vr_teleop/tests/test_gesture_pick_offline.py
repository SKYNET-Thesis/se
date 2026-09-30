"""Complete dashboard task flow using synthetic frames and a fake follower only."""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend import dashboard_server as dashboard
from backend.gesture_pick.calibration import TableCalibration
from robot.ik import IKResult
from robot.kinematics import SO101Kinematics


class SyntheticCapture:
    def __init__(self, frame):
        self.frame = frame
        self.released = False

    def set(self, *_):
        return True

    def read(self):
        return (False, None) if self.released else (True, self.frame.copy())

    def release(self):
        self.released = True


class FakeFollower:
    """Only the external follower/IK boundary is simulated; task logic is real."""

    def __init__(self, rig, should_cancel):
        self.model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
        self.rig = rig
        self.should_cancel = should_cancel
        self.q = np.zeros(5)
        self.gripper = 25.0
        self.is_connected = True
        self.commands = []
        self.targets = []

    def get_joint_positions(self):
        return self.q.copy(), self.gripper

    def solve_end_effector(self, position, *, initial_q, target_rotation):
        self.targets.append((tuple(position), np.asarray(target_rotation).copy()))
        return IKResult(True, np.asarray(initial_q) + 0.01, 0.0, 0.0, "synthetic solution")

    def move_joints(self, target_q, *, start_q, gripper, max_total_delta_deg, speed_deg_s):
        if self.should_cancel():
            raise RuntimeError("cancelled before fake command")
        assert np.array_equal(start_q, self.q)
        self.commands.append((self.rig.controller.gesture_pick_status()["stage"], gripper,
                              max_total_delta_deg, speed_deg_s))
        self.q = np.asarray(target_q).copy()
        self.gripper = gripper
        self.rig.after_move()

    def disconnect(self):
        self.is_connected = False


@pytest.fixture
def configured_offline_dashboard(tmp_path, monkeypatch):
    """Offline means no physical I/O, even when testing the motion gate."""
    monkeypatch.setattr(dashboard, "STATE_FILE", tmp_path / "state.json")
    monkeypatch.setattr(dashboard, "TELEMETRY_FILE", tmp_path / "telemetry.json")
    follower_profile = tmp_path / "fake-follower.json"
    follower_profile.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(dashboard, "calibration_path", lambda _: follower_profile)

    camera_path = "/synthetic/gesture-pick-camera"
    table_path = tmp_path / "table.json"
    TableCalibration.from_points(
        [[0, 0], [600, 0], [600, 200], [0, 200]],
        [[0, 0], [0.6, 0], [0.6, 0.2], [0, 0.2]],
        camera_path=camera_path, table_z=0.12,
    ).save(table_path)
    config_path = tmp_path / "gesture-pick.json"
    config_path.write_text(json.dumps({
        "camera_path": camera_path, "tag_dictionary": "DICT_APRILTAG_36h11",
        "tags": {"7": "object", "22": "box"}, "follower_side": "right",
        "calibration_path": str(table_path), "max_tag_age_s": 0.5,
    }), encoding="utf-8")

    frame = np.full((200, 600), 255, dtype=np.uint8)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11)
    frame[50:150, 50:150] = cv2.aruco.generateImageMarker(dictionary, 7, 100)
    frame[50:150, 250:350] = cv2.aruco.generateImageMarker(dictionary, 22, 100)
    capture = SyntheticCapture(frame)

    def open_synthetic_camera(path):
        assert path == camera_path
        return capture

    monkeypatch.setattr(cv2, "VideoCapture", open_synthetic_camera)
    rig = SimpleNamespace(capture=capture, followers=[], after_move=lambda: None)

    def fake_follower_factory(side, port, should_cancel):
        assert (side, port) == ("right", "/synthetic/follower")
        follower = FakeFollower(rig, should_cancel)
        rig.followers.append(follower)
        return follower

    controller = dashboard.Controller(
        enable_motion=False, offline=True, gesture_pick_config=config_path,
        gesture_pick_follower_factory=fake_follower_factory,
        gesture_pick_clock=lambda: 10.0,
    )
    controller.state["assignments"]["right-follower"] = "/synthetic/follower"
    monkeypatch.setattr(controller, "ports", lambda: [{"path": "/synthetic/follower", "present": True}])
    monkeypatch.setattr(controller, "cameras", lambda: [])
    rig.controller = controller
    yield rig
    controller.stop()
    worker = controller.gesture_pick._worker
    if worker:
        worker.join(timeout=2)
        assert not worker.is_alive()
    controller.gesture_pick.close_camera()


def preview(rig):
    assert rig.controller.gesture_pick_select({"kind": "object", "tagId": 7})["phase"] == "selecting-box"
    rig.controller.gesture_pick_select({"kind": "box", "tagId": 22})
    state = rig.controller.gesture_pick_status()
    assert state["phase"] == "preview"
    assert state["selection"] == {"objectTagId": 7, "boxTagId": 22}
    assert state["calibrationValid"] is True
    assert rig.followers == []
    return state["taskId"]


def confirm_and_finish(rig, task_id):
    # Exercise real authorization against fixture readiness, never real devices.
    rig.controller.enable_motion = True
    rig.controller.offline = False
    rig.controller.gesture_pick_confirm(task_id)
    worker = rig.controller.gesture_pick._worker
    worker.join(timeout=2)
    assert not worker.is_alive()
    return rig.controller.gesture_pick_status()


def test_tag_selection_preview_confirm_executes_fake_follower_sequence(configured_offline_dashboard):
    rig = configured_offline_dashboard
    task_id = preview(rig)
    with pytest.raises(PermissionError):
        rig.controller.gesture_pick_confirm(task_id)
    assert rig.followers == []

    completed = confirm_and_finish(rig, task_id)
    assert completed["phase"] == "succeeded"
    assert completed["stage"] == "retreat"
    assert completed["taskId"] == task_id
    assert completed["reason"] is None
    assert completed["running"] is False
    assert len(rig.followers) == 1
    follower = rig.followers[0]
    assert follower.commands == [
        ("open", 75.0, 10.0, 3.0), ("approach", 75.0, 10.0, 3.0),
        ("descend", 75.0, 10.0, 3.0), ("close", 0.0, 10.0, 3.0),
        ("lift", 0.0, 10.0, 3.0), ("travel", 0.0, 10.0, 3.0),
        ("place", 0.0, 10.0, 3.0), ("release", 75.0, 10.0, 3.0),
        ("retreat", 75.0, 10.0, 3.0),
    ]
    # Hand-derived pixel centres -> robot metres -> hover/descent targets.
    assert np.allclose([target for target, _ in follower.targets[-6:]], [
        [0.0995, 0.0995, 0.2], [0.0995, 0.0995, 0.135], [0.0995, 0.0995, 0.2],
        [0.2995, 0.0995, 0.2], [0.2995, 0.0995, 0.135], [0.2995, 0.0995, 0.2],
    ], atol=0.0005)
    assert all(np.array_equal(rotation, np.diag([1.0, -1.0, -1.0]))
               for _, rotation in follower.targets)
    assert follower.is_connected is False
    assert rig.controller.gesture_pick.active is False
    rig.controller.gesture_pick_confirm(task_id)
    assert len(rig.followers) == 1
    assert len(follower.commands) == 9


@pytest.mark.parametrize("interrupt,reason,stage,latched", [
    ("tag-loss", "missing_tag:7", "approach", False),
    ("cancel", "operator_cancelled", "open", False),
    ("estop", "estop", "open", True),
])
def test_interruption_holds_offline_task_before_next_stage(
        configured_offline_dashboard, interrupt, reason, stage, latched):
    rig = configured_offline_dashboard
    task_id = preview(rig)

    def interrupt_after_first_move():
        if interrupt == "tag-loss":
            rig.capture.frame[50:150, 50:150] = 255
        elif interrupt == "cancel":
            rig.controller.gesture_pick_cancel()
        else:
            rig.controller.emergency_stop()

    rig.after_move = interrupt_after_first_move
    state = confirm_and_finish(rig, task_id)
    assert state["phase"] == "held"
    assert state["reason"] == reason
    assert state["stage"] == stage
    assert rig.followers[0].commands == [("open", 75.0, 10.0, 3.0)]
    assert rig.followers[0].is_connected is False
    assert rig.controller.gesture_pick.active is False
    assert rig.controller.state["latchedMotionLock"] is latched
