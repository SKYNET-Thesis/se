#!/usr/bin/env python3
"""Read the calibrated SO-101 follower state and compute its TCP pose.

This diagnostic is intentionally read-only: it never writes Goal_Position,
configuration, PID values, calibration, or torque state.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from robot import SO101Kinematics


ROOT = Path(__file__).resolve().parent
DEFAULT_CALIBRATION = Path(
    "/home/quangduc/.cache/huggingface/lerobot/calibration/robots/"
    "so_follower/my_awesome_follower_arm.json"
)
ARM_JOINTS = (
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
)


def load_calibration(path: Path):
    from lerobot.motors import MotorCalibration

    raw = json.loads(path.read_text())
    expected = set(ARM_JOINTS) | {"gripper"}
    if set(raw) != expected:
        raise ValueError(f"Calibration joints do not match SO-101: {sorted(raw)}")
    return {name: MotorCalibration(**values) for name, values in raw.items()}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read follower joint positions and calculate TCP pose without commanding motors."
    )
    parser.add_argument("--port", default="/dev/ttyACM1", help="Follower serial port")
    parser.add_argument("--calibration", type=Path, default=DEFAULT_CALIBRATION)
    args = parser.parse_args()

    # Import only here so the offline FK/IK utilities remain independent of LeRobot.
    from lerobot.motors import Motor, MotorNormMode
    from lerobot.motors.feetech import FeetechMotorsBus

    calibration = load_calibration(args.calibration)
    motors = {
        name: Motor(calibration[name].id, "sts3215", MotorNormMode.DEGREES)
        for name in ARM_JOINTS
    }
    motors["gripper"] = Motor(
        calibration["gripper"].id, "sts3215", MotorNormMode.RANGE_0_100
    )
    bus = FeetechMotorsBus(port=args.port, motors=motors, calibration=calibration)

    print("=== READ-ONLY FOLLOWER DIAGNOSTIC ===")
    print(f"Port: {args.port}")
    print(f"Calibration: {args.calibration}")
    print("Không gửi Goal_Position; không thay đổi torque/PID/calibration.")
    try:
        bus.connect(handshake=True)
        positions = bus.sync_read("Present_Position", num_retry=2)
    finally:
        if bus.is_connected:
            # False is essential: disabling torque would itself be a hardware write.
            bus.disconnect(disable_torque=False)

    degrees = np.array([positions[name] for name in ARM_JOINTS], dtype=float)
    radians = np.radians(degrees)
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
    pose = model.forward_kinematics(radians)

    print("\nJoint state:")
    for index, name in enumerate(ARM_JOINTS):
        lower = model.lower_limits[index]
        upper = model.upper_limits[index]
        limit_status = "PASS" if lower <= radians[index] <= upper else "OUTSIDE URDF LIMIT"
        print(
            f"  {name:14s} = {degrees[index]: 8.3f} deg  ({radians[index]: .6f} rad)"
            f"  [{limit_status}]"
        )
    print(f"  {'gripper':14s} = {positions['gripper']: 8.3f} %")
    print("\nCalculated TCP pose:")
    print(f"  frame    = {model.base_frame} -> {model.end_effector_frame}")
    print(f"  position = {np.array2string(pose.position, precision=8)} m")
    print(f"  quaternion [qx,qy,qz,qw] = {np.array2string(pose.quaternion, precision=8)}")
    print("\nREAD COMPLETE — ROBOT COMMAND NOT SENT")
    print("Lưu ý: cần đối chiếu một pose vật lý để xác nhận zero/sign URDF và calibration trùng nhau.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
