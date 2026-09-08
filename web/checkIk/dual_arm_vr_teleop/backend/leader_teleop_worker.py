#!/usr/bin/env python3
"""Bimanual leader teleop worker with a latest-value telemetry side channel."""

from __future__ import annotations

import argparse
import json
import signal
import time
from pathlib import Path

from lerobot.robots.bi_so_follower import BiSOFollower, BiSOFollowerConfig
from lerobot.robots.so_follower import SOFollowerConfig
from lerobot.teleoperators.bi_so_leader import BiSOLeader, BiSOLeaderConfig
from lerobot.teleoperators.so_leader import SOLeaderConfig


def main() -> None:
    parser = argparse.ArgumentParser()
    for name in ("left-follower", "right-follower", "left-leader", "right-leader"):
        parser.add_argument(f"--{name}", required=True)
    parser.add_argument("--telemetry", type=Path, required=True)
    parser.add_argument("--profile", choices=("exhibition", "project"), default="project")
    parser.add_argument("--zero-jump", action="store_true")
    args = parser.parse_args()

    robot = BiSOFollower(BiSOFollowerConfig(
        id="my_awesome_bimanual_follower",
        left_arm_config=SOFollowerConfig(
            port=args.left_follower,
            max_relative_target=2.0 if args.profile == "exhibition" else None,
        ),
        right_arm_config=SOFollowerConfig(
            port=args.right_follower,
            max_relative_target=2.0 if args.profile == "exhibition" else None,
        ),
    ))
    leader = BiSOLeader(BiSOLeaderConfig(
        id="my_awesome_bimanual_leader",
        left_arm_config=SOLeaderConfig(port=args.left_leader),
        right_arm_config=SOLeaderConfig(port=args.right_leader),
    ))
    running = True

    def stop(_signum: int, _frame: object) -> None:
        nonlocal running
        running = False
        # Interrupt a blocking serial/calibration wait as well as the command
        # loop.  The outer finally block will release every connected bus.
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(
        "Starting bimanual LeRobot teleop: "
        f"left {args.left_leader} -> {args.left_follower}; "
        f"right {args.right_leader} -> {args.right_follower}",
        flush=True,
    )
    try:
        print(f"Connecting left follower on {args.left_follower}...", flush=True)
        robot.left_arm.connect(calibrate=False)
        print("Left follower connected.", flush=True)
        print(f"Connecting right follower on {args.right_follower}...", flush=True)
        robot.right_arm.connect(calibrate=False)
        print("Right follower connected.", flush=True)

        # Calibration is an explicit dashboard workflow.  Passing False here
        # prevents SOLeader.connect() from opening an invisible input() prompt
        # when the motor registers and saved profile differ.  The loaded
        # profile is still used to normalize every action.
        print(f"Connecting left leader on {args.left_leader}...", flush=True)
        leader.left_arm.connect(calibrate=False)
        print("Left leader connected.", flush=True)
        print(f"Connecting right leader on {args.right_leader}...", flush=True)
        leader.right_arm.connect(calibrate=False)
        print("Right leader connected.", flush=True)
        follower_start = robot.get_observation()
        leader_start = leader.get_action()
        offsets = {
            key: float(follower_start[key]) - float(value)
            for key, value in leader_start.items()
            if key in follower_start and key.endswith(".pos")
        } if args.profile == "exhibition" or args.zero_jump else {}
        print(
            f"Bimanual leader teleop connected; profile={args.profile}; "
            f"zero_jump={'enabled' if offsets else 'disabled'}.",
            flush=True,
        )

        next_telemetry = 0.0
        loop_period = 0.02 if args.profile == "exhibition" else 0.005
        telemetry_period = 0.20 if args.profile == "exhibition" else 0.05
        while running:
            leader_action = leader.get_action()
            action = {
                key: float(value) + offsets.get(key, 0.0)
                for key, value in leader_action.items()
            }
            robot.send_action(action)
            now = time.monotonic()
            if now >= next_telemetry:
                # Mirror the real follower encoders, not merely the leader's
                # command.  This follows leLab's teleoperation viewer and keeps
                # the digital twin honest when a servo is clamped or lags.
                observation = robot.get_observation()
                payload = {
                    "timestamp": time.time(),
                    "source": "follower_observation",
                    "left": {key.removeprefix("left_").removesuffix(".pos"): value for key, value in observation.items() if key.startswith("left_") and key.endswith(".pos")},
                    "right": {key.removeprefix("right_").removesuffix(".pos"): value for key, value in observation.items() if key.startswith("right_") and key.endswith(".pos")},
                }
                args.telemetry.parent.mkdir(parents=True, exist_ok=True)
                temp = args.telemetry.with_suffix(".tmp")
                temp.write_text(json.dumps(payload))
                temp.replace(args.telemetry)
                next_telemetry = now + telemetry_period
            time.sleep(loop_period)
    except KeyboardInterrupt:
        pass
    finally:
        print("Stopping teleop and releasing connected buses...", flush=True)
        # A partial connection must also be released.  Calling each arm
        # separately avoids BiSO*.disconnect decorators rejecting a partially
        # connected pair.
        for arm in (leader.right_arm, leader.left_arm):
            if arm.is_connected:
                try:
                    arm.disconnect()
                except Exception as error:
                    print(f"Warning: could not cleanly disconnect leader bus: {error}", flush=True)
        for arm in (robot.right_arm, robot.left_arm):
            if arm.is_connected:
                try:
                    arm.disconnect()
                except Exception as error:
                    print(f"Warning: could not cleanly disconnect follower bus: {error}", flush=True)
        print("All connected buses released.", flush=True)


if __name__ == "__main__":
    main()
