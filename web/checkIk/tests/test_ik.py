#!/usr/bin/env python3
"""Runnable offline IK/FK verification; it cannot command hardware."""

from pathlib import Path
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from robot.ik import solve_ik
from robot.kinematics import SO101Kinematics
from robot.safety import validate_joint_limits


def test_reachable_target() -> None:
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    result = solve_ik(model, [0.20, 0.00, 0.15])
    assert result.success, result.message
    assert result.joint_positions is not None
    assert result.position_error <= 1e-4
    assert validate_joint_limits(result.joint_positions, model.lower_limits, model.upper_limits)


def test_unreachable_target() -> None:
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    result = solve_ik(model, [2.0, 2.0, 2.0])
    assert not result.success
    assert result.joint_positions is None


def main() -> None:
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    target = np.array([0.20, 0.00, 0.15])
    print("URDF loaded successfully")
    print(f"Kinematic chain: {model.base_frame} -> {' -> '.join(model.joint_names)} -> {model.end_effector_frame}")
    print(f"\nTarget XYZ (m): {target.tolist()}\nSolving IK...")
    result = solve_ik(model, target)
    if not result.success:
        raise AssertionError(f"IK FAILED: {result.message}; position error={result.position_error:.8f} m")
    q = result.joint_positions
    pose = model.forward_kinematics(q)
    print("IK: SUCCESS\nJoint solution (rad):")
    for name, value in model.joint_dict(q).items():
        print(f"  {name:14s} = {value: .8f}")
    print(f"Joint limits: {'PASS' if validate_joint_limits(q, model.lower_limits, model.upper_limits) else 'FAIL'}")
    print(f"FK verification (m): {np.array2string(pose.position, precision=8)}")
    print(f"Position error: {result.position_error:.10f} m")
    print("RESULT: PASS")

    unreachable = solve_ik(model, [2.0, 2.0, 2.0])
    print("\nUnreachable target: [2.0, 2.0, 2.0]")
    print(f"IK: {'SUCCESS (UNEXPECTED)' if unreachable.success else 'FAILED (EXPECTED)'}")
    print(f"Reason: {unreachable.message}")
    print("Robot command: NOT SENT")
    assert not unreachable.success and unreachable.joint_positions is None


if __name__ == "__main__":
    main()
