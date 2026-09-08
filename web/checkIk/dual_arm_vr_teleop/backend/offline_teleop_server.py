#!/usr/bin/env python3
"""WebSocket receiver with offline relative-control IK/FK verification.

No module in this file imports LeRobot or writes to robot hardware.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
import math
from pathlib import Path
import sys
import time
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# A slightly bent, centered pose leaves Cartesian room in every direction.
# Starting from all zeros puts the SO-101 close to maximum forward extension.
TELEOP_START_Q = np.array([0.0, -0.6, 1.2, -0.6, 0.0])

# WebXR: +X right, +Y up, -Z forward.
# SO-101 base: +X forward, +Y left, +Z up.
WEBXR_TO_ROBOT = np.array(
    [
        [0.0, 0.0, -1.0],
        [-1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
    ]
)
WRIST_PITCH_DEADZONE = math.radians(6.0)
WRIST_ROLL_DEADZONE = math.radians(6.0)
# Quest tracking noise is normally only a few millimetres.  A 12 mm deadzone
# made deliberate short vertical motions disappear on the physical arm, even
# though they were noticeable in the headset.  Keep a small radial deadzone,
# then map WebXR +Y directly to robot +Z.
TRANSLATION_DEADZONE = 0.004
ROBOT_AXIS_GAIN = np.array([1.0, 1.0, 1.20])


def apply_deadzone(value: float, threshold: float) -> float:
    """Continuous signed deadzone: zero near rest, no jump at the boundary."""
    magnitude = abs(value)
    if magnitude <= threshold:
        return 0.0
    return math.copysign(magnitude - threshold, value)


def apply_vector_deadzone(value: np.ndarray, threshold: float) -> np.ndarray:
    """Radial deadzone that preserves direction and stays continuous."""
    magnitude = float(np.linalg.norm(value))
    if magnitude <= threshold:
        return np.zeros_like(value)
    return value * ((magnitude - threshold) / magnitude)


def quaternion_multiply(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    lx, ly, lz, lw = left
    rx, ry, rz, rw = right
    return np.array(
        [
            lw * rx + lx * rw + ly * rz - lz * ry,
            lw * ry - lx * rz + ly * rw + lz * rx,
            lw * rz + lx * ry - ly * rx + lz * rw,
            lw * rw - lx * rx - ly * ry - lz * rz,
        ]
    )


def quaternion_slerp(origin: np.ndarray, target: np.ndarray, alpha: float) -> np.ndarray:
    """Shortest-path normalized quaternion interpolation in xyzw order."""
    origin = origin / np.linalg.norm(origin)
    target = target / np.linalg.norm(target)
    dot = float(np.dot(origin, target))
    if dot < 0.0:
        target = -target
        dot = -dot
    dot = float(np.clip(dot, -1.0, 1.0))
    if dot > 0.9995:
        result = origin + alpha * (target - origin)
        return result / np.linalg.norm(result)
    theta = math.acos(dot)
    sin_theta = math.sin(theta)
    return (
        math.sin((1.0 - alpha) * theta) / sin_theta * origin
        + math.sin(alpha * theta) / sin_theta * target
    )


def relative_rotation_vector(origin: np.ndarray, current: np.ndarray) -> np.ndarray:
    """Return the shortest local-frame rotation vector from origin to current."""
    origin = origin / np.linalg.norm(origin)
    current = current / np.linalg.norm(current)
    inverse_origin = np.array([-origin[0], -origin[1], -origin[2], origin[3]])
    relative = quaternion_multiply(inverse_origin, current)
    if relative[3] < 0.0:
        relative = -relative
    vector_norm = float(np.linalg.norm(relative[:3]))
    if vector_norm < 1e-9:
        return np.zeros(3)
    angle = 2.0 * math.atan2(vector_norm, float(relative[3]))
    return relative[:3] / vector_norm * angle


def controller_local_roll(origin: np.ndarray, current: np.ndarray) -> float:
    """Relative twist about the controller's local +Z pointing axis."""
    origin = origin / np.linalg.norm(origin)
    current = current / np.linalg.norm(current)
    inverse_origin = np.array([-origin[0], -origin[1], -origin[2], origin[3]])
    relative = quaternion_multiply(inverse_origin, current)
    # Twist decomposition around local Z ignores pitch/yaw components.
    return 2.0 * math.atan2(float(relative[2]), float(relative[3]))

from robot import SO101Kinematics, solve_ik


class HandPose(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connected: bool
    enabled: bool
    position: list[float] = Field(min_length=3, max_length=3)
    rotation: list[float] = Field(min_length=4, max_length=4)
    trigger: float = Field(ge=0.0, le=1.0)
    grip: float = Field(ge=0.0, le=1.0)
    source: Literal["controller", "hand"] = "controller"

    @field_validator("position", "rotation")
    @classmethod
    def finite(cls, values: list[float]) -> list[float]:
        if not all(math.isfinite(value) for value in values):
            raise ValueError("pose values must be finite")
        return values

    @field_validator("rotation")
    @classmethod
    def quaternion(cls, values: list[float]) -> list[float]:
        norm = np.linalg.norm(values)
        if not 0.99 <= norm <= 1.01:
            raise ValueError("quaternion must be normalized")
        return values


class ControllerPacket(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sequence: int = Field(ge=0)
    timestamp: float
    left: HandPose
    right: HandPose


@dataclass
class RelativeState:
    vr_origin: np.ndarray | None = None
    robot_origin: np.ndarray | None = None
    current_q: np.ndarray | None = None
    vr_rotation_origin: np.ndarray | None = None
    controller_elevation_origin: float | None = None
    wrist_flex_origin: float | None = None
    wrist_roll_origin: float | None = None
    filtered_vr_position: np.ndarray | None = None
    filtered_vr_rotation: np.ndarray | None = None
    smoothed_target: np.ndarray | None = None
    last_raw_vr_position: np.ndarray | None = None
    last_filter_time: float | None = None
    was_enabled: bool = False


def controller_elevation(quaternion: np.ndarray) -> float:
    """Elevation of the controller's -Z pointing direction in WebXR space."""
    x, y, z, w = quaternion / np.linalg.norm(quaternion)
    forward_y = 2.0 * (x * w - y * z)
    return math.asin(float(np.clip(forward_y, -1.0, 1.0)))


class OfflineTeleop:
    def __init__(
        self,
        *,
        controller_smoothing_alpha: float = 1.0,
        max_target_step_m: float | None = None,
        ik_iterations: int = 12,
        continuity_weight: float = 1e-3,
        max_tracking_step_m: float | None = None,
        max_ik_joint_jump_deg: float | None = None,
    ) -> None:
        self.model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
        self.hands = {"left": RelativeState(), "right": RelativeState()}
        # Digital-twin testing uses a direct 1:1 hand-to-TCP translation.
        # Hardware control will use a separately configurable safety scale.
        self.translation_scale = 1.0
        self.controller_smoothing_alpha = controller_smoothing_alpha
        self.max_target_step_m = max_target_step_m
        self.ik_iterations = ik_iterations
        self.continuity_weight = continuity_weight
        self.max_tracking_step_m = max_tracking_step_m
        self.max_ik_joint_jump = (
            None if max_ik_joint_jump_deg is None else math.radians(max_ik_joint_jump_deg)
        )

    def process_hand(self, name: str, pose: HandPose, sample_time: float | None = None) -> dict | None:
        state = self.hands[name]
        if not pose.connected or not pose.enabled:
            state.was_enabled = False
            return None
        vr_position = np.asarray(pose.position, dtype=float)
        vr_rotation = np.asarray(pose.rotation, dtype=float)
        if not state.was_enabled:
            # Keep the last digital-twin pose between clutch presses.  Only the
            # first clutch starts from a centered, bent teleoperation pose.
            if state.current_q is None:
                state.current_q = TELEOP_START_Q.copy()
            state.vr_origin = vr_position.copy()
            state.robot_origin = self.model.forward_kinematics(state.current_q).position
            state.filtered_vr_position = vr_position.copy()
            state.filtered_vr_rotation = vr_rotation.copy()
            state.last_raw_vr_position = vr_position.copy()
            state.last_filter_time = sample_time
            state.smoothed_target = state.robot_origin.copy()
            state.vr_rotation_origin = vr_rotation.copy()
            state.controller_elevation_origin = controller_elevation(vr_rotation)
            state.wrist_flex_origin = float(state.current_q[3])
            state.wrist_roll_origin = float(state.current_q[4])
            state.was_enabled = True
        else:
            raw_step = float(np.linalg.norm(vr_position - state.last_raw_vr_position))
            state.last_raw_vr_position = vr_position.copy()
            if self.max_tracking_step_m is not None and raw_step > self.max_tracking_step_m:
                # A one-frame optical tracking relocation must not become a
                # Cartesian target. Re-reference on the following frame so a
                # persistent tracking-frame change cannot create catch-up motion.
                state.was_enabled = False
                return {
                    "success": False,
                    "message": f"tracking spike rejected ({raw_step:.3f} m/frame)",
                }
            # A time-aware adaptive low-pass keeps the same feel when WebXR
            # varies between 60/72/90 Hz. Slow motion gets strong jitter
            # rejection; deliberate motion raises the cutoff to avoid lag.
            filter_error = vr_position - state.filtered_vr_position
            filter_distance = float(np.linalg.norm(filter_error))
            if sample_time is None or state.last_filter_time is None:
                dt = 1.0 / 60.0
            else:
                dt = float(np.clip(sample_time - state.last_filter_time, 1.0 / 120.0, 0.05))
            state.last_filter_time = sample_time
            speed = filter_distance / dt
            min_cutoff_hz = 2.2 if pose.source == "hand" else 4.0
            cutoff_hz = min_cutoff_hz + 4.0 * speed
            time_alpha = 1.0 - math.exp(-2.0 * math.pi * cutoff_hz * dt)
            # Preserve the existing tuning knob as a lower response bound.
            alpha_floor = self.controller_smoothing_alpha * (0.5 if pose.source == "hand" else 1.0)
            alpha = float(np.clip(max(time_alpha, alpha_floor), 0.0, 1.0))
            state.filtered_vr_position += alpha * filter_error
            # Optical palm orientation needs stronger filtering than position.
            # Freeze it while the index-thumb pinch is almost closed so the
            # grasp gesture cannot accidentally bend or roll the robot wrist.
            if not (pose.source == "hand" and pose.trigger >= 0.8):
                rotation_alpha = 0.35 if pose.source == "hand" else 1.0
                state.filtered_vr_rotation = quaternion_slerp(
                    state.filtered_vr_rotation, vr_rotation, rotation_alpha
                )
        # Rotating a handheld controller about the user's wrist also translates
        # its tracked grip pose slightly. Ignore that small arc so pitch/roll
        # gestures don't accidentally fold the elbow.
        delta_vr = apply_vector_deadzone(
            state.filtered_vr_position - state.vr_origin,
            TRANSLATION_DEADZONE,
        )
        delta_robot = ROBOT_AXIS_GAIN * (WEBXR_TO_ROBOT @ delta_vr)
        desired_target = state.robot_origin + self.translation_scale * delta_robot
        if self.max_target_step_m is None:
            target = desired_target
        else:
            target_step = desired_target - state.smoothed_target
            target_step_distance = float(np.linalg.norm(target_step))
            if target_step_distance > self.max_target_step_m:
                target_step *= self.max_target_step_m / target_step_distance
            state.smoothed_target += target_step
            target = state.smoothed_target.copy()
        filtered_rotation = state.filtered_vr_rotation
        raw_elevation_delta = controller_elevation(filtered_rotation) - state.controller_elevation_origin
        # Quest's physical pitch direction is opposite the URDF wrist-flex sign.
        if pose.source == "hand":
            # Palm frame axes from WebXR: local X spans index→pinky, local Y
            # points wrist→fingers, local Z is the palm normal. SO-101 can use
            # only flex (X) and forearm twist (Y), not the full 6-DoF target.
            palm_rotation = relative_rotation_vector(
                state.vr_rotation_origin, filtered_rotation
            )
            max_hand_wrist_delta = math.radians(45.0)
            elevation_delta = float(np.clip(
                apply_deadzone(-float(palm_rotation[0]), WRIST_PITCH_DEADZONE) * 0.65,
                -max_hand_wrist_delta,
                max_hand_wrist_delta,
            ))
            roll_delta = float(np.clip(
                apply_deadzone(float(palm_rotation[1]), WRIST_ROLL_DEADZONE) * 0.65,
                -max_hand_wrist_delta,
                max_hand_wrist_delta,
            ))
        else:
            elevation_delta = -apply_deadzone(raw_elevation_delta, WRIST_PITCH_DEADZONE)
            raw_roll_delta = controller_local_roll(state.vr_rotation_origin, filtered_rotation)
            roll_delta = apply_deadzone(raw_roll_delta, WRIST_ROLL_DEADZONE)
        wrist_flex_target = np.clip(
            state.wrist_flex_origin + elevation_delta,
            self.model.lower_limits[3],
            self.model.upper_limits[3],
        )
        wrist_roll_target = np.clip(
            state.wrist_roll_origin + roll_delta,
            self.model.lower_limits[4],
            self.model.upper_limits[4],
        )
        # Position IK is solved with both wrist joints held near their clutch
        # origins. Controller orientation is applied only after that solve.
        # This deliberately prevents elbow/shoulder compensation when the user
        # merely pitches or rolls the controller.
        preferred_q = state.current_q.copy()
        preferred_q[3] = wrist_flex_target if pose.source == "hand" else state.wrist_flex_origin
        preferred_q[4] = wrist_roll_target if pose.source == "hand" else state.wrist_roll_origin
        preferred_weights = np.full(5, self.continuity_weight)
        preferred_weights[3] = 0.03 if pose.source == "hand" else 0.2
        preferred_weights[4] = 0.03 if pose.source == "hand" else 0.2
        # Pyroki-style soft pose target for optical hands: derive an achievable
        # EE orientation from the requested flex/roll, then optimize it jointly
        # with XYZ. Position remains dominant and orientation never turns a
        # usable 5-DoF solution into a rejected frame.
        soft_target_rotation = (
            self.model.forward_kinematics(preferred_q).rotation
            if pose.source == "hand"
            else None
        )
        result = solve_ik(
            self.model,
            target,
            target_rotation=soft_target_rotation,
            initial_q=state.current_q,
            # Realtime tracking prioritizes a fresh, continuous solution. A
            # 2.5 mm Cartesian tolerance avoids rejecting valid inward motion
            # due to the small continuity regularizer in the fast solver.
            position_tolerance=3e-3,
            max_iterations=self.ik_iterations,
            multi_start=False,
            joint_target=preferred_q,
            joint_target_weights=preferred_weights,
            orientation_weight=0.015,
            require_orientation=False,
        )
        if not result.success or result.joint_positions is None:
            return {"success": False, "message": result.message, "target": target.tolist()}
        ik_jump = float(np.max(np.abs(result.joint_positions - state.current_q)))
        if self.max_ik_joint_jump is not None and ik_jump > self.max_ik_joint_jump:
            return {
                "success": False,
                "message": f"IK branch jump rejected ({math.degrees(ik_jump):.1f} deg)",
                "target": target.tolist(),
            }
        state.current_q = result.joint_positions.copy()
        if pose.source != "hand":
            state.current_q[3] = wrist_flex_target
            state.current_q[4] = wrist_roll_target
        verified = self.model.forward_kinematics(state.current_q)
        return {
            "success": True,
            "target": target.tolist(),
            "verified": verified.position.tolist(),
            "position_error": float(np.linalg.norm(target - verified.position)),
            "arm_ik_error": result.position_error,
            "joint_positions": state.current_q.tolist(),
            "gripper": pose.trigger,
            "controller_elevation": controller_elevation(filtered_rotation),
            "wrist_flex_input": float(elevation_delta),
            "wrist_flex_target": float(wrist_flex_target),
            "wrist_roll_input": float(roll_delta),
            "wrist_roll_target": float(wrist_roll_target),
        }

    def process(self, packet: ControllerPacket) -> dict:
        results = {
            name: result
            for name in ("left", "right")
            if (result := self.process_hand(name, getattr(packet, name), packet.timestamp)) is not None
        }
        return {"status": "offline_ik_ok", "active_hands": list(results), "results": results}


async def connection(websocket: ServerConnection) -> None:
    print(f"Client connected: {websocket.remote_address}")
    queue: asyncio.Queue[ControllerPacket] = asyncio.Queue(maxsize=1)
    teleop = OfflineTeleop()
    last_sequence = -1
    last_report = 0.0

    async def receive() -> None:
        nonlocal last_sequence
        async for raw in websocket:
            try:
                packet = ControllerPacket.model_validate_json(raw)
                now = time.time()
                if packet.sequence <= last_sequence:
                    raise ValueError("duplicate or out-of-order sequence")
                if abs(now - packet.timestamp) > 1.0:
                    raise ValueError("stale timestamp")
                last_sequence = packet.sequence
                if queue.full():
                    queue.get_nowait()
                    queue.task_done()
                queue.put_nowait(packet)
            except (ValidationError, ValueError, json.JSONDecodeError) as error:
                await websocket.send(json.dumps({"status": "rejected", "error": str(error)}))

    async def process() -> None:
        nonlocal last_report
        while True:
            try:
                packet = await asyncio.wait_for(queue.get(), timeout=0.25)
            except asyncio.TimeoutError:
                # Deadman: release both clutches when input becomes stale.
                for state in teleop.hands.values():
                    state.was_enabled = False
                continue
            # IK is CPU-bound. Keep receiving controller packets concurrently so
            # the size-one queue always contains the newest pose, never a backlog.
            reply = await asyncio.to_thread(teleop.process, packet)
            reply["sequence"] = packet.sequence
            queue.task_done()
            await websocket.send(json.dumps(reply))
            if time.monotonic() - last_report >= 0.5:
                active = reply["active_hands"] or ["none"]
                print(f"seq={packet.sequence} active={','.join(active)} (OFFLINE ONLY)")
                last_report = time.monotonic()

    receiver = asyncio.create_task(receive())
    processor = asyncio.create_task(process())
    try:
        done, pending = await asyncio.wait(
            {receiver, processor}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for task in done:
            try:
                task.result()
            except ConnectionClosed:
                # Closing/reloading a browser tab may omit a WebSocket close
                # frame. It is still a normal deadman/disconnect event here.
                pass
    finally:
        receiver.cancel()
        processor.cancel()
        print("Client disconnected; offline clutch states discarded")


async def main() -> None:
    print("Dual-arm offline teleop WebSocket: ws://127.0.0.1:8765")
    print("NO LEROBOT IMPORT — NO ROBOT COMMANDS")
    async with serve(connection, "127.0.0.1", 8765, max_size=64 * 1024):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped")
