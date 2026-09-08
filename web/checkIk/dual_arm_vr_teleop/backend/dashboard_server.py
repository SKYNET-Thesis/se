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
import os
import re
import signal
import socket
import ssl
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


class Controller:
    def __init__(self, enable_motion: bool, offline: bool = True) -> None:
        self.enable_motion = enable_motion
        self.offline = offline
        self.state = load_state()
        self.task: ManagedTask | None = None
        self.lock = threading.RLock()
        self._camera_signature: tuple[str, ...] = ()
        self._camera_cache: list[dict[str, Any]] = []

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
        paths = tuple(sorted(glob.glob("/dev/video*")))
        if paths == self._camera_signature:
            return self._camera_cache
        self._camera_signature = paths
        self._camera_cache = []
        if not paths:
            return []
        try:
            probe = subprocess.run(
                [str(LEROBOT_BIN / "python3"), str(ROOT / "backend" / "camera_worker.py"), "probe", *paths],
                capture_output=True, text=True, timeout=max(5, len(paths) * 3),
            )
            if probe.returncode == 0:
                self._camera_cache = json.loads(probe.stdout)
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
            self._camera_cache = []
        return self._camera_cache

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
        }

    def assign(self, device_id: str, port: str | None, reassign: bool = False) -> None:
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
            if self.task and self.task.process.poll() is None:
                raise ValueError(f"task {self.task.kind} is already running")
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
        """Start the tested LeKiwi operator surface through CHECKIK's process boundary.

        The integration deliberately uses the package's deterministic fake follower path.
        No serial device is discovered or opened here; assignment values are passed as
        explicit configuration tokens so the boundary remains identical to hardware mode.
        """
        arms = self._selected_vr_arms(mode)
        if self.state.get("latchedMotionLock"):
            raise PermissionError("motion is latched by E-stop; unlock and re-check readiness first")
        with self.lock:
            if self.task and self.task.process.poll() is None:
                raise ValueError(f"task {self.task.kind} is already running")
        relay_port = relay_port or self._available_local_port()
        if not 1 <= relay_port <= 65535:
            raise ValueError("relay port must be between 1 and 65535")
        selected = {
            "left": ("fake://left-follower", "left-follower"),
            "right": ("fake://right-follower", "right-follower"),
        }
        command = [
            str(LEROBOT_BIN / "python3"), "-u", "-m", "lekiwi_vr_teleop.process",
            "--mode", mode,
            "--certificate", str(VUER_CERT), "--key", str(VUER_KEY),
            "--relay-port", str(relay_port),
            "--relay-host", "0.0.0.0",
        ]
        for arm in ("left", "right"):
            if arm in arms:
                port, device_id = selected[arm]
                command.extend([f"--{arm}-port", port, f"--{arm}-device-id", device_id])
        if not VR_LEKIWI_ROOT.exists():
            raise ValueError(f"vr_lekiwi package is missing: {VR_LEKIWI_ROOT}")
        if not VUER_CERT.exists() or not VUER_KEY.exists():
            raise ValueError("VR LeKiwi certificate/key is missing; provide explicit relay TLS files")
        with self.lock:
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

    def stop(self) -> None:
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
        self.stop()
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
        return json.loads(self.rfile.read(length) or b"{}")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._json(HTTPStatus.NO_CONTENT, {})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/status":
            self._json(HTTPStatus.OK, self.controller.snapshot())
        elif path == "/api/health":
            self._json(HTTPStatus.OK, {"ok": True})
        elif path == "/api/cameras/stream":
            camera_path = parse_qs(parsed.query).get("path", [""])[0]
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
            if path == "/api/ports/assign":
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
    parser.add_argument(
        "--hardware",
        action="store_true",
        help="Enable hardware discovery for legacy tasks; vr_lekiwi remains fake/offline in phase one.",
    )
    args = parser.parse_args()
    Handler.controller = Controller(enable_motion=args.enable_motion, offline=not args.hardware)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SO-101 dashboard API: http://{args.host}:{args.port}")
    print("REAL MOTION:", "UNLOCKED" if args.enable_motion else "LOCKED")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        Handler.controller.stop()
        server.server_close()


if __name__ == "__main__":
    main()
