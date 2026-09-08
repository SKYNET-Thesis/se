#!/usr/bin/env python3
"""Run one calibrated SO-101 leader/follower pair with live telemetry."""

from __future__ import annotations

import argparse
import json
import signal
import time
from pathlib import Path

from lerobot.robots.so_follower import SOFollower, SOFollowerRobotConfig
from lerobot.teleoperators.so_leader import SOLeader, SOLeaderTeleopConfig


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--side", choices=("left", "right"), required=True)
    parser.add_argument("--follower", required=True)
    parser.add_argument("--leader", required=True)
    parser.add_argument("--telemetry", type=Path, required=True)
    parser.add_argument("--profile", choices=("exhibition", "project"), default="project")
    parser.add_argument("--zero-jump", action="store_true")
    args = parser.parse_args()

    robot = SOFollower(SOFollowerRobotConfig(
        id=f"my_awesome_bimanual_follower_{args.side}",
        port=args.follower,
        # Public demos favor a tighter per-cycle envelope. Project mode keeps
        # the library default for faithful leader/follower experiments.
        max_relative_target=2.0 if args.profile == "exhibition" else None,
    ))
    leader = SOLeader(SOLeaderTeleopConfig(
        id=f"my_awesome_bimanual_leader_{args.side}", port=args.leader
    ))
    running = True

    def stop(_signum: int, _frame: object) -> None:
        nonlocal running
        running = False
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(f"Starting {args.side} leader teleop: {args.leader} -> {args.follower}", flush=True)
    try:
        print(f"Connecting {args.side} follower on {args.follower}...", flush=True)
        robot.connect(calibrate=False)
        print(f"Connecting {args.side} leader on {args.leader}...", flush=True)
        leader.connect(calibrate=False)
        follower_start = robot.get_observation()
        leader_start = leader.get_action()
        offsets = {
            key: float(follower_start[key]) - float(value)
            for key, value in leader_start.items()
            if key in follower_start and key.endswith(".pos")
        } if args.profile == "exhibition" or args.zero_jump else {}
        print(
            f"Single-arm leader teleop connected; profile={args.profile}; "
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
                observation = robot.get_observation()
                joints = {
                    key.removesuffix(".pos"): value
                    for key, value in observation.items()
                    if key.endswith(".pos")
                }
                payload = {
                    "timestamp": time.time(),
                    "source": "follower_observation",
                    args.side: joints,
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
        print("Stopping single-arm teleop and releasing buses...", flush=True)
        if leader.is_connected:
            try:
                leader.disconnect()
            except Exception as error:
                # A USB cable may disappear while disconnect() is disabling
                # torque. Do not let that cleanup failure hide the original
                # connection error or prevent the other bus from closing.
                print(f"Warning: could not cleanly disconnect {args.side} leader: {error}", flush=True)
        if robot.is_connected:
            try:
                robot.disconnect()
            except Exception as error:
                print(f"Warning: could not cleanly disconnect {args.side} follower: {error}", flush=True)
        print("Both buses released.", flush=True)


if __name__ == "__main__":
    main()
