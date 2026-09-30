#!/usr/bin/env python3
"""Runnable offline FK smoke test (also pytest-compatible)."""

from pathlib import Path
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from robot.kinematics import SO101Kinematics


def test_zero_pose() -> None:
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    pose = model.forward_kinematics(np.zeros(5))
    expected = np.array([0.39136147, -0.00000921, 0.22646971])
    assert np.allclose(pose.position, expected, atol=2e-7)
    assert np.allclose(pose.rotation.T @ pose.rotation, np.eye(3), atol=1e-10)


def main() -> None:
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    q = np.zeros(5)
    pose = model.forward_kinematics(q)
    print("URDF loaded successfully")
    print(f"Base frame: {model.base_frame}")
    print(f"End-effector frame: {model.end_effector_frame}")
    print(f"Joint order: {list(model.joint_names)}")
    print(f"Joint configuration (rad): {q.tolist()}")
    print(f"End-effector position (m): {np.array2string(pose.position, precision=8)}")
    print("End-effector rotation matrix:")
    print(np.array2string(pose.rotation, precision=8, suppress_small=True))
    print(f"Quaternion [qx, qy, qz, qw]: {np.array2string(pose.quaternion, precision=8)}")
    test_zero_pose()
    print("RESULT: PASS")


if __name__ == "__main__":
    main()
