#!/usr/bin/env python3
"""Run Quest/Vuer teleoperation against this laptop's left SO-101 follower."""

import argparse
import time
from pathlib import Path

from lerobot.robots.so_follower import SOFollower, SOFollowerRobotConfig
from lerobot_teleoperator_so101_vuer import So101VuerTeleop, So101VuerTeleopConfig


JOINT_KEYS = (
    "shoulder_pan.pos",
    "shoulder_lift.pos",
    "elbow_flex.pos",
    "wrist_flex.pos",
    "wrist_roll.pos",
    "gripper.pos",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", help="Follower serial port; auto-detected when exactly one ACM device exists")
    parser.add_argument("--robot-id", default="my_awesome_bimanual_follower_left")
    parser.add_argument("--hand", choices=("left", "right"), default="left")
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--max-step", type=float, default=1.5, help="Maximum joint change in degrees per cycle")
    parser.add_argument(
        "--smoothing",
        type=float,
        default=1.0,
        help="Joint target EMA factor in (0, 1]; smaller is smoother",
    )
    parser.add_argument("--cert", default="./cert.pem")
    parser.add_argument("--key", default="./key.pem")
    return parser.parse_args()


def clamp_action(action: dict[str, float], observation: dict[str, float], max_step: float) -> dict[str, float]:
    return {
        key: max(observation[key] - max_step, min(action[key], observation[key] + max_step))
        for key in JOINT_KEYS
    }


def resolve_port(requested_port: str | None) -> str:
    if requested_port:
        if not Path(requested_port).exists():
            raise SystemExit(f"Follower port does not exist: {requested_port}")
        return requested_port

    ports = sorted(Path("/dev").glob("ttyACM*"))
    if len(ports) == 1:
        port = str(ports[0])
        print(f"One ACM device found; using it as the follower: {port}")
        return port
    if not ports:
        raise SystemExit("No /dev/ttyACM* device found. Reconnect the follower USB cable and try again.")
    choices = ", ".join(str(port) for port in ports)
    raise SystemExit(f"Multiple ACM devices found ({choices}). Run again with --port <follower-port>.")


def smooth_action(
    action: dict[str, float], previous: dict[str, float], factor: float
) -> dict[str, float]:
    return {key: previous[key] + factor * (action[key] - previous[key]) for key in JOINT_KEYS}


def connect_robot(config: SOFollowerRobotConfig, attempts: int = 3) -> SOFollower:
    last_error = None
    for attempt in range(1, attempts + 1):
        robot = SOFollower(config)
        try:
            robot.connect(calibrate=False)
            return robot
        except ConnectionError as error:
            last_error = error
            print(f"Follower connection attempt {attempt}/{attempts} failed: {error}")
            try:
                if robot.bus.is_connected:
                    robot.disconnect()
            except Exception as cleanup_error:
                print(f"Serial cleanup warning: {cleanup_error}")
            if attempt < attempts:
                time.sleep(0.75)
    raise ConnectionError(
        "Follower did not respond after 3 attempts. If the error names id_=6, "
        "check the gripper motor cable and arm power, then reconnect USB."
    ) from last_error


def main() -> None:
    args = parse_args()
    if args.fps <= 0 or args.max_step <= 0 or not 0 < args.smoothing <= 1:
        raise SystemExit("--fps and --max-step must be positive; --smoothing must be in (0, 1].")
    port = resolve_port(args.port)

    robot_config = SOFollowerRobotConfig(
        port=port,
        id=args.robot_id,
        use_degrees=True,
        # We clamp against the observation already read below, avoiding a second serial read.
        max_relative_target=None,
    )
    teleop = So101VuerTeleop(
        So101VuerTeleopConfig(
            id="vuer-left",
            user_hand=args.hand,
            vuer_cert=args.cert,
            vuer_key=args.key,
            ik_hz=args.fps,
            stream_camera=False,
        )
    )

    robot = None
    teleop_connected = False
    try:
        robot = connect_robot(robot_config)
        teleop.connect()
        teleop_connected = True
        print(f"Follower ready on {port}. Waiting for Quest tracking; the arm will hold its current pose.")
        period = 1.0 / args.fps
        previous_action = None
        report_started = time.perf_counter()
        loop_count = 0
        while True:
            started = time.perf_counter()
            observation = robot.get_observation()
            teleop.update_robot_observation(observation)
            if teleop.has_tracking:
                target = teleop.get_action()
                if previous_action is None:
                    previous_action = {key: observation[key] for key in JOINT_KEYS}
                action = smooth_action(target, previous_action, args.smoothing)
                action = clamp_action(action, observation, args.max_step)
            else:
                action = {key: observation[key] for key in JOINT_KEYS}
            robot.send_action(action)
            previous_action = action
            loop_count += 1
            report_elapsed = time.perf_counter() - report_started
            if report_elapsed >= 3.0:
                print(f"Control loop: {loop_count / report_elapsed:.1f} Hz | tracking={teleop.has_tracking}")
                report_started = time.perf_counter()
                loop_count = 0
            time.sleep(max(0.0, period - (time.perf_counter() - started)))
    except KeyboardInterrupt:
        pass
    finally:
        if teleop_connected:
            teleop.disconnect()
        if robot is not None and robot.is_connected:
            robot.disconnect()


if __name__ == "__main__":
    main()
