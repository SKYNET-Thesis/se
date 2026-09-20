#!/usr/bin/env python3
"""First guarded hardware test: shoulder pan +3 degrees and return.

This script DOES move the real follower. It seeds Goal_Position before enabling
torque, interpolates slowly, validates URDF limits, and disables torque on exit.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np

from read_robot_pose import ARM_JOINTS, DEFAULT_CALIBRATION, load_calibration
from robot import SO101Kinematics
from robot.safety import validate_joint_limits


ROOT = Path(__file__).resolve().parent


def main() -> int:
    parser = argparse.ArgumentParser(description="Guarded small follower motion test")
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--calibration", type=Path, default=DEFAULT_CALIBRATION)
    parser.add_argument("--delta-deg", type=float, default=3.0, help="Shoulder movement, 0.5 to 15 degrees")
    args = parser.parse_args()
    if not 0.5 <= args.delta_deg <= 15.0:
        parser.error("--delta-deg must be between 0.5 and 15.0")

    from lerobot.motors import Motor, MotorNormMode
    from lerobot.motors.feetech import FeetechMotorsBus

    calibration = load_calibration(args.calibration)
    motors = {
        name: Motor(calibration[name].id, "sts3215", MotorNormMode.DEGREES)
        for name in ARM_JOINTS
    }
    motors["gripper"] = Motor(calibration["gripper"].id, "sts3215", MotorNormMode.RANGE_0_100)
    bus = FeetechMotorsBus(args.port, motors, calibration)
    model = SO101Kinematics(ROOT / "so101_new_calib.urdf")

    print("=== REAL ROBOT SMALL-MOTION TEST ===")
    print(f"Follower sẽ quay shoulder_pan +{args.delta_deg:g}° thật chậm rồi trở về vị trí ban đầu.")
    print("Dọn vùng hoạt động, giữ tay tránh xa robot, sẵn sàng nhấn Ctrl+C.")
    if input("Nhập MOVE để tiếp tục: ").strip() != "MOVE":
        print("Cancelled — robot command not sent.")
        return 0

    torque_was_touched = False
    try:
        bus.connect(handshake=True)
        current = bus.sync_read("Present_Position", num_retry=2)
        current_arm = np.array([current[name] for name in ARM_JOINTS], dtype=float)
        print("Current joint positions:")
        for index, name in enumerate(ARM_JOINTS):
            lower_deg = float(np.degrees(model.lower_limits[index]))
            upper_deg = float(np.degrees(model.upper_limits[index]))
            status = "PASS" if lower_deg <= current_arm[index] <= upper_deg else "OUTSIDE"
            print(
                f"  {name:14s} = {current_arm[index]: 8.3f}°  "
                f"limit=[{lower_deg: .3f}, {upper_deg: .3f}]°  [{status}]"
            )
        if not validate_joint_limits(np.radians(current_arm), model.lower_limits, model.upper_limits):
            raise RuntimeError("Current pose is outside URDF limits; refusing to move")
        # Prevent a jump when torque is enabled: first set every goal to its measured position.
        bus.disable_torque(num_retry=2)
        torque_was_touched = True
        bus.sync_write("Goal_Position", current)
        bus.enable_torque(num_retry=2)
        time.sleep(1.0)

        # Enabling torque may settle by a fraction of a degree. Use the settled
        # feedback as the motion-test origin instead of mistaking it for motion.
        settled = bus.sync_read("Present_Position", num_retry=2)
        settled_arm = np.array([settled[name] for name in ARM_JOINTS], dtype=float)
        target_arm = settled_arm.copy()
        target_arm[0] += args.delta_deg
        if not validate_joint_limits(np.radians(target_arm), model.lower_limits, model.upper_limits):
            raise RuntimeError("The requested target is outside URDF limits; refusing to move")

        def interpolate(start: dict[str, float], end: dict[str, float], seconds: float) -> None:
            # 50 Hz minimum-jerk trajectory: zero velocity and acceleration at
            # both ends, avoiding the abrupt start/stop of linear interpolation.
            steps = max(100, round(seconds * 50))
            for step in range(1, steps + 1):
                phase = step / steps
                alpha = 10 * phase**3 - 15 * phase**4 + 6 * phase**5
                goal = {name: start[name] + alpha * (end[name] - start[name]) for name in start}
                bus.sync_write("Goal_Position", goal)
                time.sleep(seconds / steps)

        target = dict(settled)
        target["shoulder_pan"] += args.delta_deg
        travel_seconds = max(2.0, args.delta_deg / 2.5)
        print(f"Settled shoulder_pan: {settled['shoulder_pan']:.3f}°")
        print(f"Moving shoulder_pan +{args.delta_deg:g}° over {travel_seconds:.1f}s...")
        interpolate(settled, target, travel_seconds)
        time.sleep(0.5)
        reached = bus.sync_read("Present_Position", num_retry=2)
        actual_delta = reached["shoulder_pan"] - settled["shoulder_pan"]
        print(f"Measured shoulder_pan delta: {actual_delta:+.3f}°")
        print("Returning to start...")
        interpolate(target, settled, travel_seconds)
        time.sleep(0.5)
        returned = bus.sync_read("Present_Position", num_retry=2)
        return_error = returned["shoulder_pan"] - settled["shoulder_pan"]
        print(f"Return error: {return_error:+.3f}°")
        motion_tolerance = 1.0
        return_tolerance = 0.75
        if abs(actual_delta - args.delta_deg) > motion_tolerance:
            raise RuntimeError("Robot did not reach the requested small motion")
        if abs(return_error) > return_tolerance:
            raise RuntimeError("Robot did not return close enough to its starting position")
        if abs(actual_delta) < abs(return_error) + 1.0:
            raise RuntimeError("Feedback did not match the small commanded motion")
        print("RESULT: PASS")
        return 0
    except KeyboardInterrupt:
        print("\nSTOP requested by Ctrl+C")
        return 130
    finally:
        if bus.is_connected:
            if torque_was_touched:
                print("Disabling torque...")
                bus.disable_torque(num_retry=2)
            bus.disconnect(disable_torque=False)


if __name__ == "__main__":
    raise SystemExit(main())
