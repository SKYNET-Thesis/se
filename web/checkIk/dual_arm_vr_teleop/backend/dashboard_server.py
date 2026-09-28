#!/usr/bin/env python3
"""Local, allow-listed control API for the SO-101 dashboard.

This server deliberately does not expose an arbitrary shell endpoint.  It can
inspect local devices, persist port assignments, run the interactive LeRobot
utilities, and stop any child process it started.  Real motion is disabled by
default and requires both ``--enable-motion`` and an explicit confirmation in
the request.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import signal
import socket
import ssl
import sys
import subprocess
import threading
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
VR_LEKIWI_ROOT = ROOT.parent / "VRTeleop" / "lekiwi-vr-teleop"
STATE_FILE = ROOT / "runtime" / "dashboard_state.json"
TELEMETRY_FILE = ROOT / "runtime" / "leader_telemetry.json"
VUER_CERT = ROOT / "runtime" / "vuer-cert.pem"
VUER_KEY = ROOT / "runtime" / "vuer-key.pem"
CALIBRATION_ROOT = Path.home() / ".cache/huggingface/lerobot/calibration"
# LeRobot is installed in its dedicated Python 3.12 conda environment.
# Do not use ~/miniconda3/bin here: that is the Python 3.14 base environment,
# where the current draccus release fails while parsing ``str | None`` fields.
LEROBOT_BIN = Path(
    os.environ.get(
        "LEROBOT_BIN",
        str(Path.home() / "miniconda3" / "envs" / "lerobot" / "bin"),
    )
)
DEVICE_IDS = ("left-leader", "left-follower", "right-leader", "right-follower")
CALIBRATION_JOINTS = (
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
)
CALIBRATION_RANGE_TOLERANCE = 0.98
CALIBRATION_RANGE_TARGETS = {
    "leader": {
        "shoulder_pan": 2400, "shoulder_lift": 2300, "elbow_flex": 2150,
        "wrist_flex": 2250, "gripper": 1150,
    },
    "follower": {
        "shoulder_pan": 2400, "shoulder_lift": 2300, "elbow_flex": 2150,
        "wrist_flex": 2250, "gripper": 1400,
    },
}
ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def default_state() -> dict[str, Any]:
    return {
        "assignments": {device_id: None for device_id in DEVICE_IDS},
        "latchedMotionLock": False,
    }


def load_state() -> dict[str, Any]:
    state = default_state()
    try:
        saved = json.loads(STATE_FILE.read_text())
        for device_id in DEVICE_IDS:
            state["assignments"][device_id] = saved.get("assignments", {}).get(device_id)
        state["latchedMotionLock"] = bool(saved.get("latchedMotionLock", False))
    except (FileNotFoundError, json.JSONDecodeError, TypeError):
        pass
    return state


def save_state(state: dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp = STATE_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(state, indent=2) + "\n")
    temp.replace(STATE_FILE)


def calibration_path(device_id: str) -> Path:
    side, role = device_id.split("-")
    category = "teleoperators" if role == "leader" else "robots"
    family = "so_leader" if role == "leader" else "so_follower"
    stem = f"my_awesome_bimanual_{role}_{side}.json"
    return CALIBRATION_ROOT / category / family / stem


def executable(name: str) -> str:
    candidate = LEROBOT_BIN / name
    return str(candidate) if candidate.exists() else name


@dataclass
class ManagedTask:
    process: subprocess.Popen[str]
    kind: str
    command: list[str]
    started_at: float = field(default_factory=time.time)
    output: list[str] = field(default_factory=list)
    calibration: dict[str, Any] | None = None
    implementation: str = "vr_control"
    arm_mode: str | None = None
    active_arms: list[str] = field(default_factory=list)
    process_health: str = "starting"
    relay_health: str = "not-configured"
    operator_url: str | None = None
    last_error: str | None = None


class _GuardedGestureRobot:
    """Check cancellation immediately before every underlying actuator write."""

    def __init__(self, robot, should_cancel):
        self._robot = robot
        self._should_cancel = should_cancel

    def __getattr__(self, name):
        return getattr(self._robot, name)

    def send_action(self, action):
        if self._should_cancel():
            raise RuntimeError("gesture-pick cancelled before actuator command")
        return self._robot.send_action(action)


class GuardedGestureFollower:
    """Adapt the existing blocking controller without dropping grasp orientation."""

    def __init__(self, controller, should_cancel):
        self.controller = controller
        self._should_cancel = should_cancel
        self.model = controller.model
        # Hold the last servo target when releasing serial ownership, rather
        # than allowing an unsupported arm to fall when the task is cancelled.
        controller.robot.config.disable_torque_on_disconnect = False
        controller.robot = _GuardedGestureRobot(controller.robot, should_cancel)

    @property
    def is_connected(self):
        return self.controller.is_connected

    def connect(self):
        """Open an already-configured bus without changing motor/torque state.

        LeRobot follower.connect() calls configure(), including torque changes;
        gesture-pick deliberately uses only the bus's read-only handshake.
        """
        robot = self.controller.robot
        if robot.cameras:
            raise ValueError("gesture follower must not own additional cameras")
        if self._should_cancel():
            raise RuntimeError("gesture-pick acquisition cancelled")
        robot.bus.connect()
        if self._should_cancel():
            raise RuntimeError("gesture-pick acquisition cancelled")
        if not robot.bus.is_calibrated:
            raise ValueError("follower calibration is not ready")
        for motor in robot.bus.motors:
            if self._should_cancel():
                raise RuntimeError("gesture-pick acquisition cancelled")
            torque = robot.bus.read("Torque_Enable", motor, normalize=False)
            if self._should_cancel():
                raise RuntimeError("gesture-pick acquisition cancelled")
            if torque != 1:
                raise ValueError("follower torque must already be enabled before gesture confirmation")

    def get_joint_positions(self):
        return self.controller.get_joint_positions()

    def solve_end_effector(self, position, *, initial_q, target_rotation):
        from robot.ik import solve_ik

        return solve_ik(self.model, position, initial_q=initial_q,
                        target_rotation=target_rotation)

    def move_joints(self, target_q, **kwargs):
        return self.controller.move_joints(target_q, **kwargs)

    def disconnect(self):
        self.controller.disconnect()


class GesturePickDashboard:
    """Configured camera and executor lifecycle behind the controller's gate."""

    def __init__(self, owner, config, follower_factory, detections, clock):
        from backend.gesture_pick.calibration import TableCalibration
        from backend.gesture_pick.localizer import AprilTagLocalizer

        self.owner = owner
        self.config = config
        self._factory = follower_factory
        self._source = detections
        self._clock = clock
        self._source_lock = threading.RLock()
        self._capture = None
        self._camera_closed = False
        self._frame_size = None
        self._cleanup_error = None
        self.calibration = None
        self._localizer = None
        self._camera_available = False
        self._frame_at = None
        self._reason = None
        self._phase = "idle"
        self._stage = None
        self._task = None
        self._cancel_reason = None
        self._selection = {}
        self.executor = None
        self._follower = None
        self._worker = None
        self._previewing = False
        self.active = False
        self._cancelled = threading.Event()
        try:
            if not config.calibration_path:
                raise ValueError("table calibration required")
            self.calibration = TableCalibration.load(config.calibration_path,
                                                      camera_path=config.camera_path)
            self._localizer = AprilTagLocalizer(config, self.calibration, clock=clock)
        except (OSError, ValueError, KeyError, TypeError):
            self._reason = "table calibration required for configured camera"

    def stopped(self):
        estopped = self.owner._estopping.is_set() or self.owner.state.get("latchedMotionLock")
        if self.executor and (estopped or self._cancelled.is_set()):
            self.executor.cancel("estop" if estopped else self._cancel_reason or "cancelled")
        return (self._cancelled.is_set() or self.owner.state.get("latchedMotionLock", False)
                or self.owner._estopping.is_set()
                or not self.owner.enable_motion or self.owner.offline)

    def camera_frame(self):
        import cv2

        with self._source_lock:
            if self._camera_closed:
                raise ValueError("configured camera is closed")
            if self._capture is None:
                self._capture = cv2.VideoCapture(self.config.camera_path)
                self._capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                self._capture.set(cv2.CAP_PROP_FPS, 30)
            ok, frame = self._capture.read()
            captured_at = float(self._clock())
            self._camera_available = bool(ok)
            self._frame_at = captured_at if ok else None
            if not ok:
                self._capture.release()
                self._capture = None
                raise ValueError("configured camera unavailable")
            self._frame_size = [int(frame.shape[1]), int(frame.shape[0])]
            return frame, captured_at

    def close_camera(self):
        with self._source_lock:
            self._camera_closed = True
            if self._capture is not None:
                self._capture.release()
                self._capture = None
            self._camera_available = False
            self._frame_at = None

    def observations(self):
        from backend.gesture_pick.models import DetectedTag

        if self.calibration is None:
            return []
        try:
            with self._source_lock:
                if self._source is None:
                    frame, captured_at = self.camera_frame()
                    tags = self._localizer.detect(frame, captured_at)
                else:
                    tags = list(self._source())
                    self._camera_available = True
                    self._frame_at = max((tag.observed_at for tag in tags), default=None)
                return [tag for tag in tags if isinstance(tag, DetectedTag)]
        except Exception:
            self._camera_available = False
            self._frame_at = None
            return []

    def usable_detections(self):
        tags = self.observations()
        now = float(self._clock())
        if not math.isfinite(now) or now < 0:
            return []
        counts = {}
        for tag in tags:
            counts[tag.tag_id] = counts.get(tag.tag_id, 0) + 1
        return [tag for tag in tags if counts[tag.tag_id] == 1
                and self.config.tags.get(tag.tag_id) == tag.kind and tag.visible
                and 0 <= now - tag.observed_at <= self.config.max_tag_age_s
                and self.calibration.contains_robot_point(tag.robot_point)
                and abs(tag.robot_point[2] - self.calibration.table_z) <= 1e-9]

    def detections(self):
        return [{"tagId": tag.tag_id, "kind": tag.kind,
                 "imageCenter": list(tag.image_center), "robotPoint": list(tag.robot_point),
                 "observedAt": tag.observed_at, "confidence": tag.confidence,
                 "visible": tag.visible} for tag in self.usable_detections()]

    def status(self):
        with self.owner.lock:
            state = self.executor.status() if self.executor else None
            reason = state.reason if state else self._reason
            if state and state.phase.value == "failed":
                reason = "follower or detection adapter failed"
            reason = self._cleanup_error or reason
            phase = state.phase.value if state else self._phase
            if self._phase == "executing" and phase == "preview":
                phase = "executing"
            return {"configured": True, "phase": phase,
                    "taskId": state.task_id if state else self._task.task_id if self._task else None,
                    "stage": state.stage if state else self._stage,
                    "reason": reason,
                    "updatedAt": state.updated_at if state else float(self._clock()),
                    "selection": dict(self._selection), "followerSide": self.config.follower_side,
                    "cameraPath": self.config.camera_path,
                    "calibrationValid": self.calibration is not None,
                    "cameraAvailable": self._camera_available, "frameObservedAt": self._frame_at,
                    "frameSize": self._frame_size,
                    "running": bool(self._worker and self._worker.is_alive())}

    def _release(self):
        with self.owner.lock:
            if self._follower is not None:
                try:
                    self._follower.disconnect()
                except Exception:
                    # Retain ownership until a later Stop can release the bus.
                    self._cleanup_error = "follower release failed; stop before starting another task"
                    return
                self._follower = None
            self._cleanup_error = None
            self.active = False

    def _build_preview(self, object_tag_id, box_tag_id):
        from backend.gesture_pick.models import PickPlaceTask

        visible = {tag.tag_id for tag in self.usable_detections()}
        if not {object_tag_id, box_tag_id} <= visible:
            raise ValueError("object and box must remain uniquely visible for preview")
        return PickPlaceTask(object_tag_id=object_tag_id, box_tag_id=box_tag_id,
                             follower_side=self.config.follower_side,
                             requested_at=float(self._clock()))

    def select(self, data):
        if not isinstance(data, dict) or set(data) != {"kind", "tagId"}:
            raise ValueError("selection accepts only kind and tagId")
        kind, tag_id = data["kind"], data["tagId"]
        if (not isinstance(kind, str) or kind not in {"object", "box"}
                or type(tag_id) is not int or self.config.tags.get(tag_id) != kind):
            raise ValueError("select a configured object or box tag")
        with self.owner.lock:
            if self.active:
                raise ValueError("gesture-pick executing or preview active; cancel it first")
            if self.calibration is None:
                raise ValueError("table calibration required for configured camera")
            if kind == "box" and ("objectTagId" not in self._selection
                                  or self._phase != "selecting-box"):
                raise ValueError("select an object before a box")
        if not any(tag.tag_id == tag_id for tag in self.usable_detections()):
            raise ValueError("select a unique currently visible configured tag")
        with self.owner.lock:
            if self.active:
                raise ValueError("gesture-pick executing or preview active; cancel it first")
            if kind == "object":
                self._selection = {"objectTagId": tag_id}
                self._task = None
                self.executor = None
                self._stage = None
                self._cancel_reason = None
                self._phase, self._reason = "selecting-box", None
                self._cancelled.clear()
                return self.status()
            self.owner._require_exclusive_task()
            self._selection["boxTagId"] = tag_id
            self.active = self._previewing = True
            selected_object = self._selection["objectTagId"]
        task = None
        try:
            task = self._build_preview(selected_object, tag_id)
        finally:
            # Publish the preview and hand off cancellation cleanup atomically.
            # A cancel delivered after the immutable task was built must win.
            with self.owner.lock:
                self._previewing = False
                if self._cancelled.is_set():
                    self._phase, self._reason = "held", self._cancel_reason or "cancelled"
                    self._release()
                elif task is None:
                    self._release()
                else:
                    self._task = task
                    self._phase, self._reason = "preview", None
        return self.status()

    def confirm(self, task_id):
        from backend.gesture_pick.executor import PickPlaceExecutor

        with self.owner.lock:
            self.owner._gesture_pick_authorize()
            if not isinstance(task_id, str) or not task_id.strip():
                raise ValueError("taskId must identify the preview")
            if self._task is None or set(self._selection) != {"objectTagId", "boxTagId"}:
                raise ValueError("select both an object and a box before confirmation")
            if task_id != self._task.task_id:
                raise ValueError("taskId must match the current preview task")
            if (self._phase in {"held", "failed", "succeeded"}
                    or self.executor and self.executor.status().phase.is_terminal
                    or self._worker and self._worker.is_alive()):
                return self.status()
            self.owner._require_exclusive_task(allow_gesture=True)
            if not self.active or self._previewing:
                raise ValueError("task preview is not ready")
            task = self._task
            port = self.owner.state["assignments"][f"{self.config.follower_side}-follower"]
            self._phase, self._stage = "executing", "connecting"

            def execute():
                try:
                    with self.owner.lock:
                        self.owner._gesture_pick_authorize()
                        if self.stopped():
                            raise RuntimeError("acquisition cancelled")
                    self._follower = self._factory(self.config.follower_side, port, self.stopped)
                    if self.stopped():
                        raise RuntimeError("acquisition cancelled")
                    if not self._follower.is_connected:
                        raise ValueError("configured follower is disconnected")
                    self.executor = PickPlaceExecutor(self._follower, self.config, self.calibration,
                        self.observations, clock=self._clock, should_cancel=self.stopped,
                        is_estopped=lambda: bool(self.owner.state.get("latchedMotionLock")))
                    state = self.executor.preview(task)
                    if not state.phase.is_terminal:
                        self.executor.confirm(task_id)
                except Exception:
                    with self.owner.lock:
                        if self.stopped():
                            reason = ("estop" if self.owner._estopping.is_set()
                                      or self.owner.state.get("latchedMotionLock")
                                      else self._cancel_reason or "cancelled")
                            self._phase, self._reason = "held", reason
                        else:
                            self._phase, self._reason = "failed", "configured follower unavailable"
                finally:
                    self._release()

            self._worker = threading.Thread(target=execute, name="gesture-pick", daemon=True)
            self._worker.start()
            return self.status()

    def cancel(self, reason):
        # Set the actuator guard before waiting on executor/controller locks.
        self._cancel_reason = reason
        self._cancelled.set()
        if self.executor:
            self.executor.cancel(reason)
        else:
            self._phase, self._reason = "held", reason
        if not self._previewing and not (self._worker and self._worker.is_alive()):
            self._release()
        return self.status()


class Controller:
    def __init__(self, enable_motion: bool, offline: bool = True, *,
                 gesture_pick_config=None, gesture_pick_follower_factory=None,
                 gesture_pick_detections=None, gesture_pick_clock=time.time) -> None:
        self.enable_motion = enable_motion
        self.offline = offline
        self.state = load_state()
        self.task: ManagedTask | None = None
        self.lock = threading.RLock()
        self._estopping = threading.Event()
        self._camera_signature: tuple[str, ...] = ()
        self._camera_cache: list[dict[str, Any]] = []
        self.gesture_pick = None
        if gesture_pick_config is not None:
            from backend.gesture_pick.config import GesturePickConfig, load_config

            config = (gesture_pick_config if isinstance(gesture_pick_config, GesturePickConfig)
                      else load_config(gesture_pick_config))
            self.gesture_pick = GesturePickDashboard(self, config,
                gesture_pick_follower_factory or self._gesture_pick_follower,
                gesture_pick_detections, gesture_pick_clock)

    def _require_motion_unlatched(self):
        if self._estopping.is_set() or self.state.get("latchedMotionLock"):
            raise PermissionError("motion is latched by E-stop; unlock and re-check readiness first")

    def _require_exclusive_task(self, *, allow_gesture=False):
        if self.task and self.task.process.poll() is None:
            raise ValueError(f"task {self.task.kind} is already running")
        if not allow_gesture and self.gesture_pick and self.gesture_pick.active:
            raise ValueError("gesture-pick task already owns the follower")

    def _gesture_pick_authorize(self):
        if not self.enable_motion or self.offline:
            raise PermissionError("gesture-pick motion requires --hardware and --enable-motion")
        self._require_motion_unlatched()
        if self.gesture_pick is None:
            raise ValueError("gesture-pick configuration required")
        readiness = self.readiness_check(f"{self.gesture_pick.config.follower_side}-only")
        if not readiness["ready"]:
            raise ValueError(f"gesture-pick readiness check failed: {readiness}")

    def _gesture_pick_follower(self, side, port, should_cancel):
        from robot.controller import RobotController
        from robot.kinematics import SO101Kinematics

        self._gesture_pick_authorize()
        follower = GuardedGestureFollower(RobotController(
            SO101Kinematics(ROOT / "so101_new_calib.urdf"), port=port,
            robot_id=f"my_awesome_bimanual_follower_{side}"), should_cancel)
        # Retain the resource before connect: even a partially successful
        # connection must stay owned if later connection/cleanup steps fail.
        self.gesture_pick._follower = follower
        follower.connect()
        if not follower.is_connected or not follower.controller.robot.is_calibrated:
            raise ValueError("follower connection/calibration is not ready")
        return follower

    def gesture_pick_status(self):
        if self.gesture_pick:
            return self.gesture_pick.status()
        return {"configured": False, "phase": "idle", "taskId": None, "stage": None,
                "reason": "gesture-pick configuration required", "selection": {},
                "followerSide": None, "cameraPath": None, "calibrationValid": False,
                "cameraAvailable": False, "frameObservedAt": None, "running": False}

    def gesture_pick_detections(self):
        tags = self.gesture_pick.detections() if self.gesture_pick else []
        status = self.gesture_pick_status()
        return {"detections": tags, "cameraPath": status["cameraPath"],
                "calibrationValid": status["calibrationValid"],
                "cameraAvailable": status["cameraAvailable"], "frameObservedAt": status["frameObservedAt"]}

    def gesture_pick_select(self, data):
        if self.gesture_pick is None:
            raise ValueError("gesture-pick configuration required")
        return self.gesture_pick.select(data)

    def gesture_pick_confirm(self, task_id):
        self._gesture_pick_authorize()
        return self.gesture_pick.confirm(task_id)

    def gesture_pick_cancel(self):
        return self.gesture_pick.cancel("operator_cancelled") if self.gesture_pick else self.gesture_pick_status()

    def ports(self) -> list[dict[str, Any]]:
        paths = sorted(set(glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*")))
        assignments = self.state["assignments"]
        return [
            {
                "path": path,
                "description": "USB serial device",
                "assignedTo": next((key for key, value in assignments.items() if value == path), None),
                "present": True,
            }
            for path in paths
        ]

    def devices(self) -> list[dict[str, Any]]:
        present = {port["path"] for port in self.ports()}
        result = []
        for device_id in DEVICE_IDS:
            side, role = device_id.split("-")
            port = self.state["assignments"][device_id]
            profile = calibration_path(device_id)
            profile_info = None
            if profile.exists():
                profile_info = {
                    "id": profile.stem,
                    "name": profile.stem,
                    "createdAt": time.strftime("%Y-%m-%d %H:%M", time.localtime(profile.stat().st_mtime)),
                    "jointCount": 6,
                }
            result.append(
                {
                    "id": device_id,
                    "name": f"{side.title()} {role.title()} Arm",
                    "side": side,
                    "role": role,
                    "model": "SO-101",
                    "serialPort": port,
                    "connection": "unconfigured" if not port else "offline",
                    "portPresent": bool(port and port in present),
                    "calibration": "calibrated" if profile_info else "required",
                    "calibrationProfile": profile_info,
                    "torqueEnabled": None,
                    "temperatureC": None,
                    "firmware": None,
                    "gripper": None,
                }
            )
        return result

    def cameras(self) -> list[dict[str, Any]]:
        configured_path = self.gesture_pick.config.camera_path if self.gesture_pick else None
        configured_identity = Path(configured_path).resolve() if configured_path else None
        # The configured camera has one shared capture for detection and MJPEG;
        # probing it in a second process can steal its frames or fail with EBUSY.
        paths = tuple(sorted(path for path in glob.glob("/dev/video*")
                             if Path(path).resolve() != configured_identity))
        if paths != self._camera_signature:
            self._camera_signature = paths
            self._camera_cache = []
            if paths:
                try:
                    probe = subprocess.run(
                        [str(LEROBOT_BIN / "python3"), str(ROOT / "backend" / "camera_worker.py"), "probe", *paths],
                        capture_output=True, text=True, timeout=max(5, len(paths) * 3),
                    )
                    if probe.returncode == 0:
                        self._camera_cache = json.loads(probe.stdout)
                except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
                    self._camera_cache = []
        result = list(self._camera_cache)
        if self.gesture_pick:
            width, height = self.gesture_pick._frame_size or [1280, 720]
            result.append({"path": configured_path,
                           "connection": "connected" if self.gesture_pick._camera_available else "offline",
                           "resolution": f"{width}×{height}", "fps": 30})
        return result

    def rescan_cameras(self) -> None:
        self._camera_signature = ()
        self._camera_cache = []

    def task_status(self) -> dict[str, Any] | None:
        with self.lock:
            task = self.task
            if task is None:
                return None
            code = task.process.poll()
            return {
                "kind": task.kind,
                "running": code is None,
                "exitCode": code,
                "startedAt": task.started_at,
                "output": task.output[-250:],
                "calibration": task.calibration,
                "implementation": task.implementation,
                "mode": task.arm_mode,
                "activeArms": task.active_arms,
                "processHealth": task.process_health,
                "relayHealth": task.relay_health,
                "operatorUrl": task.operator_url,
                "lastError": task.last_error,
            }

    def snapshot(self) -> dict[str, Any]:
        gesture_detections = self.gesture_pick_detections()
        telemetry = None
        try:
            telemetry = json.loads(TELEMETRY_FILE.read_text())
            if time.time() - float(telemetry.get("timestamp", 0)) > 2:
                telemetry = None
        except (FileNotFoundError, json.JSONDecodeError, TypeError, ValueError):
            pass
        return {
            "backend": {
                "name": "so101-local-dashboard",
                "version": "0.1.0",
                "simulated": self.offline,
                "motionEnabled": self.enable_motion,
                "supportsVRControl": True,
                "latchedMotionLock": bool(self.state.get("latchedMotionLock", False)),
            },
            "ports": self.ports(),
            "devices": self.devices(),
            "cameras": self.cameras(),
            "task": self.task_status(),
            "readiness": self.readiness_check((self.task_status() or {}).get("mode") or "dual-arm"),
            "telemetry": telemetry,
            "gesturePick": {"status": self.gesture_pick_status(),
                            "detections": gesture_detections["detections"]},
        }

    def assign(self, device_id: str, port: str | None, reassign: bool = False) -> None:
        with self.lock:
            if self.gesture_pick and self.gesture_pick.active:
                raise ValueError("gesture-pick owns the follower; cancel before changing assignments")
            self._assign(device_id, port, reassign)

    def _assign(self, device_id: str, port: str | None, reassign: bool = False) -> None:
        if device_id not in DEVICE_IDS:
            raise ValueError("unknown device id")
        if port is not None and not port.startswith(("/dev/ttyACM", "/dev/ttyUSB")):
            raise ValueError("only ttyACM/ttyUSB devices are accepted")
        if port is not None:
            for other, assigned in self.state["assignments"].items():
                if other != device_id and assigned == port:
                    if not reassign:
                        raise ValueError(f"{port} is already assigned to {other}")
                    self.state["assignments"][other] = None
        self.state["assignments"][device_id] = port
        save_state(self.state)

    def _start(self, kind: str, command: list[str], calibration: dict[str, Any] | None = None) -> None:
        with self.lock:
            self._require_exclusive_task()
            if kind in {"vr-real", "leader-teleop"} or kind.startswith("single-teleop-"):
                self._require_motion_unlatched()
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                start_new_session=True,
                cwd=str(Path.home() / "lerobot"),
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            task = ManagedTask(process=process, kind=kind, command=command, calibration=calibration)
            self.task = task

            def collect() -> None:
                assert process.stdout is not None
                for line in process.stdout:
                    with self.lock:
                        clean = ANSI_ESCAPE.sub("", line).strip()
                        task.output.append(clean)
                        del task.output[:-500]
                        self._update_calibration_from_output(task, clean)

            threading.Thread(target=collect, daemon=True).start()

    def _selected_vr_arms(self, mode: str) -> tuple[str, ...]:
        if mode not in {"left-only", "right-only", "dual-arm"}:
            raise ValueError("mode must be left-only, right-only, or dual-arm")
        return ("left", "right") if mode == "dual-arm" else (mode.removesuffix("-only"),)

    def _vr_health(self, operator_url: str) -> dict[str, Any]:
        context = ssl._create_unverified_context()
        request = Request(f"{operator_url}/api/status", headers={"Accept": "application/json"})
        with urlopen(request, context=context, timeout=3) as response:  # noqa: S310 - local relay only
            payload = json.loads(response.read())
        if not isinstance(payload, dict) or payload.get("relayState") != "listening":
            raise ValueError("vr_lekiwi relay health did not report listening")
        return payload

    @staticmethod
    def _available_local_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.bind(("127.0.0.1", 0))
            return int(probe.getsockname()[1])

    def start_vr_lekiwi(self, mode: str = "dual-arm", relay_port: int | None = None) -> None:
        """Start VRTeleop against CHECKIK-assigned, calibrated real followers."""
        arms = self._selected_vr_arms(mode)
        if not self.enable_motion or self.offline:
            raise PermissionError("VR LeKiwi motion requires --hardware and --enable-motion")
        self._require_motion_unlatched()
        readiness = self.readiness_check(mode)
        if not readiness["ready"]:
            raise ValueError(f"VR LeKiwi readiness check failed: {readiness}")
        with self.lock:
            self._require_exclusive_task()
        relay_port = relay_port or self._available_local_port()
        if not 1 <= relay_port <= 65535:
            raise ValueError("relay port must be between 1 and 65535")
        command = [
            str(LEROBOT_BIN / "python3"), "-u", "-m", "lekiwi_vr_teleop.process",
            "--mode", mode,
            "--certificate", str(VUER_CERT), "--key", str(VUER_KEY),
            "--relay-port", str(relay_port),
            "--relay-host", "0.0.0.0",
            "--real",
        ]
        for arm in ("left", "right"):
            if arm in arms:
                device_id = f"{arm}-follower"
                port = self.state["assignments"][device_id]
                command.extend([f"--{arm}-port", port, f"--{arm}-device-id", f"my_awesome_bimanual_follower_{arm}"])
        if not VR_LEKIWI_ROOT.exists():
            raise ValueError(f"vr_lekiwi package is missing: {VR_LEKIWI_ROOT}")
        if not VUER_CERT.exists() or not VUER_KEY.exists():
            raise ValueError("VR LeKiwi certificate/key is missing; provide explicit relay TLS files")
        with self.lock:
            self._require_exclusive_task()
            self._require_motion_unlatched()
            process = subprocess.Popen(
                command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, bufsize=1, start_new_session=True,
                cwd=str(VR_LEKIWI_ROOT),
                env={**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONPATH": str(VR_LEKIWI_ROOT)},
            )
            task = ManagedTask(
                process=process, kind="vr-lekiwi", command=command,
                implementation="vr_lekiwi", arm_mode=mode, active_arms=list(arms),
            )
            self.task = task

            def collect() -> None:
                assert process.stdout is not None
                for line in process.stdout:
                    clean = ANSI_ESCAPE.sub("", line).strip()
                    with self.lock:
                        task.output.append(clean)
                        del task.output[:-500]
                        if clean.startswith("VR_LEKIWI_READY "):
                            try:
                                ready = json.loads(clean.removeprefix("VR_LEKIWI_READY "))
                                task.active_arms = list(ready.get("activeArms", task.active_arms))
                                task.operator_url = ready.get("operatorUrl")
                                task.process_health = "ready"
                            except (json.JSONDecodeError, TypeError, ValueError) as error:
                                task.last_error = f"invalid readiness payload: {error}"
                                task.process_health = "error"
                        elif "startup failed" in clean.lower():
                            task.last_error = clean
                            task.process_health = "error"
            threading.Thread(target=collect, daemon=True).start()

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            with self.lock:
                code = process.poll()
                operator_url = task.operator_url
                error = task.last_error
            if operator_url:
                try:
                    self._vr_health(operator_url)
                except (OSError, ValueError, json.JSONDecodeError) as health_error:
                    if code is not None:
                        self.stop()
                        raise ValueError(f"vr_lekiwi relay health failed: {health_error}") from health_error
                    time.sleep(0.05)
                    continue
                with self.lock:
                    task.relay_health = "healthy"
                return
            if code is not None:
                self.stop()
                raise ValueError(error or f"vr_lekiwi exited with code {code}")
            time.sleep(0.05)
        self.stop()
        raise ValueError("vr_lekiwi readiness handshake timed out")

    @staticmethod
    def _new_joint_state() -> list[dict[str, Any]]:
        return [
            {
                "name": name,
                "min": 0 if name == "wrist_roll" else None,
                "position": None,
                "max": 4095 if name == "wrist_roll" else None,
                "status": "automatic" if name == "wrist_roll" else "waiting",
            }
            for name in CALIBRATION_JOINTS
        ]

    def _update_direct_calibration(self, calibration: dict[str, Any], payload: dict[str, Any]) -> None:
        event = payload.get("event")
        if event == "middle":
            calibration.update(stage="middle")
        elif event == "connecting":
            calibration.update(stage="connecting", instruction="Connecting and disabling torque…")
        elif event in {"range", "positions"}:
            calibration.update(
                stage="range",
                instruction=(
                    "Move each joint sequentially through its complete physical range. "
                    "MIN / CURRENT / MAX below are live encoder readings."
                ),
            )
            values = payload.get("joints", {})
            for joint in calibration["joints"]:
                measured = values.get(joint["name"])
                if not isinstance(measured, dict):
                    continue
                minimum = int(measured["min"])
                position = int(measured["position"])
                maximum = int(measured["max"])
                automatic = joint["name"] == "wrist_roll"
                target = CALIBRATION_RANGE_TARGETS[calibration["target"]].get(joint["name"])
                complete = bool(target and maximum - minimum >= target * CALIBRATION_RANGE_TOLERANCE)
                joint.update(
                    min=minimum,
                    position=position,
                    max=maximum,
                    status="automatic" if automatic else ("observed" if complete else "waiting"),
                    targetRange=4095 if automatic else target,
                )
        elif event == "incomplete":
            names = ", ".join(payload.get("motors", []))
            calibration.update(
                stage="range",
                instruction=f"Not saved: move these joints farther through their full range: {names}.",
            )
        elif event == "saving":
            calibration.update(stage="saving", instruction="Validating and saving this arm…")
        elif event == "saved":
            for joint in calibration["joints"]:
                joint["status"] = "done"
            self._advance_calibration_arm(calibration)
        elif event == "error":
            calibration.update(stage="error", instruction=str(payload.get("message", "Calibration failed")))

    def _advance_calibration_arm(self, calibration: dict[str, Any]) -> None:
        calibration.update(
            stage="complete",
            instruction=f"Calibration for {calibration['deviceId']} is complete and saved.",
        )

    def _update_calibration_from_output(self, task: ManagedTask, line: str) -> None:
        calibration = task.calibration
        if not calibration:
            return
        if line.startswith("CALIBRATION_JSON "):
            try:
                self._update_direct_calibration(calibration, json.loads(line.removeprefix("CALIBRATION_JSON ")))
            except (json.JSONDecodeError, TypeError, ValueError, KeyError) as error:
                calibration.update(stage="error", instruction=f"Invalid calibration telemetry: {error}")
            return
        if "Running calibration of" in line:
            calibration.update(
                stage="middle",
                instruction=(
                    f"Move the {calibration['arm'].upper()} robot to the MIDDLE of every joint range, "
                    "then confirm. Torque is disabled; support the arm by hand."
                ),
            )
        if "Recording positions" in line or "NAME" in line and "MIN" in line and "MAX" in line:
            calibration.update(
                stage="range",
                instruction=(
                    "Move each joint sequentially through its complete physical range. "
                    "Watch MIN/POS/MAX, then finish only after all five measured joints have moved."
                ),
            )
        parts = [part.strip() for part in line.split("|")]
        if len(parts) == 4 and parts[0] in CALIBRATION_JOINTS:
            try:
                minimum, position, maximum = (int(value) for value in parts[1:])
            except ValueError:
                return
            for joint in calibration["joints"]:
                if joint["name"] == parts[0]:
                    joint.update(
                        min=minimum,
                        position=position,
                        max=maximum,
                        status="observed" if minimum != maximum else "waiting",
                    )
                    break
        if "Calibration saved to" in line:
            for joint in calibration["joints"]:
                joint["status"] = "done"
            self._advance_calibration_arm(calibration)

    def start_find_port(self) -> None:
        self._start("find-port", [executable("lerobot-find-port")])

    def start_find_cameras(self) -> None:
        self._start("find-cameras", [executable("lerobot-find-cameras"), "opencv"])

    def start_vr_offline(self) -> None:
        python = ROOT.parent / ".venv" / "bin" / "python"
        if not python.exists():
            raise ValueError("project .venv is missing; create it before starting offline VR")
        self._start("vr-offline", [str(python), str(ROOT / "backend" / "offline_teleop_server.py")])

    def start_vr_real(
        self,
        confirmation: str,
        translation_scale: float,
        arm: str = "right",
        response_profile: str = "balanced",
    ) -> None:
        if not self.enable_motion or confirmation != "ENABLE VR MOTION":
            raise PermissionError("real VR motion is locked; start with --enable-motion and confirm")
        self._require_motion_unlatched()
        if arm not in {"left", "right"}:
            raise ValueError("arm must be left or right")
        device_id = f"{arm}-follower"
        follower = self.state["assignments"][device_id]
        if not follower:
            raise ValueError(f"assign {device_id} before real VR teleop")
        if not calibration_path(device_id).exists():
            raise ValueError(f"missing calibration for {device_id}; calibrate it first")
        scale = float(translation_scale)
        if not 0.05 <= scale <= 1.0:
            raise ValueError("VR translation scale must be between 0.05 and 1.0")
        response_profiles = {
            # alpha floor, maximum accepted joint change per controller frame
            "smooth": (0.45, 1.5),
            "balanced": (0.60, 2.25),
            "fast": (0.72, 3.0),
        }
        if response_profile not in response_profiles:
            raise ValueError("VR response profile must be smooth, balanced, or fast")
        joint_smoothing, max_joint_step_deg = response_profiles[response_profile]
        command = [
            str(LEROBOT_BIN / "python3"), "-u", str(ROOT / "backend" / "real_vr_teleop_server.py"),
            "--arm", arm, "--follower", follower,
            "--host", "0.0.0.0", "--port", "8765",
            "--translation-scale", str(scale),
            "--max-joint-step-deg", str(max_joint_step_deg),
        ]
        self._start("vr-real", command)

        # Connecting the follower and validating its measured startup pose can
        # fail after Popen succeeds. Do not tell the dashboard that REAL VR is
        # active until the worker has actually opened its WebSocket bridge.
        deadline = time.monotonic() + 20.0
        while time.monotonic() < deadline:
            with self.lock:
                task = self.task
                code = task.process.poll() if task else -1
                output = list(task.output[-40:]) if task else []
            if any("VR_TELEOP_READY" in line for line in output):
                return
            if code is not None:
                detail = "\n".join(output[-16:]) or f"worker exited with code {code}"
                raise ValueError(f"real {arm} VR teleop failed to start:\n{detail}")
            time.sleep(0.1)

        self.stop()
        with self.lock:
            output = list(self.task.output[-16:]) if self.task else []
        detail = "\n".join(output) or "no output received from the real VR worker"
        raise ValueError(f"real {arm} VR teleop did not become ready within 20 seconds:\n{detail}")

    def start_calibration(self, device_id: str, recalibrate: bool = True) -> None:
        if device_id not in DEVICE_IDS:
            raise ValueError("deviceId must identify one workspace arm")
        side, role = device_id.split("-")
        port = self.state["assignments"][device_id]
        if not port:
            raise ValueError(f"assign a port to {device_id} first")
        command = [
            str(LEROBOT_BIN / "python3"),
            str(ROOT / "backend" / "direct_calibration_worker.py"),
            "--role", role,
            "--port", port,
            "--id", f"my_awesome_bimanual_{role}_{side}",
        ]
        self._start(
            f"calibrate-{device_id}",
            command,
            calibration={
                "target": role,
                "deviceId": device_id,
                "arm": side,
                "stage": "middle",
                "instruction": (
                    f"Move the {side.upper()} robot to the MIDDLE of every joint range, "
                    "then confirm. Torque is disabled; support the arm by hand."
                ),
                "joints": self._new_joint_state(),
            },
        )

    def task_input(self, value: str) -> None:
        if value not in {"", "c"}:
            raise ValueError("interactive input must be Enter or c")
        with self.lock:
            if not self.task or self.task.process.poll() is not None or not self.task.process.stdin:
                raise ValueError("no interactive task is running")
            self.task.process.stdin.write(value + "\n")
            self.task.process.stdin.flush()
            calibration = self.task.calibration
            if calibration:
                stage = calibration["stage"]
                if stage == "middle" and value == "":
                    calibration.update(stage="connecting", instruction="Connecting and disabling torque…")

    def start_leader_teleop(
        self, confirmation: str, profile: str = "project", zero_jump: bool = False
    ) -> None:
        if not self.enable_motion or confirmation != "ENABLE MOTION":
            raise PermissionError("real motion is locked; start server with --enable-motion and confirm")
        self._require_motion_unlatched()
        if profile not in {"exhibition", "project"}:
            raise ValueError("profile must be exhibition or project")
        ports = self.state["assignments"]
        if not all(ports.values()):
            raise ValueError("assign all four ports first")
        TELEMETRY_FILE.unlink(missing_ok=True)
        command = [
            str(LEROBOT_BIN / "python3"), str(ROOT / "backend" / "leader_teleop_worker.py"),
            "--left-follower", ports["left-follower"], "--right-follower", ports["right-follower"],
            "--left-leader", ports["left-leader"], "--right-leader", ports["right-leader"],
            "--telemetry", str(TELEMETRY_FILE),
            "--profile", profile,
        ]
        if zero_jump:
            command.append("--zero-jump")
        self._start("leader-teleop", command)

        # Do not tell the dashboard that motion is live merely because Popen
        # succeeded.  Connecting four serial buses can take several seconds,
        # and configuration/calibration errors otherwise leave the UI showing
        # a misleading Live state while the worker has already exited.
        deadline = time.monotonic() + 30.0
        while time.monotonic() < deadline:
            with self.lock:
                task = self.task
                code = task.process.poll() if task else -1
                output = list(task.output[-30:]) if task else []
            if code is not None:
                detail = "\n".join(output[-12:]) or f"worker exited with code {code}"
                raise ValueError(f"bimanual teleop failed to start:\n{detail}")
            try:
                telemetry = json.loads(TELEMETRY_FILE.read_text())
                if time.time() - float(telemetry.get("timestamp", 0)) < 2:
                    return
            except (FileNotFoundError, json.JSONDecodeError, TypeError, ValueError):
                pass
            time.sleep(0.1)

        self.stop()
        with self.lock:
            output = list(self.task.output[-12:]) if self.task else []
        detail = "\n".join(output) or "no output received from the LeRobot worker"
        raise ValueError(f"bimanual teleop did not become ready within 30 seconds:\n{detail}")

    def recover_leader_teleop(
        self, confirmation: str, profile: str = "exhibition"
    ) -> None:
        """Reconnect both pairs and resume from their held follower poses."""
        self.stop()
        time.sleep(0.25)
        self.start_leader_teleop(confirmation, profile, zero_jump=True)

    def start_single_leader_teleop(
        self, confirmation: str, side: str, profile: str = "project", zero_jump: bool = False
    ) -> None:
        if not self.enable_motion or confirmation != "ENABLE MOTION":
            raise PermissionError("real motion is locked; start server with --enable-motion and confirm")
        self._require_motion_unlatched()
        if side not in {"left", "right"}:
            raise ValueError("side must be left or right")
        if profile not in {"exhibition", "project"}:
            raise ValueError("profile must be exhibition or project")
        ports = self.state["assignments"]
        leader_port = ports.get(f"{side}-leader")
        follower_port = ports.get(f"{side}-follower")
        if not leader_port or not follower_port:
            raise ValueError(f"assign the {side} leader and follower ports first")

        TELEMETRY_FILE.unlink(missing_ok=True)
        command = [
            str(LEROBOT_BIN / "python3"), str(ROOT / "backend" / "single_leader_teleop_worker.py"),
            "--side", side, "--follower", follower_port, "--leader", leader_port,
            "--telemetry", str(TELEMETRY_FILE),
            "--profile", profile,
        ]
        if zero_jump:
            command.append("--zero-jump")
        self._start(f"single-teleop-{side}", command)

        deadline = time.monotonic() + 20.0
        while time.monotonic() < deadline:
            with self.lock:
                task = self.task
                code = task.process.poll() if task else -1
                output = list(task.output[-30:]) if task else []
            if code is not None:
                detail = "\n".join(output[-12:]) or f"worker exited with code {code}"
                raise ValueError(f"{side} teleop failed to start:\n{detail}")
            try:
                telemetry = json.loads(TELEMETRY_FILE.read_text())
                if side in telemetry and time.time() - float(telemetry.get("timestamp", 0)) < 2:
                    return
            except (FileNotFoundError, json.JSONDecodeError, TypeError, ValueError):
                pass
            time.sleep(0.1)

        self.stop()
        with self.lock:
            output = list(self.task.output[-12:]) if self.task else []
        detail = "\n".join(output) or "no output received from the LeRobot worker"
        raise ValueError(f"{side} teleop did not become ready within 20 seconds:\n{detail}")

    def recover_single_leader_teleop(
        self, confirmation: str, side: str, profile: str = "exhibition"
    ) -> None:
        """Reconnect one pair and resume from its held follower pose."""
        self.stop()
        # Give udev/USB serial a brief window to settle after a transient
        # disconnect and ensure the previous worker has released both buses.
        time.sleep(0.25)
        self.start_single_leader_teleop(confirmation, side, profile, zero_jump=True)

    def stop(self, *, reason="operator_stop") -> None:
        if self.gesture_pick:
            self.gesture_pick.cancel(reason)
        with self.lock:
            task = self.task
            if not task:
                return
            if task.process.poll() is not None:
                task.process_health = "stopped"
                self.task = None
                return
            os.killpg(task.process.pid, signal.SIGINT)
        try:
            task.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(task.process.pid, signal.SIGTERM)
            try:
                task.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(task.process.pid, signal.SIGKILL)
        with self.lock:
            task.process_health = "stopped"
            self.task = None

    def emergency_stop(self) -> None:
        """Stop the active task and persist a lock across process termination."""
        self._estopping.set()
        self.stop(reason="estop")
        with self.lock:
            self.state["latchedMotionLock"] = True
            save_state(self.state)

    def readiness_check(self, mode: str = "dual-arm") -> dict[str, Any]:
        arms = self._selected_vr_arms(mode)
        checks = {
            "assignment": True,
            "calibration": True,
            "deviceAvailability": True,
            "motionAuthorization": not bool(self.state.get("latchedMotionLock")),
            "processReadiness": True,
        }
        if not self.offline:
            for arm in arms:
                device_id = f"{arm}-follower"
                port = self.state["assignments"].get(device_id)
                profile = calibration_path(device_id)
                checks["assignment"] = checks["assignment"] and bool(port)
                checks["calibration"] = checks["calibration"] and profile.exists()
                checks["deviceAvailability"] = checks["deviceAvailability"] and bool(
                    port and port in {item["path"] for item in self.ports()}
                )
        return {"mode": mode, "activeArms": list(arms), "checks": checks, "ready": all(checks.values())}

    def unlock(self, confirmation: str, mode: str = "dual-arm") -> dict[str, Any]:
        if confirmation != "UNLOCK MOTION":
            raise PermissionError("explicit confirmation required: UNLOCK MOTION")
        with self.lock:
            self.state["latchedMotionLock"] = False
            save_state(self.state)
        checks = self.readiness_check(mode)
        if not checks["ready"]:
            with self.lock:
                self.state["latchedMotionLock"] = True
                save_state(self.state)
            raise ValueError(f"readiness re-check failed: {checks}")
        with self.lock:
            self._estopping.clear()
        return checks


class Handler(BaseHTTPRequestHandler):
    controller: Controller

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[dashboard] {self.address_string()} {fmt % args}")

    def _json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(body, dict):
            raise ValueError("request body must be a JSON object")
        return body

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._json(HTTPStatus.NO_CONTENT, {})

    def _gesture_camera_stream(self, session):
        import cv2

        try:
            frame, _ = session.camera_frame()
        except (ValueError, OSError):
            self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "configured camera unavailable"})
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            while True:
                ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ok:
                    payload = jpeg.tobytes()
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                     + str(len(payload)).encode() + b"\r\n\r\n" + payload + b"\r\n")
                    self.wfile.flush()
                time.sleep(1 / 30)
                frame, _ = session.camera_frame()
        except (BrokenPipeError, ConnectionResetError, ValueError, OSError):
            pass

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/status":
            self._json(HTTPStatus.OK, self.controller.snapshot())
        elif path == "/api/gesture-pick/status":
            self._json(HTTPStatus.OK, self.controller.gesture_pick_status())
        elif path == "/api/gesture-pick/detections":
            self._json(HTTPStatus.OK, self.controller.gesture_pick_detections())
        elif path == "/api/health":
            self._json(HTTPStatus.OK, {"ok": True})
        elif path == "/api/cameras/stream":
            camera_path = parse_qs(parsed.query).get("path", [""])[0]
            session = self.controller.gesture_pick
            if (session and camera_path
                    and Path(camera_path).resolve() == Path(session.config.camera_path).resolve()):
                self._gesture_camera_stream(session)
                return
            available = {camera["path"] for camera in self.controller.cameras()}
            if camera_path not in available:
                self._json(HTTPStatus.NOT_FOUND, {"error": "camera is not available"})
                return
            process = subprocess.Popen(
                [str(LEROBOT_BIN / "python3"), "-u", str(ROOT / "backend" / "camera_worker.py"), "stream", camera_path],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            )
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                assert process.stdout is not None
                while chunk := process.stdout.read(65536):
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            data = self._body()
            if path == "/api/gesture-pick/select":
                self.controller.gesture_pick_select(data)
            elif path == "/api/gesture-pick/confirm":
                if set(data) != {"taskId"}:
                    raise ValueError("confirmation accepts only taskId")
                self.controller.gesture_pick_confirm(data["taskId"])
            elif path == "/api/gesture-pick/cancel":
                if data:
                    raise ValueError("cancellation accepts no parameters")
                self.controller.gesture_pick_cancel()
            elif path == "/api/ports/assign":
                self.controller.assign(
                    data.get("deviceId", ""), data.get("port"), bool(data.get("reassign", False))
                )
            elif path == "/api/tasks/find-port":
                self.controller.start_find_port()
            elif path == "/api/tasks/find-cameras":
                self.controller.rescan_cameras()
            elif path == "/api/tasks/vr-offline":
                self.controller.start_vr_offline()
            elif path == "/api/tasks/vr-lekiwi":
                self.controller.start_vr_lekiwi(data.get("mode", "dual-arm"), data.get("relayPort"))
            elif path == "/api/tasks/vr-real":
                self.controller.start_vr_real(
                    data.get("confirmation", ""), data.get("translationScale", 0.45),
                    data.get("arm", "right"),
                    data.get("responseProfile", "balanced"),
                )
            elif path == "/api/tasks/calibrate":
                self.controller.start_calibration(
                    data.get("deviceId", ""), bool(data.get("recalibrate", True))
                )
            elif path == "/api/tasks/input":
                self.controller.task_input(data.get("value", ""))
            elif path == "/api/tasks/leader-teleop":
                self.controller.start_leader_teleop(
                    data.get("confirmation", ""), data.get("profile", "project")
                )
            elif path == "/api/tasks/leader-teleop/recover":
                self.controller.recover_leader_teleop(
                    data.get("confirmation", ""), data.get("profile", "exhibition")
                )
            elif path == "/api/tasks/single-teleop":
                self.controller.start_single_leader_teleop(
                    data.get("confirmation", ""), data.get("side", "left"),
                    data.get("profile", "project"),
                )
            elif path == "/api/tasks/single-teleop/recover":
                self.controller.recover_single_leader_teleop(
                    data.get("confirmation", ""), data.get("side", "left"),
                    data.get("profile", "exhibition"),
                )
            elif path in {"/api/tasks/stop", "/api/estop"}:
                if path == "/api/estop":
                    self.controller.emergency_stop()
                else:
                    self.controller.stop()
            elif path == "/api/unlock":
                self.controller.unlock(data.get("confirmation", ""), data.get("mode", "dual-arm"))
            else:
                self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            self._json(HTTPStatus.OK, self.controller.snapshot())
        except PermissionError as error:
            self._json(HTTPStatus.FORBIDDEN, {"error": str(error)})
        except (ValueError, json.JSONDecodeError, OSError) as error:
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--enable-motion", action="store_true")
    parser.add_argument("--gesture-pick-config", type=Path,
                        help="Explicit local overhead-camera, tag and follower configuration.")
    parser.add_argument(
        "--hardware",
        action="store_true",
        help="Enable assigned hardware checks and real VR LeKiwi follower startup.",
    )
    args = parser.parse_args()
    Handler.controller = Controller(enable_motion=args.enable_motion, offline=not args.hardware,
                                    gesture_pick_config=args.gesture_pick_config)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SO-101 dashboard API: http://{args.host}:{args.port}")
    print("REAL MOTION:", "UNLOCKED" if args.enable_motion else "LOCKED")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        Handler.controller.stop()
        if Handler.controller.gesture_pick:
            Handler.controller.gesture_pick.close_camera()
        server.server_close()


if __name__ == "__main__":
    main()
