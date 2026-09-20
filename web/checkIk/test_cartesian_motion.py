#!/usr/bin/env python3
"""Guarded real-robot test: move TCP +5 mm in base X and return."""

from __future__ import annotations

import argparse
from pathlib import Path
import numpy as np

from robot import SO101Kinematics
from robot.controller import RobotController


ROOT = Path(__file__).resolve().parent


def main() -> int:
    parser = argparse.ArgumentParser(description="Move follower TCP +5 mm in X and return")
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--robot-id", default="my_awesome_follower_arm")
    parser.add_argument("--dx-mm", type=float, default=5.0)
    args = parser.parse_args()
    if not 1.0 <= args.dx_mm <= 10.0:
        parser.error("--dx-mm must be between 1 and 10")

    # Hardware interlock: LeRobot's degree normalization for the full-turn
    # wrist_roll crossed the -180/+180 boundary during the first live test.
    # Its linear relative-goal limiter then interpreted the wrap as ~360 deg.
    # Keep this test disabled until circular feedback handling is implemented
    # and validated read-only.
    raise RuntimeError(
        "Cartesian hardware test is temporarily disabled: wrist_roll wrap-around safety issue"
    )

    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    controller = RobotController(model, port=args.port, robot_id=args.robot_id)
    print("=== REAL ROBOT CARTESIAN TEST ===")
    print(f"TCP sẽ dịch +{args.dx_mm:g} mm theo X của base_link rồi quay về.")
    print("Dọn vùng robot, tránh xa cơ cấu và sẵn sàng nhấn Ctrl+C/ngắt nguồn.")
    if input("Nhập MOVE_TCP để tiếp tục: ").strip() != "MOVE_TCP":
        print("Cancelled — robot command not sent.")
        return 0

    try:
        controller.connect()
        start_q, gripper = controller.get_joint_positions()
        start_pose = model.forward_kinematics(start_q)
        target_position = start_pose.position + np.array([args.dx_mm / 1000.0, 0.0, 0.0])
        result = controller.solve_end_effector(target_position, initial_q=start_q)
        if not result.success or result.joint_positions is None:
            raise RuntimeError(f"IK rejected target: {result.message}, error={result.position_error:.6g} m")
        delta_deg = np.degrees(result.joint_positions - start_q)
        print(f"Start TCP:  {np.array2string(start_pose.position, precision=8)} m")
        print(f"Target TCP: {np.array2string(target_position, precision=8)} m")
        print(f"IK joint delta (deg): {np.array2string(delta_deg, precision=4)}")
        print(f"IK/FK error: {result.position_error:.8f} m")
        print("Moving to Cartesian target...")
        controller.move_joints(result.joint_positions, start_q=start_q, gripper=gripper)
        reached_q, _ = controller.get_joint_positions()
        reached_pose = model.forward_kinematics(reached_q)
        reached_error = float(np.linalg.norm(reached_pose.position - target_position))
        print(f"Measured TCP: {np.array2string(reached_pose.position, precision=8)} m")
        print(f"Measured target error: {reached_error:.6f} m")
        print("Returning to start...")
        controller.move_joints(start_q, start_q=reached_q, gripper=gripper)
        returned_pose = controller.get_end_effector_pose()
        return_error = float(np.linalg.norm(returned_pose.position - start_pose.position))
        print(f"Return TCP error: {return_error:.6f} m")
        if reached_error > 0.003 or return_error > 0.003:
            raise RuntimeError("Measured Cartesian error exceeded 3 mm")
        print("RESULT: PASS")
        return 0
    except KeyboardInterrupt:
        print("\nSTOP requested by Ctrl+C")
        return 130
    finally:
        print("Disconnecting and disabling torque...")
        controller.disconnect()


if __name__ == "__main__":
    raise SystemExit(main())
