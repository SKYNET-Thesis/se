#!/usr/bin/env python3
"""Read-only STS3215 health and motion-register diagnostic."""

from __future__ import annotations

import argparse
from pathlib import Path

from read_robot_pose import ARM_JOINTS, DEFAULT_CALIBRATION, load_calibration


def main() -> int:
    parser = argparse.ArgumentParser(description="Read follower motor diagnostics without writing registers")
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--calibration", type=Path, default=DEFAULT_CALIBRATION)
    args = parser.parse_args()

    from lerobot.motors import Motor, MotorNormMode
    from lerobot.motors.feetech import FeetechMotorsBus

    calibration = load_calibration(args.calibration)
    motors = {
        name: Motor(calibration[name].id, "sts3215", MotorNormMode.DEGREES)
        for name in ARM_JOINTS
    }
    motors["gripper"] = Motor(calibration["gripper"].id, "sts3215", MotorNormMode.RANGE_0_100)
    bus = FeetechMotorsBus(args.port, motors, calibration)
    registers = (
        "Present_Voltage",
        "Present_Temperature",
        "Present_Load",
        "Present_Current",
        "P_Coefficient",
        "I_Coefficient",
        "D_Coefficient",
        "Acceleration",
        "Goal_Velocity",
        "Torque_Enable",
    )

    print("=== READ-ONLY MOTOR DIAGNOSTICS ===")
    print(f"Port: {args.port}")
    print("Không ghi register và không gửi Goal_Position.")
    try:
        bus.connect(handshake=True)
        values = {register: bus.sync_read(register, normalize=False, num_retry=2) for register in registers}
    finally:
        if bus.is_connected:
            bus.disconnect(disable_torque=False)

    header = "motor           volt temp load_raw current_raw  P  I  D accel goal_vel torque"
    print("\n" + header)
    print("-" * len(header))
    for motor in motors:
        voltage = values["Present_Voltage"][motor] / 10.0
        print(
            f"{motor:14s} {voltage:4.1f}V"
            f" {values['Present_Temperature'][motor]:4d}C"
            f" {values['Present_Load'][motor]:8d}"
            f" {values['Present_Current'][motor]:11d}"
            f" {values['P_Coefficient'][motor]:2d}"
            f" {values['I_Coefficient'][motor]:2d}"
            f" {values['D_Coefficient'][motor]:2d}"
            f" {values['Acceleration'][motor]:5d}"
            f" {values['Goal_Velocity'][motor]:8d}"
            f" {values['Torque_Enable'][motor]:6d}"
        )
    print("\nREAD COMPLETE — NO REGISTER OR ROBOT COMMAND WRITTEN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
