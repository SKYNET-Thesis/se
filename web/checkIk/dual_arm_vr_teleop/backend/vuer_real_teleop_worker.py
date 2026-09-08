#!/usr/bin/env python3
"""Vuer hand tracking -> one physical SO-101 follower.

The Vuer/PyRoKi tracking and retargeting implementation is vendored from
Oasis-Uniandes/lerobot_teleoperator_so101_vuer.  This worker adds the hardware
boundary required by the dashboard: explicit follower selection, no startup
motion before a real hand frame, tracking timeout, and joint slew limiting.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import signal
import sys
import time

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "lerobot_teleoperator_so101_vuer"
sys.path.insert(0, str(VENDOR))
sys.path.insert(1, str(ROOT))

from lerobot.robots.so_follower import SOFollower, SOFollowerRobotConfig
from lerobot_teleoperator_so101_vuer import So101VuerTeleop, So101VuerTeleopConfig
from robot import SO101Kinematics, solve_ik
from robot.safety import validate_joint_limits, validate_workspace


JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll")
WORKSPACE_MIN = np.array([0.08, -0.28, -0.04])
WORKSPACE_MAX = np.array([0.42, 0.28, 0.42])
# WebXR: +X right, +Y up, -Z forward. Robot: +X forward,
# +Y left, +Z up. Use the raw Vuer wrist translation for position so the
# upstream orientation/yaw offsets cannot rotate translation axes.
WEBXR_TO_ROBOT = np.array([
    [0.0, 0.0, -1.0],
    [-1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", choices=("left", "right"), required=True)
    parser.add_argument("--follower", required=True)
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8012)
    parser.add_argument("--user-height", type=float, default=1.40)
    parser.add_argument("--translation-scale", type=float, default=0.45)
    parser.add_argument("--max-joint-step-deg", type=float, default=2.25)
    parser.add_argument("--control-hz", type=float, default=30.0)
    args = parser.parse_args()
    if not 0.1 <= args.max_joint_step_deg <= 3.0:
        parser.error("--max-joint-step-deg must be in [0.1, 3.0]")
    if not 0.05 <= args.translation_scale <= 1.0:
        parser.error("--translation-scale must be in [0.05, 1.0]")
    return args


def main(args: argparse.Namespace) -> None:
    robot_id = f"my_awesome_bimanual_follower_{args.arm}"
    robot = SOFollower(SOFollowerRobotConfig(
        id=robot_id,
        port=args.follower,
        use_degrees=True,
        # This worker already applies an explicit per-frame slew limit below.
        # Enabling LeRobot's duplicate relative-target limiter makes
        # send_action() sync-read every servo at the control rate; on the
        # SO-101 serial bus that caused intermittent malformed status packets
        # and killed the Vuer server.
        max_relative_target=None,
    ))
    teleop = So101VuerTeleop(So101VuerTeleopConfig(
        id=f"vuer-{args.arm}",
        user_hand=args.arm,
        target_coord_sys="hip",
        user_height=args.user_height,
        vuer_host=args.host,
        vuer_cert=args.cert,
        vuer_key=args.key,
    ))
    stopping = False

    def stop(_signum=None, _frame=None) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    connected = False
    try:
        print(f"Connecting {args.arm}-follower on {args.follower}; leader ports are not used")
        robot.connect(calibrate=False)
        connected = True
        observation = robot.get_observation()
        last_action = {f"{joint}.pos": float(observation[f"{joint}.pos"]) for joint in JOINTS}
        last_action["gripper.pos"] = float(observation["gripper.pos"])
        model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
        current_q = np.radians([last_action[f"{joint}.pos"] for joint in JOINTS])
        # Preserve a calibrated pose just outside the conservative URDF box;
        # never clip it and create startup motion.
        model.lower_limits = np.minimum(model.lower_limits, current_q)
        model.upper_limits = np.maximum(model.upper_limits, current_q)
        vuer_origin_pos = None
        robot_origin_tcp = None
        filtered_target = None
        teleop.connect(calibrate=False)
        print(f"VUER_TELEOP_READY follower={args.arm} url=https://<laptop-ip>:{args.port}/?ws=wss://<laptop-ip>:{args.port}")
        print("No command is sent until Vuer receives the selected tracked hand")

        period = 1.0 / args.control_hz
        while not stopping:
            started = time.monotonic()
            with teleop._lock:
                tracking_age = started - teleop._last_tracking_at
                vuer_position = teleop._viz_pos.copy()
            if tracking_age <= 0.25:
                requested = teleop.get_action()
                if vuer_origin_pos is None:
                    # Vuer's upstream mapping is absolute in a synthetic torso
                    # frame. Never chase that first arbitrary IK pose on real
                    # hardware. Capture it as a reference so engagement is
                    # motionless and subsequent hand motion is relative to the
                    # follower's measured startup pose.
                    vuer_origin_pos = vuer_position.copy()
                    robot_origin_tcp = model.forward_kinematics(current_q).position.copy()
                    filtered_target = robot_origin_tcp.copy()
                    time.sleep(max(0.0, period - (time.monotonic() - started)))
                    continue
                # Cartesian retargeting: hand up always means TCP +Z and hand
                # forward always means TCP +X, independent of the startup
                # joint pose and independent of which way the fingers point.
                raw_target = robot_origin_tcp + args.translation_scale * (
                    WEBXR_TO_ROBOT @ (vuer_position - vuer_origin_pos)
                )
                target_step = raw_target - filtered_target
                target_distance = float(np.linalg.norm(target_step))
                if target_distance > 0.012:
                    target_step *= 0.012 / target_distance
                filtered_target = filtered_target + 0.45 * target_step
                if not validate_workspace(filtered_target, WORKSPACE_MIN, WORKSPACE_MAX):
                    time.sleep(max(0.0, period - (time.monotonic() - started)))
                    continue
                solution = solve_ik(
                    model,
                    filtered_target,
                    initial_q=current_q,
                    position_tolerance=0.004,
                    max_iterations=45,
                    multi_start=False,
                    joint_target=current_q,
                    joint_target_weights=np.array([0.01, 0.015, 0.015, 0.08, 0.10]),
                    require_orientation=False,
                )
                if not solution.success or solution.joint_positions is None:
                    time.sleep(max(0.0, period - (time.monotonic() - started)))
                    continue
                target_q = solution.joint_positions
                if not validate_joint_limits(target_q, model.lower_limits, model.upper_limits):
                    continue
                delta_q = np.clip(
                    target_q - current_q,
                    -np.radians(args.max_joint_step_deg),
                    np.radians(args.max_joint_step_deg),
                )
                command_q = current_q + delta_q
                command = {
                    f"{joint}.pos": float(value)
                    for joint, value in zip(JOINTS, np.degrees(command_q), strict=True)
                }
                # Pinch remains an absolute gripper gesture like upstream.
                gripper_key = "gripper.pos"
                command[gripper_key] = float(np.clip(
                    requested[gripper_key],
                    last_action[gripper_key] - args.max_joint_step_deg,
                    last_action[gripper_key] + args.max_joint_step_deg,
                ))
                applied = robot.send_action(command)
                last_action.update({key: float(value) for key, value in applied.items()})
                current_q = np.radians([last_action[f"{joint}.pos"] for joint in JOINTS])
            else:
                # Tracking recovery always starts with a fresh zero-motion
                # reference instead of catching up to a stale hand pose.
                vuer_origin_pos = None
                robot_origin_tcp = None
                filtered_target = None
            time.sleep(max(0.0, period - (time.monotonic() - started)))
    finally:
        teleop.disconnect()
        if connected:
            robot.disconnect()


if __name__ == "__main__":
    main(parse_args())
