#!/usr/bin/env python3
"""One-board SO-101 calibration worker for the dashboard.

This follows leLab's direct-device calibration flow instead of driving the
interactive ``lerobot-calibrate`` CLI.  JSON events are written as single
prefixed lines so the lightweight dashboard process can display live encoder
ranges without importing LeRobot in its own virtualenv.
"""

from __future__ import annotations

import argparse
import json
import select
import sys
import time
import traceback

from lerobot.motors import MotorCalibration
from lerobot.motors.feetech import OperatingMode
from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig
from lerobot.teleoperators.so_leader import SO101Leader, SO101LeaderConfig


PREFIX = "CALIBRATION_JSON "
MIN_VALID_POSITION = 0
MAX_VALID_POSITION = 5000
MAX_POSITION_JUMP = 2000
FULL_TURN_MOTOR = "wrist_roll"
RANGE_TOLERANCE = 0.98
RANGE_TARGETS = {
    "leader": {
        "shoulder_pan": 2400,
        "shoulder_lift": 2300,
        "elbow_flex": 2150,
        "wrist_flex": 2250,
        "gripper": 1150,
    },
    "follower": {
        "shoulder_pan": 2400,
        "shoulder_lift": 2300,
        "elbow_flex": 2150,
        "wrist_flex": 2250,
        "gripper": 1400,
    },
}


def emit(event: str, **payload: object) -> None:
    print(PREFIX + json.dumps({"event": event, **payload}, separators=(",", ":")), flush=True)


def valid_positions(values: dict[str, float]) -> dict[str, int]:
    return {
        name: int(value)
        for name, value in values.items()
        if MIN_VALID_POSITION < float(value) < MAX_VALID_POSITION
    }


def read_command(timeout: float) -> str | None:
    ready, _, _ = select.select([sys.stdin], [], [], timeout)
    if not ready:
        return None
    line = sys.stdin.readline()
    if line == "":
        raise KeyboardInterrupt
    return line.strip().lower()


def make_device(role: str, port: str, device_id: str):
    if role == "leader":
        return SO101Leader(SO101LeaderConfig(port=port, id=device_id))
    return SO101Follower(SO101FollowerConfig(port=port, id=device_id))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", choices=("leader", "follower"), required=True)
    parser.add_argument("--port", required=True)
    parser.add_argument("--id", required=True)
    args = parser.parse_args()

    device = None
    try:
        emit("middle", message="Put every joint near the middle, then confirm.")
        while read_command(3600) is None:
            pass

        emit("connecting", port=args.port)
        device = make_device(args.role, args.port, args.id)
        device.connect(calibrate=False)
        device.bus.disable_torque()
        for motor in device.bus.motors:
            device.bus.write("Operating_Mode", motor, OperatingMode.POSITION.value)

        # Same homing procedure used by leLab: clear calibration, read the raw
        # encoder positions at the physical middle pose, then apply half-turn
        # homing offsets.
        device.bus.reset_calibration()
        actual = valid_positions(device.bus.sync_read("Present_Position", normalize=False))
        if len(actual) != len(device.bus.motors):
            raise RuntimeError(f"invalid/missing encoder readings at middle pose: {actual}")
        homing_offsets = device.bus._get_half_turn_homings(actual)
        for motor, offset in homing_offsets.items():
            device.bus.write("Homing_Offset", motor, offset)

        initial = valid_positions(device.bus.sync_read("Present_Position", normalize=False))
        if len(initial) != len(device.bus.motors):
            raise RuntimeError(f"could not read all six motors: {initial}")
        mins = initial.copy()
        maxes = initial.copy()
        current = initial.copy()
        previous = initial.copy()
        emit("range", joints={name: {"min": value, "position": value, "max": value} for name, value in initial.items()})

        last_emit = 0.0
        while True:
            command = read_command(0.01)
            if command is not None:
                insufficient = [name for name, target in RANGE_TARGETS[args.role].items()
                                if maxes[name] - mins[name] < target * RANGE_TOLERANCE]
                if insufficient:
                    emit("incomplete", motors=insufficient)
                else:
                    break

            positions = valid_positions(device.bus.sync_read("Present_Position", normalize=False))
            for motor, position in positions.items():
                if abs(position - previous[motor]) > MAX_POSITION_JUMP:
                    raise RuntimeError(
                        f"encoder wrap detected on {motor}; return every joint to its middle pose and restart"
                    )
                previous[motor] = position
                current[motor] = position
                if motor != FULL_TURN_MOTOR:
                    mins[motor] = min(mins[motor], position)
                    maxes[motor] = max(maxes[motor], position)

            now = time.monotonic()
            if now - last_emit >= 0.1:
                joints = {
                    name: {
                        "min": 0 if name == FULL_TURN_MOTOR else mins[name],
                        "position": current[name],
                        "max": 4095 if name == FULL_TURN_MOTOR else maxes[name],
                    }
                    for name in device.bus.motors
                }
                emit("positions", joints=joints)
                last_emit = now
            time.sleep(0.04)

        emit("saving")
        mins[FULL_TURN_MOTOR] = 0
        maxes[FULL_TURN_MOTOR] = 4095
        calibration = {
            motor: MotorCalibration(
                id=spec.id,
                drive_mode=0,
                homing_offset=homing_offsets[motor],
                range_min=mins[motor],
                range_max=maxes[motor],
            )
            for motor, spec in device.bus.motors.items()
        }
        device.calibration = calibration
        device.bus.write_calibration(calibration)
        device._save_calibration()
        emit("saved", path=str(device.calibration_fpath))
        return 0
    except KeyboardInterrupt:
        emit("cancelled")
        return 130
    except Exception as error:
        emit("error", message=str(error), detail=traceback.format_exc())
        return 1
    finally:
        if device is not None and device.is_connected:
            try:
                device.bus.disable_torque()
                device.disconnect()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
