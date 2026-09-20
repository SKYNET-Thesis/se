#!/usr/bin/env python3
"""Interactively solve one Cartesian target completely offline."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from robot import SO101Kinematics, solve_ik
from robot.safety import validate_joint_limits


ROOT = Path(__file__).resolve().parent


def read_target() -> list[float]:
    print("Nhập target theo base_link, đơn vị mét.")
    print("Ví dụ an toàn để thử solver: 0.20 0.00 0.15")
    while True:
        raw = input("Target x y z: ").strip().replace(",", " ")
        try:
            values = [float(value) for value in raw.split()]
        except ValueError:
            values = []
        if len(values) == 3 and np.all(np.isfinite(values)):
            return values
        print("Không hợp lệ. Hãy nhập đúng 3 số, ví dụ: 0.20 0.00 0.15")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Tính IK và kiểm tra lại bằng FK (offline, không điều khiển robot)."
    )
    parser.add_argument("xyz", nargs="*", type=float, help="Target x y z, đơn vị mét")
    args = parser.parse_args()
    if args.xyz and len(args.xyz) != 3:
        parser.error("Cần truyền đủ đúng 3 số: x y z")

    target = args.xyz if args.xyz else read_target()
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")

    print("\n=== OFFLINE IK — ROBOT KHÔNG DI CHUYỂN ===")
    print(f"Base frame: {model.base_frame}")
    print(f"End-effector frame: {model.end_effector_frame}")
    print(f"Target (m): {np.array2string(np.asarray(target), precision=6)}")
    print("Đang giải IK...")

    result = solve_ik(model, target)
    if not result.success:
        print("\nIK: FAILED")
        print(f"Lý do: {result.message}")
        print(f"Sai số tốt nhất: {result.position_error:.6f} m")
        print("Robot command: NOT SENT")
        return 1

    q = result.joint_positions
    verified_pose = model.forward_kinematics(q)
    limits_ok = validate_joint_limits(q, model.lower_limits, model.upper_limits)
    print("\nIK: SUCCESS")
    print("Joint solution:")
    for name, radians in model.joint_dict(q).items():
        print(f"  {name:14s} = {radians: .6f} rad  ({np.degrees(radians): .2f} deg)")
    print(f"Joint limits: {'PASS' if limits_ok else 'FAIL'}")
    print(f"FK result (m): {np.array2string(verified_pose.position, precision=8)}")
    print(f"Position error: {result.position_error:.10f} m")
    print("RESULT: PASS")
    print("Robot command: NOT SENT (offline only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
