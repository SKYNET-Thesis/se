#!/usr/bin/env python3
"""Quest WebXR -> IK -> one or two physical SO-101 followers.

This bridge is intentionally separate from ``offline_teleop_server.py``.  It
connects only the follower arms, seeds IK from their measured pose, and sends
commands only while the WebXR client enables its software clutch. Losing packets releases
the software clutch; Ctrl+C, Emergency Stop, or stopping the dashboard
disconnects the followers and releases torque through LeRobot's normal path.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
from pathlib import Path
import sys
import time

import numpy as np
from pydantic import ValidationError
from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.offline_teleop_server import ControllerPacket, OfflineTeleop
from backend.phone_protocol import (
    PhoneControlDisabled,
    PhoneHello,
    PhonePose,
    PhoneRecenter,
    parse_phone_message,
    phone_to_controller_packet,
)
from robot.safety import validate_joint_limits, validate_workspace


JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll")
WORKSPACE_MIN = np.array([0.08, -0.28, -0.04])
WORKSPACE_MAX = np.array([0.42, 0.28, 0.42])
STARTUP_LIMIT_TOLERANCE = math.radians(5.0)


class RealVRBridge:
    def __init__(
        self,
        robot,
        *,
        translation_scale: float,
        max_joint_step_deg: float,
        joint_smoothing: float,
        gripper_open: float,
        gripper_closed: float,
        active_sides: tuple[str, ...] = ("left", "right"),
    ) -> None:
        self.robot = robot
        # Keep Offline VR's proven relative mapping, adding only hardware-side
        # conditioning: adaptive controller filtering, a Cartesian velocity
        # envelope, more IK convergence budget, and stronger solution
        # continuity so redundant joints cannot wander between samples.
        self.teleop = OfflineTeleop(
            controller_smoothing_alpha=0.35,
            max_target_step_m=0.004,
            ik_iterations=30,
            continuity_weight=0.015,
            max_tracking_step_m=0.12,
            max_ik_joint_jump_deg=45.0,
        )
        self.teleop.translation_scale = translation_scale
        self.max_joint_step = math.radians(max_joint_step_deg)
        self.joint_smoothing = joint_smoothing
        self.gripper_open = gripper_open
        self.gripper_closed = gripper_closed
        self.active_sides = active_sides
        self.last_q: dict[str, np.ndarray] = {}
        self.last_gripper: dict[str, float] = {}
        self.last_feedback_at = time.monotonic()
        self.feedback_interval = 0.1
        # Ignore sub-resolution IK noise. Sending tiny alternating setpoints
        # makes a real servo buzz even though the offline twin looks still.
        self.joint_deadband = math.radians(0.06)
        self._seed_from_robot()

    def _seed_from_robot(self) -> None:
        dual = hasattr(self.robot, "left_arm")
        observation = self.robot.get_observation() if dual else None
        for side in self.active_sides:
            arm_observation = observation if dual else self.robot.get_observation()
            prefix = f"{side}_" if dual else ""
            q = np.radians([float(arm_observation[f"{prefix}{joint}.pos"]) for joint in JOINTS])
            lower = self.teleop.model.lower_limits
            upper = self.teleop.model.upper_limits
            strict_valid = validate_joint_limits(q, lower, upper)
            startup_valid = validate_joint_limits(
                q,
                lower - STARTUP_LIMIT_TOLERANCE,
                upper + STARTUP_LIMIT_TOLERANCE,
            )
            if not startup_valid:
                violations = []
                for joint, value, lower, upper in zip(
                    JOINTS,
                    np.degrees(q),
                    np.degrees(lower),
                    np.degrees(upper),
                    strict=True,
                ):
                    if value < lower or value > upper:
                        violations.append(
                            f"{joint}={value:.2f}deg (allowed {lower:.2f}..{upper:.2f}deg)"
                        )
                detail = ", ".join(violations) or "unknown joint"
                raise RuntimeError(
                    f"{side} follower pose is outside URDF limits: {detail}; "
                    "move it to a centered bent pose before starting VR teleop; "
                    "the startup allowance is only 5 degrees and REAL VR never auto-recovers it"
                )
            if not strict_valid:
                # A calibrated SO-101 can rest a few degrees beyond the URDF's
                # conservative limits. Extend this bridge instance's IK box to
                # the exact measured pose instead of clipping the seed. This
                # preserves zero motion on clutch-in while still rejecting a
                # genuinely unsafe startup pose above the small allowance.
                self.teleop.model.lower_limits = np.minimum(lower, q)
                self.teleop.model.upper_limits = np.maximum(upper, q)
                lower = self.teleop.model.lower_limits
                upper = self.teleop.model.upper_limits
            # Use the exact measured pose as both the IK seed and slew origin.
            # Starting from a clipped pose creates motion on clutch-in even
            # with a stationary controller, which is unsafe and feels unlike
            # the offline relative-control path.
            ik_q = q.copy()
            self.teleop.hands[side].current_q = ik_q.copy()
            self.last_q[side] = q.copy()
            self.last_gripper[side] = float(arm_observation[f"{prefix}gripper.pos"])
            tcp = self.teleop.model.forward_kinematics(ik_q).position
            if not validate_workspace(tcp, WORKSPACE_MIN, WORKSPACE_MAX):
                raise RuntimeError(f"{side} follower TCP {tcp.tolist()} is outside the safe workspace")
            startup_mode = "strict" if strict_valid else "measured-limit-extension"
            print(
                f"{side}: initial joints={np.degrees(q).round(2).tolist()} "
                f"TCP={tcp.round(4).tolist()} startup={startup_mode}"
            )

    def process(self, packet: ControllerPacket) -> dict:
        result = self.teleop.process(packet)
        side_actions: dict[str, dict[str, float]] = {}
        sent_sides: list[str] = []
        hardware_pose: dict[str, dict[str, object]] = {}

        for side in self.active_sides:
            hand = result["results"].get(side)
            if not hand or not hand.get("success"):
                continue
            target_q = np.asarray(hand["joint_positions"], dtype=float)
            target_tcp = np.asarray(hand["verified"], dtype=float)
            if not validate_joint_limits(
                target_q, self.teleop.model.lower_limits, self.teleop.model.upper_limits
            ) or not validate_workspace(target_tcp, WORKSPACE_MIN, WORKSPACE_MAX):
                hand.update(success=False, message="hardware safety envelope rejected target")
                continue

            # IK can move slightly between adjacent controller samples. Filter
            # that target before the slew limiter so the physical servos see a
            # continuous trajectory instead of a staircase of IK solutions.
            target_error = target_q - self.last_q[side]
            # Adaptive smoothing keeps small hand motion quiet but removes the
            # long "rubber band" delay after a larger controller movement.
            # joint_smoothing is the low-speed floor; alpha approaches 1 as
            # the robot falls farther behind the current VR target.
            error_deg = float(np.max(np.abs(np.degrees(target_error))))
            urgency = float(np.clip((error_deg - 0.4) / 7.6, 0.0, 1.0))
            smoothing = self.joint_smoothing + (1.0 - self.joint_smoothing) * urgency
            # Wrist gestures should feel as immediate as the offline twin.
            # Shoulder/elbow IK benefits from the configured damping, while a
            # stronger floor on wrist_flex/roll prevents small deliberate
            # controller rotations from disappearing behind that damping.
            smoothing_by_joint = np.full(len(JOINTS), smoothing)
            smoothing_by_joint[3:] = np.maximum(smoothing_by_joint[3:], 0.82)
            filtered_q = self.last_q[side] + smoothing_by_joint * target_error
            delta = np.clip(
                filtered_q - self.last_q[side], -self.max_joint_step, self.max_joint_step
            )
            delta[np.abs(delta) < self.joint_deadband] = 0.0
            command_q = self.last_q[side] + delta
            side_action = {
                f"{joint}.pos": float(degrees)
                for joint, degrees in zip(JOINTS, np.degrees(command_q), strict=True)
            }

            trigger = float(np.clip(hand["gripper"], 0.0, 1.0))
            gripper_target = self.gripper_open + trigger * (self.gripper_closed - self.gripper_open)
            # The follower bus applies the same max-relative-target safety to
            # every motor, including the gripper. Keep our request inside that
            # limit to avoid LeRobot repeatedly clamping it (visible as jerks).
            gripper_step = math.degrees(self.max_joint_step)
            gripper_error = gripper_target - self.last_gripper[side]
            gripper_urgency = float(np.clip((abs(gripper_error) - 1.0) / 19.0, 0.0, 1.0))
            gripper_smoothing = self.joint_smoothing + (
                1.0 - self.joint_smoothing
            ) * gripper_urgency
            filtered_gripper = self.last_gripper[side] + gripper_smoothing * (
                gripper_target - self.last_gripper[side]
            )
            gripper_delta = float(
                np.clip(filtered_gripper - self.last_gripper[side], -gripper_step, gripper_step)
            )
            self.last_gripper[side] += gripper_delta
            side_action["gripper.pos"] = self.last_gripper[side]
            side_actions[side] = side_action
            sent_sides.append(side)

        sent: dict[str, float] = {}
        for side, action in side_actions.items():
            arm = (
                self.robot.left_arm if side == "left" else self.robot.right_arm
            ) if hasattr(self.robot, "left_arm") else self.robot
            applied = arm.send_action(action)
            sent.update({f"{side}_{key}": value for key, value in applied.items()})
            # LeRobot may clamp a command. Seed the next frame from the value
            # actually accepted by the bus so the IK state cannot drift away.
            applied_q = np.radians([float(applied[f"{joint}.pos"]) for joint in JOINTS])
            self.last_q[side] = applied_q
            self.teleop.hands[side].current_q = np.clip(
                applied_q, self.teleop.model.lower_limits, self.teleop.model.upper_limits
            )
            self.last_gripper[side] = float(applied["gripper.pos"])
            gripper_span = self.gripper_closed - self.gripper_open
            gripper_normalized = (
                0.0
                if abs(gripper_span) < 1e-9
                else float(
                    np.clip(
                        (self.last_gripper[side] - self.gripper_open) / gripper_span,
                        0.0,
                        1.0,
                    )
                )
            )
            # This is the pose actually accepted by LeRobot after all slew and
            # bus clamps. The WebXR twin follows this exact target in real mode
            # instead of visually racing ahead toward the raw IK solution.
            hardware_pose[side] = {
                "joint_positions": applied_q.tolist(),
                "gripper": gripper_normalized,
            }
        # send_action() reports the command accepted by LeRobot, not necessarily
        # the encoder position already reached by a loaded servo. Periodically
        # close that gap with real feedback without adding a serial read to
        # every 50-60 Hz controller sample.
        now = time.monotonic()
        if sent and now - self.last_feedback_at >= self.feedback_interval:
            dual = hasattr(self.robot, "left_arm")
            observation = self.robot.get_observation() if dual else None
            for side in sent_sides:
                arm_observation = observation if dual else self.robot.get_observation()
                prefix = f"{side}_" if dual else ""
                measured_q = np.radians([
                    float(arm_observation[f"{prefix}{joint}.pos"])
                    for joint in JOINTS
                ])
                if validate_joint_limits(
                    measured_q,
                    self.teleop.model.lower_limits,
                    self.teleop.model.upper_limits,
                ):
                    self.last_q[side] = measured_q
                    self.teleop.hands[side].current_q = measured_q.copy()
                    self.last_gripper[side] = float(
                        arm_observation[f"{prefix}gripper.pos"]
                    )
            self.last_feedback_at = now
        if sent:
            result["hardware_action"] = sent
            result["hardware_pose"] = hardware_pose
        result["status"] = "hardware_ok"
        result["commanded_hands"] = sent_sides
        return result

    def release_clutches(self) -> None:
        for state in self.teleop.hands.values():
            state.was_enabled = False


async def run_client(
    websocket: ServerConnection,
    bridge: RealVRBridge,
    *,
    control_hz: float = 50.0,
) -> None:
    print(f"VR/phone client connected: {websocket.remote_address}")
    last_sequence = -1
    latest_packet: ControllerPacket | None = None
    latest_received_at = 0.0
    connection_kind: str | None = None
    phone_session: str | None = None
    phone_arm: str = "right"
    phone_trigger = 0.0
    phone_last_at: float | None = None

    async def receive() -> None:
        nonlocal connection_kind, last_sequence, latest_packet, latest_received_at
        nonlocal phone_session, phone_arm, phone_trigger, phone_last_at
        async for raw in websocket:
            try:
                payload = json.loads(raw)
                is_phone = isinstance(payload, dict) and payload.get("type") in {
                    "hello", "phone_pose", "control_disabled", "recenter"
                }
                if connection_kind is None:
                    connection_kind = "phone" if is_phone else "vr"

                if connection_kind == "phone":
                    message = parse_phone_message(raw)
                    if isinstance(message, PhoneHello):
                        if phone_session is not None:
                            raise ValueError("phone hello was already received")
                        phone_session = message.sessionId
                        phone_arm = message.arm
                        phone_trigger = 0.0
                        phone_last_at = None
                        await websocket.send(json.dumps({
                            "type": "hello_ack",
                            "protocolVersion": 1,
                            "sessionId": phone_session,
                            "arm": phone_arm,
                        }))
                        continue
                    if phone_session is None:
                        raise ValueError("phone hello is required before pose messages")
                    if isinstance(message, PhonePose):
                        if message.sessionId != phone_session:
                            raise ValueError("phone session does not match hello")
                        now = time.time()
                        timestamp = message.timestampNs / 1_000_000_000.0
                        if abs(now - timestamp) > 1.0:
                            raise ValueError("stale phone timestamp")
                        if message.sequence <= last_sequence:
                            raise ValueError("duplicate or out-of-order phone sequence")
                        current = time.monotonic()
                        dt = 0.05 if phone_last_at is None else float(
                            np.clip(current - phone_last_at, 0.01, 0.1)
                        )
                        phone_last_at = current
                        phone_trigger = float(np.clip(
                            phone_trigger - message.gripperVelocity * dt, 0.0, 1.0
                        ))
                        packet = phone_to_controller_packet(
                            message, arm=phone_arm, trigger=phone_trigger
                        )
                        last_sequence = message.sequence
                        latest_packet = packet
                        latest_received_at = current
                        continue
                    if isinstance(message, (PhoneControlDisabled, PhoneRecenter)):
                        latest_packet = None
                        latest_received_at = 0.0
                        if isinstance(message, PhoneControlDisabled):
                            phone_trigger = 0.0
                        continue
                    raise ValueError("unsupported phone message")

                packet = ControllerPacket.model_validate_json(raw)
                now = time.time()
                if packet.sequence <= last_sequence:
                    raise ValueError("duplicate or out-of-order sequence")
                if abs(now - packet.timestamp) > 1.0:
                    raise ValueError("stale timestamp")
                last_sequence = packet.sequence
                # Latest-value register: network jitter can never create a
                # backlog of stale poses for the physical robot to replay.
                latest_packet = packet
                latest_received_at = time.monotonic()
            except (ValidationError, ValueError, json.JSONDecodeError) as error:
                await websocket.send(json.dumps({
                    "type": "error" if connection_kind == "phone" else None,
                    "status": "rejected",
                    "error": str(error),
                }))

    async def process() -> None:
        period = 1.0 / control_hz
        next_tick = time.monotonic()
        stale_released = False
        while True:
            now = time.monotonic()
            if now < next_tick:
                await asyncio.sleep(next_tick - now)
            next_tick = max(next_tick + period, time.monotonic())
            packet = latest_packet
            if packet is None or time.monotonic() - latest_received_at > 0.25:
                if not stale_released:
                    bridge.release_clutches()
                    stale_released = True
                continue
            stale_released = False
            reply = await asyncio.to_thread(bridge.process, packet)
            reply["sequence"] = packet.sequence
            if connection_kind == "phone":
                reply = {
                    "type": "phone_status",
                    "trackingState": "tracking" if reply.get("active_hands") else "limited",
                    "enabled": bool(reply.get("active_hands")),
                    "sequence": packet.sequence,
                }
            await websocket.send(json.dumps(reply))

    receiver = asyncio.create_task(receive())
    processor = asyncio.create_task(process())
    try:
        done, pending = await asyncio.wait({receiver, processor}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for task in done:
            try:
                task.result()
            except ConnectionClosed:
                pass
    finally:
        bridge.release_clutches()
        receiver.cancel()
        processor.cancel()
        print("VR/phone client disconnected; clutches released")


async def main(args: argparse.Namespace) -> None:
    from lerobot.robots.so_follower import SOFollower, SOFollowerRobotConfig

    active_sides = (args.arm,)
    config = SOFollowerRobotConfig(
        id=f"my_awesome_bimanual_follower_{args.arm}",
        port=args.follower,
        use_degrees=True,
        max_relative_target=args.max_joint_step_deg,
    )
    robot = SOFollower(config)
    print(f"Connecting {args.arm} physical follower; no command is sent until WebXR enables control...")
    connected = False
    try:
        # Never enter LeRobot's interactive calibration flow from a live VR
        # bridge. Dashboard validation has already required both saved files.
        # Connect separately so a failure on the second board still cleans up
        # the first board reliably.
        robot.connect(calibrate=False)
        connected = True
        bridge = RealVRBridge(
            robot,
            translation_scale=args.translation_scale,
            max_joint_step_deg=args.max_joint_step_deg,
            joint_smoothing=args.joint_smoothing,
            gripper_open=args.gripper_open,
            gripper_closed=args.gripper_closed,
            active_sides=active_sides,
        )
        print(f"REAL VR TELEOP: ws://{args.host}:{args.port}")
        print(f"VR_TELEOP_READY followers={args.arm} mode=hardware-passthrough")
        print("A/X toggles the WebXR clutch, Trigger closes gripper, Ctrl+C disconnects and releases torque")
        client_lock = asyncio.Lock()

        async def exclusive_client(websocket: ServerConnection) -> None:
            if client_lock.locked():
                await websocket.send(json.dumps({"status": "rejected", "error": "another Quest client is active"}))
                await websocket.close(code=1013, reason="VR controller already connected")
                return
            async with client_lock:
                await run_client(websocket, bridge, control_hz=args.control_hz)

        async with serve(exclusive_client, args.host, args.port, max_size=64 * 1024):
            await asyncio.Future()
    finally:
        print("Disconnecting follower and disabling torque...")
        if connected:
            robot.disconnect()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", choices=("left", "right"), required=True)
    parser.add_argument("--follower", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--control-hz", type=float, default=50.0)
    parser.add_argument("--translation-scale", type=float, default=0.45)
    parser.add_argument(
        "--max-joint-step-deg",
        type=float,
        default=3.0,
        help="maximum physical joint change per bus update",
    )
    parser.add_argument(
        "--joint-smoothing",
        type=float,
        default=0.72,
        help="EMA fraction per controller sample; lower is smoother, higher is more responsive",
    )
    parser.add_argument("--gripper-open", type=float, default=100.0)
    parser.add_argument("--gripper-closed", type=float, default=0.0)
    args = parser.parse_args()
    if not 0.05 <= args.translation_scale <= 1.0:
        parser.error("--translation-scale must be in [0.05, 1.0]")
    if not 0.1 <= args.max_joint_step_deg <= 3.0:
        parser.error("--max-joint-step-deg must be in [0.1, 3.0]")
    if not 0.05 <= args.joint_smoothing <= 1.0:
        parser.error("--joint-smoothing must be in [0.05, 1.0]")
    if not 20.0 <= args.control_hz <= 60.0:
        parser.error("--control-hz must be in [20, 60]")
    return args


if __name__ == "__main__":
    try:
        asyncio.run(main(parse_args()))
    except KeyboardInterrupt:
        print("Stopped")
